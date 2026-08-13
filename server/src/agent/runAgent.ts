// Tool-calling agent loop. The LLM decides which tools to call; we execute them
// and feed results back until the model produces a final answer (no more
// tool_calls) or we hit MAX_STEPS as a safety cap.

import { groq, MODEL } from './groqClient.js'
import { toolSchemas, toolHandlers } from './tools.js'
import type { ChatMessage } from '../../../shared/types.js'

// Translate our compact ChatMessage shape into the OpenAI/Groq wire format.
// Groq requires tool_calls to carry { id, type: 'function', function: { name, arguments } }
// on every assistant message in the history, otherwise it 400s on turn 2+.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGroqMessage(msg: ChatMessage): any {
  if (msg.role === 'assistant' && msg.tool_calls?.length) {
    return {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    }
  }
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.tool_call_id,
      content: msg.content,
    }
  }
  return { role: msg.role, content: msg.content }
}

const MAX_STEPS = 6

const SYSTEM_PROMPT = `You are the AI assistant for an Energy Dashboard that compares baseline vs. scenario energy consumption with rooftop PV over a 7-day hourly dataset.

Rules:
- Always use tools to obtain numbers. Never fabricate KPIs or baseline data.
- When the user asks for the "best", "optimal", or "ideal" PV size, call optimizeScenario.
- When the user asks a "what if" question about a specific PV size, call calculateScenario.
- When saving a scenario, you do NOT need the user to supply KPIs — the saveScenario tool computes them from the canonical baseline.
- KPI meanings (report these verbatim from tool output, do not recompute):
  - total_consumption_kwh: total grid consumption across the full 7-day window, in kWh.
  - pv_coverage_pct: total PV generation divided by total consumption across the full 7-day window, in %. This is a 7-day aggregate, not a strict daily average — phrase it as "PV coverage" rather than "daily average" unless the user explicitly asks about daily values.
  - co2_savings_ton: avoided grid emissions across the 7-day window, in metric tons.
- Always include units: kWh, %, tons (t).
- Keep answers concise (2-4 sentences). If a tool returns a lot of data, summarize it.`

export interface RunAgentResult {
  messages: ChatMessage[]
}

export async function runAgent(userMessages: ChatMessage[]): Promise<RunAgentResult> {
  // Build full history the model sees: system prompt + user-visible history
  const history: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages,
  ]

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: history.map(toGroqMessage),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: toolSchemas as any,
      tool_choice: 'auto',
      temperature: 0.2,
    })

    const msg = res.choices[0]?.message
    if (!msg) throw new Error('Groq returned no message')

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: msg.content ?? null,
      tool_calls: msg.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    }
    history.push(assistantMsg)

    // No tool calls → model gave its final answer
    if (!msg.tool_calls?.length) {
      // Strip the system prompt before returning to the client
      return { messages: history.slice(1) }
    }

    // Execute every tool call and append tool messages
    for (const call of msg.tool_calls) {
      const handler = toolHandlers[call.function.name]
      let toolContent: string
      try {
        if (!handler) throw new Error(`Unknown tool: ${call.function.name}`)
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        const result = await handler(args)
        toolContent = JSON.stringify(result)
      } catch (err) {
        toolContent = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      }
      history.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: toolContent,
      })
    }
  }

  // Max steps hit — append a safety message so the UI has something to show
  history.push({
    role: 'assistant',
    content:
      'I ran out of tool-call steps before producing a final answer. Please try a more specific question.',
  })
  return { messages: history.slice(1) }
}
