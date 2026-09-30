import { describe, expect, it } from 'vitest'
import { retrievePages } from './retrieval'

describe('retrievePages', () => {
  const pages = [
    { pageNumber: 1, text: 'A passage about memory, attention, and what we retain.' },
    { pageNumber: 2, text: 'The author describes how attention shapes memory over time.' },
    { pageNumber: 3, text: 'A discussion of gardens, weather, and the changing seasons.' },
  ]

  it('returns matching evidence ordered by relevance', () => {
    const results = retrievePages('How does attention shape memory?', pages)

    expect(results.map(({ pageNumber }) => pageNumber)).toEqual([2, 1])
    expect(results[0].relevanceScore).toBeGreaterThan(results[1].relevanceScore)
  })

  it('returns no evidence when the question has no searchable overlap', () => {
    expect(retrievePages('Why is kindness valuable?', pages)).toEqual([])
  })

  it('respects the excerpt character budget', () => {
    const results = retrievePages('memory', [{ pageNumber: 1, text: 'memory '.repeat(5000) }], 5, 600)

    expect(results.reduce((total, page) => total + page.text.length, 0)).toBeLessThanOrEqual(600)
  })

  it('keeps a matching term in the excerpt when it occurs late on a page', () => {
    const longPage = `${'unrelated text '.repeat(300)}rareword appears in this sentence.`
    const results = retrievePages('rareword', [{ pageNumber: 8, text: longPage }])

    expect(results[0].text).toContain('rareword')
    expect(results[0].text.length).toBeLessThanOrEqual(3000)
  })
})