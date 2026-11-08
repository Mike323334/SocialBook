import { database } from '../../db/database'
import { generateEmbedding } from './embeddings'

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

export interface EmbeddingProgress {
  completed: number
  total: number
}

export async function indexDocumentEmbeddings(
  documentId: string,
  onProgress?: (progress: EmbeddingProgress) => void,
): Promise<number> {
  const chunks = await database.memoryChunks
    .where('documentId')
    .equals(documentId)
    .toArray()

  if (chunks.length === 0) {
    return 0
  }

  const existingEmbeddings = await database.memoryEmbeddings
    .where('documentId')
    .equals(documentId)
    .toArray()

  const existingIds = new Set(
    existingEmbeddings
      .filter(
        embedding => embedding.model === EMBEDDING_MODEL,
      )
      .map(embedding => embedding.id),
  )

  const chunksToProcess = chunks.filter(
    chunk => !existingIds.has(chunk.id),
  )

  let completed =
    chunks.length - chunksToProcess.length

  onProgress?.({
    completed,
    total: chunks.length,
  })

  for (const chunk of chunksToProcess) {
    const embedding = await generateEmbedding(chunk.text)

    await database.memoryEmbeddings.put({
      id: chunk.id,
      documentId,
      model: EMBEDDING_MODEL,
      dimensions: embedding.length,
      vector: new Float32Array(embedding),
      createdAt: new Date(),
    })

    completed += 1

    onProgress?.({
      completed,
      total: chunks.length,
    })
  }

  return completed
}