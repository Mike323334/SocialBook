import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist'

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import {
  database,
  type DocumentRecord,
  type OutlineItem,
  type PageRecord,
} from '../../db/database'

import { indexDocument } from '../memory/memoryIndexer'
import {
  indexDocumentEmbeddings,
  type EmbeddingProgress,
} from '../memory/embeddingIndexer'
import {
  OUTLINE_VERSION,
  buildOutlineFromPrintedToc,
  findTocPages,
} from './tocParser'

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfImportProgress {
  stage:
    | 'extracting'
    | 'saving'
    | 'chunking'
    | 'embedding'
  current?: number
  total?: number
}

export interface PdfImportResult {
  document: DocumentRecord
  extractedCharacters: number
  scanned: boolean
  chunksCreated: number
  embeddingsCreated: number
}

interface RawOutlineNode {
  title?: string
  dest?: string | unknown[] | null
  items?: RawOutlineNode[]
}

type PageRef = Parameters<PDFDocumentProxy['getPageIndex']>[0]

async function resolvePageNumber(
  pdf: PDFDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<number | null> {
  try {
    if (!dest) return null

    const explicit =
      typeof dest === 'string'
        ? await pdf.getDestination(dest)
        : dest

    if (!Array.isArray(explicit)) return null

    const target = explicit[0]

    if (typeof target === 'number') return target + 1

    return (await pdf.getPageIndex(target as PageRef)) + 1
  } catch {
    return null
  }
}

/** Bookmarks stored inside the PDF itself (what a viewer's side panel shows). */
async function extractEmbeddedOutline(
  pdf: PDFDocumentProxy,
): Promise<OutlineItem[]> {
  const raw = (await pdf.getOutline()) as RawOutlineNode[] | null

  if (!raw) return []

  const list: OutlineItem[] = []

  const walk = async (nodes: RawOutlineNode[], depth: number) => {
    for (const node of nodes) {
      list.push({
        title: String(node.title ?? '').trim() || 'Untitled',
        pageNumber: await resolvePageNumber(pdf, node.dest),
        depth,
      })
      await walk(node.items ?? [], depth + 1)
    }
  }

  await walk(raw, 0)
  return list
}

function countLinked(items: OutlineItem[]): number {
  return items.filter((item) => item.pageNumber !== null).length
}

interface PositionedText {
  str: string
  transform: number[]
}

/** Text of one page as visual lines (title and page number stay together). */
async function getPageLines(page: PDFPageProxy): Promise<string[]> {
  const content = await page.getTextContent()

  const items = (content.items as unknown[])
    .filter(
      (item): item is PositionedText =>
        typeof item === 'object' &&
        item !== null &&
        'str' in item &&
        'transform' in item,
    )
    .map((item) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }))
    .filter((item) => item.text.trim().length > 0)
    .sort((a, b) => b.y - a.y)

  const lines: Array<{ y: number; items: typeof items }> = []

  for (const item of items) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - item.y) <= 3) last.items.push(item)
    else lines.push({ y: item.y, items: [item] })
  }

  return lines.map((line) =>
    line.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(' '),
  )
}

/** For books without bookmarks: read the printed "Table of Contents" pages. */
async function extractPrintedOutline(
  pdf: PDFDocumentProxy,
  pageTexts: string[],
): Promise<OutlineItem[]> {
  const tocPages = findTocPages(pageTexts)
  if (tocPages.length === 0) return []

  const lines: string[] = []

  for (const index of tocPages) {
    const page = await pdf.getPage(index + 1)
    lines.push(...(await getPageLines(page)))
    page.cleanup()
  }

  return buildOutlineFromPrintedToc(lines, pageTexts, tocPages)
}

/**
 * Chapters for the reader's left column. Uses the PDF's own bookmarks when
 * there are any, otherwise the printed table of contents (needs `pageTexts`,
 * the extracted text of every page in order).
 */
export async function extractOutline(
  pdf: PDFDocumentProxy,
  pageTexts?: string[],
): Promise<OutlineItem[]> {
  const embedded = await extractEmbeddedOutline(pdf).catch(
    () => [] as OutlineItem[],
  )

  if (!pageTexts || countLinked(embedded) >= 5) return embedded

  const printed = await extractPrintedOutline(pdf, pageTexts).catch(
    () => [] as OutlineItem[],
  )

  return countLinked(printed) > countLinked(embedded) ? printed : embedded
}

export async function extractOutlineFromFile(
  file: Blob,
  pageTexts?: string[],
): Promise<OutlineItem[]> {
  const loadingTask = getDocument({
    data: await file.arrayBuffer(),
  })

  try {
    const pdf = await loadingTask.promise
    return await extractOutline(pdf, pageTexts)
  } finally {
    await loadingTask.destroy()
  }
}

export async function importPdf(
  file: File,
  onProgress?: (
    progress: PdfImportProgress,
  ) => void,
): Promise<PdfImportResult> {
  if (
    file.type !== 'application/pdf' &&
    !file.name.toLowerCase().endsWith('.pdf')
  ) {
    throw new Error(
      'Choose a PDF file to add it to your library.',
    )
  }

  if (file.size === 0) {
    throw new Error(
      'This file is empty and cannot be read.',
    )
  }

  let pdf: PDFDocumentProxy | undefined

  let loadingTask:
    | PDFDocumentLoadingTask
    | undefined

  try {
    onProgress?.({
      stage: 'extracting',
    })

    loadingTask = getDocument({
      data: await file.arrayBuffer(),
    })

    pdf = await loadingTask.promise

    const metadata =
      await pdf.getMetadata()

    const info =
      metadata.info as {
        Title?: string
        Author?: string
      }

    const documentId =
      crypto.randomUUID()

    const pages: PageRecord[] = []

    let extractedCharacters = 0

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber += 1
    ) {
      onProgress?.({
        stage: 'extracting',
        current: pageNumber,
        total: pdf.numPages,
      })

      const page =
        await pdf.getPage(pageNumber)

      const content =
        await page.getTextContent()

      const text =
        content.items
          .filter(
            item => 'str' in item,
          )
          .map(
            item => item.str.trim(),
          )
          .filter(Boolean)
          .join(' ')

      extractedCharacters +=
        text.length

      pages.push({
        id:
          `${documentId}:${pageNumber}`,
        documentId,
        pageNumber,
        text,
      })

      page.cleanup()
    }

    if (extractedCharacters === 0) {
      throw new Error(
        'No selectable text was found. This PDF may be scanned; OCR is not available yet.',
      )
    }

    // A malformed outline must never break an import.
    const outline = await extractOutline(
      pdf,
      pages.map((page) => page.text),
    ).catch(() => [] as OutlineItem[])

    const now = new Date()

    const document: DocumentRecord & { outlineVersion?: number } = {
      id: documentId,
      title:
        info.Title?.trim() ||
        file.name.replace(
          /\.pdf$/i,
          '',
        ),
      author:
        info.Author?.trim() ||
        null,
      fileName: file.name,
      fileSize: file.size,
      pageCount: pdf.numPages,
      createdAt: now,
      lastReadAt: null,
      readingProgress: 0,
      outline,
      outlineVersion: OUTLINE_VERSION,
      pdf: file,
    }

    onProgress?.({
      stage: 'saving',
    })

    await database.transaction(
      'rw',
      database.documents,
      database.pages,
      async () => {
        await database.documents.add(
          document,
        )

        await database.pages.bulkAdd(
          pages,
        )
      },
    )

    onProgress?.({
      stage: 'chunking',
    })

    const chunksCreated =
      await indexDocument(
        documentId,
      )

    onProgress?.({
      stage: 'embedding',
      current: 0,
      total: chunksCreated,
    })

    const embeddingsCreated =
      await indexDocumentEmbeddings(
        documentId,
        (progress: EmbeddingProgress) => {
          onProgress?.({
            stage: 'embedding',
            current:
              progress.completed,
            total:
              progress.total,
          })
        },
      )

    return {
      document,
      extractedCharacters,
      scanned:
        extractedCharacters /
          pdf.numPages <
        30,
      chunksCreated,
      embeddingsCreated,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(
        'No selectable text',
      )
    ) {
      throw error
    }

    throw new Error(
      'This PDF could not be opened. Check that it is a valid, unencrypted PDF.',
    )
  } finally {
    await loadingTask?.destroy()
  }
}