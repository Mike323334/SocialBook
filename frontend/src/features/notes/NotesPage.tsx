import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen,
  Globe,
  LockKeyhole,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'

import { database } from '../../db/database'
import {
  ACCOUNT_CHANGED_EVENT,
  API_URL,
  getCurrentAccount,
  type Account,
} from '../account/accountApi'

interface CommunityNote {
  id: string
  book_title: string
  content: string
  nickname: string
  username: string
  created_at: string
  updated_at: string
  is_published: boolean
  is_owner: boolean
}

interface ApiError {
  detail?: string | { message?: string }
}

async function getErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const result = (await response.json()) as ApiError

    if (typeof result.detail === 'string') {
      return result.detail
    }

    if (
      result.detail &&
      typeof result.detail.message === 'string'
    ) {
      return result.detail.message
    }
  } catch {
    // Ignore responses that are not JSON.
  }

  return `The request failed (${response.status}).`
}

export function NotesPage() {
  const [isCreating, setIsCreating] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState('')
  const [content, setContent] = useState('')

  const [account, setAccount] = useState<Account | null>(null)
  const [accountLoading, setAccountLoading] = useState(true)

  const [communityNotes, setCommunityNotes] = useState<
    CommunityNote[]
  >([])

  const [communityLoading, setCommunityLoading] =
    useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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

  const loadCommunityNotes = useCallback(async () => {
    if (accountLoading) {
      return
    }

    if (!account) {
      setCommunityNotes([])
      setCommunityLoading(false)
      return
    }

    setCommunityLoading(true)

    try {
      const response = await fetch(
        `${API_URL}/publications/community`,
        {
          method: 'GET',
          credentials: 'include',
        },
      )

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const result =
        (await response.json()) as CommunityNote[]

      setCommunityNotes(result)
      setError('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load community notes.',
      )
    } finally {
      setCommunityLoading(false)
    }
  }, [account, accountLoading])

  useEffect(() => {
    let active = true
    let accountChangedDuringLoad = false

    async function loadAccount() {
      try {
        const result = await getCurrentAccount()

        if (active && !accountChangedDuringLoad) {
          setAccount(result)
        }
      } catch (err) {
        if (active && !accountChangedDuringLoad) {
          setAccount(null)
          console.error(
            'Could not load the current account:',
            err,
          )
        }
      } finally {
        if (active) {
          setAccountLoading(false)
        }
      }
    }

    function handleAccountChanged(event: Event) {
      const customEvent =
        event as CustomEvent<Account | null>

      accountChangedDuringLoad = true

      setAccount(customEvent.detail)
      setAccountLoading(false)
      setError('')
      setMessage('')
    }

    window.addEventListener(
      ACCOUNT_CHANGED_EVENT,
      handleAccountChanged,
    )

    void loadAccount()

    return () => {
      active = false

      window.removeEventListener(
        ACCOUNT_CHANGED_EVENT,
        handleAccountChanged,
      )
    }
  }, [])

  useEffect(() => {
    if (accountLoading) {
      return
    }

    void loadCommunityNotes()
  }, [account, accountLoading, loadCommunityNotes])

  async function createNote() {
    const text = content.trim()

    if (!selectedBookId || !text) {
      return
    }

    setError('')
    setMessage('')

    try {
      const book = await database.documents.get(
        selectedBookId,
      )

      if (!book) {
        setError('The selected book could not be found.')
        return
      }

      const now = new Date()

      await database.notes.add({
        id: crypto.randomUUID(),
        documentId: book.id,
        bookTitle: book.title,
        content: text,
        authorName: account?.display_name ?? null,
        createdAt: now,
        updatedAt: now,
        isPublished: false,
      })

      setContent('')
      setSelectedBookId('')
      setIsCreating(false)

      setMessage('Your note was saved privately.')
    } catch (err) {
      console.error('Could not save the note:', err)
      setError('Could not save your note.')
    }
  }

  async function togglePublished(
    noteId: string,
    published: boolean,
  ) {
    setError('')
    setMessage('')

    if (accountLoading) {
      setError('Please wait while we check your sign-in session.')
      return
    }

    if (!account) {
      setError('Please sign in before publishing a note.')
      return
    }

    if (!noteId) {
      setError('The selected note could not be found.')
      return
    }

    setSaving(true)

    try {
      const note = await database.notes.get(noteId)

      if (!note) {
        throw new Error('The note could not be found.')
      }

      if (published) {
        const pages = await database.pages
          .where('documentId')
          .equals(note.documentId)
          .toArray()

        const sourceText = pages
          .sort((a, b) => a.pageNumber - b.pageNumber)
          .map(page => page.text.trim())
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 100000)

        if (!sourceText.trim()) {
          throw new Error(
            'This book has no extracted text for copyright checking. ' +
              'Import a text-based PDF before publishing this note.',
          )
        }

        const response = await fetch(
          `${API_URL}/publications/community`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              book_title: note.bookTitle,
              content: note.content,
              source_text: sourceText,
            }),
          },
        )

        if (!response.ok) {
          throw new Error(await getErrorMessage(response))
        }

        const publishedNote =
          (await response.json()) as CommunityNote

        await database.notes.update(noteId, {
          isPublished: true,
          authorName: publishedNote.nickname,
          updatedAt: new Date(),
        })

        setMessage(
          'Your note was published to the community.',
        )
      } else {
        const communityNote = communityNotes.find(
          item =>
            item.is_owner &&
            item.book_title === note.bookTitle &&
            item.content === note.content,
        )

        if (!communityNote) {
          throw new Error(
            'Could not find the published community note. ' +
              'Refresh the community list and try again.',
          )
        }

        const response = await fetch(
          `${API_URL}/publications/community/${communityNote.id}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              is_published: false,
            }),
          },
        )

        if (!response.ok) {
          throw new Error(await getErrorMessage(response))
        }

        await database.notes.update(noteId, {
          isPublished: false,
          updatedAt: new Date(),
        })

        setMessage('Your note is now private.')
      }

      await loadCommunityNotes()
    } catch (err) {
      console.error('Could not update the note:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Could not update the note.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(noteId: string) {
    setError('')
    setMessage('')

    try {
      const note = await database.notes.get(noteId)

      if (!note) {
        setError('The note could not be found.')
        return
      }

      if (note.isPublished) {
        setError(
          'Make the note private before deleting it.',
        )
        return
      }

      await database.notes.delete(noteId)
      setMessage('Your note was deleted.')
    } catch (err) {
      console.error('Could not delete the note:', err)
      setError('Could not delete your note.')
    }
  }

  async function deleteCommunityNote(
    communityNote: CommunityNote,
  ) {
    if (!communityNote.is_owner) {
      return
    }

    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API_URL}/publications/community/${communityNote.id}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      )

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const matchingNotes = notes.filter(
        note =>
          note.isPublished &&
          note.bookTitle === communityNote.book_title &&
          note.content === communityNote.content,
      )

      for (const note of matchingNotes) {
        await database.notes.update(note.id, {
          isPublished: false,
          updatedAt: new Date(),
        })
      }

      setCommunityNotes(current =>
        current.filter(
          note => note.id !== communityNote.id,
        ),
      )

      setMessage('Your community note was deleted.')
    } catch (err) {
      console.error(
        'Could not delete the community note:',
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete the community note.',
      )
    }
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
            onClick={() => {
              setError('')
              setMessage('')
              setIsCreating(true)
            }}
          >
            <Plus size={17} />
            New note
          </button>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="notes-message notes-error"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="notes-message notes-success"
        >
          {message}
        </div>
      )}

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
                <option value="">Select a book</option>

                {books.map(book => (
                  <option key={book.id} value={book.id}>
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
                  saving ||
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
        <>
          <section className="notes-section">
            <div className="notes-section-header">
              <div>
                <p className="eyebrow">Your writing</p>

                <h2>
                  {notes.length === 0
                    ? 'No notes yet'
                    : `${notes.length} ${
                        notes.length === 1 ? 'note' : 'notes'
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
                  <h3>Start your reading memory</h3>

                  <p>
                    Write your first note about something
                    you read.
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

                      <span>{note.bookTitle}</span>
                    </div>

                    <p className="note-card-content">
                      {note.content}
                    </p>

                    {note.authorName && (
                      <p className="note-author">
                        By {note.authorName}
                      </p>
                    )}

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
                          disabled={
                            saving ||
                            accountLoading ||
                            !account
                          }
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

          <section className="notes-section">
            <div className="notes-section-header">
              <div>
                <p className="eyebrow">Shared reading</p>

                <h2>
                  <Users
                    size={19}
                    style={{
                      display: 'inline',
                      verticalAlign: 'middle',
                      marginRight: 8,
                    }}
                  />
                  Community notes
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadCommunityNotes()
                }
                disabled={
                  communityLoading ||
                  accountLoading ||
                  !account
                }
              >
                Refresh
              </button>
            </div>

            {accountLoading ? (
              <p>Checking your sign-in session...</p>
            ) : !account ? (
              <p>
                Sign in to see notes shared by other readers.
              </p>
            ) : communityLoading ? (
              <p>Loading community notes...</p>
            ) : communityNotes.length === 0 ? (
              <div className="notes-empty">
                <Users
                  size={24}
                  strokeWidth={1.5}
                />

                <div>
                  <h3>No published notes yet</h3>

                  <p>
                    Publish one of your notes to start
                    the community.
                  </p>
                </div>
              </div>
            ) : (
              <div className="notes-list">
                {communityNotes.map(note => (
                  <article
                    key={note.id}
                    className="note-card"
                  >
                    <div className="note-card-book">
                      <BookOpen size={17} />

                      <span>{note.book_title}</span>
                    </div>

                    <p className="note-author">
                      By {note.nickname} (@{note.username})
                    </p>

                    <p className="note-card-content">
                      {note.content}
                    </p>

                    <div className="note-card-footer">
                      <span className="note-status published">
                        <Globe size={13} />
                        Published
                      </span>

                      {note.is_owner && (
                        <div className="note-actions">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              const localNote = notes.find(
                                item =>
                                  item.isPublished &&
                                  item.bookTitle ===
                                    note.book_title &&
                                  item.content ===
                                    note.content,
                              )

                              if (localNote) {
                                void togglePublished(
                                  localNote.id,
                                  false,
                                )
                              } else {
                                setError(
                                  'This community note does not match a local note. ' +
                                    'Refresh the page and try again.',
                                )
                              }
                            }}
                          >
                            Make private
                          </button>

                          <button
                            type="button"
                            className="note-delete"
                            aria-label="Delete community note"
                            onClick={() =>
                              void deleteCommunityNote(note)
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}