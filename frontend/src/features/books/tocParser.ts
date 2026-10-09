/**
 * Builds a chapter outline from a book's *printed* table of contents.
 *
 * Used when a PDF has no embedded bookmarks. Pure functions only (no pdf.js,
 * no database), so it can be tested on its own.
 */

/**
 * Bump when the outline logic improves. Books saved with an empty outline
 * under an older version are checked again the next time they are opened.
 */
export const OUTLINE_VERSION = 3

/**
 * One line of the chapter list. The list is flat on purpose: `depth` is the
 * indentation level (0 = part/chapter, 1 = section, ...). A nested type would
 * break Dexie's TypeScript typings (TS2615).
 */
export interface TocNode {
  title: string
  pageNumber: number | null
  depth: number
}

type EntryKind = 'part' | 'chapter' | 'section' | 'root'

interface PrintedPage {
  kind: 'arabic' | 'roman'
  value: number
}

export interface PrintedTocEntry {
  title: string
  kind: EntryKind
  page: PrintedPage | null
}

const ROMAN_RE = /^(?=[mdclxvi])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/
const HEADER_RE = /^(?:(?:\d{1,4}|[ivxlc]{1,6})\s+)?(?:table of contents|contents)(?:\s+(?:\d{1,4}|[ivxlc]{1,6}))?$/i
const TRAILING_RE = /^(.*?\S)(?:\s*[.·…•_-]{2,}\s*|\s+)(\d{1,4}|[ivxlc]{1,7})$/
const PART_RE = /^part\s+(?:\d+|[ivxlc]+)\b/i
const CHAPTER_RE = /^chapter\s+\d+\b/i
const BACK_MATTER_RE = /^(?:appendix|appendices|index|glossary|bibliography|afterword|other books you may enjoy|about the authors?|about the reviewers?)\b/i
const FRONT_MATTER_RE = /^(?:preface|foreword|introduction|acknowledg(?:e)?ments?|about this book|prologue)\b/i

function romanToInt(value: string): number {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
  let total = 0
  for (let i = 0; i < value.length; i += 1) {
    const current = map[value[i]]
    const next = map[value[i + 1]] ?? 0
    total += current < next ? -current : current
  }
  return total
}

/** Splits printed-contents text (one string per visual line) into entries. */
export function parseTocLines(lines: string[]): PrintedTocEntry[] {
  const entries: PrintedTocEntry[] = []
  let pending: string[] = []
  let chapterNumber: string | null = null
  let sawArabic = false
  let sawChapterOrPart = false

  const isPageToken = (token: string) =>
    /^\d{1,4}$/.test(token) || (!sawArabic && ROMAN_RE.test(token))

  const toPage = (token: string): PrintedPage =>
    /^\d+$/.test(token)
      ? { kind: 'arabic', value: Number(token) }
      : { kind: 'roman', value: romanToInt(token) }

  const flushPending = () => {
    const text = pending.join(' ').replace(/\s+/g, ' ').trim()
    pending = []
    return text
  }

  const pushEntry = (rawTitle: string, page: PrintedPage | null) => {
    let title = rawTitle.replace(/\s+/g, ' ').trim()
    if (!title) return

    let kind: EntryKind
    if (PART_RE.test(title)) kind = 'part'
    else if (chapterNumber !== null || CHAPTER_RE.test(title)) kind = 'chapter'
    else if (BACK_MATTER_RE.test(title)) kind = 'root'
    else if (!sawChapterOrPart && FRONT_MATTER_RE.test(title)) kind = 'root'
    else kind = 'section'

    if (kind === 'chapter' && chapterNumber !== null) title = `${chapterNumber}. ${title}`
    chapterNumber = null

    if (kind === 'part' || kind === 'chapter') sawChapterOrPart = true
    if (page?.kind === 'arabic') sawArabic = true

    entries.push({ title, kind, page })
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || HEADER_RE.test(line)) continue

    // A line that is only a number is a chapter number ("1", "2", ...).
    if (/^\d{1,3}$/.test(line)) {
      if (pending.length > 0 && !PART_RE.test(pending.join(' '))) {
        // Wrapped title whose page number landed on its own line.
        pushEntry(flushPending(), toPage(line))
      } else {
        if (pending.length > 0) pushEntry(flushPending(), null) // "Part N – ..." has no page
        chapterNumber = line
      }
      continue
    }

    const match = TRAILING_RE.exec(line)
    if (match && isPageToken(match[2])) {
      pushEntry([flushPending(), match[1]].filter(Boolean).join(' '), toPage(match[2]))
    } else {
      pending.push(line)
    }
  }

  if (pending.length > 0) pushEntry(flushPending(), null)
  return entries
}

function numericDensity(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length < 40) return 0
  let numeric = 0
  for (const token of tokens) if (/^\d{1,4}$/.test(token)) numeric += 1
  return numeric / tokens.length
}

const CONTENTS_WORD_RE = /\btable of contents\b|(?:^|\s)contents(?:\s|$)/i

/** Zero-based indexes of the pages that hold the printed table of contents. */
export function findTocPages(pageTexts: string[]): number[] {
  const limit = Math.min(pageTexts.length, 60)
  let first = -1

  for (let i = 0; i < limit; i += 1) {
    const text = pageTexts[i] ?? ''
    if (CONTENTS_WORD_RE.test(text) && numericDensity(text) >= 0.06) {
      first = i
      break
    }
  }

  if (first === -1) return []

  const pages = [first]
  const end = Math.min(pageTexts.length, first + 15)
  for (let i = first + 1; i < end; i += 1) {
    const text = pageTexts[i] ?? ''
    const density = numericDensity(text)
    if (density >= 0.1 || (CONTENTS_WORD_RE.test(text) && density >= 0.06)) pages.push(i)
    else break
  }

  return pages
}

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')

const titleKey = (title: string) => normalize(title.replace(/^\d+\.\s+/, ''))

/**
 * Turns printed page numbers into PDF page numbers by finding where the
 * headings really appear in the extracted page text.
 */
function resolvePages(
  entries: PrintedTocEntry[],
  pageTexts: string[],
  tocPages: number[],
): { pages: Array<number | null>; offset: number } | null {
  const total = pageTexts.length
  const normPages = pageTexts.map(normalize)
  const startIndex = tocPages[tocPages.length - 1] + 1
  const keys = entries.map((entry) => titleKey(entry.title))

  // Vote for the offset (pdf page - printed page) using distinctive headings.
  const anchors = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) =>
      entry.kind !== 'part' && entry.page?.kind === 'arabic' && keys[index].length >= 14)

  const step = Math.max(1, Math.floor(anchors.length / 150))
  const votes = new Map<number, number>()

  for (let a = 0; a < anchors.length; a += step) {
    const { entry, index } = anchors[a]
    const matches: number[] = []
    for (let i = startIndex; i < total; i += 1) {
      if (normPages[i].includes(keys[index])) {
        matches.push(i + 1)
        if (matches.length > 6) break
      }
    }
    if (matches.length === 0 || matches.length > 6) continue // not distinctive enough
    for (const pdfPage of matches) {
      const offset = pdfPage - (entry.page as PrintedPage).value
      votes.set(offset, (votes.get(offset) ?? 0) + 1)
    }
  }

  const ranked = [...votes.entries()].sort((x, y) => y[1] - x[1])
  if (ranked.length === 0) return null
  const [offset, best] = ranked[0]
  const second = ranked[1]?.[1] ?? 0
  if (best < 3 || best < second * 1.5) return null

  const arabicValues = entries
    .filter((entry) => entry.page?.kind === 'arabic')
    .map((entry) => (entry.page as PrintedPage).value)
  const firstArabicPdfIndex = Math.min(...arabicValues) + offset - 1 // zero-based

  const containsAt = (index: number, key: string) =>
    index >= 0 && index < total && key.length >= 8 && normPages[index].includes(key)

  const pages = entries.map((entry, i): number | null => {
    if (!entry.page) return null

    if (entry.page.kind === 'roman') {
      if (keys[i].length < 4) return null
      for (let p = startIndex; p < firstArabicPdfIndex && p < total; p += 1) {
        if (normPages[p].includes(keys[i])) return p + 1
      }
      return null
    }

    let index = entry.page.value + offset - 1
    if (!containsAt(index, keys[i])) {
      for (let d = -2; d <= 4; d += 1) {
        if (containsAt(index + d, keys[i])) {
          index += d
          break
        }
      }
    }
    index = Math.min(total - 1, Math.max(startIndex, index))
    return index + 1
  })

  // Part headings carry no page: use the first entry that follows them.
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    if (pages[i] === null && entries[i].kind === 'part') {
      const next = pages.slice(i + 1).find((value) => value !== null)
      if (next !== undefined) pages[i] = next
    }
  }

  return { pages, offset }
}

function buildList(entries: PrintedTocEntry[], pages: Array<number | null>): TocNode[] {
  const list: TocNode[] = []
  let partOpen = false
  let chapterDepth: number | null = null

  entries.forEach((entry, index) => {
    let depth: number

    switch (entry.kind) {
      case 'part':
        depth = 0
        partOpen = true
        chapterDepth = null
        break
      case 'chapter':
        depth = partOpen ? 1 : 0
        chapterDepth = depth
        break
      case 'root':
        depth = 0
        partOpen = false
        chapterDepth = 0
        break
      default:
        depth = chapterDepth !== null ? chapterDepth + 1 : partOpen ? 1 : 0
    }

    list.push({ title: entry.title, pageNumber: pages[index], depth })
  })

  return list
}

/**
 * Full pipeline: parsed lines of the contents pages + text of every page
 * -> flat outline with PDF page numbers. Returns [] when it cannot be trusted.
 */
export function buildOutlineFromPrintedToc(
  tocLines: string[],
  pageTexts: string[],
  tocPages: number[],
): TocNode[] {
  if (tocPages.length === 0) return []

  const entries = parseTocLines(tocLines)
  if (entries.length < 5) return []

  const resolved = resolvePages(entries, pageTexts, tocPages)
  if (!resolved) return []

  return buildList(entries, resolved.pages)
}