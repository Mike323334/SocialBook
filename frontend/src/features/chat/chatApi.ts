import type { RetrievedPage } from './retrieval'

export interface ChatCitation {
  source_type: 'book_page'
  document_id: string
  title: string
  page_number: number | null
  score: number
}

export interface ChatAnswer {
  answer: string
  citations: ChatCitation[]
}

export async function askBookQuestion(
  question: string,
  documentId: string,
  title: string,
  pages: RetrievedPage[],
): Promise<ChatAnswer> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      context: [
        ...pages.map((page) => ({
          source_type: 'book_page',
          document_id: documentId,
          title,
          page_number: page.pageNumber,
          text: page.text,
          score: page.relevanceScore,
        })),
      ],
    }),
  })

  if (!response.ok) {
    let detail = 'The question could not be answered. Check that the API is running and try again.'
    try {
      const body: unknown = await response.json()
      if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') {
        detail = body.detail
      }
    } catch {
      // Keep the user-facing fallback when the server response is not JSON.
    }
    throw new Error(detail)
  }

  return await response.json() as ChatAnswer
}