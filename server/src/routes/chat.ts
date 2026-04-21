// POST /api/chat — accepts a conversation history, runs the agent loop, and
// returns the full updated history so the client can render tool-call badges.

import { Router } from 'express'
import { z } from 'zod'
import { runAgent } from '../agent/runAgent.js'

export const chatRouter = Router()

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(),
      }),
    )
    .optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
})

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
})

chatRouter.post('/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ error: 'GROQ_API_KEY is not configured on the server.' })
    return
  }

  const parsed = chatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues })
    return
  }

  try {
    const result = await runAgent(parsed.data.messages)
    res.json(result)
  } catch (err) {
    console.error('[chat] agent error', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Agent error',
    })
  }
})
