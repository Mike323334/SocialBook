
export interface RelationshipAnalysis {
  meaningful: boolean
  explanation: string
  connection: string
  bookAContribution: string
  bookBContribution: string
  importantDifference: string
  whyItMatters: string
  sharedConcepts: string[]
}

export async function analyzeRelationship(
  payload: {
    queryBook: string
    queryPage: number
    queryPassage: string
    matchedBook: string
    matchedPage: number
    matchedPassage: string
    similarity: number
  },
): Promise<RelationshipAnalysis> {
  const response =
    await fetch(
      'http://localhost:8000/api/memory/analyze-relationship',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify(
          payload,
        ),
      },
    )

  if (!response.ok) {
    let detail =
      'Failed to analyze book relationship.'

    try {
      const data =
        await response.json()

      if (
        typeof data.detail ===
        'string'
      ) {
        detail = data.detail
      }
    } catch {
      // Response wasn't JSON.
    }

    if (response.status === 429) {
      throw new Error(
        `429 Groq rate limit: ${detail}`,
      )
    }

    throw new Error(
      `${response.status}: ${detail}`,
    )
  }

  return (await response.json()) as RelationshipAnalysis
}

