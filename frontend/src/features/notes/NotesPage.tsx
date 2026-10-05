
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen,
  Globe,
  LockKeyhole,
  Plus,
  Trash2,
} from 'lucide-react'
import { database } from '../../db/database'

export function NotesPage() {
  const [isCreating, setIsCreating] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState('')
  const [content, setContent] = useState('')

  const books = useLiveQuery(
    () => database.documents.orderBy('title').toArray(),
    [],
    [],
  )

  const notes = useLiveQuery(
    () =>
      database.notes
        .orderBy('updatedAt')
        .reverse()
        .toArray(),
    [],
    [],
  )

  async function createNote() {
    const text = content.trim()

    if (!selectedBookId || !text) {
      return
    }

    const book = await database.documents.get(selectedBookId)

    if (!book) {
      return
    }

    const now = new Date()

    await database.notes.add({
      id: crypto.randomUUID(),
      documentId: book.id,
      bookTitle: book.title,
      content: text,
      authorName: null,
      createdAt: now,
      updatedAt: now,
      isPublished: false,
    })

    setContent('')
    setSelectedBookId('')
    setIsCreating(false)
  }

  async function togglePublished(
    noteId: string,
    published: boolean,
  ) {
    await database.notes.update(noteId, {
      isPublished: published,
      updatedAt: new Date(),
    })
  }

  async function deleteNote(noteId: string) {
    await database.notes.delete(noteId)
  }

  return (
    <section className="notes-page">
      <header className="notes-page-header">
        <div>
          <p className="eyebrow">Reading memory</p>

          <h1>Your notes</h1>

          <p className="notes-description">
            Capture your thoughts and observations
            about the books you read.
          </p>
        </div>

        {!isCreating && (
          <button
            type="button"
            className="notes-new-button"
            onClick={() => setIsCreating(true)}
          >
            <Plus size={17} />
            New note
          </button>
        )}
      </header>

      {isCreating && (
        <section className="note-editor">
          <div className="note-editor-title">
            <h2>New note</h2>

            <p>
              Write your own thoughts about a book.
            </p>
          </div>

          <div className="note-form">
            <label>
              <span>Book</span>

              <select
                value={selectedBookId}
                onChange={event =>
                  setSelectedBookId(event.target.value)
                }
              >
                <option value="">
                  Select a book
                </option>

                {books.map(book => (
                  <option
                    key={book.id}
                    value={book.id}
                  >
                    {book.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Your note</span>

              <textarea
                value={content}
                onChange={event =>
                  setContent(event.target.value)
                }
                placeholder="What did you think about this book?"
                rows={7}
              />
            </label>
          </div>

          <div className="note-editor-footer">
            <p>
              New notes are private. You can publish
              them later.
            </p>

            <div>
              <button
                type="button"
                className="note-cancel"
                onClick={() => {
                  setIsCreating(false)
                  setSelectedBookId('')
                  setContent('')
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="note-save"
                disabled={
                  !selectedBookId ||
                  !content.trim()
                }
                onClick={() => void createNote()}
              >
                Save note
              </button>
            </div>
          </div>
        </section>
      )}

      {!isCreating && (
        <section className="notes-section">
          <div className="notes-section-header">
            <div>
              <p className="eyebrow">Your writing</p>

              <h2>
                {notes.length === 0
                  ? 'No notes yet'
                  : `${notes.length} ${
                      notes.length === 1
                        ? 'note'
                        : 'notes'
                    }`}
              </h2>
            </div>
          </div>

          {notes.length === 0 ? (
            <div className="notes-empty">
              <BookOpen
                size={24}
                strokeWidth={1.5}
              />

              <div>
                <h3>
                  Start your reading memory
                </h3>

                <p>
                  Write your first note about
                  something you read.
                </p>
              </div>
            </div>
          ) : (
            <div className="notes-list">
              {notes.map(note => (
                <article
                  key={note.id}
                  className="note-card"
                >
                  <div className="note-card-book">
                    <BookOpen
                      size={17}
                      strokeWidth={1.7}
                    />

                    <span>
                      {note.bookTitle}
                    </span>
                  </div>

                  <p className="note-card-content">
                    {note.content}
                  </p>

                  <div className="note-card-footer">
                    <span
                      className={
                        note.isPublished
                          ? 'note-status published'
                          : 'note-status private'
                      }
                    >
                      {note.isPublished ? (
                        <>
                          <Globe size={13} />
                          Published
                        </>
                      ) : (
                        <>
                          <LockKeyhole size={13} />
                          Private
                        </>
                      )}
                    </span>

                    <div className="note-actions">
                      <button
                        type="button"
                        onClick={() =>
                          void togglePublished(
                            note.id,
                            !note.isPublished,
                          )
                        }
                      >
                        {note.isPublished
                          ? 'Make private'
                          : 'Publish'}
                      </button>

                      <button
                        type="button"
                        className="note-delete"
                        aria-label="Delete note"
                        onClick={() =>
                          void deleteNote(note.id)
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  )
}

