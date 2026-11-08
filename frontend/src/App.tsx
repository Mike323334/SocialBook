import { useEffect, useState } from 'react'

import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import { useLiveQuery } from 'dexie-react-hooks'

import {
  BookOpen,
  Bookmark,
  BrainCircuit,
  ChevronDown,
  Clock3,
  Compass,
  Library,
  LockKeyhole,
  LogOut,
  MessageCircle,
  UserRound,
} from 'lucide-react'

import EmbeddingTest from './features/memory/EmbeddingTest'

import { AskMyBooksPage } from './features/chat/AskMyBooksPage'

import './App.css'

import {
  LibraryPage,
  ReaderPage,
} from './features/books/LibraryPage'

import {
  activateDatabase,
  getActiveDatabase,
} from './db/database'

import { trackAnalyticsEvent } from './features/analytics/analyticsClient'

import { AccountPage } from './features/account/AccountPage'

import {
  ACCOUNT_CHANGED_EVENT,
  getCurrentAccount,
  logoutAccount,
  notifyAccountChanged,
  type Account,
} from './features/account/accountApi'

import { ReadingMemoryPage } from './features/memory/ReadingMemoryPage'

import { NotesPage } from './features/notes/NotesPage'

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

const navigation = [
  { label: 'Overview', to: '/', icon: Compass },
  { label: 'Library', to: '/library', icon: Library },
  { label: 'Notes', to: '/notes', icon: Bookmark },
  { label: 'Account', to: '/account', icon: UserRound },
]

const pageCopy: Record<
  string,
  { title: string; description: string }
> = {
  '/library': {
    title: 'Your library',
    description:
      'Books you add will be organized here and stored on this device.',
  },

  '/memory': {
    title: 'Your reading memory',
    description:
      'Questions, notes, and connections will build your personal reading history.',
  },

  '/notes': {
    title: 'Your notes',
    description:
      'Notes and highlights will stay in your local library.',
  },
}

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

function Overview() {
  const db = getActiveDatabase()

  const bookCount = useLiveQuery(
    () => db.documents.count(),
    [db],
    0,
  )

  return (
    <>
      <section
        className="welcome"
        aria-labelledby="welcome-title"
      >
        <div className="welcome-copy">
          <p className="eyebrow">
            A quieter place for ideas
          </p>

          <h1 id="welcome-title">
            Your reading,
            <br />
            remembered.
          </h1>

          <p className="welcome-description">
            Build a library of what you read, what you notice,
            and the ideas that stay with you.
          </p>

          <NavLink
            className="welcome-action"
            to="/library"
          >
            {bookCount > 0
              ? 'Open your library'
              : 'Add your first book'}

            <span aria-hidden="true">→</span>
          </NavLink>
        </div>

        <div
          className="welcome-mark"
          aria-hidden="true"
        >
          <BookOpen size={70} strokeWidth={1.15} />
          <span>01</span>
        </div>
      </section>

      <section
        className="library-state"
        aria-labelledby="library-state-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Your collection
            </p>

            <h2 id="library-state-title">
              A fresh page
            </h2>
          </div>

          <span className="item-count">
            {bookCount}{' '}
            {bookCount === 1 ? 'book' : 'books'}
          </span>
        </div>

        <div className="empty-library">
          <div className="empty-icon">
            <Library
              size={21}
              strokeWidth={1.7}
            />
          </div>

          <div>
            <h3>Your library is ready</h3>

            <p>
              {bookCount > 0
                ? 'Your books are ready in the library.'
                : 'Add a PDF to read it and ask questions about its contents.'}
            </p>
          </div>
        </div>
      </section>

      <aside className="privacy-note">
        <span className="privacy-icon">
          <LockKeyhole size={17} />
        </span>

        <p>
          <strong>Local by default.</strong> PDFs and extracted
          pages stay in this browser. When you ask a question,
          only selected passages are sent to your configured
          AI provider.
        </p>
      </aside>
    </>
  )
}

// -----------------------------------------------------------------------------
// Fallback page
// -----------------------------------------------------------------------------

function RoutedPage() {
  const { pathname } = useLocation()

  const page = pageCopy[pathname]

  if (!page) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Reading memory</p>

        <h1>Page not found</h1>

        <p>
          The page you requested does not exist.
          Use the navigation menu to open another page.
        </p>

        <NavLink
          className="welcome-action"
          to="/"
        >
          Return to overview →
        </NavLink>
      </section>
    )
  }

  return (
    <section className="placeholder-page">
      <p className="eyebrow">
        Reading memory
      </p>

      <h1>{page.title}</h1>

      <p>{page.description}</p>

      <span className="phase-label">
        <Clock3 size={15} />
        Foundation phase
      </span>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Workspace loading and error states
// -----------------------------------------------------------------------------

function WorkspaceLoading() {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Reading memory</p>

      <h1>Preparing your workspace...</h1>

      <p>
        Opening your local reading database.
        Please wait.
      </p>
    </section>
  )
}

function WorkspaceError({
  message,
  onRetry,
  retrying,
}: {
  message: string
  onRetry: () => void
  retrying: boolean
}) {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Reading memory</p>

      <h1>Workspace initialization failed</h1>

      <p role="alert">{message}</p>

      <button
        type="button"
        className="secondary-button"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? 'Retrying...' : 'Retry'}
      </button>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Main application
// -----------------------------------------------------------------------------

function App() {
  const location = useLocation()

  const isMemoryRoute =
    location.pathname === '/memory' ||
    location.pathname === '/ask-books'

  const [memoryMenuOverride, setMemoryMenuOverride] =
    useState<boolean | null>(null)

  const memoryMenuOpen =
    memoryMenuOverride ?? isMemoryRoute

  const [account, setAccount] = useState<Account | null>(null)

  const [authLoading, setAuthLoading] = useState(true)

  const [loggingOut, setLoggingOut] = useState(false)

  const [authError, setAuthError] = useState('')

  // undefined = database not initialized
  // null = guest database initialized
  // string = authenticated account database initialized
  const [workspaceAccountId, setWorkspaceAccountId] =
    useState<string | null | undefined>(undefined)

  const [workspaceError, setWorkspaceError] = useState('')

  const [workspaceRetry, setWorkspaceRetry] = useState(0)

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void trackAnalyticsEvent('daily_visit')
  }, [])

  // ---------------------------------------------------------------------------
  // Restore authentication session
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let active = true

    function handleAccountChange(event: Event) {
      const customEvent = event as CustomEvent<Account | null>

      setAccount(customEvent.detail)
      setAuthError('')
    }

    window.addEventListener(
      ACCOUNT_CHANGED_EVENT,
      handleAccountChange,
    )

    void getCurrentAccount()
      .then((result) => {
        if (active) {
          setAccount(result)
        }
      })
      .catch((error) => {
        console.error(
          '[Auth] Could not restore session:',
          error,
        )

        if (active) {
          setAccount(null)
        }
      })
      .finally(() => {
        if (active) {
          setAuthLoading(false)
        }
      })

    return () => {
      active = false

      window.removeEventListener(
        ACCOUNT_CHANGED_EVENT,
        handleAccountChange,
      )
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Activate account-specific IndexedDB
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (authLoading) {
      return
    }

    let cancelled = false

    const accountId = account?.id ?? null

    setWorkspaceAccountId(undefined)
    setWorkspaceError('')

    async function initializeWorkspace() {
      try {
        console.log(
          '[Workspace] Starting database activation:',
          accountId ?? 'guest',
        )

        const db = await activateDatabase(accountId)

        if (cancelled) {
          return
        }

        console.log(
          '[Workspace] Database activated:',
          db.name,
        )

        setWorkspaceAccountId(accountId)
      } catch (error) {
        if (cancelled) {
          return
        }

        console.error(
          '[Workspace] Database activation failed:',
          error,
        )

        setWorkspaceError(
          error instanceof Error
            ? error.message
            : 'Could not initialize your local workspace.',
        )
      }
    }

    void initializeWorkspace()

    return () => {
      cancelled = true
    }
  }, [account?.id, authLoading, workspaceRetry])

  // ---------------------------------------------------------------------------
  // Workspace status
  // ---------------------------------------------------------------------------

  const expectedAccountId = account?.id ?? null

  const workspaceReady =
    !authLoading &&
    workspaceAccountId === expectedAccountId &&
    !workspaceError

  // ---------------------------------------------------------------------------
  // Retry workspace activation
  // ---------------------------------------------------------------------------

  function handleWorkspaceRetry() {
    setWorkspaceError('')
    setWorkspaceAccountId(undefined)
    setWorkspaceRetry((current) => current + 1)
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  async function handleLogout() {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)
    setAuthError('')

    try {
      await logoutAccount()

      setAccount(null)

      notifyAccountChanged(null)
    } catch (error: unknown) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Could not sign out.',
      )
    } finally {
      setLoggingOut(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink
          className="brand"
          to="/"
          aria-label="Reading Memory home"
        >
          <span className="brand-mark">
            <BookOpen size={20} />
          </span>

          <span>SocialBooks</span>
        </NavLink>

        <div className="nav-caption">
          Workspace
        </div>

        <nav aria-label="Main navigation">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}

          <div className="memory-nav-group">
            <button
              type="button"
              className={`memory-nav-trigger${isMemoryRoute ? ' active' : ''}`}
              aria-expanded={memoryMenuOpen}
              aria-controls="memory-submenu"
              onClick={() =>
                setMemoryMenuOverride(!memoryMenuOpen)
              }
            >
              <BrainCircuit size={17} strokeWidth={1.8} />

              <span>My Memory</span>

              <ChevronDown
                size={15}
                className={memoryMenuOpen ? 'rotated' : ''}
              />
            </button>

            {memoryMenuOpen && (
              <div
                id="memory-submenu"
                className="memory-nav-submenu"
              >
                <NavLink
                  to="/memory"
                  className={({ isActive }) =>
                    `memory-sub-link${isActive ? ' active' : ''}`
                  }
                >
                  <BrainCircuit size={15} />
                  <span>Reading Memory</span>
                </NavLink>

                {/* Ask My Books is visible only to authenticated users. */}
                {account && !loggingOut && (
                  <NavLink
                    to="/ask-books"
                    className={({ isActive }) =>
                      `memory-sub-link${isActive ? ' active' : ''}`
                    }
                  >
                    <MessageCircle size={15} />
                    <span>Ask My Books</span>
                  </NavLink>
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="sidebar-bottom">
          <div className="device-status">
            <span />
            Local-first design
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <span>Personal library</span>

          <div className="topbar-actions">
            <span className="local-badge">
              <LockKeyhole size={13} />
              Local space
            </span>

            {!authLoading && account && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                aria-label="Log out of your account"
              >
                <LogOut size={15} />

                {loggingOut
                  ? 'Signing out...'
                  : 'Log out'}
              </button>
            )}
          </div>
        </header>

        {authError && (
          <p
            className="error-message"
            role="alert"
          >
            {authError}
          </p>
        )}

        <main className="app-content">
          <div className="content-wrap">
            {authLoading ? (
              <WorkspaceLoading />
            ) : workspaceError ? (
              <WorkspaceError
                message={workspaceError}
                onRetry={handleWorkspaceRetry}
                retrying={workspaceAccountId === undefined}
              />
            ) : !workspaceReady ? (
              <WorkspaceLoading />
            ) : (
              <Routes>
                <Route
                  path="/"
                  element={<Overview />}
                />

                <Route
                  path="/library"
                  element={<LibraryPage />}
                />

                <Route
                  path="/book/:id"
                  element={<ReaderPage />}
                />

                {/* Protected route: authentication is required. */}
                <Route
                  path="/ask-books"
                  element={
                    account && !loggingOut ? (
                      <AskMyBooksPage />
                    ) : (
                      <Navigate
                        to="/account"
                        replace
                      />
                    )
                  }
                />

                <Route
                  path="/memory"
                  element={<ReadingMemoryPage />}
                />

                <Route
                  path="/notes"
                  element={<NotesPage account={account} />}
                />

                <Route
                  path="/account"
                  element={<AccountPage />}
                />

                <Route
                  path="/memory-test"
                  element={<EmbeddingTest />}
                />

                <Route
                  path="*"
                  element={<RoutedPage />}
                />
              </Routes>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App