import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChatPanel } from '../components/ChatPanel'
import type { UseChatResult } from '../hooks/useChat'

// jsdom has no scrollTo; the panel scrolls to the newest message
beforeAll(() => { Element.prototype.scrollTo = vi.fn() })

const chat = (overrides: Partial<UseChatResult> = {}): UseChatResult => ({
  messages: [],
  sendMessage: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null,
  ...overrides,
})

describe('ChatPanel — state from the page', () => {
  it('shows the conversation it is given, so it survives the panel being remounted', () => {
    const { unmount } = render(<ChatPanel chat={chat({
      messages: [
        { role: 'user', content: 'Show me the first week of October' },
        { role: 'assistant', content: 'Coverage was 25.8 % from 1 to 7 October.' },
      ],
    })} />)
    unmount() // what the page's loading skeleton does when the period switches

    render(<ChatPanel chat={chat({
      messages: [
        { role: 'user', content: 'Show me the first week of October' },
        { role: 'assistant', content: 'Coverage was 25.8 % from 1 to 7 October.' },
      ],
    })} />)
    expect(screen.getByText('Coverage was 25.8 % from 1 to 7 October.')).toBeInTheDocument()
  })

  it('sends an example prompt through the page\'s chat', () => {
    const sendMessage = vi.fn()
    render(<ChatPanel chat={chat({ sendMessage })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show me the first week of October' }))
    expect(sendMessage).toHaveBeenCalledWith('Show me the first week of October')
  })
})
