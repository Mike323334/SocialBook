import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, FilePlus2, FileText, LoaderCircle, Trash2 } from 'lucide-react'
import { database, type DocumentRecord, type PageRecord } from '../../db/database'
import { BookChatPanel } from '../chat/BookChatPanel'
import { trackAnalyticsEvent } from '../analytics/analyticsClient'

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function LibraryPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const books = useLiveQuery(() => database.documents.orderBy('createdAt').reverse().toArray(), [], [])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function addFile(file?: File) {
    if (!file) return
    setError('')
    setMessage('Extracting text and saving this book on your device...')
    setBusy(true)
    try {
      const { importPdf } = await import('./pdfImport')
      const result = await importPdf(file)
      void trackAnalyticsEvent('book_upload')
      setMessage(result.scanned
        ? 'Book saved locally. This PDF appears to be scanned; some pages may have little or no selectable text.'
        : `Book saved locally. Extracted ${result.extractedCharacters.toLocaleString()} characters from ${result.document.pageCount} pages.`)
    } catch (cause) {
      setMessage('')
      setError(cause instanceof Error ? cause.message : 'The PDF could not be added.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void addFile(event.currentTarget.files?.[0])
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void addFile(event.dataTransfer.files[0])
  }

  async function removeBook(book: DocumentRecord) {
    if (!window.confirm(`Remove “${book.title}” and its locally stored pages?`)) return
    await database.transaction('rw', database.documents, database.pages, database.conversations, database.messages, async () => {
      await database.documents.delete(book.id)
      await database.pages.where('documentId').equals(book.id).delete()
      await database.conversations.delete(book.id)
      await database.messages.where('documentId').equals(book.id).delete()
    })
    setMessage(`“${book.title}” was removed from this device.`)
  }

  return (
    <section className="books-page" aria-labelledby="books-title">
      <header className="books-header">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1 id="books-title">Library</h1>
          <p className="books-intro">PDFs are read and stored in this browser. The original file is not uploaded to the server.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <FilePlus2 size={17} />}
          {busy ? 'Adding PDF' : 'Add a book'}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={handleFileChange} aria-label="Choose a PDF book" />
      </header>

      <div
        className={`upload-zone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="upload-symbol"><FilePlus2 size={21} /></span>
        <div>
          <strong>Drop a PDF here</strong>
          <span> or <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>browse files</button></span>
          <p>Text extraction happens locally in your browser.</p>
        </div>
      </div>

      {message && <p className="status-message" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="books-list-heading">
        <h2>Your books</h2>
        <span>{books.length} {books.length === 1 ? 'book' : 'books'}</span>
      </div>

      {books.length === 0 ? (
        <div className="books-empty">
          <BookOpen size={26} strokeWidth={1.4} />
          <h3>Your first book starts here</h3>
          <p>Add a selectable-text PDF to read it and ask questions about its contents.</p>
        </div>
      ) : (
        <ul className="book-list">
          {books.map((book) => (
            <li className="book-row" key={book.id}>
              <span className="book-file-icon"><FileText size={19} /></span>
              <Link className="book-link" to={`/book/${book.id}`}>
                <strong>{book.title}</strong>
                <span>{book.author || book.fileName} · {book.pageCount} pages · {formatSize(book.fileSize)}</span>
              </Link>
              <button className="icon-button" type="button" aria-label={`Remove ${book.title}`} title="Remove book" onClick={() => void removeBook(book)}>
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ReaderPage() {
  const { id } = useParams()
  const [book, setBook] = useState<DocumentRecord | null>(null)
  const [pages, setPages] = useState<PageRecord[]>([])
  const [pageNumber, setPageNumber] = useState(1)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!id) return
    void Promise.all([
      database.documents.get(id),
      database.pages.where('documentId').equals(id).sortBy('pageNumber'),
    ]).then(([record, records]) => {
      if (!record) {
        setMissing(true)
        return
      }
      setBook(record)
      setPages(records)
      void database.documents.update(id, { lastReadAt: new Date() })
    })
  }, [id])

  if (missing) {
    return <section className="reader-loading"><p>This book is no longer in your local library.</p><Link to="/library">Return to library</Link></section>
  }

  if (!book) {
    return <section className="reader-loading"><LoaderCircle className="spin" size={20} /><p>Opening your book...</p></section>
  }

  const currentPage = pages.find((page) => page.pageNumber === pageNumber)

  return (
    <section className="reader-page">
      <header className="reader-header">
        <Link to="/library" className="back-link">← Library</Link>
        <div><h1>{book.title}</h1><span>{book.author || `${book.pageCount} pages`}</span></div>
      </header>
      <div className="reader-layout">
        <nav className="page-rail" aria-label="Book pages">
          <p>Pages</p>
          {pages.map((page) => (
            <button key={page.pageNumber} type="button" className={page.pageNumber === pageNumber ? 'selected' : ''} onClick={() => setPageNumber(page.pageNumber)}>
              {page.pageNumber}
            </button>
          ))}
        </nav>
        <article className="reader-sheet" aria-label={`Page ${pageNumber}`}>
          <div className="page-kicker">{book.title} <span>·</span> {pageNumber}</div>
          {currentPage?.text ? <p className="page-text">{currentPage.text}</p> : <p className="page-no-text">No selectable text was extracted from this page.</p>}
          <div className="page-controls">
            <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((number) => number - 1)}>Previous</button>
            <span>Page {pageNumber} of {book.pageCount}</span>
            <button type="button" disabled={pageNumber >= book.pageCount} onClick={() => setPageNumber((number) => number + 1)}>Next</button>
          </div>
        </article>
        <BookChatPanel book={book} pages={pages} onCitationClick={setPageNumber} />
      </div>
    </section>
  )
}
