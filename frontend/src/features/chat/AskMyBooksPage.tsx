import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import './AskMyBooksPage.css'
import {
  BookOpen,
  MessageSquareText,
  Library,
  ArrowRight,
} from 'lucide-react'

import {
  getActiveDatabase,
  type DocumentRecord,
  type PageRecord,
} from '../../db/database'

import { BookChatPanel } from './BookChatPanel'

export function AskMyBooksPage() {
  // Use the currently active account database.
  const db = getActiveDatabase()
  const navigate = useNavigate()

  const [selectedBookId, setSelectedBookId] =
    useState<string>('')

  // Load books from the active library.
  const books = useLiveQuery(
    () =>
      db.documents
        .orderBy('createdAt')
        .reverse()
        .toArray(),
    [db],
    [],
  )

  // Find the selected book.
  const selectedBook = useMemo(
    () =>
      books.find(
        (book: DocumentRecord) =>
          book.id === selectedBookId,
      ) ?? null,
    [books, selectedBookId],
  )

  // Load pages belonging to the selected book.
  // Explicit types prevent TypeScript from inferring never[].
  const pages = useLiveQuery<PageRecord[], PageRecord[]>(
    () => {
      if (!selectedBookId) {
        return Promise.resolve([] as PageRecord[])
      }

      return db.pages
        .where('documentId')
        .equals(selectedBookId)
        .sortBy('pageNumber')
    },
    [db, selectedBookId],
    [],
  )

  // Open the reader at the cited page.
  function handleCitationClick(pageNumber: number) {
    if (!selectedBook) return

    navigate(`/book/${selectedBook.id}`, {
      state: {
        pageNumber,
      },
    })
  }

  return (
    <section className="ask-books-page">
      <header className="ask-books-header">
        <div>
          <p className="eyebrow">
            Your personal reading assistant
          </p>

          <h1>Ask My Books</h1>

          <p>
            Ask questions across your personal reading
            library. Select a book to start a conversation.
          </p>
        </div>

        <div className="ask-books-header-icon">
          <MessageSquareText size={28} />
        </div>
      </header>

      <section className="ask-books-selector">
        <div className="ask-books-selector-heading">
          <div className="ask-books-selector-icon">
            <Library size={19} />
          </div>

          <div>
            <h2>Choose a book</h2>

            <p>
              {books.length}{' '}
              {books.length === 1 ? 'book' : 'books'} in
              your library
            </p>
          </div>
        </div>

        {books.length === 0 ? (
          <div className="ask-books-empty">
            <BookOpen size={30} />

            <h3>Your library is empty</h3>

            <p>
              Add a book to your library before starting
              a conversation.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={() => navigate('/library')}
            >
              Open my library
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div className="ask-books-book-list">
            {books.map((book: DocumentRecord) => {
              const selected =
                selectedBookId === book.id

              return (
                <button
                  key={book.id}
                  type="button"
                  className={
                    `ask-books-book-option${
                      selected ? ' selected' : ''
                    }`
                  }
                  aria-pressed={selected}
                  onClick={() =>
                    setSelectedBookId(book.id)
                  }
                >
                  <BookOpen size={19} />

                  <span className="ask-books-book-info">
                    <strong>{book.title}</strong>

                    <small>
                      {book.author || 'Unknown author'}
                    </small>
                  </span>

                  {selected && (
                    <span className="ask-books-selected-label">
                      Selected
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {selectedBook ? (
        <section className="ask-books-chat-section">
          <div className="ask-books-chat-heading">
            <div>
              <span>Currently discussing</span>

              <h2>{selectedBook.title}</h2>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setSelectedBookId('')}
            >
              Change book
            </button>
          </div>

          <BookChatPanel
            key={selectedBook.id}
            book={selectedBook}
            pages={pages}
            onCitationClick={handleCitationClick}
          />
        </section>
      ) : books.length > 0 ? (
        <div className="ask-books-placeholder">
          <MessageSquareText size={27} />

          <h3>Your next conversation starts here</h3>

          <p>
            Select a book above to ask questions about
            its content and explore its ideas.
          </p>
        </div>
      ) : null}
    </section>
  )
}