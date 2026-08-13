// use dotenv library to load environment variable (secrets) from .env file (proper configuration management)
import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { energyRouter } from './routes/energy.js'
import { chatRouter } from './routes/chat.js'


const app = express()
const port = Number(process.env.PORT) || 4000
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'] }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', energyRouter)  // mount energyRouter to handle any incoming request starting URL with /api
app.use('/api', chatRouter)    // mount chatRouter for the AI chat + optimizer agent
app.get('/health', (_req, res) => { res.json({ ok: true }) })
app.listen(port, () => console.log(`Energy API listening on http://localhost:${port}`))


