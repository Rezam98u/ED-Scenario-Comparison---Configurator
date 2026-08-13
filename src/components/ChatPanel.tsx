import { useEffect, useRef, useState } from 'react'
import { useChat } from '../hooks/useChat'
import type { ChatMessage, ChatToolCall } from '../../shared/types'

const EXAMPLE_PROMPTS = [
  'What was the average daily PV coverage?',
  'What if PV capacity were 40 kW?',
  'Find the best PV size to maximize CO2 savings',
  'Save a 25 kW scenario',
]

// Internal/data-fetching tools whose call-and-return steps we hide from the UI
// to keep the conversation focused on the user-meaningful actions.
const HIDDEN_TOOLS = new Set(['getEnergyData'])

function ToolCallBadge({ call }: { call: ChatToolCall }) {
  let summary = ''
  try {
    const parsed = call.arguments ? JSON.parse(call.arguments) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      summary = Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ')
    }
  } catch {
    /* fall through with empty summary */
  }
  return (
    <div className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-0.5 mr-1 mb-1">
      <span className="font-mono">{call.name}</span>
      {summary && <span className="text-indigo-500">({summary})</span>}
    </div>
  )
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'system') return null

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-blue-600 text-white rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === 'tool') {
    if (msg.name && HIDDEN_TOOLS.has(msg.name)) return null
    return (
      <div className="text-[11px] text-gray-500 italic pl-2 border-l-2 border-gray-200">
        tool {msg.name ?? ''} returned
      </div>
    )
  }

  // assistant
  const visibleToolCalls = msg.tool_calls?.filter((tc) => !HIDDEN_TOOLS.has(tc.name)) ?? []
  // Drop empty assistant turns (e.g. a step that only called getEnergyData)
  if (!msg.content && visibleToolCalls.length === 0) return null

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] bg-gray-100 text-gray-800 rounded-lg px-3 py-2 text-sm">
        {visibleToolCalls.length > 0 && (
          <div className="mb-1">
            {visibleToolCalls.map((tc) => (
              <ToolCallBadge key={tc.id} call={tc} />
            ))}
          </div>
        )}
        {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
      </div>
    </div>
  )
}

export function ChatPanel() {
  const { messages, sendMessage, reset, isPending, error } = useChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isPending])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending) return
    sendMessage(input)
    setInput('')
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border flex flex-col" style={{ maxHeight: '32rem' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">AI Assistant</h3>
          <p className="text-xs text-gray-500">Groq + Llama 3.3 70B with tools</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Reset
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[12rem]">
        {messages.length === 0 && !isPending && (
          <div className="text-sm text-gray-500">
            <p className="mb-2">Ask about the dataset or let the agent find the optimal PV size.</p>
            <div className="space-y-1">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  className="block w-full text-left text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1 text-gray-700"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => ( <MessageRow key={i} msg={msg} />))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-lg px-3 py-2 text-sm italic">
              thinking...
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error.message}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the data..."
          disabled={isPending}
          className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="bg-blue-600 text-white rounded-md px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  )
}
