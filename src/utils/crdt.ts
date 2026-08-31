/**
 * CRDT and Yjs utilities for real-time synchronization
 */

import * as Y from 'yjs'

import type {
  ActiveVotableInput,
  CRDTAction,
  CRDTState,
  CreateRoomInput,
  CreateVotableInput,
  EditVotableInput,
  FinalizeEstimateInput,
  JoinRoomInput,
  MarkUserOfflineInput,
  RemoveUserInput,
  RemoveVotableInput,
  ReorderVotableInput,
  ResetVotesInput,
  RevealVotesInput,
  Role,
  Room,
  SubmitVoteInput,
  User,
  Votable,
  Vote,
} from '../types'

import { IndexeddbPersistence } from 'y-indexeddb'
import { WebrtcProvider } from 'y-webrtc'

export interface SharedCollections {
  room: Y.Map<unknown>
  users: Y.Map<User>
  voterIds: Y.Array<string>
  observerIds: Y.Array<string>
  votables: Y.Array<Votable>
  votes: Y.Map<Vote>
  uiState: Y.Map<unknown>
}

export interface CRDTConfig {
  roomId: string
  awareness?: boolean
}

export interface CRDTReducer {
  dispatch: (action: CRDTAction) => CRDTState | undefined
  getState: () => CRDTState | undefined
}

/**
 * Initialize Yjs document with shared types for Planning Poker
 *
 * Room membership (facilitator/voters/observers) and the backlog are modeled
 * as CRDT-native structures rather than a single opaque `Room` object so that
 * concurrent edits merge instead of clobbering each other:
 *   - `room` holds only scalar metadata (id, name, status, createdAt,
 *     passphrase, facilitatorId). facilitatorId is set once and never changed.
 *   - `voterIds` / `observerIds` are append-only Y.Array<string> membership
 *     lists; users are never removed from them, only marked offline.
 *   - `votables` is an append-only Y.Array<Votable>; "removing" an item sets
 *     a `deleted` flag instead of splicing it out of the array.
 */
export function initializeYDoc(config: CRDTConfig): Y.Doc {
  void config
  const ydoc = new Y.Doc()

  // Create shared types for room state
  const ymap = ydoc.getMap('shared')
  ymap.set('room', new Y.Map())
  ymap.set('users', new Y.Map())
  ymap.set('voterIds', new Y.Array())
  ymap.set('observerIds', new Y.Array())
  ymap.set('votables', new Y.Array())
  ymap.set('votes', new Y.Map())
  ymap.set('uiState', new Y.Map())

  return ydoc
}

/**
 * Return typed handles to all shared Yjs collections used by the app state.
 */
export function getSharedCollections(ydoc: Y.Doc): SharedCollections {
  const shared = ydoc.getMap<Y.AbstractType<unknown>>('shared')

  return {
    room: shared.get('room') as Y.Map<unknown>,
    users: shared.get('users') as Y.Map<User>,
    voterIds: shared.get('voterIds') as Y.Array<string>,
    observerIds: shared.get('observerIds') as Y.Array<string>,
    votables: shared.get('votables') as Y.Array<Votable>,
    votes: shared.get('votes') as Y.Map<Vote>,
    uiState: shared.get('uiState') as Y.Map<unknown>,
  }
}

/**
 * Build a full room object and write it to the CRDT document.
 *
 * Room creation is idempotent/set-once for identity fields: if the room
 * metadata already exists (e.g. a concurrent create from another peer),
 * this will not overwrite the existing facilitator or metadata.
 */
export function createRoomState(ydoc: Y.Doc, input: CreateRoomInput): Room {
  const createdAt = input.createdAt ?? Date.now()

  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    // Set-once: never overwrite an already-created room or reassign facilitator.
    if (!shared.room.has('id')) {
      shared.room.set('id', input.id)
      shared.room.set('name', input.name)
      shared.room.set('status', input.status ?? 'active')
      shared.room.set('createdAt', createdAt)
      shared.room.set('passphrase', input.passphrase)
      shared.room.set('facilitatorId', input.facilitator.id)
    }

    indexUser(shared, input.facilitator)
    input.voters?.forEach((user) => indexUser(shared, user))
    input.observers?.forEach((user) => indexUser(shared, user))

    appendIds(shared.voterIds, (input.voters ?? []).map((user) => user.id))
    appendIds(shared.observerIds, (input.observers ?? []).map((user) => user.id))

    if (shared.votables.length === 0 && input.votables && input.votables.length > 0) {
      shared.votables.insert(0, input.votables)
    }
  })

  const room = buildRoom(getSharedCollections(ydoc))
  if (!room) {
    throw new Error('Failed to create room state')
  }

  return room
}

/**
 * Add or update a user record in the CRDT users map.
 */
export function upsertUser(ydoc: Y.Doc, user: User): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    indexUser(shared, user)
  })
}

/**
 * Add a new votable item to the room and shared votables list.
 */
export function addVotable(ydoc: Y.Doc, input: CreateVotableInput): Votable {
  const votable: Votable = {
    id: input.id,
    name: input.name,
    link: input.link,
    description: input.description,
    votes: [],
    finalEstimate: input.finalEstimate,
    status: input.status ?? 'pending',
  }

  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    shared.votables.push([votable])
  })

  return votable
}

/**
 * Edit metadata for an existing votable item.
 */
export function editVotable(ydoc: Y.Doc, input: EditVotableInput): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    updateVotable(shared, input.votableId, (votable) => ({
      ...votable,
      name: input.name,
      link: input.link,
      description: input.description,
    }))
  })
}

/**
 * Mark an item as deleted so it is hidden from the UI. Items are never
 * spliced out of the CRDT array — only tombstoned — so concurrent edits to
 * the same item never race against its removal.
 */
export function removeVotable(ydoc: Y.Doc, input: RemoveVotableInput): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    updateVotable(shared, input.votableId, (votable) => ({
      ...votable,
      deleted: true,
    }))

    if (shared.uiState.get('activeVotableId') === input.votableId) {
      const nextActive = shared.votables.toArray().find((votable) => !votable.deleted && votable.id !== input.votableId)

      if (nextActive) {
        shared.uiState.set('activeVotableId', nextActive.id)
      } else {
        shared.uiState.delete('activeVotableId')
      }
    }
  })
}

/**
 * Move an item to a target position.
 */
export function reorderVotable(ydoc: Y.Doc, input: ReorderVotableInput): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    const votables = shared.votables.toArray()
    const sourceIndex = votables.findIndex((votable) => votable.id === input.votableId)

    if (sourceIndex === -1) {
      throw new Error(`Votable ${input.votableId} does not exist`)
    }

    const boundedTarget = Math.max(0, Math.min(input.targetIndex, votables.length - 1))
    if (boundedTarget === sourceIndex) {
      return
    }

    const [moved] = votables.splice(sourceIndex, 1)
    votables.splice(boundedTarget, 0, moved)

    shared.votables.delete(0, shared.votables.length)
    shared.votables.insert(0, votables)
  })
}

/**
 * Submit or replace a user's vote for a specific votable item.
 */
export function submitVote(ydoc: Y.Doc, input: SubmitVoteInput): Vote {
  const vote: Vote = {
    id: input.id,
    userId: input.userId,
    votableId: input.votableId,
    score: input.score,
    createdAt: input.createdAt ?? Date.now(),
  }

  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    if (!shared.users.has(vote.userId)) {
      throw new Error(`Cannot submit vote: user ${vote.userId} does not exist`)
    }

    updateVotable(shared, vote.votableId, (votable) => {
      const filteredVotes = votable.votes.filter((existingVote) => existingVote.userId !== vote.userId)
      return {
        ...votable,
        votes: [...filteredVotes, vote],
      }
    })

    const voteKey = `${vote.votableId}:${vote.userId}`
    shared.votes.set(voteKey, vote)
  })

  return vote
}

/**
 * Reveal votes for a votable item.
 */
export function revealVotes(ydoc: Y.Doc, votableId: string, revealedBy: string): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    setRevealState(shared, votableId, true, revealedBy)
  })
}

/**
 * Reset all votes for a votable and clear reveal metadata.
 */
export function resetVotes(ydoc: Y.Doc, votableId: string): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    updateVotable(shared, votableId, (votable) => ({
      ...votable,
      votes: [],
      finalEstimate: undefined,
      status: 'estimating',
    }))

    const voteKeysToDelete: string[] = []
    shared.votes.forEach((vote, voteKey) => {
      if (vote.votableId === votableId) {
        voteKeysToDelete.push(voteKey)
      }
    })
    voteKeysToDelete.forEach((key) => shared.votes.delete(key))

    setRevealState(shared, votableId, false)
  })
}

/**
 * Mark a votable item as estimated and persist final estimate.
 */
export function finalizeEstimate(ydoc: Y.Doc, votableId: string, finalEstimate: string | number): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    updateVotable(shared, votableId, (votable) => ({
      ...votable,
      finalEstimate,
      status: 'estimated',
    }))
  })
}

/**
 * Track which votable is active in the UI state.
 */
export function setActiveVotable(ydoc: Y.Doc, votableId: string): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    shared.uiState.set('activeVotableId', votableId)
  })
}

/**
 * Join room as voter and keep room membership lists normalized.
 */
export function joinAsVoter(ydoc: Y.Doc, input: JoinRoomInput): void {
  joinRoomWithRole(ydoc, input.user, 'voter')
}

/**
 * Join room as observer and keep room membership lists normalized.
 */
export function joinAsObserver(ydoc: Y.Doc, input: JoinRoomInput): void {
  joinRoomWithRole(ydoc, input.user, 'observer')
}

/**
 * Mark a user as offline when they disconnect from awareness.
 * Users remain in the room but show as offline in the UI.
 */
export function markUserOffline(ydoc: Y.Doc, userId: string): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    const user = shared.users.get(userId)
    
    if (user) {
      shared.users.set(userId, {
        ...user,
        online: false,
      })
    }
  })
}

/**
 * Mark a user as offline (called when a user disconnects).
 *
 * Membership lists (voters/observers) are append-only, so users are never
 * removed from the room — they are only ever marked offline.
 * @deprecated Use markUserOffline instead; kept for backward compatibility.
 */
export function removeUser(ydoc: Y.Doc, userId: string): void {
  markUserOffline(ydoc, userId)
}

/**
 * Dispatch a typed action to mutate CRDT state and return a fresh snapshot.
 */
export function dispatchCRDTAction(ydoc: Y.Doc, action: CRDTAction): CRDTState | undefined {
  switch (action.type) {
    case 'createRoom':
      createRoomState(ydoc, action.payload)
      break
    case 'upsertUser':
      upsertUser(ydoc, action.payload)
      break
    case 'joinAsVoter':
      joinAsVoter(ydoc, action.payload)
      break
    case 'joinAsObserver':
      joinAsObserver(ydoc, action.payload)
      break
    case 'removeUser': {
      const payload: RemoveUserInput = action.payload
      removeUser(ydoc, payload.userId)
      break
    }
    case 'markUserOffline': {
      const payload: MarkUserOfflineInput = action.payload
      markUserOffline(ydoc, payload.userId)
      break
    }
    case 'addVotable':
      addVotable(ydoc, action.payload)
      break
    case 'editVotable':
      editVotable(ydoc, action.payload)
      break
    case 'removeVotable':
      removeVotable(ydoc, action.payload)
      break
    case 'reorderVotable':
      reorderVotable(ydoc, action.payload)
      break
    case 'submitVote':
      submitVote(ydoc, action.payload)
      break
    case 'revealVotes': {
      const payload: RevealVotesInput = action.payload
      revealVotes(ydoc, payload.votableId, payload.revealedBy)
      break
    }
    case 'resetVotes': {
      const payload: ResetVotesInput = action.payload
      resetVotes(ydoc, payload.votableId)
      break
    }
    case 'finalizeEstimate': {
      const payload: FinalizeEstimateInput = action.payload
      finalizeEstimate(ydoc, payload.votableId, payload.finalEstimate)
      break
    }
    case 'setActiveVotable': {
      const payload: ActiveVotableInput = action.payload
      setActiveVotable(ydoc, payload.votableId)
      break
    }
    default: {
      const exhaustiveCheck: never = action
      throw new Error(`Unsupported action: ${JSON.stringify(exhaustiveCheck)}`)
    }
  }

  return getCRDTStateSnapshot(ydoc)
}

/**
 * Create a reducer-like API for UI layers that dispatch typed CRDT actions.
 */
export function createCRDTReducer(ydoc: Y.Doc): CRDTReducer {
  return {
    dispatch: (action: CRDTAction) => dispatchCRDTAction(ydoc, action),
    getState: () => getCRDTStateSnapshot(ydoc),
  }
}

/**
 * Read a typed snapshot of all state currently in the CRDT document.
 */
export function getCRDTStateSnapshot(ydoc: Y.Doc): CRDTState | undefined {
  const shared = getSharedCollections(ydoc)
  const room = buildRoom(shared)

  if (!room) {
    return undefined
  }

  return {
    room,
    users: new Map(shared.users.entries()),
    votables: shared.votables.toArray().filter((votable) => !votable.deleted),
    votes: new Map(shared.votes.entries()),
    uiState: new Map(shared.uiState.entries()),
  }
}

/**
 * Reconstruct the full `Room` view from the underlying CRDT-native
 * collections (scalar metadata, append-only membership lists, users map).
 */
function buildRoom(shared: SharedCollections): Room | undefined {
  if (!shared.room.has('id')) {
    return undefined
  }

  const facilitatorId = shared.room.get('facilitatorId') as string
  const facilitator = shared.users.get(facilitatorId)

  if (!facilitator) {
    return undefined
  }

  const voters = shared.voterIds
    .toArray()
    .map((id) => shared.users.get(id))
    .filter((user): user is User => Boolean(user) && user!.role === 'voter')
  const observers = shared.observerIds
    .toArray()
    .map((id) => shared.users.get(id))
    .filter((user): user is User => Boolean(user) && user!.role === 'observer')

  return {
    id: shared.room.get('id') as string,
    name: shared.room.get('name') as string,
    facilitator,
    voters,
    observers,
    votables: shared.votables.toArray().filter((votable) => !votable.deleted),
    status: shared.room.get('status') as Room['status'],
    createdAt: shared.room.get('createdAt') as number,
    passphrase: shared.room.get('passphrase') as string | undefined,
  }
}

function indexUser(shared: SharedCollections, user: User): void {
  shared.users.set(user.id, user)
}

/**
 * Append ids to a membership list without ever removing existing entries,
 * and without introducing duplicates.
 */
function appendIds(list: Y.Array<string>, ids: string[]): void {
  const existing = new Set(list.toArray())
  const toAdd = ids.filter((id) => id && !existing.has(id))
  if (toAdd.length > 0) {
    list.push(toAdd)
  }
}

function updateVotable(
  shared: SharedCollections,
  votableId: string,
  updater: (votable: Votable) => Votable
): void {
  const votables = shared.votables.toArray()
  const index = votables.findIndex((votable) => votable.id === votableId)

  if (index === -1) {
    throw new Error(`Votable ${votableId} does not exist`)
  }

  const updatedVotable = updater(votables[index])
  shared.votables.delete(index, 1)
  shared.votables.insert(index, [updatedVotable])
}

function setRevealState(shared: SharedCollections, votableId: string, revealed: boolean, revealedBy?: string): void {
  shared.uiState.set(`reveal:${votableId}`, {
    revealed,
    revealedBy,
    revealedAt: revealed ? Date.now() : undefined,
  })
}

function joinRoomWithRole(ydoc: Y.Doc, user: User, role: Extract<Role, 'voter' | 'observer'>): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    if (!shared.room.has('id')) {
      throw new Error('Cannot join room before room state is created')
    }

    const facilitatorId = shared.room.get('facilitatorId') as string
    if (facilitatorId === user.id) {
      throw new Error('Facilitator cannot be reassigned as voter or observer')
    }

    const updatedUser: User = {
      ...user,
      role,
    }

    indexUser(shared, updatedUser)

    // Append-only: a user's id is added to whichever list matches their
    // current role. If they switch roles later, their id may end up in both
    // lists, but buildRoom() disambiguates using the authoritative role
    // stored on the user record, so membership always reflects the latest
    // role without ever deleting entries from either list.
    if (role === 'voter') {
      appendIds(shared.voterIds, [updatedUser.id])
    } else {
      appendIds(shared.observerIds, [updatedUser.id])
    }
  })
}

/**
 * Create a WebRTC provider for peer-to-peer sync
 * Note: This requires a signaling server for WebRTC connection establishment
 */
export function createWebRTCProvider(
  ydoc: Y.Doc,
  roomId: string,
  signalingServers: string[] = [],
  password?: string
): WebrtcProvider {
  const defaultSignalingServer = import.meta.env.VITE_SIGNALING_SERVER ?? 'ws://localhost:4444'
  
  const signaling = signalingServers.length > 0 ? signalingServers : [defaultSignalingServer]

  const provider = new WebrtcProvider(`planning-poker-${roomId}`, ydoc, {
    signaling,
    password,
  })

  return provider
}

/**
 * Enable IndexedDB persistence for room state and restoration after refresh.
 */
export function createIndexedDBProvider(ydoc: Y.Doc, roomId: string): IndexeddbPersistence {
  return new IndexeddbPersistence(`planning-poker-${roomId}`, ydoc)
}

/**
 * Get all currently connected peers
 */
export function getConnectedPeers(provider: WebrtcProvider): number {
  return provider.awareness.getStates().size
}

/**
 * Encode document state to transfer
 */
export function encodeDocumentState(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(ydoc)
}

/**
 * Apply received document state
 */
export function applyDocumentUpdate(ydoc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(ydoc, update)
}
