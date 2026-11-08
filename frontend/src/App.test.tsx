import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./features/account/accountApi', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('./features/account/accountApi')
    >()

  return {
    ...actual,

    // Tests start as a guest instead of making a real HTTP request.
    getCurrentAccount: vi.fn().mockResolvedValue(null),
  }
})

describe('Reading Memory foundation', () => {
  it('renders the empty library state and primary navigation', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    // Wait for the guest database to initialize.
    expect(
      await screen.findByRole('heading', {
        name: 'A fresh page',
      }),
    ).toBeInTheDocument()

    expect(screen.getByText('0 books')).toBeInTheDocument()

    expect(
      screen.getByRole('navigation', {
        name: 'Main navigation',
      }),
    ).toBeInTheDocument()

    expect(
      screen.getByText(/Local by default/),
    ).toBeInTheDocument()
  })
})