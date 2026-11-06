export interface Account {
  id: string
  email: string
  username: string
  display_name: string
}

export const ACCOUNT_CHANGED_EVENT =
  'reading-memory-account-changed'

export function notifyAccountChanged(
  account: Account | null,
): void {
  window.dispatchEvent(
    new CustomEvent<Account | null>(
      ACCOUNT_CHANGED_EVENT,
      { detail: account },
    ),
  )
}

interface Credentials {
  email: string
  password: string
}

interface Registration extends Credentials {
  username: string
  display_name: string
}

export const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://social-books-dny1.onrender.com'

const REQUEST_TIMEOUT_MS = 15000

async function requestAccount(
  path: string,
  body?: Credentials | Registration,
): Promise<Account | null> {
  const controller = new AbortController()

  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${API_URL}/api/auth/${path}`,
      {
        method: path === 'me' ? 'GET' : 'POST',
        headers: body
          ? { 'Content-Type': 'application/json' }
          : undefined,
        body: body
          ? JSON.stringify(body)
          : undefined,
        credentials: 'include',
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      let message =
        'The account request could not be completed.'

      try {
        const result: unknown = await response.json()

        if (
          typeof result === 'object' &&
          result !== null &&
          'detail' in result &&
          typeof result.detail === 'string'
        ) {
          message = result.detail
        }
      } catch {
        // Keep the generic message if the response isn't JSON.
      }

      throw new Error(message)
    }

    if (response.status === 204) {
      return null
    }

    return await response.json() as Account
  } catch (cause: unknown) {
    if (controller.signal.aborted) {
      throw new Error(
        'The account server took too long to respond. Please try again.',
      )
    }

    throw cause
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export const getCurrentAccount =
  (): Promise<Account | null> =>
    requestAccount('me')

export const registerAccount =
  (input: Registration): Promise<Account | null> =>
    requestAccount('register', input)

export const loginAccount =
  (input: Credentials): Promise<Account | null> =>
    requestAccount('login', input)

export const logoutAccount =
  (): Promise<Account | null> =>
    requestAccount('logout')