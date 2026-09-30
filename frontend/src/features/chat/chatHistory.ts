import { database, type ChatMessageRecord, type StoredCitation } from '../../db/database'

export async function createConversation(documentId: string): Promise<string> {
  const now = new Date()
  const conversationId = crypto.randomUUID()

  await database.conversations.add({
    id: conversationId,
    documentId,
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    nextSequence: 0,
  })

  return conversationId
}

export async function saveUserQuestion(
  conversationId: string,
  documentId: string,
  bookTitle: string,
  content: string,
): Promise<string> {
  const now = new Date()
  const questionId = crypto.randomUUID()

  await database.transaction('rw', database.conversations, database.messages, async () => {
    const conversation = await database.conversations.get(conversationId)
    if (!conversation || conversation.documentId !== documentId) {
      throw new Error('The selected conversation could not be found for this book.')
    }

    const title = conversation.nextSequence === 0 ? content.slice(0, 72) : conversation.title
    await database.messages.add({
      id: questionId,
      conversationId,
      documentId,
      role: 'user',
      content,
      citations: [],
      createdAt: now,
      sequence: conversation?.nextSequence ?? 0,
      status: 'pending',
    })
    await database.conversations.update(conversationId, {
      title: title || bookTitle,
      updatedAt: now,
      nextSequence: conversation.nextSequence + 1,
    })
  })

  return questionId
}

export async function saveAssistantAnswer(
  documentId: string,
  questionId: string,
  content: string,
  citations: StoredCitation[],
): Promise<void> {
  const now = new Date()
  await database.transaction('rw', database.conversations, database.messages, async () => {
    const question = await database.messages.get(questionId)
    const conversation = await database.conversations.get(question?.conversationId ?? documentId)
    if (!question || question.role !== 'user' || question.documentId !== documentId) {
      throw new Error('The original question could not be found in local history.')
    }
    if (!conversation) throw new Error('The book conversation could not be found in local history.')

    await database.messages.add({
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
    await database.messages.update(questionId, { status: 'answered' })
    await database.conversations.update(question.conversationId, {
      updatedAt: now,
      nextSequence: conversation.nextSequence + 1,
    })
  })
}

export async function saveLocalReply(documentId: string, questionId: string, content: string): Promise<void> {
  await saveAssistantAnswer(documentId, questionId, content, [])
}

export async function markQuestionFailed(questionId: string): Promise<void> {
  await database.messages.update(questionId, { status: 'failed' })
}

export async function markInterruptedQuestionsFailed(documentId: string): Promise<void> {
  await database.messages
    .where('documentId')
    .equals(documentId)
    .filter((message: ChatMessageRecord) => message.role === 'user' && message.status === 'pending')
    .modify({ status: 'failed' })
}

