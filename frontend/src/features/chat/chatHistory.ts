import {
  getActiveDatabase,
  type ReadingMemoryDB,
  type ChatMessageRecord,
  type StoredCitation,
} from '../../db/database'

/**
 * Creates a conversation inside the database captured for this operation.
 */
export async function createConversation(
  documentId: string,
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<string> {
  const operationDatabase = db

  const now = new Date()
  const conversationId = crypto.randomUUID()

  await operationDatabase.conversations.add({
    id: conversationId,
    documentId,
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    nextSequence: 0,
  })

  return conversationId
}

/**
 * Saves a user question and updates its conversation sequence.
 */
export async function saveUserQuestion(
  conversationId: string,
  documentId: string,
  bookTitle: string,
  content: string,
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<string> {
  const operationDatabase = db

  const now = new Date()
  const questionId = crypto.randomUUID()

  await operationDatabase.transaction(
    'rw',
    [
      operationDatabase.conversations,
      operationDatabase.messages,
    ],
    async () => {
      const conversation =
        await operationDatabase.conversations.get(conversationId)

      if (!conversation || conversation.documentId !== documentId) {
        throw new Error(
          'The selected conversation could not be found for this book.',
        )
      }

      const title =
        conversation.nextSequence === 0
          ? content.slice(0, 72)
          : conversation.title

      await operationDatabase.messages.add({
        id: questionId,
        conversationId,
        documentId,
        role: 'user',
        content,
        citations: [],
        createdAt: now,
        sequence: conversation.nextSequence,
        status: 'pending',
      })

      await operationDatabase.conversations.update(conversationId, {
        title: title || bookTitle,
        updatedAt: now,
        nextSequence: conversation.nextSequence + 1,
      })
    },
  )

  return questionId
}

/**
 * Saves an assistant answer in the same database as the original question.
 */
export async function saveAssistantAnswer(
  documentId: string,
  questionId: string,
  content: string,
  citations: StoredCitation[],
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<void> {
  const operationDatabase = db

  const now = new Date()

  await operationDatabase.transaction(
    'rw',
    [
      operationDatabase.conversations,
      operationDatabase.messages,
    ],
    async () => {
      const question =
        await operationDatabase.messages.get(questionId)

      if (
        !question ||
        question.role !== 'user' ||
        question.documentId !== documentId
      ) {
        throw new Error(
          'The original question could not be found in local history.',
        )
      }

      const conversation =
        await operationDatabase.conversations.get(
          question.conversationId,
        )

      if (
        !conversation ||
        conversation.documentId !== documentId
      ) {
        throw new Error(
          'The book conversation could not be found in local history.',
        )
      }

      await operationDatabase.messages.add({
        id: crypto.randomUUID(),
        conversationId: question.conversationId,
        documentId,
        role: 'assistant',
        content,
        citations,
        createdAt: now,
        sequence: conversation.nextSequence,
        status: 'answered',
      })

      await operationDatabase.messages.update(questionId, {
        status: 'answered',
      })

      await operationDatabase.conversations.update(
        question.conversationId,
        {
          updatedAt: now,
          nextSequence: conversation.nextSequence + 1,
        },
      )
    },
  )
}

/**
 * Saves a local reply without citations.
 */
export async function saveLocalReply(
  documentId: string,
  questionId: string,
  content: string,
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<void> {
  const operationDatabase = db

  await saveAssistantAnswer(
    documentId,
    questionId,
    content,
    [],
    operationDatabase,
  )
}

/**
 * Marks a question as failed in the captured database.
 */
export async function markQuestionFailed(
  questionId: string,
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<void> {
  const operationDatabase = db

  await operationDatabase.messages.update(questionId, {
    status: 'failed',
  })
}

/**
 * Marks pending questions as failed when a conversation is interrupted.
 */
export async function markInterruptedQuestionsFailed(
  documentId: string,
  db: ReadingMemoryDB = getActiveDatabase(),
): Promise<void> {
  const operationDatabase = db

  await operationDatabase.messages
    .where('documentId')
    .equals(documentId)
    .filter(
      (message: ChatMessageRecord) =>
        message.role === 'user' &&
        message.status === 'pending',
    )
    .modify({
      status: 'failed',
    })
}