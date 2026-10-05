import { database } from '../../db/database'

export interface SemanticSearchResult {
  chunkId: string
  documentId: string
  documentTitle: string
  pageNumber: number
  text: string
  similarity: number
}

export interface LoadedSemanticData {
  embeddings: Array<{
    id: string
    documentId: string
    vector: Float32Array
  }>
  chunks: Map<
    string,
    {
      id: string
      documentId: string
      pageNumber: number
      text: string
    }
  >
  documents: Map<
    string,
    {
      id: string
      title: string
    }
  >
}


/**
 * Calculate cosine similarity between two vectors.
 *
 * The embedding model produces normalized vectors,
 * but we calculate the full cosine similarity here
 * so the function remains safe if that changes later.
 */
export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimensions do not match: ${a.length} vs ${b.length}`,
    )
  }

  if (a.length === 0) {
    return 0
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i += 1) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  if (
    magnitudeA === 0 ||
    magnitudeB === 0
  ) {
    return 0
  }

  return (
    dotProduct /
    (
      Math.sqrt(magnitudeA) *
      Math.sqrt(magnitudeB)
    )
  )
}


/**
 * Load ALL semantic-search data from IndexedDB once.
 *
 * The old implementation repeatedly queried IndexedDB
 * while comparing chunks. That became very expensive with
 * 1,000+ chunks.
 *
 * This function loads everything once and lets JavaScript
 * perform the comparisons in memory.
 */
export async function loadSemanticData(): Promise<LoadedSemanticData> {
  const [
    embeddings,
    chunks,
    documents,
  ] = await Promise.all([
    database.memoryEmbeddings
      .where('model')
      .equals('Xenova/all-MiniLM-L6-v2')
      .toArray(),

    database.memoryChunks.toArray(),

    database.documents.toArray(),
  ])

  return {
    embeddings: embeddings.map(
      embedding => ({
        id: embedding.id,
        documentId:
          embedding.documentId,
        vector:
          embedding.vector,
      }),
    ),

    chunks: new Map(
      chunks.map(chunk => [
        chunk.id,
        {
          id: chunk.id,
          documentId:
            chunk.documentId,
          pageNumber:
            chunk.pageNumber,
          text: chunk.text,
        },
      ]),
    ),

    documents: new Map(
      documents.map(document => [
        document.id,
        {
          id: document.id,
          title: document.title,
        },
      ]),
    ),
  }
}


/**
 * Search using already-loaded semantic data.
 *
 * This is the fast path used by the new comparison system.
 */
export function searchLoadedSemanticData(
  queryEmbedding: Float32Array | number[],
  data: LoadedSemanticData,
  options?: {
    excludeDocumentId?: string
    excludeChunkId?: string
    limit?: number
    minSimilarity?: number
  },
): SemanticSearchResult[] {
  const limit =
    options?.limit ?? 10

  const minSimilarity =
    options?.minSimilarity ?? -Infinity

  const scored: Array<{
    embedding: LoadedSemanticData['embeddings'][number]
    similarity: number
  }> = []

  for (
    const embedding of data.embeddings
  ) {
    if (
      options?.excludeDocumentId &&
      embedding.documentId ===
        options.excludeDocumentId
    ) {
      continue
    }

    if (
      options?.excludeChunkId &&
      embedding.id ===
        options.excludeChunkId
    ) {
      continue
    }

    const similarity =
      cosineSimilarity(
        queryEmbedding,
        embedding.vector,
      )

    if (
      similarity >=
      minSimilarity
    ) {
      scored.push({
        embedding,
        similarity,
      })
    }
  }

  scored.sort(
    (a, b) =>
      b.similarity -
      a.similarity,
  )

  const topResults =
    scored.slice(0, limit)

  return topResults.flatMap(
    result => {
      const chunk =
        data.chunks.get(
          result.embedding.id,
        )

      if (!chunk) {
        return []
      }

      const document =
        data.documents.get(
          chunk.documentId,
        )

      if (!document) {
        return []
      }

      return [
        {
          chunkId: chunk.id,

          documentId:
            chunk.documentId,

          documentTitle:
            document.title,

          pageNumber:
            chunk.pageNumber,

          text:
            chunk.text,

          similarity:
            result.similarity,
        },
      ]
    },
  )
}


/**
 * Compatibility wrapper.
 *
 * Existing code can still call searchSimilarChunks().
 *
 * However, new code should prefer:
 *
 * loadSemanticData()
 * +
 * searchLoadedSemanticData()
 */
export async function searchSimilarChunks(
  queryEmbedding:
    | Float32Array
    | number[],
  options?: {
    excludeDocumentId?: string
    excludeChunkId?: string
    limit?: number
    minSimilarity?: number
  },
): Promise<SemanticSearchResult[]> {
  const data =
    await loadSemanticData()

  return searchLoadedSemanticData(
    queryEmbedding,
    data,
    options,
  )
}