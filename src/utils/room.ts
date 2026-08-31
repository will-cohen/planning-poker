/**
 * Room utility functions for managing Planning Poker sessions
 */

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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create a shareable invite URL
 */
export function createInviteUrl(roomId: string, baseUrl: string = window.location.origin): string {
  return `${baseUrl}/app/${encodeURIComponent(roomId)}`
}

/**
 * Validate room ID format
 */
export function isValidRoomId(roomId: string): boolean {
  // Room IDs should be 6 characters, alphanumeric
  return /^[A-Z0-9]{6}$/.test(roomId)
}

export function generateProfileIcon(name: string): string {
  const glyphs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'Z']
  const normalized = name.trim().toUpperCase()
  if (!normalized) {
    return glyphs[Math.floor(Math.random() * glyphs.length)]
  }

  const code = normalized.charCodeAt(0)
  return glyphs[code % glyphs.length]
}
