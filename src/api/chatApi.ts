// Chat API client — POSTs the conversation to the backend agent loop and
// returns the full updated history (incl. assistant + tool messages).

import type { ChatMessage, ChatRequest, ChatResponse } from '../../shared/types'

const BASE_URL = window.location.origin

export const chatApi = {
  async sendMessages(messages: ChatMessage[], datasetId: string | null): Promise<ChatResponse> {
    const request: ChatRequest = { messages, datasetId }
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const text = await response.text()
      let message = text
      try {
        const body = JSON.parse(text) as { error?: string }
        if (body.error) message = body.error
      } catch {
        /* use raw text */
      }
      throw new Error(message || `Chat request failed: ${response.status}`)
    }

    return (await response.json()) as ChatResponse
  },
}
