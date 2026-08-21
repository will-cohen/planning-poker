/**
 * Room utility functions for managing Planning Poker sessions
 */

import { v4 as uuidv4 } from 'crypto'

/**
 * Generate a unique room ID
 */
export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

/**
 * Generate a unique participant ID
 */
export function generateParticipantId(): string {
  // In a real app, this might use crypto.randomUUID()
  // For now, use a simple timestamp-based ID
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create a shareable invite URL
 */
export function createInviteUrl(roomId: string, baseUrl: string = window.location.origin): string {
  return `${baseUrl}/room/${roomId}`
}

/**
 * Validate room ID format
 */
export function isValidRoomId(roomId: string): boolean {
  // Room IDs should be 6 characters, alphanumeric
  return /^[A-Z0-9]{6}$/.test(roomId)
}
