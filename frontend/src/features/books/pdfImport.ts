import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { database, type DocumentRecord, type PageRecord } from '../../db/database'

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfImportResult {
  document: DocumentRecord
  extractedCharacters: number
  scanned: boolean
}

export async function importPdf(file: File): Promise<PdfImportResult> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Choose a PDF file to add it to your library.')
  }
  if (file.size === 0) {
    throw new Error('This file is empty and cannot be read.')
  }

  let pdf: PDFDocumentProxy | undefined
  let loadingTask: PDFDocumentLoadingTask | undefined
  try {
    loadingTask = getDocument({ data: await file.arrayBuffer() })
    pdf = await loadingTask.promise
    const metadata = await pdf.getMetadata()
    const info = metadata.info as { Title?: string; Author?: string }
    const documentId = crypto.randomUUID()
    const pages: PageRecord[] = []
    let extractedCharacters = 0

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .filter((item) => 'str' in item)
        .map((item) => item.str.trim())
        .filter(Boolean)
        .join(' ')
      extractedCharacters += text.length
      pages.push({ id: `${documentId}:${pageNumber}`, documentId, pageNumber, text })
      page.cleanup()
    }

    if (extractedCharacters === 0) {
      throw new Error('No selectable text was found. This PDF may be scanned; OCR is not available yet.')
    }

    const now = new Date()
    const document: DocumentRecord = {
      id: documentId,
      title: info.Title?.trim() || file.name.replace(/\.pdf$/i, ''),
      author: info.Author?.trim() || null,
      fileName: file.name,
      fileSize: file.size,
      pageCount: pdf.numPages,
      createdAt: now,
      lastReadAt: null,
      readingProgress: 0,
      pdf: file,
    }

    await database.transaction('rw', database.documents, database.pages, async () => {
      await database.documents.add(document)
      await database.pages.bulkAdd(pages)
    })

    return {
      document,
      extractedCharacters,
      scanned: extractedCharacters / pdf.numPages < 30,
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No selectable text')) throw error
    throw new Error('This PDF could not be opened. Check that it is a valid, unencrypted PDF.')
  } finally {
    await loadingTask?.destroy()
  }
}