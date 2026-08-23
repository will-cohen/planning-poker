import { WebSocketServer } from 'ws'
import http from 'http'

const PORT = Number(process.env.PORT || 4444)
const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const pingTimeoutMs = 30000

const topics = new Map()

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

const wss = new WebSocketServer({ noServer: true })

function send(conn, message) {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    conn.close()
    return
  }

  try {
    conn.send(JSON.stringify(message))
  } catch (error) {
    console.error('Failed to send websocket message', error)
    conn.close()
  }
}

function addSubscription(conn, topicName, subscribedTopics) {
  if (typeof topicName !== 'string' || topicName.length === 0) {
    return
  }

  const subs = topics.get(topicName) ?? new Set()
  subs.add(conn)
  topics.set(topicName, subs)
  subscribedTopics.add(topicName)
}

function removeSubscription(conn, topicName, subscribedTopics) {
  const subs = topics.get(topicName)
  if (!subs) {
    return
  }

  subs.delete(conn)
  subscribedTopics.delete(topicName)
  if (subs.size === 0) {
    topics.delete(topicName)
  }
}

function cleanupConnection(conn, subscribedTopics) {
  subscribedTopics.forEach((topicName) => removeSubscription(conn, topicName, subscribedTopics))
}

function handlePublish(conn, message) {
  const topic = message.topic
  if (typeof topic !== 'string') {
    return
  }

  const receivers = topics.get(topic)
  if (!receivers) {
    return
  }

  const payload = {
    ...message,
    clients: receivers.size,
  }

  receivers.forEach((receiver) => {
    send(receiver, payload)
  })
}

wss.on('connection', (conn) => {
  const subscribedTopics = new Set()
  let closed = false
  let pongReceived = true

  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close()
      clearInterval(pingInterval)
      return
    }

    pongReceived = false
    try {
      conn.ping()
    } catch (error) {
      console.error('Ping failed, closing socket', error)
      conn.close()
    }
  }, pingTimeoutMs)

  conn.on('pong', () => {
    pongReceived = true
  })

  conn.on('close', () => {
    closed = true
    clearInterval(pingInterval)
    cleanupConnection(conn, subscribedTopics)
  })

  conn.on('message', (rawMessage) => {
    try {
      const payload = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf8')
      const message = JSON.parse(payload)
      if (!message?.type || closed) {
        return
      }

      switch (message.type) {
        case 'subscribe':
          ;(message.topics || []).forEach((topicName) => addSubscription(conn, topicName, subscribedTopics))
          console.log('Subscribed topics:', Array.from(subscribedTopics).join(', ') || '(none)')
          break
        case 'unsubscribe':
          ;(message.topics || []).forEach((topicName) => removeSubscription(conn, topicName, subscribedTopics))
          break
        case 'publish':
          handlePublish(conn, message)
          break
        case 'ping':
          send(conn, { type: 'pong' })
          break
        default:
          break
      }
    } catch (error) {
      console.error('Error processing websocket message', error)
    }
  })

  conn.on('error', (error) => {
    console.error('WebSocket connection error', error)
  })
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

server.listen(PORT, () => {
  console.log(`Signaling server listening on ws://localhost:${PORT}`)
  console.log('Protocol: y-webrtc subscribe/publish')
})

process.on('SIGTERM', () => {
  console.log('Shutting down signaling server...')
  wss.close(() => {
    server.close(() => {
      process.exit(0)
    })
  })
})
