import { WebSocketServer } from 'ws';
import { createClient } from 'redis';
import http from 'http';
import url from 'url';

const PORT = process.env.PORT || 4444;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Room state: { [roomId]: Set<peer connections> }
const rooms = new Map();

// Peer state: { [peerId]: { conn, roomId, clientId } }
const peers = new Map();

let redisClient;
let redisReady = false;

// Initialize Redis client for message queue
try {
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', (err) => console.warn('Redis error:', err));
  redisClient.on('connect', () => console.log('✓ Redis connected'));
  await redisClient.connect();
  redisReady = true;
} catch (err) {
  console.warn('⚠ Redis not available, running in memory mode:', err.message);
  redisClient = null;
}

// Create HTTP server for WebSocket
const server = http.createServer();
const wss = new WebSocketServer({ server });

function generatePeerId() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function broadcastToRoom(roomId, message, excludePeerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.forEach((peerConn) => {
    const peer = Array.from(peers.values()).find((p) => p.conn === peerConn);
    if (peer && peer.peerId !== excludePeerId) {
      try {
        peerConn.send(JSON.stringify(message));
      } catch (err) {
        console.error('Error sending message:', err);
      }
    }
  });
}

async function storeSignalInRedis(roomId, fromPeerId, message) {
  if (!redisClient || !redisReady) return;

  try {
    const key = `signal:${roomId}:${Date.now()}:${Math.random()}`;
    await redisClient.setEx(key, 3600, JSON.stringify({ fromPeerId, message }));
  } catch (err) {
    console.error('Error storing signal in Redis:', err);
  }
}

wss.on('connection', (ws, req) => {
  const peerId = generatePeerId();
  const queryParams = new url.URLSearchParams(new url.parse(req.url).query);
  const roomId = queryParams.get('room');
  const clientId = queryParams.get('clientId');

  console.log(`[${peerId}] Connected to room: ${roomId}`);

  if (!roomId) {
    ws.close(4000, 'Missing room parameter');
    return;
  }

  // Initialize room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const room = rooms.get(roomId);
  room.add(ws);

  peers.set(peerId, { conn: ws, roomId, clientId, peerId });

  // Send peer ID to connecting client
  ws.send(JSON.stringify({ type: 'peer-id', peerId }));

  // Notify room of new peer
  const peerList = Array.from(room)
    .map((conn) => {
      const p = Array.from(peers.values()).find((x) => x.conn === conn);
      return p ? { peerId: p.peerId, clientId: p.clientId } : null;
    })
    .filter(Boolean);

  broadcastToRoom(roomId, { type: 'peers', peers: peerList }, peerId);
  ws.send(JSON.stringify({ type: 'peers', peers: peerList }));

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      const { type, to, signal } = message;

      if (type === 'signal') {
        // Route signal (offer/answer/candidate) to specific peer
        if (to) {
          const targetPeer = Array.from(peers.values()).find((p) => p.peerId === to);
          if (targetPeer && targetPeer.conn.readyState === 1) {
            targetPeer.conn.send(
              JSON.stringify({
                type: 'signal',
                from: peerId,
                signal,
              })
            );

            // Store signal in Redis for recovery/replay if needed
            await storeSignalInRedis(roomId, peerId, { to, signal });
          }
        }
      } else if (type === 'ping') {
        // Keep-alive ping
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`[${peerId}] Disconnected from room: ${roomId}`);

    peers.delete(peerId);
    room.delete(ws);

    // Remove empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`[Room ${roomId}] Closed - no peers`);
    } else {
      // Notify remaining peers
      const peerList = Array.from(room)
        .map((conn) => {
          const p = Array.from(peers.values()).find((x) => x.conn === conn);
          return p ? { peerId: p.peerId, clientId: p.clientId } : null;
        })
        .filter(Boolean);

      broadcastToRoom(roomId, { type: 'peer-left', peerId, peers: peerList });
    }
  });

  ws.on('error', (err) => {
    console.error(`[${peerId}] WebSocket error:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server listening on ws://localhost:${PORT}`);
  console.log(`📡 Redis ${redisReady ? 'connected' : '(fallback: in-memory mode)'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  if (redisClient) {
    await redisClient.quit();
  }
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
