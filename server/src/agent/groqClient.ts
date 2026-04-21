// Singleton Groq client. The SDK is OpenAI-compatible and supports tool-calling
// natively on fast Llama 3.3 70B (plus other models).

import Groq from 'groq-sdk'

const apiKey = process.env.GROQ_API_KEY

if (!apiKey) {
  console.warn('[agent] GROQ_API_KEY is not set — /api/chat will return 503 until it is configured in server/.env')
}

export const groq = new Groq({ apiKey: apiKey ?? 'missing' })

export const MODEL = 'llama-3.3-70b-versatile'
