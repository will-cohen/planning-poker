/**
 * CRDT and Yjs utilities for real-time synchronization
 */

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-webrtc'

export interface CRDTConfig {
  roomId: string
  awareness?: boolean
}

/**
 * Initialize Yjs document with shared types for Planning Poker
 */
export function initializeYDoc(config: CRDTConfig): Y.Doc {
  const ydoc = new Y.Doc()

  // Create shared types for room state
  const ymap = ydoc.getMap('shared')
  ymap.set('roomMeta', new Y.Map())
  ymap.set('participants', new Y.Map())
  ymap.set('backlogItems', new Y.Array())
  ymap.set('rounds', new Y.Array())
  ymap.set('uiState', new Y.Map())

  return ydoc
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
): WebsocketProvider {
  const provider = new WebsocketProvider(
    signalingServers.length > 0 ? signalingServers[0] : 'ws://localhost:1234',
    `planning-poker-${roomId}`,
    ydoc,
    {
      awareness: true,
      resyncInterval: 5000,
    }
  )

  return provider
}

/**
 * Get all currently connected peers
 */
export function getConnectedPeers(provider: WebsocketProvider): number {
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
