import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackAnalyticsEvent } from './analyticsClient'

describe('anonymous analytics client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('sends events automatically with only the event and daily anonymous ID', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))

    await trackAnalyticsEvent('question')
    await trackAnalyticsEvent('book_upload')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const firstPayload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as Record<string, unknown>
    const secondPayload = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)) as Record<string, unknown>
    expect(Object.keys(firstPayload).sort()).toEqual(['event', 'visitor_id'])
    expect(firstPayload).toMatchObject({ event: 'question' })
    expect(secondPayload).toMatchObject({ event: 'book_upload', visitor_id: firstPayload.visitor_id })
    expect(firstPayload.visitor_id).toMatch(/^[0-9a-f-]{36}$/i)
  })

})