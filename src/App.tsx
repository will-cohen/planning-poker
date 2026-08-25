import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  CARD_VALUES,
  type CRDTAction,
  type CRDTState,
  type Role,
  type User,
  type Votable,
} from './types'
import {
  createIndexedDBProvider,
  createCRDTReducer,
  createWebRTCProvider,
  getConnectedPeers,
  initializeYDoc,
} from './utils/crdt'
import {
  buildSessionCsv,
  buildSessionJson,
  clearLastSession,
  loadLastSession,
  saveLastSession,
  type StoredSession,
} from './utils/session'
import { trackError, trackEvent } from './utils/telemetry'
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
  const [restorableSession, setRestorableSession] = useState<StoredSession | null>(null)
  const [snapshot, setSnapshot] = useState<CRDTState | undefined>(undefined)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected')
  const [peerCount, setPeerCount] = useState(1)
  const [awarenessUsers, setAwarenessUsers] = useState<AwarenessUser[]>([])
  const [persistenceState, setPersistenceState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const [newItemName, setNewItemName] = useState('')
  const [newItemLink, setNewItemLink] = useState('')
  const [newItemDescription, setNewItemDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingLink, setEditingLink] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [finalEstimateInput, setFinalEstimateInput] = useState('')

  const reducerRef = useRef<ReturnType<typeof createCRDTReducer> | null>(null)
  const ydocRef = useRef<ReturnType<typeof initializeYDoc> | null>(null)
  const providerRef = useRef<ReturnType<typeof createWebRTCProvider> | null>(null)
  const hasCreatedRoomRef = useRef(false)
  const hasJoinedRoomRef = useRef(false)
  const previousAwarenessUsersRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setRestorableSession(loadLastSession())

    const onWindowError = (event: ErrorEvent): void => {
      trackError(event.error ?? event.message, { source: 'window.error' })
      setErrorMessage('An unexpected error occurred. Please refresh or rejoin the room.')
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      trackError(event.reason, { source: 'window.unhandledrejection' })
      setErrorMessage('A background operation failed. Please try the action again.')
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    const persisted: StoredSession = {
      mode: session.mode,
      roomId: session.roomId,
      roomName: session.roomName,
      user: {
        id: session.user.id,
        name: session.user.name,
        profileIcon: session.user.profileIcon,
        role: session.user.role,
      },
    }

    saveLastSession(persisted)
    setRestorableSession(persisted)
  }, [session])

  useEffect(() => {
    if (!session) {
      reducerRef.current = null
      ydocRef.current = null
      providerRef.current = null
      setSnapshot(undefined)
      setAwarenessUsers([])
      setPeerCount(1)
      setConnectionStatus('disconnected')
      setPersistenceState('idle')
      return
    }

    hasCreatedRoomRef.current = false
    hasJoinedRoomRef.current = false

    const ydoc = initializeYDoc({ roomId: session.roomId, awareness: true })
    const provider = createWebRTCProvider(ydoc, session.roomId)
    const indexeddb = createIndexedDBProvider(ydoc, session.roomId)
    const reducer = createCRDTReducer(ydoc)
    setPersistenceState('syncing')

    indexeddb.whenSynced
      .then(() => {
        setPersistenceState('synced')
        trackEvent('indexeddb_synced', { roomId: session.roomId })
      })
      .catch((error) => {
        setPersistenceState('error')
        trackError(error, { roomId: session.roomId, stage: 'indexeddb_sync' })
      })

    ydocRef.current = ydoc
    providerRef.current = provider
    reducerRef.current = reducer

    const refreshSnapshot = (): void => {
      const newSnapshot = reducer.getState()
      console.log('[CRDT] State updated. Room participants:', {
        facilitator: newSnapshot?.room.facilitator.name,
        voters: newSnapshot?.room.voters.map(v => v.name) ?? [],
        observers: newSnapshot?.room.observers.map(o => o.name) ?? [],
      })
      setSnapshot(newSnapshot)
    }

    const refreshAwareness = (): void => {
      const users: AwarenessUser[] = []
      const currentUserIds = new Set<string>()

      provider.awareness.getStates().forEach((state) => {
        const userState = (state as { user?: AwarenessUser }).user
        if (userState) {
          users.push(userState)
          currentUserIds.add(userState.id)
        }
      })

      const previousUserIds = previousAwarenessUsersRef.current

      // Only detect disconnects if:
      // 1. We've previously tracked users (avoid false positives during initial sync)
      // 2. The previous set was non-empty (so we had a baseline)
      // 3. A user who was present is now missing (and not the local user)
      const disconnectedUserIds = previousUserIds.size > 0
        ? Array.from(previousUserIds).filter(
            (userId) => !currentUserIds.has(userId) && userId !== session.user.id
          )
        : []

      // Mark users as offline when they disconnect from awareness
      if (disconnectedUserIds.length > 0 && reducerRef.current) {
        disconnectedUserIds.forEach((userId) => {
          console.log('[Awareness] User disconnected:', userId)
          // Use markUserOffline instead of removeUser to keep users in the room
          reducerRef.current!.dispatch({
            type: 'markUserOffline',
            payload: { userId },
          })
          trackEvent('user_disconnected', { roomId: session.roomId, userId })
        })
      }

      previousAwarenessUsersRef.current = currentUserIds
      console.log('[Awareness] Updated users:', users, 'Total in awareness:', currentUserIds.size)
      setAwarenessUsers(users)
      setPeerCount(getConnectedPeers(provider))
    }

    provider.awareness.setLocalStateField('user', {
      id: session.user.id,
      name: session.user.name,
      role: session.user.role,
      profileIcon: session.user.profileIcon,
    })
    console.log('[Awareness] Set local user state:', { id: session.user.id, name: session.user.name })

    // Initialize awareness tracking
    previousAwarenessUsersRef.current = new Set([session.user.id])

    ydoc.on('update', refreshSnapshot)
    provider.awareness.on('change', refreshAwareness)
    provider.on('status', ({ connected }: { connected: boolean }) => {
      const status = connected ? 'connected' : 'disconnected'
      setConnectionStatus(status)
      setPeerCount(getConnectedPeers(provider))
      trackEvent('signaling_status', { status, roomId: session.roomId })
    })

    refreshSnapshot()
    refreshAwareness()

    return () => {
      provider.awareness.off('change', refreshAwareness)
      ydoc.off('update', refreshSnapshot)
      void indexeddb.destroy()
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
      console.log('[Room] Creating room:', session.roomId)
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
      if (!snapshot?.room) {
        console.log('[Room] Waiting for room state to be created...')
      }
      return
    }

    console.log('[Room] Joining room as', session.user.role, ':', session.user)
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
  const onlineUserIds = useMemo(() => new Set(awarenessUsers.map((user) => user.id)), [awarenessUsers])

  const persistenceLabel = useMemo(() => {
    switch (persistenceState) {
      case 'syncing':
        return 'Restoring room state...'
      case 'synced':
        return 'Session persisted locally'
      case 'error':
        return 'Local persistence unavailable'
      default:
        return ''
    }
  }, [persistenceState])

  const downloadTextFile = (filename: string, mimeType: string, content: string): void => {
    const blob = new Blob([content], { type: mimeType })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(href)
  }

  const requireReducer = (): ReturnType<typeof createCRDTReducer> => {
    if (!reducerRef.current) {
      throw new Error('Room is not initialized')
    }

    return reducerRef.current
  }

  const dispatchAction = useCallback((action: CRDTAction): void => {
    const reducer = requireReducer()
    const startedAt = performance.now()

    try {
      reducer.dispatch(action)
      const duration = Math.round(performance.now() - startedAt)
      trackEvent('action_dispatched', { action: action.type, durationMs: duration })
      setErrorMessage(null)
    } catch (error) {
      trackError(error, { action: action.type })
      setErrorMessage(`Action failed: ${action.type}`)
    }
  }, [])

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
    trackEvent('room_created', { roomId })
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
    trackEvent('room_join_requested', { roomId: normalizedRoom, role: joinRole })
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

    const votableId = generateParticipantId()
    dispatchAction({
      type: 'addVotable',
      payload: {
        id: votableId,
        name: title,
        link: newItemLink.trim() || undefined,
        description: newItemDescription.trim() || undefined,
      },
    })

    if (!activeVotableId) {
      dispatchAction({
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

    dispatchAction({
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

    dispatchAction({
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

    dispatchAction({
      type: 'resetVotes',
      payload: { votableId: activeVotableId },
    })
  }

  const handleFinalize = (value: string | number): void => {
    if (!activeVotableId || !isFacilitator) {
      return
    }

    dispatchAction({
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

    dispatchAction({
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
    dispatchAction({
      type: 'setActiveVotable',
      payload: { votableId },
    })
  }

  const handleMove = (votableId: string, targetIndex: number): void => {
    if (!isFacilitator) {
      return
    }

    dispatchAction({
      type: 'reorderVotable',
      payload: { votableId, targetIndex },
    })
  }

  const handleRemove = (votableId: string): void => {
    if (!isFacilitator) {
      return
    }

    dispatchAction({
      type: 'removeVotable',
      payload: { votableId },
    })
  }

  const handleExportCsv = (): void => {
    if (!snapshot || !session) {
      return
    }

    const csv = buildSessionCsv(snapshot)
    const filename = `planning-poker-${session.roomId}-${Date.now()}.csv`
    downloadTextFile(filename, 'text/csv;charset=utf-8', csv)
    setExportMessage('CSV exported')
    trackEvent('session_exported', { format: 'csv', roomId: session.roomId })
  }

  const handleExportJson = (): void => {
    if (!snapshot || !session) {
      return
    }

    const json = buildSessionJson(snapshot)
    const filename = `planning-poker-${session.roomId}-${Date.now()}.json`
    downloadTextFile(filename, 'application/json;charset=utf-8', json)
    setExportMessage('JSON exported')
    trackEvent('session_exported', { format: 'json', roomId: session.roomId })
  }

  const handleCopyInvite = async (): Promise<void> => {
    if (!inviteUrl) {
      return
    }

    await navigator.clipboard.writeText(inviteUrl)
    trackEvent('invite_copied', { roomId: session?.roomId ?? '' })
  }

  const leaveRoom = (): void => {
    trackEvent('room_left', { roomId: session?.roomId ?? '' })
    setSession(null)
    setSnapshot(undefined)
    setErrorMessage(null)
    setExportMessage(null)
  }

  const restoreSession = (): void => {
    if (!restorableSession) {
      return
    }

    setSession({
      mode: restorableSession.mode,
      roomId: restorableSession.roomId,
      roomName: restorableSession.roomName,
      user: {
        ...restorableSession.user,
        online: true,
        joinedAt: Date.now(),
      },
    })

    trackEvent('session_restored', { roomId: restorableSession.roomId, mode: restorableSession.mode })
  }

  const forgetStoredSession = (): void => {
    clearLastSession()
    setRestorableSession(null)
    trackEvent('stored_session_cleared')
  }

  const renderLobby = (): React.ReactElement => (
    <main className="max-w-5xl mx-auto px-4 py-10 grid lg:grid-cols-2 gap-8">
      {restorableSession ? (
        <section className="lg:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap gap-3 justify-between items-center" aria-live="polite">
          <div>
            <p className="font-semibold text-amber-900">Resume previous session</p>
            <p className="text-sm text-amber-800">{restorableSession.roomName ?? restorableSession.roomId} as {restorableSession.user.name}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={restoreSession} className="px-3 py-2 rounded-lg bg-amber-700 text-white" aria-label="Resume previous session">
              Resume
            </button>
            <button type="button" onClick={forgetStoredSession} className="px-3 py-2 rounded-lg bg-amber-100 text-amber-900" aria-label="Forget previous session">
              Forget
            </button>
          </div>
        </section>
      ) : null}

      <section className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-2xl font-bold text-slate-900">Create Room</h2>
        <p className="text-slate-600 mt-2">Start a new planning poker session as facilitator.</p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-700">Your Name</span>
            <input
              aria-label="Create room display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Alex"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Room Name</span>
            <input
              aria-label="Create room name"
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
          aria-label="Create planning poker room"
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
              aria-label="Join room display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Sam"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Room ID</span>
            <input
              aria-label="Room ID to join"
              value={joinRoomId}
              onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest"
              placeholder="AB12CD"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Role</span>
            <select
              aria-label="Role when joining room"
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
          aria-label="Join planning poker room"
          className="mt-5 w-full bg-teal-700 hover:bg-teal-600 text-white rounded-lg px-4 py-2 font-semibold"
        >
          Join Room
        </button>
      </section>
    </main>
  )

  const renderRoom = (): React.ReactElement => {
    const room = snapshot?.room
    const tableParticipants = expectedVoters
    const observerParticipants = snapshot?.room.observers ?? []
    const selectedVote = session ? votesByParticipant.get(session.user.id) : undefined

    const getSeatStyle = (index: number, total: number): React.CSSProperties => {
      const count = Math.max(total, 1)
      const angle = ((Math.PI * 2) / count) * index - Math.PI / 2
      const x = 50 + 38 * Math.cos(angle)
      const y = 50 + 33 * Math.sin(angle)

      return {
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
      }
    }

    return (
      <>
        <main className="max-w-7xl mx-auto px-4 py-8 pb-44 space-y-6">
          <section className="bg-white rounded-xl shadow-lg border border-slate-200 p-5">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{room?.name ?? `Room ${session?.roomId}`}</h2>
                <p className="text-slate-600">Room ID: <span className="font-semibold tracking-widest">{session?.roomId}</span></p>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                  Connection: 
                  <span className={`inline-flex items-center gap-1 font-semibold px-2 py-1 rounded ${
                    connectionStatus === 'connected' 
                      ? 'bg-emerald-100 text-emerald-900' 
                      : 'bg-amber-100 text-amber-900'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-600' : 'bg-amber-600'} animate-pulse`}></span>
                    {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                  </span>
                  | Peers: {peerCount}
                </p>
                {persistenceLabel ? <p className="text-xs text-slate-500 mt-1" role="status" aria-live="polite">{persistenceLabel}</p> : null}
                {connectionStatus === 'disconnected' && (
                  <p className="text-sm text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    You are currently disconnected. Changes may not sync to other participants.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  aria-label="Copy invite link"
                  className="bg-slate-100 hover:bg-slate-200 text-slate-900 px-3 py-2 rounded-lg"
                >
                  Copy Invite
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  aria-label="Export session as CSV"
                  className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 px-3 py-2 rounded-lg"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  aria-label="Export session as JSON"
                  className="bg-cyan-100 hover:bg-cyan-200 text-cyan-900 px-3 py-2 rounded-lg"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={leaveRoom}
                  aria-label="Leave room"
                  className="bg-rose-100 hover:bg-rose-200 text-rose-900 px-3 py-2 rounded-lg"
                >
                  Leave
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 break-all">{inviteUrl}</p>
            {exportMessage ? <p className="text-xs text-emerald-700 mt-1" aria-live="polite">{exportMessage}</p> : null}
          </section>

          <section className="grid xl:grid-cols-[1.05fr_1.95fr] gap-6">
            <div className="bg-white rounded-xl shadow border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Backlog Items</h3>
                <span className="text-sm text-slate-500">{snapshot?.votables.length ?? 0} items</span>
              </div>

              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {snapshot?.votables.map((item, index) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${item.id === activeVotableId ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}
                  >
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <input
                          aria-label="Edit item name"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1"
                          placeholder="Item name"
                        />
                        <input
                          aria-label="Edit item link"
                          value={editingLink}
                          onChange={(event) => setEditingLink(event.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1"
                          placeholder="Link"
                        />
                        <textarea
                          aria-label="Edit item description"
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
                    aria-label="New item name"
                    value={newItemName}
                    onChange={(event) => setNewItemName(event.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-2"
                    placeholder="Feature title"
                  />
                  <input
                    aria-label="New item link"
                    value={newItemLink}
                    onChange={(event) => setNewItemLink(event.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-2"
                    placeholder="https://ticket"
                  />
                  <textarea
                    aria-label="New item description"
                    value={newItemDescription}
                    onChange={(event) => setNewItemDescription(event.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-2"
                    placeholder="Description"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={handleAddVotable}
                    aria-label="Add backlog item"
                    className="w-full bg-teal-700 hover:bg-teal-600 text-white py-2 rounded-lg font-semibold"
                  >
                    Add Item
                  </button>
                </div>
              ) : null}
            </div>

            <div className="bg-white rounded-xl shadow border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Table</h3>
                  <p className="text-sm text-slate-600">
                    {activeVotable
                      ? `Estimating: ${activeVotable.name}`
                      : 'Select or add an item to start voting.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleReveal}
                    disabled={!isFacilitator || !activeVotable?.votes.length}
                    aria-label="Reveal votes"
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40"
                  >
                    Reveal
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!isFacilitator || !activeVotable}
                    aria-label="Reset current voting round"
                    className="px-3 py-2 rounded-lg bg-amber-100 text-amber-900 disabled:opacity-40"
                  >
                    Reset
                  </button>
                  <input
                    aria-label="Final estimate"
                    value={finalEstimateInput}
                    onChange={(event) => setFinalEstimateInput(event.target.value)}
                    className="px-2 py-2 rounded-lg border border-slate-300 w-28"
                    placeholder="Estimate"
                  />
                  <button
                    type="button"
                    onClick={() => handleFinalize(finalEstimateInput || (selectedVote ?? '?'))}
                    disabled={!isFacilitator || !revealState.revealed || !activeVotable}
                    aria-label="Finalize estimate"
                    className="px-3 py-2 rounded-lg bg-emerald-100 text-emerald-900 disabled:opacity-40"
                  >
                    Finalize
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 p-4">
                <div className="relative h-[560px] md:h-[600px]">
                  <div className="absolute left-1/2 top-1/2 w-[74%] h-[56%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] border-[10px] border-emerald-800 bg-emerald-700 shadow-[inset_0_15px_35px_rgba(0,0,0,0.15)]" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/90 text-sm font-semibold tracking-wide">
                    {revealState.revealed ? 'Votes Revealed' : `Votes: ${activeVotable?.votes.length ?? 0}/${tableParticipants.length}`}
                  </div>

                  {tableParticipants.map((participant, index) => {
                    const voteValue = votesByParticipant.get(participant.id)
                    const hasVoted = voteValue !== undefined
                    const isCurrentUser = participant.id === session?.user.id

                    return (
                      <div
                        key={participant.id}
                        className="absolute flex flex-col items-center gap-2"
                        style={getSeatStyle(index, tableParticipants.length)}
                      >
                        <div className={`h-14 w-14 rounded-full border-2 flex items-center justify-center text-lg font-black shadow ${isCurrentUser ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white text-slate-700'}`}>
                          {participant.profileIcon}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 text-center max-w-24 truncate" title={participant.name}>
                          {participant.name}
                        </div>

                        <div className="h-16 w-12 rounded-md border-2 border-slate-400 shadow-sm flex items-center justify-center">
                          {hasVoted ? (
                            revealState.revealed ? (
                              <span className="text-lg font-black text-slate-800">{String(voteValue)}</span>
                            ) : (
                              <div className="h-full w-full rounded-sm bg-slate-800 bg-[radial-gradient(circle_at_30%_30%,#334155_0%,#0f172a_70%)] relative overflow-hidden">
                                <div className="absolute inset-0 opacity-40 [background:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,0.25)_7px,transparent_8px)]" />
                              </div>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400">Waiting</span>
                          )}
                        </div>

                        <span className={`text-[11px] ${onlineUserIds.has(participant.id) ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {onlineUserIds.has(participant.id) ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {observerParticipants.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Observers</p>
                  <div className="flex flex-wrap gap-2">
                    {observerParticipants.map((participant) => (
                      <div key={participant.id} className={`px-2.5 py-1.5 rounded-full border text-xs flex items-center gap-2 ${
                        onlineUserIds.has(participant.id)
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-slate-100 border-slate-300 text-slate-600 opacity-60'
                      }`}>
                        {participant.profileIcon} 
                        <span>{participant.name}</span>
                        <span className="text-[10px]">{onlineUserIds.has(participant.id) ? '●' : '○'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </main>

        {activeVotable ? (
          <section className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
            <div className="max-w-7xl mx-auto">
              <p className="text-xs text-slate-500 mb-2">Pick your card</p>
              <div className="flex flex-wrap justify-center gap-2">
                {CARD_VALUES.map((value) => {
                  const selected = selectedVote === value
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!canVote}
                      onClick={() => handleVote(value)}
                      aria-label={`Vote ${value}`}
                      aria-pressed={selected}
                      className={`h-14 w-12 rounded-md border-2 font-bold transition ${selected ? 'bg-slate-900 border-slate-900 text-white -translate-y-1' : 'bg-white border-slate-300 text-slate-800'} ${!canVote ? 'opacity-40 cursor-not-allowed' : 'hover:border-slate-500 hover:-translate-y-0.5'}`}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        ) : null}
      </>
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
            Phase 2 hardening: persistence, export, accessibility, analytics, and performance tuning.
          </p>
          {errorMessage ? <p className="text-rose-700 mt-2 text-sm" role="alert">{errorMessage}</p> : null}
        </div>
      </header>

      {session ? renderRoom() : renderLobby()}
    </div>
  )
}
