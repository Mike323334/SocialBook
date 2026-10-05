
import { useEffect, useState } from 'react'
import { database } from '../../db/database'
import { generateEmbedding } from './embeddings'
import {
  loadSemanticData,
  searchLoadedSemanticData,
} from './semanticSearch'
import {
  analyzeRelationship,
  type RelationshipAnalysis,
} from './comparisonAnalyzer'

/*
 * Lower threshold = more semantic candidates.
 *
 * We let local embeddings favor recall.
 * Groq performs the final meaningfulness check.
 */
const SEMANTIC_MIN_SIMILARITY = 0.30

/*
 * Number of semantic matches retrieved
 * for each passage.
 */
const CANDIDATES_PER_CHUNK = 8

/*
 * Maximum local candidates retained
 * for each comparison book.
 */
const LOCAL_CANDIDATES_PER_BOOK = 100

/*
 * Maximum number of candidates sent to Groq.
 *
 * Keep this controlled because Groq has
 * token-per-day limits.
 */
const MAX_GROQ_ANALYSES = 40

interface CandidateRelationship {
  queryChunkId: string
  matchedChunkId: string

  query: {
    documentId: string
    documentTitle: string
    pageNumber: number
    text: string
  }

  matched: {
    documentId: string
    documentTitle: string
    pageNumber: number
    text: string
  }

  similarity: number
}

interface RelationshipResult
  extends CandidateRelationship {
  analysis: RelationshipAnalysis
}

/*
 * Split:
 *
 * "Exploitology: Web Apps Exploits"
 *
 * into:
 *
 * title = "Exploitology"
 * subtitle = "Web Apps Exploits"
 */
function getBookTitleParts(title: string) {
  const separatorIndex =
    title.indexOf(':')

  if (separatorIndex === -1) {
    return {
      title,
      subtitle: '',
    }
  }

  return {
    title: title
      .slice(0, separatorIndex)
      .trim(),

    subtitle: title
      .slice(separatorIndex + 1)
      .trim(),
  }
}

function BookTitle({
  title,
}: {
  title: string
}) {
  const parts =
    getBookTitleParts(title)

  return (
    <div>
      <div className="font-semibold">
        {parts.title}
      </div>

      {parts.subtitle && (
        <div className="text-sm text-gray-500">
          {parts.subtitle}
        </div>
      )}
    </div>
  )
}

export default function EmbeddingTest() {
  const [
    selectedBookId,
    setSelectedBookId,
  ] = useState('')

  const [books, setBooks] =
    useState<
      Awaited<
        ReturnType<
          typeof database.documents.toArray
        >
      >
    >([])

  const [loading, setLoading] =
    useState(false)

  const [status, setStatus] =
    useState('')

  const [results, setResults] =
    useState<RelationshipResult[]>([])

  /*
   * Which relationship bubble is currently
   * expanded.
   */
  const [
    expandedRelationship,
    setExpandedRelationship,
  ] = useState<string | null>(null)

  /*
   * Load books when the component mounts.
   */
  useEffect(() => {
    async function loadBooks() {
      const documents =
        await database.documents.toArray()

      setBooks(documents)
    }

    void loadBooks()
  }, [])

  async function compareBooks() {
    if (!selectedBookId) {
      return
    }

    setLoading(true)
    setResults([])
    setExpandedRelationship(null)

    try {
      /*
       * ============================================
       * LOAD SELECTED BOOK
       * ============================================
       */
      setStatus(
        'Loading semantic memory...',
      )

      const selectedBook =
        await database.documents.get(
          selectedBookId,
        )

      if (!selectedBook) {
        throw new Error(
          'Selected book was not found.',
        )
      }

      /*
       * ============================================
       * FIND OTHER BOOKS
       * ============================================
       */
      const allDocuments =
        await database.documents.toArray()

      const otherBooks =
        allDocuments.filter(
          document =>
            document.id !==
            selectedBookId,
        )

      if (otherBooks.length === 0) {
        setStatus(
          'You need at least two books to compare.',
        )

        return
      }

      /*
       * ============================================
       * LOAD SEMANTIC DATA
       * ============================================
       *
       * Embeddings, chunks and documents are
       * loaded once.
       */
      setStatus(
        'Loading embeddings and passages...',
      )

      const semanticData =
        await loadSemanticData()

      /*
       * ============================================
       * LOAD SELECTED BOOK CHUNKS
       * ============================================
       */
      const queryChunks =
        await database.memoryChunks
          .where('documentId')
          .equals(selectedBookId)
          .toArray()

      if (queryChunks.length === 0) {
        setStatus(
          'This book does not have indexed chunks yet.',
        )

        return
      }

      /*
       * ============================================
       * CANDIDATE BUCKETS
       * ============================================
       *
       * Each comparison book gets its own bucket.
       *
       * Example:
       *
       * Book A → Book B
       * Book A → Book C
       * Book A → Book D
       */
      const candidatesByBook =
        new Map<
          string,
          CandidateRelationship[]
        >()

      for (const book of otherBooks) {
        candidatesByBook.set(
          book.id,
          [],
        )
      }

      /*
       * ============================================
       * STEP 1
       *
       * LOCAL SEMANTIC SEARCH
       * ============================================
       *
       * This part does NOT call Groq.
       *
       * It searches the local embeddings.
       */
      for (
        let index = 0;
        index < queryChunks.length;
        index += 1
      ) {
        const queryChunk =
          queryChunks[index]

        setStatus(
          `Finding semantic matches ${index + 1}/${queryChunks.length}...`,
        )

        /*
         * Generate embedding for the current
         * passage.
         */
        const queryEmbedding =
          await generateEmbedding(
            queryChunk.text,
          )

        /*
         * Find the strongest semantic matches
         * across the other books.
         */
        const matches =
          searchLoadedSemanticData(
            queryEmbedding,
            semanticData,
            {
              /*
               * Do not match the selected book
               * against itself.
               */
              excludeDocumentId:
                selectedBookId,

              /*
               * Get several candidates.
               */
              limit:
                CANDIDATES_PER_CHUNK,

              /*
               * Favor recall.
               */
              minSimilarity:
                SEMANTIC_MIN_SIMILARITY,
            },
          )

        /*
         * Put matches into the appropriate
         * comparison-book bucket.
         */
        for (const match of matches) {
          if (
            !candidatesByBook.has(
              match.documentId,
            )
          ) {
            continue
          }

          const bucket =
            candidatesByBook.get(
              match.documentId,
            )

          if (!bucket) {
            continue
          }

          /*
           * Only remove an EXACT duplicate
           * passage pair.
           *
           * We intentionally DO NOT use
           * shared concepts for deduplication.
           */
          const duplicate =
            bucket.some(
              existing =>
                existing.queryChunkId ===
                  queryChunk.id &&
                existing.matchedChunkId ===
                  match.chunkId,
            )

          if (duplicate) {
            continue
          }

          bucket.push({
            queryChunkId:
              queryChunk.id,

            matchedChunkId:
              match.chunkId,

            query: {
              documentId:
                selectedBookId,

              documentTitle:
                selectedBook.title,

              pageNumber:
                queryChunk.pageNumber,

              text:
                queryChunk.text,
            },

            matched: {
              documentId:
                match.documentId,

              documentTitle:
                match.documentTitle,

              pageNumber:
                match.pageNumber,

              text:
                match.text,
            },

            similarity:
              match.similarity,
          })
        }
      }

      /*
       * ============================================
       * STEP 2
       *
       * LOCAL RANKING
       * ============================================
       */
      const localCandidates: CandidateRelationship[] =
        []

      for (const book of otherBooks) {
        const bucket =
          candidatesByBook.get(
            book.id,
          ) ?? []

        /*
         * Highest semantic similarity first.
         */
        bucket.sort(
          (a, b) =>
            b.similarity -
            a.similarity,
        )

        /*
         * Keep the strongest candidates
         * for this particular book.
         */
        const selected =
          bucket.slice(
            0,
            LOCAL_CANDIDATES_PER_BOOK,
          )

        localCandidates.push(
          ...selected,
        )

        console.log(
          `[Semantic Search] ${book.title}: ${selected.length} candidates`,
        )
      }

      /*
       * Sort all candidates globally.
       */
      localCandidates.sort(
        (a, b) =>
          b.similarity -
          a.similarity,
      )

      console.log(
        `[Comparison] Total local candidates: ${localCandidates.length}`,
      )

      /*
       * ============================================
       * STEP 3
       *
       * SELECT CANDIDATES FOR GROQ
       * ============================================
       */
      const groqCandidates =
        localCandidates.slice(
          0,
          MAX_GROQ_ANALYSES,
        )

      console.log(
        `[Comparison] Sending ${groqCandidates.length} candidates to Groq`,
      )

      setStatus(
        `Found ${localCandidates.length} semantic candidates. Analyzing the best ${groqCandidates.length} with AI...`,
      )

      /*
       * ============================================
       * STEP 4
       *
       * GROQ RELATIONSHIP ANALYSIS
       * ============================================
       */
      const finalResults:
        RelationshipResult[] =
          []

      for (
        let index = 0;
        index < groqCandidates.length;
        index += 1
      ) {
        const candidate =
          groqCandidates[index]

        setStatus(
          `AI relationship analysis ${index + 1}/${groqCandidates.length}...`,
        )

        try {
          const analysis =
            await analyzeRelationship({
              queryBook:
                candidate.query
                  .documentTitle,

              queryPage:
                candidate.query
                  .pageNumber,

              queryPassage:
                candidate.query.text,

              matchedBook:
                candidate.matched
                  .documentTitle,

              matchedPage:
                candidate.matched
                  .pageNumber,

              matchedPassage:
                candidate.matched
                  .text,

              similarity:
                candidate.similarity,
            })

          /*
           * Groq determined that the passages
           * are not meaningfully related.
           */
          if (!analysis.meaningful) {
            continue
          }

          /*
           * Exact passage-pair deduplication.
           */
          const duplicate =
            finalResults.some(
              existing =>
                existing.queryChunkId ===
                  candidate.queryChunkId &&
                existing.matchedChunkId ===
                  candidate.matchedChunkId,
            )

          if (duplicate) {
            continue
          }

          const relationship: RelationshipResult =
            {
              ...candidate,
              analysis,
            }

          finalResults.push(
            relationship,
          )

          /*
           * Show each new relationship immediately.
           */
          setResults([
            ...finalResults,
          ])
        } catch (error) {
          console.error(
            'Relationship analysis failed:',
            error,
          )

          /*
           * Stop if Groq reports a rate limit.
           */
          if (
            error instanceof Error &&
            error.message.includes(
              '429',
            )
          ) {
            setStatus(
              'Groq rate limit reached. AI analysis stopped.',
            )

            break
          }
        }
      }

      /*
       * Sort final relationships by semantic
       * similarity.
       */
      const sortedResults =
        [...finalResults].sort(
          (a, b) =>
            b.similarity -
            a.similarity,
        )

      setResults(
        sortedResults,
      )

      /*
       * ============================================
       * FINAL STATUS
       * ============================================
       */
      if (sortedResults.length > 0) {
        setStatus(
          `Finished. Found ${sortedResults.length} meaningful relationships.`,
        )
      } else {
        setStatus(
          'Finished. No meaningful relationships were confirmed by AI.',
        )
      }
    } catch (error) {
      console.error(
        'Book comparison failed:',
        error,
      )

      setStatus(
        error instanceof Error
          ? error.message
          : 'Book comparison failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ==========================================
          HEADER
          ========================================== */}
      <div>
        <h2 className="text-xl font-bold">
          Compare Books
        </h2>

        <p className="text-sm text-gray-500">
          Find meaningful relationships
          between passages from different
          books.
        </p>
      </div>

      {/* ==========================================
          BOOK SELECTOR
          ========================================== */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Select a book
        </label>

        <select
          value={selectedBookId}
          onChange={event =>
            setSelectedBookId(
              event.target.value,
            )
          }
          disabled={loading}
          className="w-full rounded border px-3 py-2"
        >
          <option value="">
            Select a book...
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

        <button
          type="button"
          onClick={() =>
            void compareBooks()
          }
          disabled={
            loading ||
            !selectedBookId
          }
          className="rounded px-4 py-2 font-medium disabled:opacity-50"
        >
          {loading
            ? 'Comparing...'
            : 'Compare Books'}
        </button>
      </div>

      {/* ==========================================
          STATUS
          ========================================== */}
      {status && (
        <div className="rounded border p-3 text-sm">
          {status}
        </div>
      )}

      {/* ==========================================
          RELATIONSHIP BUBBLES
          ========================================== */}
      <div className="space-y-3">
        {results.map(result => {
          const relationshipId =
            `${result.queryChunkId}-${result.matchedChunkId}`

          const expanded =
            expandedRelationship ===
            relationshipId

          const analysis =
            result.analysis

          const bookAParts =
            getBookTitleParts(
              result.query.documentTitle,
            )

          const bookBParts =
            getBookTitleParts(
              result.matched.documentTitle,
            )

          return (
            <div
              key={relationshipId}
              className="overflow-hidden rounded-2xl border shadow-sm"
            >
              {/* ==================================
                  COLLAPSED BUBBLE
                  ================================== */}
              <button
                type="button"
                onClick={() =>
                  setExpandedRelationship(
                    expanded
                      ? null
                      : relationshipId,
                  )
                }
                className="w-full p-4 text-left transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Pages + similarity */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border px-3 py-1 text-xs">
                        Page{' '}
                        {
                          result.query
                            .pageNumber
                        }
                      </span>

                      <span className="text-gray-400">
                        ↔
                      </span>

                      <span className="rounded-full border px-3 py-1 text-xs">
                        Page{' '}
                        {
                          result.matched
                            .pageNumber
                        }
                      </span>

                      <span className="rounded-full border px-3 py-1 text-xs">
                        {(
                          result.similarity *
                          100
                        ).toFixed(0)}
                        % semantic
                      </span>
                    </div>

                    {/* Book names */}
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="font-semibold">
                          {bookAParts.title}
                        </div>

                        {bookAParts.subtitle && (
                          <div className="text-xs text-gray-500">
                            {
                              bookAParts.subtitle
                            }
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="font-semibold">
                          {bookBParts.title}
                        </div>

                        {bookBParts.subtitle && (
                          <div className="text-xs text-gray-500">
                            {
                              bookBParts.subtitle
                            }
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Short relationship preview */}
                    <p className="mt-3 line-clamp-2 text-sm text-gray-600">
                      {analysis.connection ||
                        analysis.explanation}
                    </p>

                    {/* Shared concepts */}
                    {analysis.sharedConcepts
                      .length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {analysis.sharedConcepts
                          .slice(0, 5)
                          .map(
                            concept => (
                              <span
                                key={
                                  concept
                                }
                                className="rounded-full border px-2 py-1 text-xs text-gray-600"
                              >
                                {
                                  concept
                                }
                              </span>
                            ),
                          )}
                      </div>
                    )}
                  </div>

                  {/* Expand button */}
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-lg">
                    {expanded
                      ? '−'
                      : '+'}
                  </div>
                </div>
              </button>

              {/* ==================================
                  EXPANDED RELATIONSHIP
                  ================================== */}
              {expanded && (
                <div className="border-t p-5">
                  {/* Two passages */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* BOOK A */}
                    <div className="rounded-xl border p-4">
                      <div className="mb-3 text-xs font-medium uppercase text-gray-500">
                        Book A · Page{' '}
                        {
                          result.query
                            .pageNumber
                        }
                      </div>

                      <BookTitle
                        title={
                          result.query
                            .documentTitle
                        }
                      />

                      <p className="mt-4 text-sm leading-7">
                        {
                          result.query
                            .text
                        }
                      </p>
                    </div>

                    {/* BOOK B */}
                    <div className="rounded-xl border p-4">
                      <div className="mb-3 text-xs font-medium uppercase text-gray-500">
                        Book B · Page{' '}
                        {
                          result.matched
                            .pageNumber
                        }
                      </div>

                      <BookTitle
                        title={
                          result.matched
                            .documentTitle
                        }
                      />

                      <p className="mt-4 text-sm leading-7">
                        {
                          result.matched
                            .text
                        }
                      </p>
                    </div>
                  </div>

                  {/* AI explanation */}
                  <div className="mt-6 space-y-5 border-t pt-5">
                    <div>
                      <strong>
                        Why They Are Related
                      </strong>

                      <p className="mt-1 text-sm leading-6">
                        {
                          analysis.explanation
                        }
                      </p>
                    </div>

                    <div>
                      <strong>
                        Connection
                      </strong>

                      <p className="mt-1 text-sm leading-6">
                        {
                          analysis.connection
                        }
                      </p>
                    </div>

                    <div>
                      <strong>
                        Book A Contribution
                      </strong>

                      <p className="mt-1 text-sm leading-6">
                        {
                          analysis.bookAContribution
                        }
                      </p>
                    </div>

                    <div>
                      <strong>
                        Book B Contribution
                      </strong>

                      <p className="mt-1 text-sm leading-6">
                        {
                          analysis.bookBContribution
                        }
                      </p>
                    </div>

                    <div>
                      <strong>
                        Important Difference
                      </strong>

                      <p className="mt-1 text-sm leading-6">
                        {
                          analysis.importantDifference
                        }
                      </p>
                    </div>

                    <div>
                      <strong>
                        Why It Matters
                      </strong>

                      <p className="mt-1 text-sm leading-6">
                        {
                          analysis.whyItMatters
                        }
                      </p>
                    </div>

                    {/* Shared concepts */}
                    {analysis.sharedConcepts
                      .length > 0 && (
                      <div>
                        <strong>
                          Shared Concepts
                        </strong>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {analysis.sharedConcepts.map(
                            concept => (
                              <span
                                key={
                                  concept
                                }
                                className="rounded-full border px-3 py-1 text-xs"
                              >
                                {
                                  concept
                                }
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {/* Similarity */}
                    <div className="text-xs text-gray-500">
                      Semantic similarity:{' '}
                      {(
                        result.similarity *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* No results */}
      {!loading &&
        results.length === 0 &&
        status.startsWith(
          'Finished',
        ) && (
          <div className="rounded-xl border p-6 text-center text-sm text-gray-500">
            No meaningful relationships
            were found.
          </div>
        )}
    </div>
  )
}

