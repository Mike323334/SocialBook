import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen,
  Bookmark,
  BrainCircuit,
  Clock3,
  Compass,
  Library,
  LockKeyhole,
  UserRound,
} from 'lucide-react'
import './App.css'
import { LibraryPage, ReaderPage } from './features/books/LibraryPage'
import { database } from './db/database'
import { trackAnalyticsEvent } from './features/analytics/analyticsClient'
import { AccountPage } from './features/account/AccountPage'

const navigation = [
  { label: 'Overview', to: '/', icon: Compass },
  { label: 'Library', to: '/library', icon: Library },
  { label: 'My memory', to: '/memory', icon: BrainCircuit },
  { label: 'Notes', to: '/notes', icon: Bookmark },
  { label: 'Account', to: '/account', icon: UserRound },
]

const pageCopy: Record<string, { title: string; description: string }> = {
  '/library': {
    title: 'Your library',
    description: 'Books you add will be organized here and stored on this device.',
  },
  '/memory': {
    title: 'Your reading memory',
    description: 'Questions, notes, and connections will build your personal reading history.',
  },
  '/notes': {
    title: 'Your notes',
    description: 'Notes and highlights will stay in your local library.',
  },
}

function Overview() {
  const bookCount = useLiveQuery(() => database.documents.count(), [], 0)

  return (
    <>
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow">A quieter place for ideas</p>
          <h1 id="welcome-title">Your reading,<br />remembered.</h1>
          <p className="welcome-description">
            Build a library of what you read, what you notice, and the ideas that stay with you.
          </p>
          <NavLink className="welcome-action" to="/library">{bookCount > 0 ? 'Open your library' : 'Add your first book'} <span aria-hidden="true">→</span></NavLink>
        </div>
        <div className="welcome-mark" aria-hidden="true">
          <BookOpen size={70} strokeWidth={1.15} />
          <span>01</span>
        </div>
      </section>

      <section className="library-state" aria-labelledby="library-state-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your collection</p>
            <h2 id="library-state-title">A fresh page</h2>
          </div>
          <span className="item-count">{bookCount} {bookCount === 1 ? 'book' : 'books'}</span>
        </div>
        <div className="empty-library">
          <div className="empty-icon"><Library size={21} strokeWidth={1.7} /></div>
          <div>
            <h3>Your library is ready</h3>
            <p>{bookCount > 0 ? 'Your books are ready in the library.' : 'Add a PDF to read it and ask questions about its contents.'}</p>
          </div>
        </div>
      </section>

      <aside className="privacy-note">
        <span className="privacy-icon"><LockKeyhole size={17} /></span>
        <p><strong>Local by default.</strong> PDFs and extracted pages stay in this browser. When you ask a question, only selected passages are sent to your configured AI provider.</p>
      </aside>
    </>
  )
}

function RoutedPage() {
  const { pathname: path } = useLocation()
  const page = pageCopy[path] ?? pageCopy['/library']

  return (
    <section className="placeholder-page">
      <p className="eyebrow">Reading memory</p>
      <h1>{page.title}</h1>
      <p>{page.description}</p>
      <span className="phase-label"><Clock3 size={15} /> Foundation phase</span>
    </section>
  )
}

function App() {
  useEffect(() => {
    void trackAnalyticsEvent('daily_visit')
  }, [])

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Reading Memory home">
          <span className="brand-mark"><BookOpen size={20} /></span>
          <span>Reading Memory</span>
        </NavLink>

        <div className="nav-caption">Workspace</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="device-status"><span /> Local-first design</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <span>Personal library</span>
          <span className="local-badge"><LockKeyhole size={13} /> Local space</span>
        </header>
        <div className="content-wrap">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/book/:id" element={<ReaderPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<RoutedPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App