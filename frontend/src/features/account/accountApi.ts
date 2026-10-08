export interface Account {
  id: string
  email: string
  username: string
  display_name: string
}

interface Credentials {
  email: string
  password: string
}

interface Registration extends Credentials {
  username: string
  display_name: string
}

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000'

async function requestAccount(
  path: string,
  body?: Credentials | Registration,
): Promise<Account | null> {
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
    },
  )

  if (!response.ok) {
    let message =
      'The account request could not be completed.'

    try {
      const result: unknown =
        await response.json()

      if (
        typeof result === 'object' &&
        result !== null &&
        'detail' in result &&
        typeof result.detail === 'string'
      ) {
        message = result.detail
      }
    } catch {
      // Keep a generic message for non-JSON errors.
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return await response.json() as Account
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