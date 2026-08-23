import type { CRDTState, Role } from '../types'

const LAST_SESSION_KEY = 'planning-poker:last-session'

export interface StoredSession {
  mode: 'create' | 'join'
  roomId: string
  roomName?: string
  user: {
    id: string
    name: string
    profileIcon: string
    role: Role
  }
}

export function saveLastSession(session: StoredSession): void {
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session))
}

export function loadLastSession(): StoredSession | null {
  const raw = localStorage.getItem(LAST_SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.roomId || !parsed.user?.id || !parsed.user?.name) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function clearLastSession(): void {
  localStorage.removeItem(LAST_SESSION_KEY)
}

export function buildSessionExportRows(state: CRDTState): Array<Record<string, string>> {
  return state.votables.map((votable) => {
    const votes = votable.votes.map((vote) => String(vote.score))
    const numericVotes = votable.votes
      .map((vote) => (typeof vote.score === 'number' ? vote.score : Number(vote.score)))
      .filter((value) => Number.isFinite(value))

    const min = numericVotes.length > 0 ? Math.min(...numericVotes) : null
    const max = numericVotes.length > 0 ? Math.max(...numericVotes) : null
    const spread = min !== null && max !== null ? String(max - min) : ''

    return {
      id: votable.id,
      name: votable.name,
      link: votable.link ?? '',
      description: votable.description ?? '',
      status: votable.status,
      finalEstimate: votable.finalEstimate !== undefined ? String(votable.finalEstimate) : '',
      voteCount: String(votable.votes.length),
      voteValues: votes.join('|'),
      voteSpread: spread,
    }
  })
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

export function buildSessionCsv(state: CRDTState): string {
  const rows = buildSessionExportRows(state)
  const headers = ['id', 'name', 'link', 'description', 'status', 'finalEstimate', 'voteCount', 'voteValues', 'voteSpread']

  const lines = [headers.join(',')]
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '')).join(','))
  })

  return lines.join('\n')
}

export function buildSessionJson(state: CRDTState): string {
  const exportState = {
    room: {
      id: state.room.id,
      name: state.room.name,
      status: state.room.status,
      createdAt: state.room.createdAt,
      facilitator: state.room.facilitator.name,
      voterCount: state.room.voters.length,
      observerCount: state.room.observers.length,
    },
    exportedAt: Date.now(),
    items: buildSessionExportRows(state),
  }

  return JSON.stringify(exportState, null, 2)
}
