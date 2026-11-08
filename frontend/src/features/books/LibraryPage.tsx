
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'

import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'

import {
  BookOpen,
  FilePlus2,
  FileText,
  LoaderCircle,
  Trash2,
} from 'lucide-react'

import {
  getActiveDatabase,
  isActiveDatabase,
  type DocumentRecord,
  type OutlineItem,
  type PageRecord,
} from '../../db/database'

import { BookChatPanel } from '../chat/BookChatPanel'
import { trackAnalyticsEvent } from '../analytics/analyticsClient'

import { OUTLINE_VERSION } from './tocParser'
import { PdfPageViewer } from './PdfPageViewer'

type StoredBook = DocumentRecord & {
  outlineVersion?: number
}

// ============================================================
// HELPERS
// ============================================================

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================
// LIBRARY PAGE
// ============================================================

export function LibraryPage() {
  const inputRef = useRef<HTMLInputElement>(null)

  // Capture the active database for this component instance.
  const db = getActiveDatabase()

  const books = useLiveQuery(
    () =>
      db.documents
        .orderBy('createdAt')
        .reverse()
        .toArray(),
    [db],
    [],
  )

  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // ----------------------------------------------------------
  // ADD PDF
  // ----------------------------------------------------------

  async function addFile(file?: File) {
    if (!file) return

    const operationDatabase = db

    setError('')

    setMessage(
      'Extracting text and saving this book on your device...',
    )

    setBusy(true)

    try {
      const { importPdf } = await import('./pdfImport')

      const result = await importPdf(
        file,
        undefined,
        operationDatabase,
      )

      // Avoid updating the UI if the active account changed.
      if (!isActiveDatabase(operationDatabase)) {
        return
      }

      void trackAnalyticsEvent('book_upload')

      setMessage(
        result.scanned
          ? 'Book saved locally. This PDF appears to be scanned; some pages may have little or no selectable text.'
          : `Book saved locally. Extracted ${result.extractedCharacters.toLocaleString()} characters from ${result.document.pageCount} pages.`,
      )
    } catch (cause) {
      if (!isActiveDatabase(operationDatabase)) {
        return
      }

      setMessage('')

      setError(
        cause instanceof Error
          ? cause.message
          : 'The PDF could not be added.',
      )
    } finally {
      if (isActiveDatabase(operationDatabase)) {
        setBusy(false)

        if (inputRef.current) {
          inputRef.current.value = ''
        }
      }
    }
  }

  // ----------------------------------------------------------
  // FILE INPUT
  // ----------------------------------------------------------

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    void addFile(event.currentTarget.files?.[0])
  }

  // ----------------------------------------------------------
  // DRAG AND DROP
  // ----------------------------------------------------------

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault()

    setDragging(false)

    void addFile(event.dataTransfer.files[0])
  }

  // ----------------------------------------------------------
  // REMOVE BOOK
  // ----------------------------------------------------------

  async function removeBook(book: DocumentRecord) {
    if (
      !window.confirm(
        `Remove "${book.title}" and its locally stored pages?`,
      )
    ) {
      return
    }

    const operationDatabase = db

    try {
      await operationDatabase.transaction(
        'rw',
        [
          operationDatabase.documents,
          operationDatabase.pages,
          operationDatabase.conversations,
          operationDatabase.messages,
          operationDatabase.memoryChunks,
          operationDatabase.memoryEmbeddings,
          operationDatabase.notes,
        ],
        async () => {
          // Delete the document.
          await operationDatabase.documents.delete(book.id)

          // Delete extracted PDF pages.
          await operationDatabase.pages
            .where('documentId')
            .equals(book.id)
            .delete()

          // Find conversations belonging to this document.
          const conversations =
            await operationDatabase.conversations
              .where('documentId')
              .equals(book.id)
              .toArray()

          // Delete messages belonging to this document.
          await operationDatabase.messages
            .where('documentId')
            .equals(book.id)
            .delete()

          // Handle legacy messages with inconsistent document IDs.
          for (const conversation of conversations) {
            await operationDatabase.messages
              .where('conversationId')
              .equals(conversation.id)
              .delete()
          }

          // Delete conversations.
          await operationDatabase.conversations
            .where('documentId')
            .equals(book.id)
            .delete()

          // Delete generated memory chunks.
          await operationDatabase.memoryChunks
            .where('documentId')
            .equals(book.id)
            .delete()

          // Delete generated embeddings.
          await operationDatabase.memoryEmbeddings
            .where('documentId')
            .equals(book.id)
            .delete()

          // Delete private notes.
          await operationDatabase.notes
            .where('documentId')
            .equals(book.id)
            .delete()
        },
      )

      if (!isActiveDatabase(operationDatabase)) {
        return
      }

      setMessage(
        `"${book.title}" was removed from this device.`,
      )

      setError('')
    } catch (cause) {
      if (!isActiveDatabase(operationDatabase)) {
        return
      }

      setError(
        cause instanceof Error
          ? cause.message
          : 'The book could not be removed.',
      )
    }
  }

  // ----------------------------------------------------------
  // LIBRARY UI
  // ----------------------------------------------------------

  return (
    <section
      className="books-page"
      aria-labelledby="books-title"
    >
      <header className="books-header">
        <div>
          <p className="eyebrow">
            Your collection
          </p>

          <h1 id="books-title">
            Library
          </h1>

          <p className="books-intro">
            PDFs are read and stored in this browser.
            The original file is not uploaded to the server.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle
              className="spin"
              size={17}
            />
          ) : (
            <FilePlus2 size={17} />
          )}

          {busy ? 'Adding PDF' : 'Add a book'}
        </button>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          aria-label="Choose a PDF book"
        />
      </header>

      <div
        className={`upload-zone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="upload-symbol">
          <FilePlus2 size={21} />
        </span>

        <div>
          <strong>Drop a PDF here</strong>

          <span>
            {' '}
            or{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => inputRef.current?.click()}
            >
              browse files
            </button>
          </span>

          <p>
            Text extraction happens locally in your browser.
          </p>
        </div>
      </div>

      {message && (
        <p
          className="status-message"
          role="status"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          className="error-message"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="books-list-heading">
        <h2>Your books</h2>

        <span>
          {books.length}{' '}
          {books.length === 1 ? 'book' : 'books'}
        </span>
      </div>

      {books.length === 0 ? (
        <div className="books-empty">
          <BookOpen
            size={26}
            strokeWidth={1.4}
          />

          <h3>Your first book starts here</h3>

          <p>
            Add a selectable-text PDF to read it and ask
            questions about its contents.
          </p>
        </div>
      ) : (
        <ul className="book-list">
          {books.map((book) => (
            <li
              className="book-row"
              key={book.id}
            >
              <span className="book-file-icon">
                <FileText size={19} />
              </span>

              <Link
                className="book-link"
                to={`/book/${book.id}`}
              >
                <strong>{book.title}</strong>

                <span>
                  {book.author || book.fileName}
                  {' · '}
                  {book.pageCount} pages
                  {' · '}
                  {formatSize(book.fileSize)}
                </span>
              </Link>

              <button
                className="icon-button"
                type="button"
                aria-label={`Remove ${book.title}`}
                title="Remove book"
                onClick={() => void removeBook(book)}
              >
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ============================================================
// PDF OUTLINE
// ============================================================

/**
 * Returns the last outline entry that starts on or before
 * the currently selected page.
 */
function findActiveIndex(
  items: OutlineItem[],
  pageNumber: number,
): number {
  let active = -1

  items.forEach((item, index) => {
    if (
      item.pageNumber !== null &&
      item.pageNumber <= pageNumber
    ) {
      active = index
    }
  })

  return active
}

// ============================================================
// OUTLINE LIST
// ============================================================

function OutlineList({
  items,
  activeIndex,
  onSelect,
}: {
  items: OutlineItem[]
  activeIndex: number
  onSelect: (page: number) => void
}) {
  return (
    <ul className="outline-list">
      {items.map((item, index) => {
        const page = item.pageNumber

        return (
          <li
            key={index}
            style={{
              paddingLeft: `${Math.min(item.depth, 4) * 12}px`,
            }}
          >
            <button
              type="button"
              disabled={page === null}
              className={
                index === activeIndex
                  ? 'selected'
                  : ''
              }
              title={
                page === null
                  ? item.title
                  : `${item.title} (page ${page})`
              }
              onClick={() => {
                if (page !== null) {
                  onSelect(page)
                }
              }}
            >
              {item.title}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================
// READER PAGE
// ============================================================

export function ReaderPage() {
  const { id } = useParams()

  // Capture one database reference for this reader instance.
  const db = getActiveDatabase()

  const [book, setBook] =
    useState<DocumentRecord | null>(null)

  const [pages, setPages] =
    useState<PageRecord[]>([])

  const [pageNumber, setPageNumber] = useState(1)

  const [missing, setMissing] = useState(false)

  // ----------------------------------------------------------
  // LOAD BOOK AND OUTLINE
  // ----------------------------------------------------------

  useEffect(() => {
    if (!id) return

    // Keep a validated ID for all asynchronous operations.
    const documentId = id

    let cancelled = false

    // Reset previous reader data when the document changes.
    setBook(null)
    setPages([])
    setPageNumber(1)
    setMissing(false)

    const operationDatabase = db

    async function loadBook() {
      try {
        const [record, records] = await Promise.all([
          operationDatabase.documents.get(documentId),

          operationDatabase.pages
            .where('documentId')
            .equals(documentId)
            .sortBy('pageNumber'),
        ])

        if (cancelled) return

        if (!record) {
          setMissing(true)
          return
        }

        setBook(record)
        setPages(records)

        // Update last-read timestamp.
        await operationDatabase.documents.update(
          documentId,
          {
            lastReadAt: new Date(),
          },
        )

        if (cancelled) return

        // Check whether the stored outline needs updating.
        const stored: StoredBook = record

        const outdated =
          stored.outlineVersion !== OUTLINE_VERSION &&
          (
            stored.outline?.length === 0 ||
            typeof stored.outline?.[0]?.depth !== 'number'
          )

        const needsOutline =
          !stored.outline || outdated

        // Re-extract the outline from the original PDF if needed.
        if (needsOutline && stored.pdf) {
          const pageTexts = records.map(
            (page) => page.text,
          )

          try {
            const { extractOutlineFromFile } =
              await import('./pdfImport')

            const outline = await extractOutlineFromFile(
              stored.pdf as Blob,
              pageTexts,
            )

            if (cancelled) return

            const patch: Partial<StoredBook> = {
              outline,
              outlineVersion: OUTLINE_VERSION,
            }

            // Write to the database captured at operation start.
            await operationDatabase.documents.update(
              documentId,
              patch,
            )

            if (cancelled) return

            setBook((current) =>
              current
                ? {
                    ...current,
                    outline,
                    outlineVersion: OUTLINE_VERSION,
                  }
                : current,
            )
          } catch (cause) {
            console.error(
              'Could not extract the PDF outline:',
              cause,
            )

            // Keep the existing outline.
            // The next visit can retry extraction.
          }
        }
      } catch (cause) {
        if (cancelled) return

        console.error(
          'Could not load the selected book:',
          cause,
        )

        setMissing(true)
      }
    }

    void loadBook()

    return () => {
      cancelled = true
    }
  }, [id, db])

  // ----------------------------------------------------------
  // OUTLINE STATE
  // ----------------------------------------------------------

  const outline = book?.outline

  const hasOutline = Boolean(
    outline &&
    outline.length > 0 &&
    typeof outline[0].depth === 'number',
  )

  const activeIndex = useMemo(
    () =>
      outline
        ? findActiveIndex(outline, pageNumber)
        : -1,
    [outline, pageNumber],
  )

  // ----------------------------------------------------------
  // MISSING BOOK
  // ----------------------------------------------------------

  if (missing) {
    return (
      <section className="reader-loading">
        <p>
          This book is no longer in your local library.
        </p>

        <Link to="/library">
          Return to library
        </Link>
      </section>
    )
  }

  // ----------------------------------------------------------
  // LOADING BOOK
  // ----------------------------------------------------------

  if (!book) {
    return (
      <section className="reader-loading">
        <LoaderCircle
          className="spin"
          size={20}
        />

        <p>Opening your book...</p>
      </section>
    )
  }

  // ----------------------------------------------------------
  // CURRENT PAGE
  // ----------------------------------------------------------

  const currentPage = pages.find(
    (page) => page.pageNumber === pageNumber,
  )

  // ----------------------------------------------------------
  // READER UI
  // ----------------------------------------------------------

  return (
    <section className="reader-page">

      {/* READER HEADER */}

      <header className="reader-header">
        <Link
          to="/library"
          className="back-link"
        >
          ← Library
        </Link>

        <div>
          <h1>{book.title}</h1>

          <span>
            {book.author || `${book.pageCount} pages`}
          </span>
        </div>
      </header>

      {/* MAIN READER LAYOUT */}

      <div className="reader-layout">

        {/* LEFT SIDEBAR: CHAPTERS OR PAGES */}

        <nav
          className="page-rail"
          aria-label={
            hasOutline ? 'Chapters' : 'Book pages'
          }
        >
          <p>
            {hasOutline ? 'Chapters' : 'Pages'}
          </p>

          {hasOutline && outline ? (
            <OutlineList
              items={outline}
              activeIndex={activeIndex}
              onSelect={setPageNumber}
            />
          ) : (
            pages.map((page) => (
              <button
                key={page.pageNumber}
                type="button"
                className={
                  page.pageNumber === pageNumber
                    ? 'selected'
                    : ''
                }
                onClick={() =>
                  setPageNumber(page.pageNumber)
                }
              >
                {page.pageNumber}
              </button>
            ))
          )}
        </nav>

        {/* CENTER: ORIGINAL PDF READER */}

        <article
          className="reader-sheet"
          aria-label={`Page ${pageNumber}`}
        >
          {book.pdf ? (
            <PdfPageViewer
              pdf={book.pdf as Blob}
              pageNumber={pageNumber}
              title={book.title}
            />
          ) : (
            <>
              {/* FALLBACK FOR BOOKS WITHOUT ORIGINAL PDF */}

              <div className="page-kicker">
                {book.title}
                {' '}
                <span>·</span>
                {' '}
                {pageNumber}
              </div>

              {currentPage?.text ? (
                <p className="page-text">
                  {currentPage.text}
                </p>
              ) : (
                <p className="page-no-text">
                  No selectable text was extracted from this page.
                </p>
              )}
            </>
          )}

          {/* PAGE NAVIGATION */}

          <div className="page-controls">
            <button
              type="button"
              disabled={pageNumber <= 1}
              onClick={() =>
                setPageNumber((number) => number - 1)
              }
            >
              Previous
            </button>

            <span>
              Page {pageNumber} of {book.pageCount}
            </span>

            <button
              type="button"
              disabled={pageNumber >= book.pageCount}
              onClick={() =>
                setPageNumber((number) => number + 1)
              }
            >
              Next
            </button>
          </div>
        </article>

        {/* RIGHT SIDEBAR: AI BOOK CHAT */}

        
      </div>
      <BookChatPanel
          book={book}
          pages={pages}
          onCitationClick={setPageNumber}
        />

    </section>
  )
}
