export interface TextChunk {
  id: string
  documentId: string
  pageNumber: number
  chunkIndex: number
  text: string
  startOffset: number
  endOffset: number
}

interface PageInput {
  documentId: string
  pageNumber: number
  text: string
}

const TARGET_CHUNK_SIZE = 1200
const MAX_CHUNK_SIZE = 1600
const OVERLAP_SIZE = 200

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

function createChunkId(
  documentId: string,
  pageNumber: number,
  chunkIndex: number,
): string {
  return `${documentId}:page-${pageNumber}:chunk-${chunkIndex}`
}

export function chunkPage(page: PageInput): TextChunk[] {
  const text = page.text.trim()

  if (!text) {
    return []
  }

  const sentences = splitIntoSentences(text)

  if (sentences.length === 0) {
    return []
  }

  const chunks: TextChunk[] = []

  let currentText = ''
  let currentStartOffset = 0
  let searchOffset = 0
  let chunkIndex = 0

  for (const sentence of sentences) {
    const sentenceStart = text.indexOf(sentence, searchOffset)

    if (sentenceStart === -1) {
      continue
    }

    const sentenceEnd = sentenceStart + sentence.length

    const proposedText = currentText
      ? `${currentText} ${sentence}`
      : sentence

    if (
      currentText &&
      proposedText.length > MAX_CHUNK_SIZE
    ) {
      chunks.push({
        id: createChunkId(
          page.documentId,
          page.pageNumber,
          chunkIndex,
        ),
        documentId: page.documentId,
        pageNumber: page.pageNumber,
        chunkIndex,
        text: currentText,
        startOffset: currentStartOffset,
        endOffset: searchOffset,
      })

      chunkIndex += 1

      const overlapText = currentText.slice(
        Math.max(0, currentText.length - OVERLAP_SIZE),
      )

      currentText = overlapText

      currentStartOffset = Math.max(
        0,
        searchOffset - overlapText.length,
      )
    }

    currentText = currentText
      ? `${currentText} ${sentence}`
      : sentence

    searchOffset = sentenceEnd

    if (currentText.length >= TARGET_CHUNK_SIZE) {
      chunks.push({
        id: createChunkId(
          page.documentId,
          page.pageNumber,
          chunkIndex,
        ),
        documentId: page.documentId,
        pageNumber: page.pageNumber,
        chunkIndex,
        text: currentText,
        startOffset: currentStartOffset,
        endOffset: searchOffset,
      })

      chunkIndex += 1

      const overlapText = currentText.slice(
        Math.max(0, currentText.length - OVERLAP_SIZE),
      )

      currentText = overlapText

      currentStartOffset = Math.max(
        0,
        searchOffset - overlapText.length,
      )
    }
  }

  if (currentText.trim()) {
    chunks.push({
      id: createChunkId(
        page.documentId,
        page.pageNumber,
        chunkIndex,
      ),
      documentId: page.documentId,
      pageNumber: page.pageNumber,
      chunkIndex,
      text: currentText.trim(),
      startOffset: currentStartOffset,
      endOffset: text.length,
    })
  }

  return chunks
}

export function chunkPages(pages: PageInput[]): TextChunk[] {
  return pages.flatMap(chunkPage)
}