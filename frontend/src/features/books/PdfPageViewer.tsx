import { useEffect, useRef, useState } from 'react'

import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import 'pdfjs-dist/web/pdf_viewer.css'
import './PdfPageViewer.css'

GlobalWorkerOptions.workerSrc = workerUrl

interface PdfPageViewerProps {
  pdf: Blob
  pageNumber: number
  title?: string
}

export function PdfPageViewer({
  pdf,
  pageNumber,
  title,
}: PdfPageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)

  const [document, setDocument] =
    useState<PDFDocumentProxy | null>(null)

  const [containerWidth, setContainerWidth] =
    useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ----------------------------------------------------------
  // LOAD ORIGINAL PDF
  // ----------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    let loadingTask: PDFDocumentLoadingTask | null = null

    setDocument(null)
    setLoading(true)
    setError('')

    async function loadPdf() {
      try {
        const data = await pdf.arrayBuffer()

        if (cancelled) return

        loadingTask = getDocument({ data })

        const loadedDocument = await loadingTask.promise

        if (cancelled) {
          await loadingTask.destroy()
          return
        }

        setDocument(loadedDocument)
        setLoading(false)
      } catch (cause) {
        if (cancelled) return

        console.error('PDF loading failed:', cause)

        setError(
          cause instanceof Error
            ? cause.message
            : 'The PDF could not be opened.',
        )

        setLoading(false)
      }
    }

    void loadPdf()

    return () => {
      cancelled = true

      if (loadingTask) {
        void loadingTask.destroy()
      }
    }
  }, [pdf])

  // ----------------------------------------------------------
  // OBSERVE CONTAINER WIDTH
  // ----------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current

    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) return

      setContainerWidth(entry.contentRect.width)
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  // ----------------------------------------------------------
  // RENDER PDF PAGE AND SELECTABLE TEXT LAYER
  // ----------------------------------------------------------

  useEffect(() => {
    const canvasElement = canvasRef.current
    const textContainerElement = textLayerRef.current
    const pdfDocument = document

    if (
      !pdfDocument ||
      !canvasElement ||
      !textContainerElement ||
      containerWidth <= 0
    ) {
      return
    }

    // These references are validated and non-null.
    // They remain correctly typed inside async functions.
    const loadedPdf = pdfDocument as PDFDocumentProxy
    const canvas = canvasElement as HTMLCanvasElement
    const textContainer = textContainerElement as HTMLDivElement

    let cancelled = false

    let renderTask: RenderTask | null = null

    let textLayer: TextLayer | null = null

    async function renderPage() {
      try {
        textContainer.innerHTML = ''

        const page = await loadedPdf.getPage(pageNumber)

        if (cancelled) return

        const originalViewport = page.getViewport({
          scale: 1,
        })

        const scale =
          containerWidth / originalViewport.width

        const viewport = page.getViewport({
          scale,
        })

        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          2,
        )

        // Configure the canvas resolution.
        canvas.width = Math.floor(
          viewport.width * pixelRatio,
        )

        canvas.height = Math.floor(
          viewport.height * pixelRatio,
        )

        // Configure the displayed canvas dimensions.
        canvas.style.width = `${viewport.width}px`

        canvas.style.height = `${viewport.height}px`

        // Configure the selectable text layer.
        textContainer.style.width =
          `${viewport.width}px`

        textContainer.style.height =
          `${viewport.height}px`

        textContainer.style.setProperty(
          '--scale-factor',
          String(scale),
        )

        textContainer.style.setProperty(
          '--total-scale-factor',
          String(scale * pixelRatio),
        )

        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error(
            'Could not initialize the PDF canvas.',
          )
        }

        // Render the original PDF page.
        const currentRenderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,

          ...(pixelRatio !== 1 && {
            transform: [
              pixelRatio,
              0,
              0,
              pixelRatio,
              0,
              0,
            ],
          }),
        })

        renderTask = currentRenderTask

        // Extract text for the selectable text layer.
        const textContent = await page.getTextContent()

        if (cancelled) {
          currentRenderTask.cancel()
          return
        }

        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        })

        // Render the canvas and text layer together.
        await Promise.all([
          currentRenderTask.promise,
          textLayer.render(),
        ])
      } catch (cause) {
        if (cancelled) return

        console.error(
          'PDF page rendering failed:',
          cause,
        )

        setError(
          cause instanceof Error
            ? cause.message
            : 'This PDF page could not be rendered.',
        )
      }
    }

    setError('')

    void renderPage()

    return () => {
      cancelled = true

      renderTask?.cancel()

      textLayer?.cancel()

      textContainer.innerHTML = ''
    }
  }, [document, pageNumber, containerWidth])

  // ----------------------------------------------------------
  // COMPONENT UI
  // ----------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="pdf-page-viewer"
    >
      {loading && (
        <div className="pdf-viewer-status">
          Loading original PDF...
        </div>
      )}

      {error && (
        <div
          className="pdf-viewer-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {!error && document && (
        <>
          <div className="pdf-page-label">
            {title && <>{title} {' · '}</>}
            Page {pageNumber}
          </div>

          <div className="pdf-page-stage">
            <canvas
              ref={canvasRef}
              className="pdf-page-canvas"
              aria-label={`PDF page ${pageNumber}`}
            />

            <div
              ref={textLayerRef}
              className="textLayer"
              aria-label="Selectable PDF text"
            />
          </div>
        </>
      )}
    </div>
  )
}