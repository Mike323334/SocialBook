
import Dexie, { type EntityTable } from 'dexie'

export interface OutlineItem {
  title: string
  pageNumber: number | null
  depth: number
}

export interface DocumentRecord {
  id: string
  title: string
  author: string | null
  fileName: string
  fileSize: number
  pageCount: number
  createdAt: Date
  lastReadAt: Date | null
  readingProgress: number
  pdf: Blob
  outline?: OutlineItem[]
  outlineVersion?: number
}

export interface PageRecord {
  id: string
  documentId: string
  pageNumber: number
  text: string
}

export interface ConversationRecord {
  id: string
  documentId: string
  title: string
  createdAt: Date
  updatedAt: Date
  nextSequence: number
}

export interface StoredCitation {
  documentId: string
  title: string
  sourceType?: 'book_page'
  pageNumber: number | null
  score: number
}

export interface ChatMessageRecord {
  id: string
  conversationId: string
  documentId: string
  role: 'user' | 'assistant'
  content: string
  citations: StoredCitation[]
  createdAt: Date
  sequence: number
  status: 'pending' | 'answered' | 'failed'
}

export interface MemoryChunkRecord {
  id: string
  documentId: string
  pageNumber: number
  chunkIndex: number
  text: string
  startOffset: number
  endOffset: number
  createdAt: Date
}

export interface MemoryEmbeddingRecord {
  id: string
  documentId: string
  model: string
  dimensions: number
  vector: Float32Array
  createdAt: Date
}

export interface NoteRecord {
  id: string
  documentId: string
  bookTitle: string
  content: string
  authorName: string | null
  chapterTitle?: string | null
  chapterPageNumber?: number | null
  createdAt: Date
  updatedAt: Date
  isPublished: boolean
}

export class ReadingMemoryDB extends Dexie {
  documents!: EntityTable<DocumentRecord, 'id'>
  pages!: EntityTable<PageRecord, 'id'>
  conversations!: EntityTable<ConversationRecord, 'id'>
  messages!: EntityTable<ChatMessageRecord, 'id'>
  memoryChunks!: EntityTable<MemoryChunkRecord, 'id'>
  memoryEmbeddings!: EntityTable<MemoryEmbeddingRecord, 'id'>
  notes!: EntityTable<NoteRecord, 'id'>

  constructor(name = 'ReadingMemoryDB') {
    super(name)

    // Version 1
    this.version(1).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
    })

    // Version 2
    this.version(2).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages:
        'id, conversationId, documentId, createdAt, status, [conversationId+createdAt]',
    })

    // Version 3
    this.version(3)
      .stores({
        documents: 'id, title, createdAt, lastReadAt',
        pages: 'id, documentId, [documentId+pageNumber]',
        conversations: 'id, documentId, updatedAt',
        messages:
          'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      })
      .upgrade(async (transaction) => {
        const conversations =
          (await transaction.table('conversations').toArray()) as ConversationRecord[]

        const messages =
          (await transaction.table('messages').toArray()) as ChatMessageRecord[]

        const messagesByConversation = new Map<
          string,
          ChatMessageRecord[]
        >()

        for (const message of messages) {
          const conversationMessages =
            messagesByConversation.get(message.conversationId) ?? []

          conversationMessages.push(message)

          messagesByConversation.set(
            message.conversationId,
            conversationMessages,
          )
        }

        for (const conversation of conversations) {
          const conversationMessages =
            messagesByConversation.get(conversation.id) ?? []

          conversationMessages.sort(
            (left, right) =>
              new Date(left.createdAt).getTime() -
                new Date(right.createdAt).getTime() ||
              left.id.localeCompare(right.id),
          )

          conversationMessages.forEach((message, sequence) => {
            message.sequence = sequence
          })

          conversation.nextSequence = conversationMessages.length
        }

        await transaction.table('messages').bulkPut(messages)
        await transaction.table('conversations').bulkPut(conversations)
      })

    // Version 4
    this.version(4)
      .stores({
        documents: 'id, title, createdAt, lastReadAt',
        pages: 'id, documentId, [documentId+pageNumber]',
        conversations: 'id, documentId, updatedAt',
        messages:
          'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      })
      .upgrade(async (transaction) => {
        const conversations =
          (await transaction.table('conversations').toArray()) as ConversationRecord[]

        for (const conversation of conversations) {
          const firstQuestion = (await transaction
            .table('messages')
            .where('[conversationId+sequence]')
            .equals([conversation.id, 0])
            .first()) as ChatMessageRecord | undefined

          if (firstQuestion?.role === 'user') {
            conversation.title = firstQuestion.content.slice(0, 72)
          }
        }

        await transaction.table('conversations').bulkPut(conversations)
      })

    // Version 5
    this.version(5).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages:
        'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      importedMemories: 'id, documentId, category, importedAt',
    })

    // Version 6
    this.version(6).stores({
      importedMemories: null,
    })

    // Version 7
    this.version(7).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages:
        'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      memoryChunks:
        'id, documentId, [documentId+pageNumber], [documentId+chunkIndex]',
      memoryEmbeddings: 'id, documentId, model',
    })

    // Version 8
    this.version(8).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages:
        'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      memoryChunks:
        'id, documentId, [documentId+pageNumber], [documentId+chunkIndex]',
      memoryEmbeddings: 'id, documentId, model',
      notes: 'id, documentId, createdAt, updatedAt, isPublished',
    })
  }
}

// ============================================================
// LEGACY DATABASE
// ============================================================

// Keep the original database intact.
// Do not use it for account-specific application operations.
export const database = new ReadingMemoryDB()

// ============================================================
// ACCOUNT-SCOPED DATABASE MANAGEMENT
// ============================================================


// -----------------------------------------------------------------------------
// Account-isolated database management
// -----------------------------------------------------------------------------

const accountDatabases = new Map<string, ReadingMemoryDB>()

let activeDatabase: ReadingMemoryDB | null = null

let activationSequence = 0

/**
 * Returns the IndexedDB name associated with an account.
 *
 * Guest users have their own database.
 * Authenticated users receive a database based on their stable account ID.
 */
export function getDatabaseNameForAccount(
  accountId: string | null,
): string {
  if (!accountId) {
    return 'ReadingMemoryDB_guest'
  }

  const normalizedId = accountId.trim()

  if (!normalizedId) {
    return 'ReadingMemoryDB_guest'
  }

  return `ReadingMemoryDB_user_${encodeURIComponent(normalizedId)}`
}

/**
 * Returns the cached database instance for an account.
 *
 * The legacy singleton "database" is intentionally not reused.
 */
export function getDatabaseForAccount(
  accountId: string | null,
): ReadingMemoryDB {
  const databaseName = getDatabaseNameForAccount(accountId)

  const existingDatabase = accountDatabases.get(databaseName)

  if (existingDatabase) {
    return existingDatabase
  }

  const accountDatabase = new ReadingMemoryDB(databaseName)

  accountDatabases.set(databaseName, accountDatabase)

  return accountDatabase
}

/**
 * Activates and opens the database belonging to an account.
 *
 * A generation counter prevents an older asynchronous activation
 * from replacing a newer account selection.
 */
export async function activateDatabase(
  accountId: string | null,
): Promise<ReadingMemoryDB> {
  const currentActivation = ++activationSequence

  const targetDatabase = getDatabaseForAccount(accountId)

  await targetDatabase.open()

  if (currentActivation !== activationSequence) {
    throw new Error(
      'Database activation was superseded by another account switch.',
    )
  }

  activeDatabase = targetDatabase

  return targetDatabase
}

/**
 * Returns the currently active account database.
 *
 * Components should capture this reference once per operation.
 */
export function getActiveDatabase(): ReadingMemoryDB {
  if (!activeDatabase) {
    throw new Error(
      'No account database is active. Wait for workspace initialization.',
    )
  }

  return activeDatabase
}

/**
 * Checks whether a database reference still belongs to the active account.
 *
 * Useful for preventing stale asynchronous operations from updating
 * the interface after an account switch.
 */
export function isActiveDatabase(
  candidateDatabase: ReadingMemoryDB,
): boolean {
  return activeDatabase === candidateDatabase
}
