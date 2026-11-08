import { type ReactNode } from 'react'

import { useLiveQuery } from 'dexie-react-hooks'

import {
  BrainCircuit,
  BookOpen,
  Check,
  MessageCircle,
  Sparkles,
  Library,
  Network,
  ArrowUpRight,
  Layers3,
} from 'lucide-react'

import { getActiveDatabase } from '../../db/database'

function StatCard({
  icon,
  label,
  value,
  description,
  accent,
}: {
  icon: ReactNode
  label: string
  value: number
  description: string
  accent: string
}) {
  return (
    <article className="memory-stat-card">
      <div className={`memory-stat-icon ${accent}`}>
        {icon}
      </div>

      <div className="memory-stat-content">
        <p className="memory-stat-label">{label}</p>

        <p className="memory-stat-value">
          {value.toLocaleString()}
        </p>

        <p className="memory-stat-description">
          {description}
        </p>
      </div>
    </article>
  )
}

export function ReadingMemoryPage() {
  /*
   * Capture the database belonging to the currently active account.
   *
   * App.tsx remounts the private routes when the database changes.
   * This prevents queries from switching databases unexpectedly.
   */
  const db = getActiveDatabase()

  /*
   * Count books in the current account's private library.
   */
  const bookCount = useLiveQuery(
    () => db.documents.count(),
    [db],
    0,
  )

  /*
   * Count indexed text passages.
   */
  const passageCount = useLiveQuery(
    () => db.memoryChunks.count(),
    [db],
    0,
  )

  /*
   * Count semantic embeddings.
   */
  const embeddingCount = useLiveQuery(
    () => db.memoryEmbeddings.count(),
    [db],
    0,
  )

  /*
   * Count user questions from this account's chat history.
   */
  const questionCount = useLiveQuery(
    async () => {
      const messages = await db.messages.toArray()

      return messages.filter(
        (message) => message.role === 'user',
      ).length
    },
    [db],
    0,
  )

  /*
   * Load the five most recently added books.
   */
  const documents = useLiveQuery(
    () =>
      db.documents
        .orderBy('createdAt')
        .reverse()
        .limit(5)
        .toArray(),
    [db],
    [],
  )

  /*
   * Calculate semantic indexing status.
   */
  const memoryReady =
    passageCount > 0 &&
    embeddingCount > 0

  const indexingProgress =
    passageCount > 0
      ? Math.min(
          100,
          Math.round(
            (embeddingCount / passageCount) * 100,
          ),
        )
      : 0

  return (
    <section className="reading-memory-page">
      {/* Page introduction */}
      <header className="memory-page-header">
        <div className="memory-heading-copy">
          <div className="memory-kicker">
            <BrainCircuit size={15} />

            <span>Your personal knowledge base</span>
          </div>

          <h1>SocialBooks</h1>

          <p className="memory-page-description">
            Your books, questions, and discoveries come together
            to build a personal history of what you read and learn.
          </p>
        </div>

        <div
          className={`memory-status ${
            memoryReady ? 'ready' : 'building'
          }`}
          aria-live="polite"
        >
          <span className="memory-status-indicator" />

          {memoryReady
            ? 'Semantic memory ready'
            : 'Memory awaiting indexing'}
        </div>
      </header>

      {/* Statistics */}
      <div className="memory-stats">
        <StatCard
          icon={<BookOpen size={21} strokeWidth={1.7} />}
          label="Books"
          value={bookCount}
          description="In your local library"
          accent="book"
        />

        <StatCard
          icon={<Layers3 size={21} strokeWidth={1.7} />}
          label="Passages"
          value={passageCount}
          description="Indexed text passages"
          accent="passage"
        />

        <StatCard
          icon={<Sparkles size={21} strokeWidth={1.7} />}
          label="Embeddings"
          value={embeddingCount}
          description="Semantic representations"
          accent="embedding"
        />

        <StatCard
          icon={<MessageCircle size={21} strokeWidth={1.7} />}
          label="Questions"
          value={questionCount}
          description="User messages in your history"
          accent="question"
        />
      </div>

      {/* Knowledge foundation */}
      <section className="memory-section memory-foundation">
        <div className="memory-section-heading">
          <div>
            <p className="eyebrow">Foundation</p>

            <h2>Your knowledge, organized</h2>

            <p className="memory-section-description">
              An overview of the information available to your
              personal reading memory.
            </p>
          </div>

          <div className="memory-foundation-badge">
            <BrainCircuit size={17} />

            <span>
              {memoryReady ? 'Active' : 'Getting started'}
            </span>
          </div>
        </div>

        <div className="memory-foundation-grid">
          <article className="memory-foundation-card">
            <div className="memory-foundation-top">
              <span className="memory-progress-icon complete">
                {bookCount > 0 ? (
                  <Check size={16} />
                ) : (
                  <BookOpen size={16} />
                )}
              </span>

              <span className="memory-foundation-number">
                {bookCount.toLocaleString()}
              </span>
            </div>

            <h3>Books imported</h3>

            <p>
              {bookCount > 0
                ? `${bookCount} ${
                    bookCount === 1 ? 'book is' : 'books are'
                  } available in your library.`
                : 'Import a PDF to begin building your memory.'}
            </p>
          </article>

          <article className="memory-foundation-card">
            <div className="memory-foundation-top">
              <span
                className={`memory-progress-icon ${
                  passageCount > 0 ? 'complete' : ''
                }`}
              >
                {passageCount > 0 ? (
                  <Check size={16} />
                ) : (
                  <Layers3 size={16} />
                )}
              </span>

              <span className="memory-foundation-number">
                {passageCount.toLocaleString()}
              </span>
            </div>

            <h3>Passages indexed</h3>

            <p>
              {passageCount > 0
                ? 'Text passages are available for retrieval.'
                : 'Your book passages will appear after indexing.'}
            </p>
          </article>

          <article className="memory-foundation-card">
            <div className="memory-foundation-top">
              <span
                className={`memory-progress-icon ${
                  memoryReady ? 'complete' : ''
                }`}
              >
                {memoryReady ? (
                  <Check size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
              </span>

              <span className="memory-foundation-number">
                {indexingProgress}%
              </span>
            </div>

            <h3>Embedding coverage</h3>

            <p>
              {passageCount === 0
                ? 'Coverage will be available after passages are indexed.'
                : `${embeddingCount.toLocaleString()} embeddings for ${passageCount.toLocaleString()} passages.`}
            </p>

            <div
              className="memory-coverage-track"
              role="progressbar"
              aria-label="Embedding coverage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={indexingProgress}
            >
              <span
                className="memory-coverage-fill"
                style={{
                  width: `${indexingProgress}%`,
                }}
              />
            </div>
          </article>

          <article className="memory-foundation-card memory-connection-preview">
            <div className="memory-foundation-top">
              <span className="memory-progress-icon">
                <Network size={16} />
              </span>

              <Sparkles
                size={17}
                className="memory-subtle-icon"
              />
            </div>

            <h3>Conceptual connections</h3>

            <p>
              Discover relationships between ideas discussed
              across different books.
            </p>

            <span className="memory-coming-soon">
              <span />
              Connection discovery
            </span>
          </article>
        </div>
      </section>

      {/* Recently added books */}
      <section className="memory-section">
        <div className="memory-section-heading">
          <div>
            <p className="eyebrow">Your collection</p>

            <h2>Recently added books</h2>

            <p className="memory-section-description">
              The books contributing to your personal knowledge base.
            </p>
          </div>

          <div className="memory-section-count">
            <Library size={15} />

            <span>{bookCount} books</span>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="memory-empty">
            <div className="memory-empty-icon">
              <BookOpen size={24} strokeWidth={1.5} />
            </div>

            <div>
              <h3>Your reading memory starts with a book</h3>

              <p>
                Add a PDF to build your personal library and
                begin collecting passages you can revisit.
              </p>
            </div>
          </div>
        ) : (
          <div className="memory-books">
            {documents.map((document) => (
              <article
                key={document.id}
                className="memory-book"
              >
                <div className="memory-book-icon">
                  <BookOpen size={21} strokeWidth={1.6} />
                </div>

                <div className="memory-book-info">
                  <h3>{document.title}</h3>

                  <p>
                    {document.pageCount.toLocaleString()}{' '}
                    {document.pageCount === 1
                      ? 'page'
                      : 'pages'}
                  </p>

                  <span className="memory-book-status">
                    <Check size={12} />
                    In your library
                  </span>
                </div>

                <ArrowUpRight
                  size={17}
                  className="memory-book-arrow"
                  aria-hidden="true"
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Conceptual connections */}
      <section className="memory-section memory-connections">
        <div className="memory-section-heading">
          <div>
            <p className="eyebrow">Explore ideas</p>

            <h2>Meaningful connections</h2>

            <p className="memory-section-description">
              Ideas that relate across the books you've read.
            </p>
          </div>
        </div>

        <div className="memory-connections-panel">
          <div className="memory-connections-visual">
            <div className="memory-node memory-node-one">
              <BookOpen size={19} />
            </div>

            <div className="memory-node memory-node-two">
              <BrainCircuit size={21} />
            </div>

            <div className="memory-node memory-node-three">
              <Sparkles size={18} />
            </div>

            <span className="memory-node-line memory-line-one" />

            <span className="memory-node-line memory-line-two" />
          </div>

          <div className="memory-connections-copy">
            <span className="memory-coming-soon">
              <span />
              Knowledge discovery
            </span>

            <h3>Your connections will appear here</h3>

            <p>
              When related passages from different books are
              identified, this space can show the source books,
              relevant passages, and an explanation of the
              conceptual relationship between them.
            </p>

            <p className="memory-connections-note">
              Similar wording alone isn't enough. The goal is
              to surface meaningful relationships between ideas.
            </p>
          </div>
        </div>
      </section>
    </section>
  )
}