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

export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (next: ChatMessage[]) => chatApi.sendMessages(next),
    onSuccess: (updated) => {
      setMessages(updated)
      // Chat can save scenarios via tool call — keep the dashboard list in sync
      queryClient.invalidateQueries({ queryKey: ['saved-scenarios'] })
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
