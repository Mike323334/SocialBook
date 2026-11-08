import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import { useLiveQuery } from 'dexie-react-hooks'

import {
  ArrowUp,
  BookOpenText,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Sparkles,
} from 'lucide-react'

import {
  getActiveDatabase,
  isActiveDatabase,
  type ChatMessageRecord,
  type ConversationRecord,
  type DocumentRecord,
  type PageRecord,
} from '../../db/database'

import { askBookQuestion } from './chatApi'

import {
  createConversation,
  markInterruptedQuestionsFailed,
  markQuestionFailed,
  saveAssistantAnswer,
  saveLocalReply,
  saveUserQuestion,
} from './chatHistory'

import { retrievePages } from './retrieval'
import { trackAnalyticsEvent } from '../analytics/analyticsClient'

import './BookChatPanel.css'

interface BookChatPanelProps {
  book: DocumentRecord
  pages: PageRecord[]
  onCitationClick: (pageNumber: number) => void
}

export function BookChatPanel({
  book,
  pages,
  onCitationClick,
}: BookChatPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mountedRef = useRef(true)

  const db = getActiveDatabase()

  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const conversations = useLiveQuery<
    ConversationRecord[],
    ConversationRecord[]
  >(
    () =>
      db.conversations
        .where('documentId')
        .equals(book.id)
        .sortBy('updatedAt')
        .then((items) => items.reverse()),
    [db, book.id],
    [],
  )

  const selectedConversationId =
    activeConversationId ?? conversations[0]?.id ?? null

  const messages = useLiveQuery<
    ChatMessageRecord[],
    ChatMessageRecord[]
  >(
    () =>
      selectedConversationId
        ? db.messages
            .where('conversationId')
            .equals(selectedConversationId)
            .sortBy('sequence')
        : Promise.resolve([] as ChatMessageRecord[]),
    [db, selectedConversationId],
    [],
  )

  useEffect(() => {
    setActiveConversationId(null)
    setError('')
  }, [book.id, db])

  useEffect(() => {
    void markInterruptedQuestionsFailed(book.id, db).catch((cause) => {
      console.error(
        'Could not update interrupted questions:',
        cause,
      )
    })
  }, [book.id, db])

  async function startConversation() {
    const operationDatabase = db

    try {
      const conversationId = await createConversation(
        book.id,
        operationDatabase,
      )

      if (
        !mountedRef.current ||
        !isActiveDatabase(operationDatabase)
      ) {
        return
      }

      setActiveConversationId(conversationId)
      setQuestion('')
      setError('')

      inputRef.current?.focus()
    } catch (cause) {
      if (
        mountedRef.current &&
        isActiveDatabase(operationDatabase)
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not create a new conversation.',
        )
      }
    }
  }

  function selectConversation(conversationId: string) {
    setActiveConversationId(conversationId)
    setError('')
  }

  async function submitQuestion(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const text = question.trim()

    if (!text || busy) return

    const operationDatabase = db

    if (!isActiveDatabase(operationDatabase)) {
      setError('Your account session is changing. Please try again.')
      return
    }

    setBusy(true)
    setQuestion('')
    setError('')

    void trackAnalyticsEvent('question')

    let questionId: string | undefined
    let conversationId = selectedConversationId

    try {
      if (!conversationId) {
        conversationId = await createConversation(
          book.id,
          operationDatabase,
        )

        if (
          !mountedRef.current ||
          !isActiveDatabase(operationDatabase)
        ) {
          return
        }

        setActiveConversationId(conversationId)
      }

      questionId = await saveUserQuestion(
        conversationId,
        book.id,
        book.title,
        text,
        operationDatabase,
      )

      if (
        !mountedRef.current ||
        !isActiveDatabase(operationDatabase)
      ) {
        return
      }

      const evidence = retrievePages(
        text,
        pages,
        5,
        7000,
      )

      if (evidence.length === 0) {
        await saveLocalReply(
          book.id,
          questionId,
          "I couldn't find matching text in this book. Try using a phrase or concept that appears in the text.",
          operationDatabase,
        )

        return
      }

      const result = await askBookQuestion(
        text,
        book.id,
        book.title,
        evidence,
      )

      if (
        !mountedRef.current ||
        !isActiveDatabase(operationDatabase)
      ) {
        return
      }

      await saveAssistantAnswer(
        book.id,
        questionId,
        result.answer,
        result.citations.map((citation) => ({
          documentId: citation.document_id,
          title: citation.title,
          sourceType: citation.source_type,
          pageNumber: citation.page_number,
          score: citation.score,
        })),
        operationDatabase,
      )
    } catch (cause) {
      if (questionId) {
        try {
          await markQuestionFailed(
            questionId,
            operationDatabase,
          )
        } catch (historyError) {
          console.error(
            'Could not mark the question as failed:',
            historyError,
          )
        }
      }

      if (
        mountedRef.current &&
        isActiveDatabase(operationDatabase)
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The question could not be answered.',
        )
      }
    } finally {
      if (
        mountedRef.current &&
        isActiveDatabase(operationDatabase)
      ) {
        setBusy(false)
      }
    }
  }

  return (
    <aside
      className="book-chat"
      aria-labelledby="book-chat-title"
    >
      <nav
        className="conversation-sidebar"
        aria-label="Book conversations"
      >
        <button
          className="new-conversation-button"
          type="button"
          onClick={() => void startConversation()}
        >
          <Plus size={16} />
          <span>New conversation</span>
        </button>

        <p className="conversation-sidebar-label">
          This book
        </p>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-item${
                conversation.id === selectedConversationId
                  ? ' selected'
                  : ''
              }`}
              type="button"
              aria-current={
                conversation.id === selectedConversationId
                  ? 'page'
                  : undefined
              }
              title={conversation.title}
              onClick={() =>
                selectConversation(conversation.id)
              }
            >
              <MessageSquareText size={15} />

              <span>{conversation.title}</span>
            </button>
          ))}

          {conversations.length === 0 && (
            <p className="conversation-list-empty">
              Your questions about this book will appear here.
            </p>
          )}
        </div>
      </nav>

      <div className="chat-main">
        <header className="chat-heading">
          <span className="chat-heading-icon">
            <Sparkles size={16} />
          </span>

          <div>
            <h2 id="book-chat-title">
              Ask this book
            </h2>

            <p>
              Answers use matching passages only
            </p>
          </div>
        </header>

        <div className="chat-privacy">
          <BookOpenText size={16} />

          <span>
            Only selected passages from this book are sent
            to your configured AI provider when you ask.
          </span>
        </div>

        <div
          className="chat-messages"
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                <Sparkles size={22} />
              </div>

              <h3>Start exploring this book</h3>

              <p>
                Ask a question about <strong>{book.title}</strong>.
              </p>

              <span>
                Try “What is the main argument?”
              </span>
            </div>
          ) : (
            messages.map((message) => (
              <article
                className={`chat-message ${message.role}`}
                key={message.id}
              >
                <p>{message.content}</p>

                {message.role === 'user' &&
                  message.status === 'failed' && (
                    <button
                      className="retry-question"
                      type="button"
                      onClick={() => {
                        setQuestion(message.content)
                        inputRef.current?.focus()
                      }}
                    >
                      Not answered · retry
                    </button>
                  )}

                {message.role === 'user' &&
                  message.status === 'pending' && (
                    <span className="pending-question">
                      Waiting for an answer
                    </span>
                  )}

                {message.citations.length > 0 && (
                  <div
                    className="citation-list"
                    aria-label="Sources"
                  >
                    {message.citations.map(
                      (citation, index) =>
                        citation.sourceType === 'book_page' &&
                        citation.pageNumber !== null ? (
                          <button
                            key={`${citation.documentId}:${citation.pageNumber}:${index}`}
                            type="button"
                            onClick={() =>
                              onCitationClick(
                                citation.pageNumber!,
                              )
                            }
                          >
                            {citation.title} · p.{' '}
                            {citation.pageNumber}
                          </button>
                        ) : null,
                    )}
                  </div>
                )}
              </article>
            ))
          )}

          {busy && (
            <div className="chat-thinking">
              <LoaderCircle
                className="spin"
                size={17}
              />

              <span>
                Finding an answer from this book...
              </span>
            </div>
          )}
        </div>

        {error && (
          <p
            className="chat-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <form
          className="chat-form"
          onSubmit={(event) => void submitQuestion(event)}
        >
          <label
            className="visually-hidden"
            htmlFor="book-question"
          >
            Ask a question about this book
          </label>

          <textarea
            ref={inputRef}
            id="book-question"
            value={question}
            onChange={(event) =>
              setQuestion(event.currentTarget.value)
            }
            maxLength={1200}
            rows={2}
            placeholder="Ask about this book..."
            disabled={busy}
          />

          <button
            type="submit"
            aria-label="Send question"
            disabled={busy || !question.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </form>

        <p className="chat-footnote">
          Questions and answers are saved in this browser.
        </p>
      </div>
    </aside>
  )
}