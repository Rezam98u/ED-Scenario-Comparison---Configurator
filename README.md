# Energy Dashboard – Scenario Comparison

A full-stack web application for visualizing energy consumption and PV (photovoltaic) generation, with an interactive scenario configuration that lets you compare baseline vs. custom PV capacity setups in real time.

![Dashboard Preview](./public/dashboard-preview.png)

---

## Features

- **Time-series chart** — hourly baseline vs. scenario comparison for consumption and PV generation over a 7-day window, with a brush/zoom control
- **KPI cards** — live-recalculated total consumption (kWh), PV coverage (%), and CO₂ savings (t)
- **PV Configuration** — slider + numeric input (0–100 kW) to adjust PV capacity; changes are applied on demand
- **Save scenarios** — persist named scenarios via the API (in-memory, resets on restart); optimistic UI updates
- **Skeleton loading states & error boundaries** — graceful handling of slow or failed API calls
- **AI Assistant (Groq + Llama 3.3 70B)** — tool-calling chat agent that can query the dataset, run what-if scenarios, and search for the optimal PV size

---

## Tech Stack

| Layer         | Technology                               |
| ------------- | ---------------------------------------- |
| Frontend      | React 18, TypeScript, Vite, Tailwind CSS |
| Data fetching | TanStack Query (React Query) v5          |
| Charts        | Recharts                                 |
| Backend       | Node.js, Express 4, TypeScript, tsx      |
| ORM           | Prisma 6                                 |
| Database      | PostgreSQL 16 (via Docker)               |
| AI agent      | Groq SDK, Llama 3.3 70B, zod             |

---

## Project Structure

```
.
├── mock-data/                    # Seed JSON (7-day hourly dataset)
├── server/
│   ├── prisma/
│   │   ├── migrations/           # SQL migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── routes/energy.ts
│       ├── lib/prisma.ts
│       └── index.ts
└── src/
    ├── api/energyApi.ts
    ├── components/
    ├── types/energy.ts
    └── utils/calculateScenario.ts
```

## Backend Architecture

The backend follows a clear **separation of concerns** between two files:

| File | Responsibility |
| ---- | -------------- |
| `server/src/index.ts` | **Infrastructure** — creates the Express app, configures middleware (CORS, JSON parsing), sets the port, mounts routers, and starts the server |
| `server/src/routes/energy.ts` | **Application logic** — defines all route handlers, validates request data, reads from / writes to the database |

This separation means `index.ts` never contains business logic, and `energy.ts` never concerns itself with how the server is started or configured. Adding a new feature only requires creating a new router file and registering it in `index.ts` with a single `app.use(...)` line.

---

## Seeding the Database

The seed script (`server/prisma/seed.ts`) populates the `EnergyDataset` table with one week of mock hourly data (Jan 1–7, 2025) sourced from `mock-data/energy-2025-01-01-2025-01-07.json`.

Run it once after applying migrations:

```bash
cd server
npm run db:migrate   # apply schema migrations
npm run db:seed      # load mock data into the database
```

**What it does:**
1. Reads the mock JSON file containing `timestamps`, `baseline`, `scenario`, and `kpis` arrays.
2. Clears any existing rows in `EnergyDataset` (safe to re-run).
3. Inserts a single `demo` dataset row that the `GET /api/energy` endpoint serves to the frontend.

> Without seeding, the `GET /api/energy` endpoint returns a `404` and the dashboard will show no data.

---

## API Reference

All endpoints are prefixed with `/api`.

| Method | Endpoint                | Description                                                          |
| ------ | ----------------------- | -------------------------------------------------------------------- |
| `GET`  | `/health`               | Health check                                                         |
| `GET`  | `/api/energy`           | Fetch the full energy dataset (timestamps, baseline, scenario, KPIs) |
| `GET`  | `/api/energy/scenarios` | List all saved scenarios                                             |
| `POST` | `/api/energy/scenarios` | Save a new scenario (`{ pvKw: number, kpis: object }`)               |
| `POST` | `/api/chat`             | Run the AI agent on a conversation (`{ messages: ChatMessage[] }`)   |

---

## Scenario Calculation

The frontend calculates scenario values in `src/utils/calculateScenario.ts` using these assumptions:

| Constant              | Value      | Description                                     |
| --------------------- | ---------- | ----------------------------------------------- |
| Peak sun hours        | 4 h/day    | Used to derive hourly additional PV             |
| Self-consumption rate | 60%        | Share of PV generation that offsets consumption |
| CO₂ factor            | 0.4 kg/kWh | Grid emissions factor                           |

---

## Available Scripts

### Frontend (root)

| Script            | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Start Vite dev server    |
| `npm run build`   | Production build         |
| `npm run preview` | Preview production build |

### Backend (`server/`)

| Script               | Description                               |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Start API with hot reload (tsx watch)     |
| `npm run build`      | Compile TypeScript                        |
| `npm run db:migrate` | Apply Prisma migrations                   |
| `npm run db:seed`    | Seed database from mock JSON              |
| `npm run db:push`    | Push schema without migrations (dev only) |

---

## Notes

- Saved scenarios are stored **in memory** on the server and reset on restart. Persisting them to the database is a natural next step.
- The seed script wipes existing `EnergyDataset` rows before inserting, so re-running it is safe.
- The Vite dev proxy is not configured — the frontend reads `window.location.origin` for API calls, so both servers must run on their default ports.

---

## AI Agent (Chat + Optimizer)

The dashboard ships with a Groq-powered chat agent that can answer natural-language questions, run what-if scenarios, and find the optimal PV capacity — all by calling server-side tools that wrap the same business logic the UI uses.

### Setup

1. Create a free API key at [console.groq.com](https://console.groq.com).
2. Add it to `server/.env`:

   ```env
   GROQ_API_KEY=gsk_...
   ```

3. Restart the API server. The assistant panel on the dashboard will become usable.

### Architecture

```
User → ChatPanel.tsx → POST /api/chat → runAgent loop → Groq (Llama 3.3 70B)
                                               ↓ tool_calls
                                        tools.ts dispatch
                                               ↓
                             [Prisma | calculateScenario | optimizer | scenarioStore]
```

- The **LLM decides which tools to call**; the loop in `server/src/agent/runAgent.ts` executes them and feeds results back until the model produces a final answer (capped at 6 steps).
- Tool arguments are validated with **zod** before any handler runs.
- The optimizer itself is a **deterministic grid search** (`server/src/agent/optimizer.ts`), exposed as a tool — keeping expensive reasoning in fast, reliable code while the LLM handles intent and explanation.

### Tools the agent can call

| Tool                | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `getEnergyData`     | Return the seeded 7-day baseline + KPIs                              |
| `calculateScenario` | Simulate KPIs for a specific `pvKw`                                  |
| `optimizeScenario`  | Grid-search best `pvKw` for `co2` / `coverage` / `minConsumption`    |
| `listScenarios`     | Read the in-memory saved-scenarios store                             |
| `saveScenario`      | Compute KPIs from the canonical baseline and persist the scenario    |

### Example prompts

- *"What was the average daily PV coverage?"*
- *"What would the KPIs look like if PV were 40 kW?"*
- *"Find the best PV size to maximize CO2 savings under 50 kW."*
- *"Save a 25 kW scenario."*
