import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AtSign,
  LoaderCircle,
  LogOut,
  UserRound,
} from 'lucide-react'

import {
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  notifyAccountChanged,
  registerAccount,
  type Account,
} from './accountApi'

type AccountMode = 'login' | 'register'

export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null)

  // Show the login form immediately.
  const [mode, setMode] = useState<AccountMode>('login')

  // Session checking is separate from form submission.
  const [checkingSession, setCheckingSession] = useState(true)
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')

  // Prevent a slow session check from overwriting a newer login result.
  const sessionCheckCancelled = useRef(false)

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const result = await getCurrentAccount()

        if (active && !sessionCheckCancelled.current) {
          setAccount(result)
        }
      } catch {
        // A missing or expired session is normal for a logged-out user.
        if (active && !sessionCheckCancelled.current) {
          setAccount(null)
        }
      } finally {
        if (active) {
          setCheckingSession(false)
        }
      }
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Do not allow two account requests at the same time.
    if (busy) {
      return
    }

    sessionCheckCancelled.current = true

    setBusy(true)
    setError('')

    try {
      let result: Account | null

      if (mode === 'register') {
        result = await registerAccount({
          email: email.trim(),
          username: username.trim(),
          display_name: displayName.trim(),
          password,
        })
      } else {
        result = await loginAccount({
          email: email.trim(),
          password,
        })
      }

      if (!result) {
        throw new Error(
          'The server did not return account information. Please try again.',
        )
      }

      setAccount(result)
      setPassword('')

      // Inform the rest of the application that the account changed.
      notifyAccountChanged(result)
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The account request could not be completed.',
      )
    } finally {
      setBusy(false)
      setCheckingSession(false)
    }
  }

  async function signOut() {
    if (busy) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await logoutAccount()

      setAccount(null)
      setMode('login')
      setEmail('')
      setUsername('')
      setDisplayName('')
      setPassword('')

      sessionCheckCancelled.current = true

      // Update the rest of the application immediately.
      notifyAccountChanged(null)
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not sign out. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  function changeMode() {
    setMode((currentMode) =>
      currentMode === 'login' ? 'register' : 'login',
    )

    setError('')
    setPassword('')
  }

  // An authenticated user sees their profile, not the account form.
  if (account) {
    return (
      <section
        className="account-page"
        aria-labelledby="account-title"
      >
        <p className="eyebrow">Your reader identity</p>

        <h1 id="account-title">Account</h1>

        <div className="account-profile">
          <span className="account-avatar">
            <UserRound size={23} />
          </span>

          <div>
            <h2>{account.display_name}</h2>

            <p>
              <AtSign size={13} />
              {account.username}
            </p>

            <small>{account.email}</small>
          </div>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={() => void signOut()}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle
              className="spin"
              size={16}
            />
          ) : (
            <LogOut size={16} />
          )}

          {busy ? 'Signing out...' : 'Sign out'}
        </button>

        {error && (
          <p
            className="error-message"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>
    )
  }

  return (
    <section
      className="account-page"
      aria-labelledby="account-title"
    >
      <p className="eyebrow">Reader community</p>

      <h1 id="account-title">
        {mode === 'register'
          ? 'Create your account'
          : 'Welcome back'}
      </h1>

      <p className="account-intro">
        Your reading stays private unless you choose to share it.
      </p>

      <form
        className="account-form"
        onSubmit={(event) => void submit(event)}
      >
        {mode === 'register' && (
          <>
            <label htmlFor="account-username">
              Username
            </label>

            <div className="account-input">
              <AtSign size={15} />

              <input
                id="account-username"
                name="username"
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(event.currentTarget.value)
                }
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                autoComplete="username"
                required
                disabled={busy}
              />
            </div>

            <label htmlFor="account-display-name">
              Display name
            </label>

            <input
              id="account-display-name"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(event) =>
                setDisplayName(event.currentTarget.value)
              }
              maxLength={80}
              autoComplete="name"
              required
              disabled={busy}
            />
          </>
        )}

        <label htmlFor="account-email">
          Email
        </label>

        <input
          id="account-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.currentTarget.value)
          }
          maxLength={320}
          autoComplete="email"
          required
          disabled={busy}
        />

        <label htmlFor="account-password">
          Password
        </label>

        <input
          id="account-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(event.currentTarget.value)
          }
          minLength={mode === 'register' ? 12 : 1}
          maxLength={128}
          autoComplete={
            mode === 'register'
              ? 'new-password'
              : 'current-password'
          }
          required
          disabled={busy}
        />

        {error && (
          <p
            className="error-message"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle
              className="spin"
              size={16}
            />
          ) : (
            <UserRound size={16} />
          )}

          {busy
            ? mode === 'register'
              ? 'Creating account...'
              : 'Signing in...'
            : mode === 'register'
              ? 'Create account'
              : 'Sign in'}
        </button>
      </form>

      {!checkingSession && (
        <button
          className="account-mode-switch"
          type="button"
          onClick={changeMode}
          disabled={busy}
        >
          {mode === 'register'
            ? 'Already have an account? Sign in'
            : 'New here? Create an account'}
        </button>
      )}

      {checkingSession && (
        <p className="account-intro">
          <LoaderCircle
            className="spin"
            size={14}
            aria-hidden="true"
          />{' '}
          Checking your session...
        </p>
      )}
    </section>
  )
}