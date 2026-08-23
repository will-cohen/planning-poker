import React, { useEffect, useMemo, useRef, useState } from 'react'

import {
  CARD_VALUES,
  type CRDTState,
  type Role,
  type User,
  type Votable,
} from './types'
import {
  createCRDTReducer,
  createWebRTCProvider,
  getConnectedPeers,
  initializeYDoc,
} from './utils/crdt'
import {
  createInviteUrl,
  generateParticipantId,
  generateProfileIcon,
  generateRoomId,
} from './utils/room'

interface Session {
  mode: 'create' | 'join'
  roomId: string
  roomName?: string
  user: User
}

interface AwarenessUser {
  id: string
  name: string
  role: Role
  profileIcon: string
}

interface RevealState {
  revealed: boolean
  revealedBy?: string
  revealedAt?: number
}

export default function App(): React.ReactElement {
  const [displayName, setDisplayName] = useState('')
  const [roomName, setRoomName] = useState('Sprint Planning')
  const [joinRoomId, setJoinRoomId] = useState(() => {
    const roomId = new URLSearchParams(window.location.search).get('room')
    return (roomId ?? '').toUpperCase()
  })
  const [joinRole, setJoinRole] = useState<Role>('voter')

  const [session, setSession] = useState<Session | null>(null)
  const [snapshot, setSnapshot] = useState<CRDTState | undefined>(undefined)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected')
  const [peerCount, setPeerCount] = useState(1)
  const [awarenessUsers, setAwarenessUsers] = useState<AwarenessUser[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [newItemName, setNewItemName] = useState('')
  const [newItemLink, setNewItemLink] = useState('')
  const [newItemDescription, setNewItemDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingLink, setEditingLink] = useState('')
  const [editingDescription, setEditingDescription] = useState('')

  const reducerRef = useRef<ReturnType<typeof createCRDTReducer> | null>(null)
  const ydocRef = useRef<ReturnType<typeof initializeYDoc> | null>(null)
  const providerRef = useRef<ReturnType<typeof createWebRTCProvider> | null>(null)
  const hasCreatedRoomRef = useRef(false)
  const hasJoinedRoomRef = useRef(false)

  useEffect(() => {
    if (!session) {
      reducerRef.current = null
      ydocRef.current = null
      providerRef.current = null
      setSnapshot(undefined)
      setAwarenessUsers([])
      setPeerCount(1)
      setConnectionStatus('disconnected')
      return
    }

    hasCreatedRoomRef.current = false
    hasJoinedRoomRef.current = false

    const ydoc = initializeYDoc({ roomId: session.roomId, awareness: true })
    const provider = createWebRTCProvider(ydoc, session.roomId)
    const reducer = createCRDTReducer(ydoc)

    ydocRef.current = ydoc
    providerRef.current = provider
    reducerRef.current = reducer

    const refreshSnapshot = (): void => {
      setSnapshot(reducer.getState())
    }

    const refreshAwareness = (): void => {
      const users: AwarenessUser[] = []
      provider.awareness.getStates().forEach((state) => {
        const userState = (state as { user?: AwarenessUser }).user
        if (userState) {
          users.push(userState)
        }
      })
      setAwarenessUsers(users)
      setPeerCount(getConnectedPeers(provider))
    }

    provider.awareness.setLocalStateField('user', {
      id: session.user.id,
      name: session.user.name,
      role: session.user.role,
      profileIcon: session.user.profileIcon,
    })

    ydoc.on('update', refreshSnapshot)
    provider.awareness.on('change', refreshAwareness)
    provider.on('status', ({ status }: { status: 'connected' | 'disconnected' }) => {
      setConnectionStatus(status)
      setPeerCount(getConnectedPeers(provider))
    })

    refreshSnapshot()
    refreshAwareness()

    return () => {
      provider.awareness.off('change', refreshAwareness)
      ydoc.off('update', refreshSnapshot)
      provider.destroy()
      ydoc.destroy()
    }
  }, [session])

  useEffect(() => {
    if (!session || !reducerRef.current) {
      return
    }

    const reducer = reducerRef.current

    if (session.mode === 'create' && !hasCreatedRoomRef.current) {
      reducer.dispatch({
        type: 'createRoom',
        payload: {
          id: session.roomId,
          name: session.roomName ?? `Room ${session.roomId}`,
          facilitator: session.user,
        },
      })
      hasCreatedRoomRef.current = true
      hasJoinedRoomRef.current = true
      return
    }

    if (!snapshot?.room || hasJoinedRoomRef.current) {
      return
    }

    if (session.user.role === 'observer') {
      reducer.dispatch({ type: 'joinAsObserver', payload: { user: session.user } })
    } else {
      reducer.dispatch({ type: 'joinAsVoter', payload: { user: session.user } })
    }
    hasJoinedRoomRef.current = true
  }, [session, snapshot])

  const activeVotableId = useMemo(() => {
    const fromState = snapshot?.uiState.get('activeVotableId')
    if (typeof fromState === 'string') {
      return fromState
    }

    return snapshot?.votables[0]?.id
  }, [snapshot])

  const activeVotable = useMemo(() => {
    if (!snapshot || !activeVotableId) {
      return undefined
    }

    return snapshot.votables.find((votable) => votable.id === activeVotableId)
  }, [snapshot, activeVotableId])

  const revealState = useMemo(() => {
    if (!snapshot || !activeVotableId) {
      return { revealed: false } as RevealState
    }

    const state = snapshot.uiState.get(`reveal:${activeVotableId}`)
    if (!state || typeof state !== 'object') {
      return { revealed: false } as RevealState
    }

    return state as RevealState
  }, [snapshot, activeVotableId])

  const allParticipants = useMemo(() => {
    if (!snapshot) {
      return [] as User[]
    }

    const map = new Map<string, User>()
    map.set(snapshot.room.facilitator.id, snapshot.room.facilitator)
    snapshot.room.voters.forEach((participant) => map.set(participant.id, participant))
    snapshot.room.observers.forEach((participant) => map.set(participant.id, participant))
    return Array.from(map.values())
  }, [snapshot])

  const currentParticipant = useMemo(() => {
    if (!session) {
      return undefined
    }

    return allParticipants.find((participant) => participant.id === session.user.id)
  }, [allParticipants, session])

  const currentRole = currentParticipant?.role ?? session?.user.role
  const canVote = currentRole !== 'observer'
  const isFacilitator = snapshot ? session?.user.id === snapshot.room.facilitator.id : false

  const votesByParticipant = useMemo(() => {
    const lookup = new Map<string, string | number>()
    if (!activeVotable) {
      return lookup
    }

    activeVotable.votes.forEach((vote) => {
      lookup.set(vote.userId, vote.score)
    })
    return lookup
  }, [activeVotable])

  const expectedVoters = useMemo(() => {
    if (!snapshot) {
      return [] as User[]
    }

    return [snapshot.room.facilitator, ...snapshot.room.voters].filter((user) => user.role !== 'observer')
  }, [snapshot])

  const inviteUrl = session ? createInviteUrl(session.roomId) : ''

  const requireReducer = (): ReturnType<typeof createCRDTReducer> => {
    if (!reducerRef.current) {
      throw new Error('Room is not initialized')
    }

    return reducerRef.current
  }

  const createUser = (name: string, role: Role): User => ({
    id: generateParticipantId(),
    name,
    profileIcon: generateProfileIcon(name),
    role,
    online: true,
    joinedAt: Date.now(),
  })

  const handleCreateRoom = (): void => {
    const trimmedName = displayName.trim()
    const trimmedRoomName = roomName.trim()

    if (!trimmedName || !trimmedRoomName) {
      setErrorMessage('Please enter your name and a room name.')
      return
    }

    const roomId = generateRoomId()
    const facilitator = createUser(trimmedName, 'facilitator')
    setSession({
      mode: 'create',
      roomId,
      roomName: trimmedRoomName,
      user: facilitator,
    })
    setErrorMessage(null)
  }

  const handleJoinRoom = (): void => {
    const trimmedName = displayName.trim()
    const normalizedRoom = joinRoomId.trim().toUpperCase()

    if (!trimmedName || !normalizedRoom) {
      setErrorMessage('Please enter your name and the room ID.')
      return
    }

    const user = createUser(trimmedName, joinRole)
    setSession({
      mode: 'join',
      roomId: normalizedRoom,
      user,
    })
    setErrorMessage(null)
  }

  const handleAddVotable = (): void => {
    if (!isFacilitator) {
      return
    }

    const title = newItemName.trim()
    if (!title) {
      return
    }

    const reducer = requireReducer()
    const votableId = generateParticipantId()
    reducer.dispatch({
      type: 'addVotable',
      payload: {
        id: votableId,
        name: title,
        link: newItemLink.trim() || undefined,
        description: newItemDescription.trim() || undefined,
      },
    })

    if (!activeVotableId) {
      reducer.dispatch({
        type: 'setActiveVotable',
        payload: { votableId },
      })
    }

    setNewItemName('')
    setNewItemLink('')
    setNewItemDescription('')
  }

  const handleVote = (score: string | number): void => {
    if (!session || !activeVotableId || !canVote) {
      return
    }

    const reducer = requireReducer()
    reducer.dispatch({
      type: 'submitVote',
      payload: {
        id: generateParticipantId(),
        userId: session.user.id,
        votableId: activeVotableId,
        score,
      },
    })
  }

  const handleReveal = (): void => {
    if (!session || !activeVotableId || !isFacilitator) {
      return
    }

    requireReducer().dispatch({
      type: 'revealVotes',
      payload: {
        votableId: activeVotableId,
        revealedBy: session.user.id,
      },
    })
  }

  const handleReset = (): void => {
    if (!activeVotableId || !isFacilitator) {
      return
    }

    requireReducer().dispatch({
      type: 'resetVotes',
      payload: { votableId: activeVotableId },
    })
  }

  const handleFinalize = (value: string | number): void => {
    if (!activeVotableId || !isFacilitator) {
      return
    }

    requireReducer().dispatch({
      type: 'finalizeEstimate',
      payload: {
        votableId: activeVotableId,
        finalEstimate: value,
      },
    })
  }

  const beginEdit = (votable: Votable): void => {
    setEditingId(votable.id)
    setEditingName(votable.name)
    setEditingLink(votable.link ?? '')
    setEditingDescription(votable.description ?? '')
  }

  const handleSaveEdit = (): void => {
    if (!editingId || !isFacilitator) {
      return
    }

    requireReducer().dispatch({
      type: 'editVotable',
      payload: {
        votableId: editingId,
        name: editingName.trim() || 'Untitled',
        link: editingLink.trim() || undefined,
        description: editingDescription.trim() || undefined,
      },
    })
    setEditingId(null)
  }

  const handleSetActive = (votableId: string): void => {
    requireReducer().dispatch({
      type: 'setActiveVotable',
      payload: { votableId },
    })
  }

  const handleMove = (votableId: string, targetIndex: number): void => {
    if (!isFacilitator) {
      return
    }

    requireReducer().dispatch({
      type: 'reorderVotable',
      payload: { votableId, targetIndex },
    })
  }

  const handleRemove = (votableId: string): void => {
    if (!isFacilitator) {
      return
    }

    requireReducer().dispatch({
      type: 'removeVotable',
      payload: { votableId },
    })
  }

  const handleCopyInvite = async (): Promise<void> => {
    if (!inviteUrl) {
      return
    }

    await navigator.clipboard.writeText(inviteUrl)
  }

  const leaveRoom = (): void => {
    setSession(null)
    setSnapshot(undefined)
    setErrorMessage(null)
  }

  const renderLobby = (): React.ReactElement => (
    <main className="max-w-5xl mx-auto px-4 py-10 grid lg:grid-cols-2 gap-8">
      <section className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-2xl font-bold text-slate-900">Create Room</h2>
        <p className="text-slate-600 mt-2">Start a new planning poker session as facilitator.</p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-700">Your Name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Alex"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Room Name</span>
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Sprint Planning"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleCreateRoom}
          className="mt-5 w-full bg-slate-900 hover:bg-slate-700 text-white rounded-lg px-4 py-2 font-semibold"
        >
          Create Room
        </button>
      </section>

      <section className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-2xl font-bold text-slate-900">Join Room</h2>
        <p className="text-slate-600 mt-2">Join as voter or observer.</p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-700">Your Name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Sam"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Room ID</span>
            <input
              value={joinRoomId}
              onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest"
              placeholder="AB12CD"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Role</span>
            <select
              value={joinRole}
              onChange={(event) => setJoinRole(event.target.value as Role)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="voter">Voter</option>
              <option value="observer">Observer</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={handleJoinRoom}
          className="mt-5 w-full bg-teal-700 hover:bg-teal-600 text-white rounded-lg px-4 py-2 font-semibold"
        >
          Join Room
        </button>
      </section>
    </main>
  )

  const renderRoom = (): React.ReactElement => {
    const room = snapshot?.room

    return (
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-white rounded-xl shadow-lg border border-slate-200 p-5">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{room?.name ?? `Room ${session?.roomId}`}</h2>
              <p className="text-slate-600">Room ID: <span className="font-semibold tracking-widest">{session?.roomId}</span></p>
              <p className="text-sm text-slate-500 mt-1">
                Connection: <span className="font-semibold">{connectionStatus}</span> | Peers: {peerCount}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="bg-slate-100 hover:bg-slate-200 text-slate-900 px-3 py-2 rounded-lg"
              >
                Copy Invite
              </button>
              <button
                type="button"
                onClick={leaveRoom}
                className="bg-rose-100 hover:bg-rose-200 text-rose-900 px-3 py-2 rounded-lg"
              >
                Leave
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 break-all">{inviteUrl}</p>
        </section>

        <section className="grid xl:grid-cols-[1.2fr_1fr_1fr] gap-6">
          <div className="bg-white rounded-xl shadow border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Backlog Items</h3>
              <span className="text-sm text-slate-500">{snapshot?.votables.length ?? 0} items</span>
            </div>

            <div className="space-y-2">
              {snapshot?.votables.map((item, index) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 ${item.id === activeVotableId ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}
                >
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1"
                        placeholder="Item name"
                      />
                      <input
                        value={editingLink}
                        onChange={(event) => setEditingLink(event.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1"
                        placeholder="Link"
                      />
                      <textarea
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1"
                        placeholder="Description"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-2 py-1 bg-slate-900 text-white rounded"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 bg-slate-100 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-left w-full"
                        onClick={() => handleSetActive(item.id)}
                      >
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        {item.description ? <p className="text-sm text-slate-600 mt-1">{item.description}</p> : null}
                        {item.finalEstimate !== undefined ? (
                          <p className="text-xs mt-1 text-emerald-700">Final: {item.finalEstimate}</p>
                        ) : null}
                      </button>
                      {isFacilitator ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-sm">
                          <button type="button" onClick={() => beginEdit(item)} className="px-2 py-1 bg-slate-100 rounded">Edit</button>
                          <button type="button" onClick={() => handleMove(item.id, index - 1)} className="px-2 py-1 bg-slate-100 rounded">Up</button>
                          <button type="button" onClick={() => handleMove(item.id, index + 1)} className="px-2 py-1 bg-slate-100 rounded">Down</button>
                          <button type="button" onClick={() => handleRemove(item.id)} className="px-2 py-1 bg-rose-100 text-rose-800 rounded">Remove</button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </div>

            {isFacilitator ? (
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <h4 className="font-semibold text-slate-900">Add Item</h4>
                <input
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-2"
                  placeholder="Feature title"
                />
                <input
                  value={newItemLink}
                  onChange={(event) => setNewItemLink(event.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-2"
                  placeholder="https://ticket"
                />
                <textarea
                  value={newItemDescription}
                  onChange={(event) => setNewItemDescription(event.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-2"
                  placeholder="Description"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleAddVotable}
                  className="w-full bg-teal-700 hover:bg-teal-600 text-white py-2 rounded-lg font-semibold"
                >
                  Add Item
                </button>
              </div>
            ) : null}
          </div>

          <div className="bg-white rounded-xl shadow border border-slate-200 p-5 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Voting</h3>
            {!activeVotable ? (
              <p className="text-slate-600">Select or add an item to start voting.</p>
            ) : (
              <>
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                  <p className="text-sm text-slate-500">Active Item</p>
                  <p className="font-semibold text-slate-900">{activeVotable.name}</p>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {CARD_VALUES.map((value) => {
                    const selected = session ? votesByParticipant.get(session.user.id) === value : false
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!canVote || !activeVotable}
                        onClick={() => handleVote(value)}
                        className={`rounded-lg py-2 font-semibold border ${selected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'} ${!canVote ? 'opacity-40 cursor-not-allowed' : 'hover:border-slate-500'}`}
                      >
                        {value}
                      </button>
                    )
                  })}
                </div>

                <p className="text-sm text-slate-600">
                  {revealState.revealed
                    ? 'Votes have been revealed.'
                    : `Votes submitted: ${activeVotable.votes.length}/${expectedVoters.length}`}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleReveal}
                    disabled={!isFacilitator || !activeVotable.votes.length}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40"
                  >
                    Reveal
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!isFacilitator}
                    className="px-3 py-2 rounded-lg bg-amber-100 text-amber-900 disabled:opacity-40"
                  >
                    Reset Round
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinalize(votesByParticipant.get(session?.user.id ?? '') ?? '?')}
                    disabled={!isFacilitator || !revealState.revealed}
                    className="px-3 py-2 rounded-lg bg-emerald-100 text-emerald-900 disabled:opacity-40"
                  >
                    Finalize Selected
                  </button>
                </div>

                {revealState.revealed ? (
                  <div className="space-y-2 border-t border-slate-200 pt-3">
                    <h4 className="font-semibold">Revealed Votes</h4>
                    {expectedVoters.map((participant) => (
                      <div key={participant.id} className="flex items-center justify-between text-sm">
                        <span>{participant.profileIcon} {participant.name}</span>
                        <span className="font-semibold">{votesByParticipant.get(participant.id) ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="bg-white rounded-xl shadow border border-slate-200 p-5 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Participants</h3>
            <div className="space-y-2">
              {allParticipants.map((participant) => {
                const isOnline = awarenessUsers.some((entry) => entry.id === participant.id)
                const hasVoted = !!votesByParticipant.get(participant.id)

                return (
                  <div key={participant.id} className="rounded-lg border border-slate-200 p-2 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{participant.profileIcon} {participant.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{participant.role}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className={isOnline ? 'text-emerald-700' : 'text-slate-400'}>{isOnline ? 'Online' : 'Offline'}</p>
                      {participant.role !== 'observer' && activeVotable ? (
                        <p className={hasVoted ? 'text-teal-700' : 'text-slate-400'}>{hasVoted ? 'Voted' : 'Waiting'}</p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-slate-500">Observers can view session progress but cannot cast, reveal, or finalize votes.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#dbeafe_0%,transparent_35%),radial-gradient(circle_at_90%_10%,#ccfbf1_0%,transparent_35%),linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)]">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto py-5 px-4">
          <h1 className="text-3xl font-black text-slate-900">
            Planning Poker
          </h1>
          <p className="text-slate-600 mt-1">
            Phase 1 MVP: room management, presence, item workflow, and voting reveal loop.
          </p>
          {errorMessage ? <p className="text-rose-700 mt-2 text-sm">{errorMessage}</p> : null}
        </div>
      </header>

      {session ? renderRoom() : renderLobby()}
    </div>
  )
}
