// Custom hook that owns chat state and wraps the POST /api/chat call with
// TanStack useMutation — per project rule "extract custom hooks for reusable logic".

import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '../api/chatApi'
import type { ChatMessage } from '../../shared/types'

interface UseChatResult {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
  reset: () => void
  isPending: boolean
  error: Error | null
}

interface UseChatOptions {
  datasetId: string | null // the period the dashboard shows; the agent works on it
  onShowDataset: (datasetId: string) => void // the agent loaded a period: show it
}

export function useChat({ datasetId, onShowDataset }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (next: ChatMessage[]) => chatApi.sendMessages(next, datasetId),
    onSuccess: async (response) => {
      setMessages(response.messages)
      // Chat can save scenarios via tool call — keep the dashboard list in sync
      queryClient.invalidateQueries({ queryKey: ['saved-scenarios'] })
      if (response.showDatasetId) {
        // Refetch the period list first, so the dashboard knows the new period
        await queryClient.invalidateQueries({ queryKey: ['datasets'] })
        onShowDataset(response.showDatasetId)
      }
    },
  })

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const next: ChatMessage[] = [
        ...messages,
        { role: 'user', content: trimmed },
      ]
      setMessages(next)
      mutation.mutate(next)
    },
    [messages, mutation],
  )

  const reset = useCallback(() => {
    setMessages([])
    mutation.reset()
  }, [mutation])

  return {
    messages,
    sendMessage,
    reset,
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
  }
}
