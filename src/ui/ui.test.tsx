import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import {
  Avatar,
  Button,
  Dialog,
  Input,
  SegmentedControl,
  StatusGlyph,
  Tabs,
  ToastProvider,
  useToast,
} from '@/ui'

describe('Button', () => {
  it('fires onClick, but not when busy or disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(
      <Button onClick={onClick} busy busyLabel="Going…">
        Go
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Going…' }))
    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Input', () => {
  it('links label and error text', () => {
    render(<Input label="Code" error="Codes are 8 letters, A to Z" />)
    const input = screen.getByLabelText('Code')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Codes are 8 letters, A to Z')
  })
})

describe('SegmentedControl', () => {
  it('changes with the keyboard and never clears', async () => {
    function Harness() {
      const [v, setV] = useState('a')
      return (
        <SegmentedControl
          label="Status"
          value={v}
          onValueChange={setV}
          options={[
            { value: 'a', label: 'To do' },
            { value: 'b', label: 'Done' },
          ]}
        />
      )
    }
    render(<Harness />)
    const first = screen.getByRole('radio', { name: 'To do' })
    await userEvent.click(first)
    expect(first).toBeChecked()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(screen.getByRole('radio', { name: 'Done' })).toBeChecked()
  })
})

describe('Tabs', () => {
  it('moves between tabs with arrow keys', async () => {
    render(
      <Tabs
        label="Dock"
        items={[
          { value: 'a', label: 'Chat', content: 'chat body' },
          { value: 'b', label: 'Logs', content: 'logs body' },
        ]}
      />,
    )
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('logs body')).toBeVisible()
  })
})

describe('Dialog', () => {
  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    render(<Dialog open onOpenChange={onOpenChange} title="Confirm" />)
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Toast', () => {
  it('shows a confirmation', async () => {
    function Trigger() {
      const toast = useToast()
      return <Button onClick={() => toast('Task added')}>Show</Button>
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(await screen.findByText('Task added')).toBeInTheDocument()
  })
})

describe('Avatar and StatusGlyph', () => {
  it('labels jersey number and state in words', () => {
    render(<Avatar seat={7} name="Renz" former />)
    expect(screen.getByRole('img', { name: 'Renz, number 07, former member' })).toBeInTheDocument()
  })
  it('names every status', () => {
    render(<StatusGlyph status="blocked" />)
    expect(screen.getByRole('img', { name: 'Blocked' })).toBeInTheDocument()
  })
})
