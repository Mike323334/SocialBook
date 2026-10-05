
import { useEffect, useState } from 'react'
import { database } from '../../db/database'
import {
  generateEmbedding,
} from './embeddings'
import {
  loadSemanticData,
  searchLoadedSemanticData,
} from './semanticSearch'
import {
  analyzeRelationship,
  type RelationshipAnalysis,
} from './comparisonAnalyzer'

const SEMANTIC_MIN_SIMILARITY = 0.35

// Local semantic search can generate many candidates.
const CANDIDATES_PER_CHUNK = 8

// Keep the best local candidates for each target book.
const LOCAL_CANDIDATES_PER_BOOK = 50

// IMPORTANT:
// Only this many candidates are sent to Groq.
const MAX_GROQ_ANALYSES = 30

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
  const [selectedBookId, setSelectedBookId] =
    useState('')

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

  useEffect(() => {
    async function load() {
      const documents =
        await database.documents.toArray()

      setBooks(documents)
    }

    void load()
  }, [])

  async function compareBooks() {
    if (!selectedBookId) {
      return
    }

    setLoading(true)
    setResults([])

    try {
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

      setStatus(
        'Loading embeddings and passages...',
      )

      /*
       * IMPORTANT:
       *
       * This loads embeddings/chunks/documents
       * once instead of repeatedly querying
       * IndexedDB.
       */
      const semanticData =
        await loadSemanticData()

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
       * Each target book gets its own candidate
       * bucket.
       *
       * This prevents one book from consuming
       * the entire candidate pool.
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
       * ------------------------------------------------
       * STEP 1
       *
       * LOCAL semantic search.
       *
       * NO GROQ REQUESTS HERE.
       * ------------------------------------------------
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

        const queryEmbedding =
          await generateEmbedding(
            queryChunk.text,
          )

        const matches =
          searchLoadedSemanticData(
            queryEmbedding,
            semanticData,
            {
              excludeDocumentId:
                selectedBookId,

              limit:
                CANDIDATES_PER_CHUNK,

              minSimilarity:
                SEMANTIC_MIN_SIMILARITY,
            },
          )

        for (const match of matches) {
          /*
           * Ignore anything that isn't one
           * of the selected comparison books.
           */
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
           * Only remove the exact same passage pair.
           *
           * DO NOT deduplicate using concepts.
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
       * ------------------------------------------------
       * STEP 2
       *
       * Keep the strongest LOCAL candidates
       * for each comparison book.
       * ------------------------------------------------
       */
      const localCandidates: CandidateRelationship[] =
        []

      for (const book of otherBooks) {
        const bucket =
          candidatesByBook.get(
            book.id,
          ) ?? []

        bucket.sort(
          (a, b) =>
            b.similarity -
            a.similarity,
        )

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
       * Highest semantic similarity first.
       */
      localCandidates.sort(
        (a, b) =>
          b.similarity -
          a.similarity,
      )

      /*
       * ------------------------------------------------
       * STEP 3
       *
       * Only send the BEST candidates to Groq.
       * ------------------------------------------------
       */
      const groqCandidates =
        localCandidates.slice(
          0,
          MAX_GROQ_ANALYSES,
        )

      console.log(
        `[Comparison] Local candidates: ${localCandidates.length}`,
      )

      console.log(
        `[Comparison] Sending to Groq: ${groqCandidates.length}`,
      )

      setStatus(
        `Found ${localCandidates.length} semantic candidates. Analyzing the best ${groqCandidates.length} with AI...`,
      )

      const finalResults:
        RelationshipResult[] =
          []

      /*
       * ------------------------------------------------
       * STEP 4
       *
       * Groq analysis.
       *
       * Sequential requests prevent a burst of
       * simultaneous API requests.
       * ------------------------------------------------
       */
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
           * Only meaningful relationships are
           * displayed.
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
           * Display each result immediately.
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
           * Stop immediately if Groq reports
           * a rate limit.
           */
          if (
            error instanceof Error &&
            error.message.includes(
              '429',
            )
          ) {
            setStatus(
              'Groq rate limit reached. The semantic search completed, but AI analysis must stop until the limit resets.',
            )

            break
          }
        }
      }

      setResults(
        [...finalResults].sort(
          (a, b) =>
            b.similarity -
            a.similarity,
        ),
      )

      if (
        finalResults.length > 0
      ) {
        setStatus(
          `Finished. Found ${finalResults.length} meaningful relationships.`,
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

      {status && (
        <div className="rounded border p-3 text-sm">
          {status}
        </div>
      )}

      <div className="space-y-6">
        {results.map(result => {
          const analysis =
            result.analysis

          return (
            <div
              key={`${result.queryChunkId}-${result.matchedChunkId}`}
              className="rounded-lg border p-5"
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-medium uppercase text-gray-500">
                    Book A · Page{' '}
                    {result.query.pageNumber}
                  </div>

                  <BookTitle
                    title={
                      result.query
                        .documentTitle
                    }
                  />

                  <p className="mt-3 text-sm leading-6">
                    {result.query.text}
                  </p>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium uppercase text-gray-500">
                    Book B · Page{' '}
                    {result.matched
                      .pageNumber}
                  </div>

                  <BookTitle
                    title={
                      result.matched
                        .documentTitle
                    }
                  />

                  <p className="mt-3 text-sm leading-6">
                    {result.matched.text}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t pt-5">
                <div>
                  <strong>
                    Why They Are Related
                  </strong>

                  <p className="mt-1 text-sm">
                    {analysis.explanation}
                  </p>
                </div>

                <div>
                  <strong>
                    Connection
                  </strong>

                  <p className="mt-1 text-sm">
                    {analysis.connection}
                  </p>
                </div>

                <div>
                  <strong>
                    Book A Contribution
                  </strong>

                  <p className="mt-1 text-sm">
                    {
                      analysis.bookAContribution
                    }
                  </p>
                </div>

                <div>
                  <strong>
                    Book B Contribution
                  </strong>

                  <p className="mt-1 text-sm">
                    {
                      analysis.bookBContribution
                    }
                  </p>
                </div>

                <div>
                  <strong>
                    Important Difference
                  </strong>

                  <p className="mt-1 text-sm">
                    {
                      analysis.importantDifference
                    }
                  </p>
                </div>

                <div>
                  <strong>
                    Why It Matters
                  </strong>

                  <p className="mt-1 text-sm">
                    {analysis.whyItMatters}
                  </p>
                </div>

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
                            key={concept}
                            className="rounded-full border px-3 py-1 text-xs"
                          >
                            {concept}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                )}

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
          )
        })}
      </div>
    </div>
  )
}

