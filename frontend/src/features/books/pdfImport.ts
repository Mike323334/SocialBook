import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist'

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import {
  database,
  type DocumentRecord,
  type PageRecord,
} from '../../db/database'

import { indexDocument } from '../memory/memoryIndexer'
import {
  indexDocumentEmbeddings,
   type EmbeddingProgress,
} from '../memory/embeddingIndexer'

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

    const now = new Date()

    const document: DocumentRecord = {
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