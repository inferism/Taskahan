import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { LandingPage } from './LandingPage'

it('lets visitors try task completion and question resolution without an account', async () => {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Mark done' }))
  expect(screen.getByText('3 of 6 tasks completed')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: "Jamie's progress" })).toHaveAttribute(
    'aria-valuenow',
    '2',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Reopen task' }))
  expect(screen.getByText('2 of 6 tasks completed')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Try resolving the question' }))
  expect(screen.queryByText('Blocked · Open question')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
  expect(screen.getByText('Blocked · Open question')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
})
