const EVENT_LOG_KEY = 'planning-poker:analytics-events'
const MAX_EVENTS = 500

export interface AnalyticsEvent {
  name: string
  timestamp: number
  attributes?: Record<string, string | number | boolean>
}

function readEvents(): AnalyticsEvent[] {
  const raw = localStorage.getItem(EVENT_LOG_KEY)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as AnalyticsEvent[]
  } catch {
    return []
  }
}

function writeEvents(events: AnalyticsEvent[]): void {
  localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(events.slice(-MAX_EVENTS)))
}

export function trackEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const event: AnalyticsEvent = {
    name,
    timestamp: Date.now(),
    attributes,
  }

  const events = readEvents()
  events.push(event)
  writeEvents(events)

  const isDevHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  if (isDevHost) {
    console.info('[analytics:event]', event)
  }
}

export function trackError(error: unknown, attributes?: Record<string, string | number | boolean>): void {
  const message = error instanceof Error ? error.message : String(error)
  trackEvent('error', {
    message,
    ...attributes,
  })

  console.error('[analytics:error]', error)
}
