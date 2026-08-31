export type Role = 'facilitator' | 'voter' | 'observer'

export interface User {
  id: string
  name: string
  profileIcon: string
  role: Role
  online: boolean
  joinedAt: number
}

export interface Vote {
  id: string
  userId: string
  votableId: string
  score: string | number
  createdAt: number
}

export interface Votable {
  id: string
  name: string
  link?: string
  description?: string
  votes: Vote[]
  finalEstimate?: string | number
  status: 'pending' | 'estimating' | 'estimated'
  deleted?: boolean
}

export interface Room {
  id: string
  name: string
  facilitator: User
  voters: User[]
  observers: User[]
  votables: Votable[]
  status: 'active' | 'paused' | 'ended'
  createdAt: number
  passphrase?: string
}

export interface Round {
  id: string
  votableId: string
  startTime: number
  endTime?: number
  revealed: boolean
  revealedAt?: number
  votes: Map<string, string | number>
}

export interface RoomState {
  room: Room
  activeVotableId?: string
  rounds: Round[]
  timerActive: boolean
  timerDuration?: number
}

export interface CRDTState {
  room: Room
  users: Map<string, User>
  votables: Votable[]
  votes: Map<string, Vote>
  uiState: Map<string, unknown>
}

export interface CreateRoomInput {
  id: string
  name: string
  facilitator: User
  voters?: User[]
  observers?: User[]
  votables?: Votable[]
  status?: Room['status']
  createdAt?: number
  passphrase?: string
}

export interface CreateVotableInput {
  id: string
  name: string
  link?: string
  description?: string
  finalEstimate?: string | number
  status?: Votable['status']
}

export interface SubmitVoteInput {
  id: string
  userId: string
  votableId: string
  score: string | number
  createdAt?: number
}

export interface RevealVotesInput {
  votableId: string
  revealedBy: string
}

export interface ResetVotesInput {
  votableId: string
}

export interface FinalizeEstimateInput {
  votableId: string
  finalEstimate: string | number
}

export interface ActiveVotableInput {
  votableId: string
}

export interface JoinRoomInput {
  user: User
}

export interface EditVotableInput {
  votableId: string
  name: string
  link?: string
  description?: string
}

export interface RemoveVotableInput {
  votableId: string
}

export interface ReorderVotableInput {
  votableId: string
  targetIndex: number
}

export interface RemoveUserInput {
  userId: string
}

export interface MarkUserOfflineInput {
  userId: string
}

export type CRDTAction =
  | { type: 'createRoom'; payload: CreateRoomInput }
  | { type: 'upsertUser'; payload: User }
  | { type: 'joinAsVoter'; payload: JoinRoomInput }
  | { type: 'joinAsObserver'; payload: JoinRoomInput }
  | { type: 'removeUser'; payload: RemoveUserInput }
  | { type: 'markUserOffline'; payload: MarkUserOfflineInput }
  | { type: 'addVotable'; payload: CreateVotableInput }
  | { type: 'editVotable'; payload: EditVotableInput }
  | { type: 'removeVotable'; payload: RemoveVotableInput }
  | { type: 'reorderVotable'; payload: ReorderVotableInput }
  | { type: 'submitVote'; payload: SubmitVoteInput }
  | { type: 'revealVotes'; payload: RevealVotesInput }
  | { type: 'resetVotes'; payload: ResetVotesInput }
  | { type: 'finalizeEstimate'; payload: FinalizeEstimateInput }
  | { type: 'setActiveVotable'; payload: ActiveVotableInput }

// Backward-compatible aliases while the app transitions to the new model.
export type Participant = User
export type BacklogItem = Votable

export const CARD_VALUES = ['1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕', '🚫']
