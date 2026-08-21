export type Role = 'facilitator' | 'voter' | 'observer'

export interface Participant {
  id: string
  nickname: string
  role: Role
  online: boolean
  joinedAt: number
}

export interface BacklogItem {
  id: string
  title: string
  description?: string
  order: number
  finalEstimate?: string | number
  status: 'pending' | 'estimating' | 'estimated'
}

export interface Vote {
  participantId: string
  value: string | number
  timestamp: number
}

export interface Round {
  id: string
  itemId: string
  startTime: number
  endTime?: number
  revealed: boolean
  revealedAt?: number
  votes: Map<string, string | number>
}

export interface RoomMeta {
  id: string
  name: string
  facilitatorId: string
  status: 'active' | 'paused' | 'ended'
  createdAt: number
  passphrase?: string
}

export interface RoomState {
  meta: RoomMeta
  participants: Map<string, Participant>
  backlogItems: BacklogItem[]
  activeItemId?: string
  rounds: Round[]
  timerActive: boolean
  timerDuration?: number
}

export const CARD_VALUES = ['1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕', '🚫']
