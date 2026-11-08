export interface SearchablePage {
  pageNumber: number
  text: string
}

export interface RetrievedPage extends SearchablePage {
  relevanceScore: number
}

const stopWords = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'between', 'but', 'can', 'could', 'does', 'from', 'have', 'into', 'its', 'just', 'more',
  'most', 'not', 'our', 'same', 'some', 'such', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'what', 'when', 'where',
  'which', 'while', 'with', 'would', 'your',
])

function terms(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []
}

export function retrievePages(
  question: string,
  pages: SearchablePage[],
  maxResults = 5,
  maxCharacters = 9000,
): RetrievedPage[] {
  const queryTerms = [...new Set(terms(question).filter((term) => !stopWords.has(term)))]
  if (queryTerms.length === 0 || maxResults <= 0 || maxCharacters <= 0) return []

  const ranked = pages.map((page) => {
    const pageTerms = terms(page.text)
    const termCounts = new Map<string, number>()
    for (const term of pageTerms) termCounts.set(term, (termCounts.get(term) ?? 0) + 1)
    const matches = queryTerms.reduce((count, term) => count + Number(termCounts.has(term)), 0)
    const frequency = queryTerms.reduce((score, term) => score + Math.min(termCounts.get(term) ?? 0, 3), 0)
    const relevanceScore = matches / queryTerms.length * 0.8 + Math.min(frequency / (queryTerms.length * 3), 1) * 0.2
    return { ...page, relevanceScore }
  })
    .filter((page) => page.relevanceScore > 0)
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, maxResults)

  const selected: RetrievedPage[] = []
  let remaining = maxCharacters
  for (const page of ranked) {
    if (remaining <= 0) break
    const matchingPositions = queryTerms
      .map((term) => page.text.toLocaleLowerCase().indexOf(term))
      .filter((position) => position >= 0)
    const excerptLength = Math.min(remaining, 3000)
    const excerptStart = matchingPositions.length > 0
      ? Math.max(0, Math.min(...matchingPositions) - 400)
      : 0
    const text = page.text.slice(excerptStart, excerptStart + excerptLength).trim()
    if (!text) continue
    selected.push({ ...page, text })
    remaining -= text.length
  }
  return selected
}