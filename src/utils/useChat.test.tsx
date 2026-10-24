import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useChat } from '../hooks/useChat'
import type { ChatResponse } from '../../shared/types'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function stubChatResponse(body: ChatResponse) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => { vi.unstubAllGlobals() })

describe('useChat — periods', () => {
  it('sends the period the dashboard shows', async () => {
    const fetchMock = stubChatResponse({ messages: [] })
    const { result } = renderHook(() => useChat({ datasetId: 'oct', onShowDataset: vi.fn() }), { wrapper })

    act(() => result.current.sendMessage('What if 20 kW?'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messages: [{ role: 'user', content: 'What if 20 kW?' }],
      datasetId: 'oct',
    })
  })

  it('shows the period the agent loaded', async () => {
    const answer = { role: 'assistant' as const, content: 'Here is the first week of October.' }
    stubChatResponse({ messages: [answer], showDatasetId: 'oct' })
    const onShowDataset = vi.fn()
    const { result } = renderHook(() => useChat({ datasetId: null, onShowDataset }), { wrapper })

    act(() => result.current.sendMessage('Give me the first week in October'))

    await waitFor(() => expect(onShowDataset).toHaveBeenCalledWith('oct'))
    expect(result.current.messages).toEqual([answer])
  })

  it('keeps the period when the agent loaded none', async () => {
    stubChatResponse({ messages: [{ role: 'assistant', content: 'Hello!' }] })
    const onShowDataset = vi.fn()
    const { result } = renderHook(() => useChat({ datasetId: null, onShowDataset }), { wrapper })

    act(() => result.current.sendMessage('Hi'))

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(onShowDataset).not.toHaveBeenCalled()
  })
})
