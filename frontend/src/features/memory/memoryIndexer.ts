import {
  getActiveDatabase,
  type ReadingMemoryDB,
} from '../../db/database'

import { chunkPage } from './chunking'

export async function indexDocument(
  documentId: string,
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<number> {
  // Capture the database reference for the entire operation.
  const operationDatabase = db

  const pages = await operationDatabase.pages
    .where('documentId')
    .equals(documentId)
    .toArray()

  if (pages.length === 0) {
    return 0
  }

  const chunks = pages.flatMap((page) =>
    chunkPage({
      documentId: page.documentId,
      pageNumber: page.pageNumber,
      text: page.text,
    }),
  )

  const records = chunks.map((chunk) => ({
    ...chunk,
    createdAt: new Date(),
  }))

  await operationDatabase.transaction(
    'rw',
    [operationDatabase.memoryChunks],
    async () => {
      await operationDatabase.memoryChunks
        .where('documentId')
        .equals(documentId)
        .delete()

      await operationDatabase.memoryChunks.bulkPut(records)
    },
  )

  return records.length
}