
import { type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BrainCircuit,
  BookOpen,
  Check,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { database } from '../../db/database'

function StatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode
  label: string
  value: number
  description: string
}) {
  return (
    <div className="memory-stat-card">
      <div className="memory-stat-icon">
        {icon}
      </div>

      <div>
        <p className="memory-stat-label">
          {label}
        </p>

        <p className="memory-stat-value">
          {value.toLocaleString()}
        </p>

        <p className="memory-stat-description">
          {description}
        </p>
      </div>
    </div>
  )
}

export function ReadingMemoryPage() {
  const bookCount =
    useLiveQuery(
      () => database.documents.count(),
      [],
      0,
    )

  const passageCount =
    useLiveQuery(
      () => database.memoryChunks.count(),
      [],
      0,
    )

  const embeddingCount =
    useLiveQuery(
      () => database.memoryEmbeddings.count(),
      [],
      0,
    )

  const questionCount =
  useLiveQuery(
    async () => {
      const messages =
        await database.messages.toArray()

      return messages.filter(
        message => message.role === 'user',
      ).length
    },
    [],
    0,
  )

  const documents =
    useLiveQuery(
      () =>
        database.documents
          .orderBy('createdAt')
          .reverse()
          .limit(5)
          .toArray(),
      [],
      [],
    )

  const memoryReady =
    passageCount > 0 &&
    embeddingCount > 0

  return (
    <section className="reading-memory-page">
      <div className="memory-page-header">
        <div>
          <p className="eyebrow">
            Reading memory
          </p>

          <h1>
            Your reading memory
          </h1>

          <p className="memory-page-description">
            Questions, passages, and connections
            from your books become part of your
            personal reading history.
          </p>
        </div>

        <div
          className={`memory-status ${
            memoryReady
              ? 'ready'
              : 'building'
          }`}
        >
          {memoryReady ? (
            <>
              <Check size={16} />
              Semantic memory ready
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Building memory
            </>
          )}
        </div>
      </div>

      <div className="memory-stats">
        <StatCard
          icon={
            <BookOpen
              size={20}
              strokeWidth={1.7}
            />
          }
          label="Books"
          value={bookCount}
          description="Books in your local library"
        />

        <StatCard
          icon={
            <BrainCircuit
              size={20}
              strokeWidth={1.7}
            />
          }
          label="Passages"
          value={passageCount}
          description="Indexed passages"
        />

        <StatCard
          icon={
            <Sparkles
              size={20}
              strokeWidth={1.7}
            />
          }
          label="Embeddings"
          value={embeddingCount}
          description="Semantic representations"
        />

        <StatCard
          icon={
            <MessageCircle
              size={20}
              strokeWidth={1.7}
            />
          }
          label="Questions"
          value={questionCount}
          description="Questions you've asked"
        />
      </div>

      <section className="memory-section">
        <div className="memory-section-heading">
          <div>
            <p className="eyebrow">
              Foundation
            </p>

            <h2>
              Your memory is taking shape
            </h2>
          </div>
        </div>

        <div className="memory-progress">
          <div className="memory-progress-item">
            <span className="memory-progress-icon">
              {bookCount > 0 ? (
                <Check size={16} />
              ) : (
                '1'
              )}
            </span>

            <div>
              <strong>
                Books imported
              </strong>

              <p>
                {bookCount > 0
                  ? `${bookCount} ${
                      bookCount === 1
                        ? 'book'
                        : 'books'
                    } available.`
                  : 'Add a PDF to begin.'}
              </p>
            </div>
          </div>

          <div className="memory-progress-item">
            <span className="memory-progress-icon">
              {passageCount > 0 ? (
                <Check size={16} />
              ) : (
                '2'
              )}
            </span>

            <div>
              <strong>
                Passages indexed
              </strong>

              <p>
                {passageCount > 0
                  ? `${passageCount.toLocaleString()} passages indexed.`
                  : 'Passages will appear after indexing.'}
              </p>
            </div>
          </div>

          <div className="memory-progress-item">
            <span className="memory-progress-icon">
              {embeddingCount > 0 ? (
                <Check size={16} />
              ) : (
                '3'
              )}
            </span>

            <div>
              <strong>
                Semantic memory
              </strong>

              <p>
                {embeddingCount > 0
                  ? `${embeddingCount.toLocaleString()} semantic embeddings available.`
                  : 'Embeddings have not been generated yet.'}
              </p>
            </div>
          </div>

          <div className="memory-progress-item">
            <span className="memory-progress-icon">
              <Sparkles size={16} />
            </span>

            <div>
              <strong>
                Connections
              </strong>

              <p>
                Meaningful connections between
                your books will appear here.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="memory-section">
        <div className="memory-section-heading">
          <div>
            <p className="eyebrow">
              Library
            </p>

            <h2>
              Recently added books
            </h2>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="memory-empty">
            <BookOpen
              size={22}
              strokeWidth={1.5}
            />

            <div>
              <h3>
                Your reading memory is empty
              </h3>

              <p>
                Add your first PDF to start
                building your personal memory.
              </p>
            </div>
          </div>
        ) : (
          <div className="memory-books">
            {documents.map(document => (
              <div
                key={document.id}
                className="memory-book"
              >
                <div className="memory-book-icon">
                  <BookOpen
                    size={19}
                    strokeWidth={1.6}
                  />
                </div>

                <div className="memory-book-info">
                  <h3>
                    {document.title}
                  </h3>

                  <p>
                    {document.pageCount}{' '}
                    {document.pageCount === 1
                      ? 'page'
                      : 'pages'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="memory-section memory-connections">
        <div className="memory-section-heading">
          <div>
            <p className="eyebrow">
              Connections
            </p>

            <h2>
              Meaningful relationships
            </h2>
          </div>
        </div>

        <div className="memory-empty">
          <BrainCircuit
            size={22}
            strokeWidth={1.5}
          />

          <div>
            <h3>
              Your connections will appear here
            </h3>

            <p>
              When two passages from different
              books contain a meaningful
              conceptual relationship, Reading
              Memory will save it here.
            </p>
          </div>
        </div>
      </section>
    </section>
  )
}