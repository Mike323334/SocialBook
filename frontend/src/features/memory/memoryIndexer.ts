import { database } from '../../db/database'
import { chunkPage } from './chunking'

export async function indexDocument(documentId: string): Promise<number> {
  const pages = await database.pages
    .where('documentId')
    .equals(documentId)
    .toArray()

  if (pages.length === 0) {
    return 0
  }

  const chunks = pages.flatMap(page =>
    chunkPage({
      documentId: page.documentId,
      pageNumber: page.pageNumber,
      text: page.text,
    }),
  )

  const records = chunks.map(chunk => ({
    ...chunk,
    createdAt: new Date(),
  }))

  await database.transaction(
    'rw',
    database.memoryChunks,
    async () => {
      await database.memoryChunks
        .where('documentId')
        .equals(documentId)
        .delete()

      await database.memoryChunks.bulkPut(records)
    },
  )

  return records.length
}