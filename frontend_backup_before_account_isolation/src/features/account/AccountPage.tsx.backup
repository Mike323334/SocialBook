import { useEffect, useState, type FormEvent } from 'react'
import { AtSign, LoaderCircle, LogOut, UserRound } from 'lucide-react'
import {
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
  type Account,
} from './accountApi'

type AccountMode = 'login' | 'register'

export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null)
  const [mode, setMode] = useState<AccountMode>('register')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getCurrentAccount()
      .then((result) => { if (active) setAccount(result) })
      .catch((cause: unknown) => {
        if (active && cause instanceof Error && !cause.message.includes('Sign in')) setError(cause.message)
      })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = mode === 'register'
        ? await registerAccount({ email, username, display_name: displayName, password })
        : await loginAccount({ email, password })
      setAccount(result)
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The account request could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logoutAccount()
      setAccount(null)
      setMode('login')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.')
    } finally {
      setBusy(false)
    }
  }

  if (busy && !account) {
    return <section className="account-page"><LoaderCircle className="spin" size={20} aria-label="Loading account" /></section>
  }

  if (account) {
    return (
      <section className="account-page" aria-labelledby="account-title">
        <p className="eyebrow">Your reader identity</p>
        <h1 id="account-title">Account</h1>
        <div className="account-profile">
          <span className="account-avatar"><UserRound size={23} /></span>
          <div><h2>{account.display_name}</h2><p><AtSign size={13} />{account.username}</p><small>{account.email}</small></div>
        </div>
        <button className="secondary-button" type="button" onClick={() => void signOut()} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />} Sign out
        </button>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <section className="account-page" aria-labelledby="account-title">
      <p className="eyebrow">Reader community</p>
      <h1 id="account-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
      <p className="account-intro">Your reading stays private unless you choose to share it.</p>
      <form className="account-form" onSubmit={(event) => void submit(event)}>
        {mode === 'register' && <>
          <label htmlFor="account-username">Username</label>
          <div className="account-input"><AtSign size={15} /><input id="account-username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" autoComplete="username" required /></div>
          <label htmlFor="account-display-name">Display name</label>
          <input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} maxLength={80} autoComplete="name" required />
        </>}
        <label htmlFor="account-email">Email</label>
        <input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} maxLength={320} autoComplete="email" required />
        <label htmlFor="account-password">Password</label>
        <input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} minLength={mode === 'register' ? 12 : 1} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required />
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <UserRound size={16} />}
          {mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button className="account-mode-switch" type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError('') }}>
        {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </section>
  )
}