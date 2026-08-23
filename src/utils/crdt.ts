/**
 * CRDT and Yjs utilities for real-time synchronization
 */

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

import type {
  ActiveVotableInput,
  CRDTAction,
  CRDTState,
  CreateRoomInput,
  CreateVotableInput,
  EditVotableInput,
  FinalizeEstimateInput,
  JoinRoomInput,
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

import { WebrtcProvider } from 'y-webrtc'

export interface SharedCollections {
  room: Y.Map<Room>
  users: Y.Map<User>
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
 */
export function initializeYDoc(config: CRDTConfig): Y.Doc {
  void config
  const ydoc = new Y.Doc()

  // Create shared types for room state
  const ymap = ydoc.getMap('shared')
  ymap.set('room', new Y.Map())
  ymap.set('users', new Y.Map())
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
    room: shared.get('room') as Y.Map<Room>,
    users: shared.get('users') as Y.Map<User>,
    votables: shared.get('votables') as Y.Array<Votable>,
    votes: shared.get('votes') as Y.Map<Vote>,
    uiState: shared.get('uiState') as Y.Map<unknown>,
  }
}

/**
 * Build a full room object and write it to the CRDT document.
 */
export function createRoomState(ydoc: Y.Doc, input: CreateRoomInput): Room {
  const room: Room = {
    id: input.id,
    name: input.name,
    facilitator: input.facilitator,
    voters: input.voters ?? [],
    observers: input.observers ?? [],
    votables: input.votables ?? [],
    status: input.status ?? 'active',
    createdAt: input.createdAt ?? Date.now(),
    passphrase: input.passphrase,
  }

  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)

    shared.room.set('data', room)
    indexUser(shared, room.facilitator)
    room.voters.forEach((user) => indexUser(shared, user))
    room.observers.forEach((user) => indexUser(shared, user))

    shared.votables.delete(0, shared.votables.length)
    if (room.votables.length > 0) {
      shared.votables.insert(0, room.votables)
    }
  })

  return room
}

/**
 * Add or update a user record in the CRDT users map.
 */
export function upsertUser(ydoc: Y.Doc, user: User): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    indexUser(shared, user)
    syncRoomUsers(shared)
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

    const room = getRoom(shared)
    if (room) {
      shared.room.set('data', {
        ...room,
        votables: [...room.votables, votable],
      })
    }
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

    syncRoomVotables(shared)
  })
}

/**
 * Remove an item and all associated votes from the CRDT state.
 */
export function removeVotable(ydoc: Y.Doc, input: RemoveVotableInput): void {
  ydoc.transact(() => {
    const shared = getSharedCollections(ydoc)
    const votables = shared.votables.toArray()
    const index = votables.findIndex((votable) => votable.id === input.votableId)

    if (index === -1) {
      throw new Error(`Votable ${input.votableId} does not exist`)
    }

    shared.votables.delete(index, 1)

    const voteKeysToDelete: string[] = []
    shared.votes.forEach((vote, voteKey) => {
      if (vote.votableId === input.votableId) {
        voteKeysToDelete.push(voteKey)
      }
    })
    voteKeysToDelete.forEach((key) => shared.votes.delete(key))

    shared.uiState.delete(`reveal:${input.votableId}`)

    if (shared.uiState.get('activeVotableId') === input.votableId) {
      const nextActive = shared.votables.length > 0
        ? shared.votables.get(Math.min(index, shared.votables.length - 1))?.id
        : undefined

      if (nextActive) {
        shared.uiState.set('activeVotableId', nextActive)
      } else {
        shared.uiState.delete('activeVotableId')
      }
    }

    syncRoomVotables(shared)
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
    syncRoomVotables(shared)
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
    setRevealState(shared, vote.votableId, false)
    syncRoomVotables(shared)
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
    syncRoomVotables(shared)
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

    syncRoomVotables(shared)
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
  const room = getRoom(shared)

  if (!room) {
    return undefined
  }

  return {
    room,
    users: new Map(shared.users.entries()),
    votables: shared.votables.toArray(),
    votes: new Map(shared.votes.entries()),
    uiState: new Map(shared.uiState.entries()),
  }
}

function getRoom(shared: SharedCollections): Room | undefined {
  return shared.room.get('data')
}

function indexUser(shared: SharedCollections, user: User): void {
  shared.users.set(user.id, user)
}

function syncRoomUsers(shared: SharedCollections): void {
  const room = getRoom(shared)
  if (!room) {
    return
  }

  const facilitator = shared.users.get(room.facilitator.id) ?? room.facilitator
  const voters = room.voters.map((user) => shared.users.get(user.id) ?? user)
  const observers = room.observers.map((user) => shared.users.get(user.id) ?? user)

  shared.room.set('data', {
    ...room,
    facilitator,
    voters,
    observers,
  })
}

function syncRoomVotables(shared: SharedCollections): void {
  const room = getRoom(shared)
  if (!room) {
    return
  }

  shared.room.set('data', {
    ...room,
    votables: shared.votables.toArray(),
  })
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
    const room = getRoom(shared)

    if (!room) {
      throw new Error('Cannot join room before room state is created')
    }

    if (room.facilitator.id === user.id) {
      throw new Error('Facilitator cannot be reassigned as voter or observer')
    }

    const updatedUser: User = {
      ...user,
      role,
    }

    indexUser(shared, updatedUser)

    const voters = role === 'voter'
      ? upsertUserArray(room.voters, updatedUser)
      : removeUserFromArray(room.voters, updatedUser.id)
    const observers = role === 'observer'
      ? upsertUserArray(room.observers, updatedUser)
      : removeUserFromArray(room.observers, updatedUser.id)

    shared.room.set('data', {
      ...room,
      voters,
      observers,
    })
  })
}

function upsertUserArray(users: User[], user: User): User[] {
  const existingIndex = users.findIndex((candidate) => candidate.id === user.id)
  if (existingIndex === -1) {
    return [...users, user]
  }

  const copy = [...users]
  copy[existingIndex] = user
  return copy
}

function removeUserFromArray(users: User[], userId: string): User[] {
  return users.filter((user) => user.id !== userId)
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
  const defaultSignalingServer = 'ws://localhost:4444'
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
