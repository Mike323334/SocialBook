import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { database, ReadingMemoryDB } from '../../db/database'
import {
  markInterruptedQuestionsFailed,
  createConversation,
  saveAssistantAnswer,
  saveUserQuestion,
} from './chatHistory'

describe('local chat history', () => {
  beforeEach(async () => {
    await database.delete()
    await database.open()
  })

  it('restores questions, answers, and citations after the database is reopened', async () => {
    const conversationId = await createConversation('book-1')
    const questionId = await saveUserQuestion(conversationId, 'book-1', 'A book', 'What does the author say about memory?')
    await saveAssistantAnswer('book-1', questionId, 'Memory depends on attention.', [{
      documentId: 'book-1',
      title: 'A book',
      pageNumber: 12,
      score: 0.92,
    }])

    database.close()
    await database.open()
    const history = await database.messages.where('conversationId').equals(conversationId).sortBy('createdAt')

    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ role: 'user', content: 'What does the author say about memory?', status: 'answered' })
    expect(history[1]).toMatchObject({
      role: 'assistant',
      content: 'Memory depends on attention.',
      citations: [{ pageNumber: 12 }],
    })
  })

  it('marks unanswered questions as retryable after an interrupted session', async () => {
    const firstConversationId = await createConversation('book-2')
    const secondConversationId = await createConversation('book-2')
    const firstQuestionId = await saveUserQuestion(firstConversationId, 'book-2', 'Another book', 'Why does this matter?')
    const secondQuestionId = await saveUserQuestion(secondConversationId, 'book-2', 'Another book', 'What happens next?')

    await markInterruptedQuestionsFailed('book-2')

    expect(await database.messages.get(firstQuestionId)).toMatchObject({ status: 'failed' })
    expect(await database.messages.get(secondQuestionId)).toMatchObject({ status: 'failed' })
  })

  it('keeps questions for the same book in separately selectable conversations', async () => {
    const firstConversation = await createConversation('book-3')
    const secondConversation = await createConversation('book-3')
    await saveUserQuestion(firstConversation, 'book-3', 'A book', 'What is the central idea?')
    await saveUserQuestion(secondConversation, 'book-3', 'A book', 'How does the author conclude?')

    const conversations = await database.conversations.where('documentId').equals('book-3').toArray()
    const firstMessages = await database.messages.where('conversationId').equals(firstConversation).toArray()
    const secondMessages = await database.messages.where('conversationId').equals(secondConversation).toArray()

    expect(conversations.map((conversation) => conversation.title).sort()).toEqual([
      'How does the author conclude?',
      'What is the central idea?',
    ])
    expect(firstMessages.map((message) => message.content)).toEqual(['What is the central idea?'])
    expect(secondMessages.map((message) => message.content)).toEqual(['How does the author conclude?'])
  })

  it('migrates an existing v2 conversation without losing its messages', async () => {
    const databaseName = 'ReadingMemoryMigrationTest'
    const legacy = new Dexie(databaseName)
    legacy.version(2).stores({
      documents: 'id, title, createdAt, lastReadAt',
      pages: 'id, documentId, [documentId+pageNumber]',
      conversations: 'id, documentId, updatedAt',
      messages: 'id, conversationId, documentId, createdAt, status, [conversationId+createdAt]',
    })
    await legacy.open()
    const createdAt = new Date('2026-01-01T12:00:00Z')
    await legacy.table('conversations').put({
      id: 'migration-book',
      documentId: 'migration-book',
      title: 'Migration book',
      createdAt,
      updatedAt: createdAt,
    })
    await legacy.table('messages').bulkPut([
      { id: 'old-question', conversationId: 'migration-book', documentId: 'migration-book', role: 'user', content: 'Question?', citations: [], createdAt, status: 'answered' },
      { id: 'old-answer', conversationId: 'migration-book', documentId: 'migration-book', role: 'assistant', content: 'Answer.', citations: [], createdAt: new Date(createdAt.getTime() + 1), status: 'answered' },
    ])
    legacy.close()

    const upgraded = new ReadingMemoryDB(databaseName)
    try {
      await upgraded.open()
      const messages = await upgraded.messages.where('conversationId').equals('migration-book').sortBy('sequence')

      expect(messages.map((message) => [message.id, message.sequence])).toEqual([
        ['old-question', 0],
        ['old-answer', 1],
      ])
      expect(await upgraded.conversations.get('migration-book')).toMatchObject({ nextSequence: 2 })
    } finally {
      upgraded.close()
      await Dexie.delete(databaseName)
    }
  })
})