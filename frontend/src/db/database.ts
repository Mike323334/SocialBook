import Dexie, { type EntityTable,  type Table  } from 'dexie'


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

// PUT THESE HERE
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
  constructor(name = 'ReadingMemoryDB') {
    super(name)
    this.version(1).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
    })
    this.version(2).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, status, [conversationId+createdAt]',
    })
    this.version(3).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
    }).upgrade(async (transaction) => {
      const conversations = await transaction.table('conversations').toArray() as ConversationRecord[]
      const messages = await transaction.table('messages').toArray() as ChatMessageRecord[]
      const messagesByConversation = new Map<string, ChatMessageRecord[]>()

      for (const message of messages) {
        const conversationMessages = messagesByConversation.get(message.conversationId) ?? []
        conversationMessages.push(message)
        messagesByConversation.set(message.conversationId, conversationMessages)
      }

      for (const conversation of conversations) {
        const conversationMessages = messagesByConversation.get(conversation.id) ?? []
        conversationMessages.sort((left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id.localeCompare(right.id),
        )
        conversationMessages.forEach((message, sequence) => { message.sequence = sequence })
        conversation.nextSequence = conversationMessages.length
      }

      await transaction.table('messages').bulkPut(messages)
      await transaction.table('conversations').bulkPut(conversations)
    })
    this.version(4).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
    }).upgrade(async (transaction) => {
      const conversations = await transaction.table('conversations').toArray() as ConversationRecord[]
      for (const conversation of conversations) {
        const firstQuestion = await transaction.table('messages')
          .where('[conversationId+sequence]')
          .equals([conversation.id, 0])
          .first() as ChatMessageRecord | undefined
        if (firstQuestion?.role === 'user') {
          conversation.title = firstQuestion.content.slice(0, 72)
        }
      }
      await transaction.table('conversations').bulkPut(conversations)
    })
    this.version(5).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      importedMemories: 'id, documentId, category, importedAt',
    })
    this.version(6).stores({ importedMemories: null })
    this.version(7).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',

      memoryChunks: 'id, documentId, [documentId+pageNumber], [documentId+chunkIndex]',
      memoryEmbeddings: 'id, documentId, model',
    })
        this.version(8).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, sequence, status, [conversationId+sequence]',
      memoryChunks: 'id, documentId, [documentId+pageNumber], [documentId+chunkIndex]',
      memoryEmbeddings: 'id, documentId, model',
      notes: 'id, documentId, createdAt, updatedAt, isPublished',
    })
  }
}

export const database = new ReadingMemoryDB()

