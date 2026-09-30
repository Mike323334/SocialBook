export type AnalyticsEvent = 'daily_visit' | 'question' | 'book_upload'
const visitorKey = 'reading-memory.daily-visitor'

interface DailyVisitor {
  day: string
  id: string
}

function getDailyVisitorId(): string | null {
  try {
    const day = new Date().toISOString().slice(0, 10)
    const saved = localStorage.getItem(visitorKey)
    if (saved) {
      const visitor = JSON.parse(saved) as DailyVisitor
      if (visitor.day === day) return visitor.id
    }

    const id = crypto.randomUUID()
    localStorage.setItem(visitorKey, JSON.stringify({ day, id } satisfies DailyVisitor))
    return id
  } catch {
    return null
  }
}

export async function trackAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const visitorId = getDailyVisitorId()
  if (!visitorId) return

  try {
    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, visitor_id: visitorId }),
      keepalive: true,
    })
  } catch {
    // Analytics are best-effort and must never block reading or asking questions.
  }
}
