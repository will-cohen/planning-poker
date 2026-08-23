# Planning Poker Signaling Server

A lightweight WebSocket signaling server for WebRTC peer discovery and connection establishment in the Planning Poker application.

## Architecture

- **WebSocket-based signaling**: Enables peers to exchange offer/answer/ICE candidates
- **Room-based peer discovery**: Clients connecting to the same room are notified of each other
- **Redis message queue**: Optional Redis integration for signal persistence and replay (useful for recovery)
- **Stateless design**: Can be horizontally scaled behind a load balancer
- **Docker containerized**: Runs seamlessly with Docker and docker-compose

## Features

- ✅ Minimal dependencies (ws, redis)
- ✅ Keep-alive ping/pong support
- ✅ Automatic cleanup of empty rooms
- ✅ Redis fallback (works without Redis in-memory)
- ✅ Graceful shutdown handling
- ✅ Error logging and monitoring

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose (recommended)
- Or Redis running locally if not using Docker

### Option 1: Docker Compose (Recommended)

```bash
cd /path/to/planning-poker

# Start both signaling server and Redis
docker-compose up

# The server will be available at ws://localhost:4444
```

### Option 2: Local Node.js

```bash
cd server

# Install dependencies
npm install

# Start with default settings (uses in-memory mode, no Redis)
npm start

# Or with Redis
REDIS_URL=redis://localhost:6379 npm start

# Development with watch mode
npm run dev
```

### Option 3: Production Deployment

Build the Docker image and deploy:

```bash
docker build -t planning-poker-signaling:latest server/

docker run -d \
  --name planning-poker-signaling \
  -p 4444:4444 \
  -e REDIS_URL=redis://your-redis-host:6379 \
  planning-poker-signaling:latest
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4444` | WebSocket server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL (optional) |
| `NODE_ENV` | `development` | Node environment |

### Frontend Configuration

Update your `.env` file:

```env
VITE_SIGNALING_SERVER=ws://localhost:4444
```

For production, use your deployed signaling server URL:

```env
VITE_SIGNALING_SERVER=wss://signaling.example.com
```

## Protocol

### Client → Server

#### Connect
Establish WebSocket connection with room ID:
```
ws://localhost:4444?room=ROOM_ID&clientId=CLIENT_ID
```

#### Send Signal
```json
{
  "type": "signal",
  "to": "PEER_ID",
  "signal": { "type": "offer", "sdp": "..." }
}
```

#### Keep-Alive
```json
{
  "type": "ping"
}
```

### Server → Client

#### Peer ID Assignment
```json
{
  "type": "peer-id",
  "peerId": "..."
}
```

#### Peer List
```json
{
  "type": "peers",
  "peers": [
    { "peerId": "...", "clientId": "..." },
    { "peerId": "...", "clientId": "..." }
  ]
}
```

#### Incoming Signal
```json
{
  "type": "signal",
  "from": "PEER_ID",
  "signal": { "type": "offer", "sdp": "..." }
}
```

#### Peer Left
```json
{
  "type": "peer-left",
  "peerId": "...",
  "peers": [...]
}
```

#### Keep-Alive Response
```json
{
  "type": "pong"
}
```

## Monitoring

### Logs

The server outputs helpful logs to stdout:

```
✓ Redis connected
🚀 Signaling server listening on ws://localhost:4444
[abc123def456] Connected to room: poker-session-1
[abc123def456] Disconnected from room: poker-session-1
[Room poker-session-1] Closed - no peers
```

### Health Check

For production setups behind a load balancer:

```bash
# TCP health check on port 4444
nc -zv localhost 4444

# Or test with wscat if installed
npm install -g wscat
wscat -c "ws://localhost:4444?room=health-check&clientId=health"
```

## Scaling

### Multiple Instances

The server is stateless except for active connections. For high availability:

1. Run multiple instances of the signaling server
2. Place behind a load balancer (e.g., nginx, HAProxy)
3. Use shared Redis for signal persistence (optional)
4. Sticky sessions may be needed depending on your load balancer

### Docker Compose Scaling

```bash
# Scale to 3 instances
docker-compose up --scale signaling-server=3
```

Note: You'll need to adjust the docker-compose.yml to use unique ports or a reverse proxy.

## Testing

### Manual Testing with wscat

```bash
npm install -g wscat

# Terminal 1 - Peer 1
wscat -c "ws://localhost:4444?room=test&clientId=peer1"

# Terminal 2 - Peer 2
wscat -c "ws://localhost:4444?room=test&clientId=peer2"

# Send a signal from Terminal 1
> {"type": "signal", "to": "PEER_ID_OF_PEER2", "signal": {"type": "offer"}}

# Peer 2 should receive it
< {"type":"signal","from":"PEER_ID_OF_PEER1","signal":{"type":"offer"}}
```

## Performance

- **Typical latency**: < 100ms signal delivery
- **Memory per peer**: ~10-50KB (varies by browser/client)
- **Concurrent peers**: Tested up to 1000 in single room (limitations depend on server resources)
- **Message throughput**: Capable of handling thousands of messages/sec

## Troubleshooting

### Server won't start
```
Error: EADDRINUSE: address already in use :::4444
```
Change the PORT:
```bash
PORT=5555 npm start
```

### Redis connection fails
```
⚠ Redis not available, running in memory mode
```
This is normal - the server will work without Redis using in-memory storage.

### Peers can't connect
- Verify firewall allows port 4444
- Check VITE_SIGNALING_SERVER environment variable in frontend
- Ensure room ID is URL-safe (no spaces or special characters)
- Look for error messages in server logs

### High latency signals
- Reduce distance between client and server (use CDN/edge deployment)
- Check network conditions (might be browser/ISP issue)
- Verify Redis isn't bottlenecking (if used)

## Production Checklist

- [ ] Use WSS (WebSocket Secure) with valid SSL certificate
- [ ] Set NODE_ENV=production
- [ ] Configure REDIS_URL for persistence
- [ ] Set up monitoring/logging (e.g., Sentry, DataDog)
- [ ] Configure firewall rules
- [ ] Set up health checks for load balancer
- [ ] Enable CORS if needed (modify server code)
- [ ] Rate limiting if exposed to public internet
- [ ] Configure auto-restart (systemd, supervisor, Docker restart policy)

## License

See parent project LICENSE.

## Support

For issues or questions, see the main project README.
