# Energy Dashboard: Scenario Comparison & Configurator

An interactive dashboard for comparing energy scenarios, featuring baseline vs proposal comparison with PV capacity configuration. Built with React, TypeScript, and modern frontend best practices.

![Dashboard Preview](./public/dashboard-preview.png)


## Features

- **Interactive Time-Series Chart**: Compare baseline and scenario energy consumption and PV generation
- **KPI Cards**: Track Total Consumption (kWh), PV Coverage (%), and CO₂ Savings (t)
- **PV Configurator**: Adjust PV capacity with real-time scenario calculation
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **REST API**: Express + PostgreSQL (Prisma) for baseline energy data
- **Type Safety**: Full TypeScript coverage for all data structures
- **Comprehensive Logging**: Centralized error tracking with real-time console and persistence

## Quick Start

**Prerequisites:** Node.js, Docker (recommended for PostgreSQL), or a local Postgres instance.

```bash
# 1) Start PostgreSQL (from repo root)
docker compose up -d

# 2) Configure the API (copy and edit if your DB credentials differ)
copy server\.env.example server\.env   # Windows
# cp server/.env.example server/.env   # macOS / Linux

# 3) Install API dependencies, apply migrations, seed demo data
cd server
npm install
npx prisma migrate deploy
npm run db:seed
cd ..

# 4) Install frontend dependencies and run Vite + API together
npm install
npm run dev
```

Open **http://localhost:5173** (Vite proxies `/api` to the API on port **4000**).

- Run only the UI: `npm run dev:web` (still needs the API for data unless you point `VITE_API_URL` at another host).
- Run only the API: `npm run dev:api`

## Available Scripts

- `npm run dev` - Start Vite and the Express API together
- `npm run dev:web` - Vite only
- `npm run dev:api` - API only (`server/`)
- `npm run build` - Build for production
- `npm test` - Run unit tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run preview` - Preview production build

## Architecture

### Project Structure

```
src/
├── components/          # React components
│   ├── DashboardPage.tsx    # Main dashboard component
│   ├── TimeSeriesChart.tsx  # Recharts-based chart
│   ├── KpiCards.tsx         # KPI display cards
│   ├── PvConfigurator.tsx   # PV capacity configuration
│   ├── LoadingSkeleton.tsx  # Loading states
│   ├── ErrorState.tsx       # Error handling
│   ├── ErrorBoundary.tsx    # React error boundary
│   ├── ErrorConsole.tsx     # Error logging console
│   └── ErrorDemo.tsx        # Development error testing
├── api/                 # API client
│   └── energyApi.ts         # Energy data fetching
├── types/               # TypeScript interfaces
│   └── energy.ts            # Energy data types
└── ...

server/                  # Express + Prisma backend
├── prisma/                # Schema, migrations, seed
└── src/                   # API routes and app entry
```

### Data Flow

1. **Data Fetching**: `EnergyApiService` fetches baseline data from `/api/energy`
2. **Scenario Calculation**: `calculateScenario()` function processes baseline data with PV configuration
3. **State Management**: React state manages current PV capacity and calculated scenarios
4. **UI Updates**: Components reactively update when scenario parameters change
5. **Error Tracking**: Centralized logger captures all errors with context and persistence

## Scenario Calculation Algorithm

The scenario calculation follows these steps:

### Formula

```typescript
// Additional PV generation per hour
additionalPvPerHour = (pvKw * hours_per_day) / 24

// New PV generation (scales with existing pattern)
newPvGeneration = basePvGeneration + (additionalPvPerHour * scaleFactor)

// Consumption reduction
consumptionReduction = min(
  additionalPv * self_consumption_share,
  baseConsumption * 0.8  // Max 80% reduction
)

// New consumption
newConsumption = max(
  baseConsumption - consumptionReduction,
  baseConsumption * 0.2  // Min 20% of original
)
```

### Constants & Assumptions

| Parameter | Default Value | Description |
|-----------|---------------|-------------|
| `hours_per_day` | 4 | Peak sun hours per day |
| `self_consumption_share` | 0.6 | Percentage of PV generation self-consumed |
| `co2_emission_factor` | 0.4 kg/kWh | CO₂ emissions from grid electricity |

### KPI Calculations

- **Total Consumption**: Sum of all consumption values in scenario
- **PV Coverage**: `(total_pv_generation / total_baseline_consumption) * 100`
- **CO₂ Savings**: `(baseline_consumption - scenario_consumption) * co2_factor / 1000`

## API Interface

### Endpoint

```
GET /api/energy?start=YYYY-MM-DD&end=YYYY-MM-DD
```

### Response Format

```typescript
interface EnergyApiResponse {
  timestamps: string[]          // ISO 8601 timestamps
  baseline: {
    consumption: number[]       // kWh values
    pv_generation: number[]     // kWh values
  }
  scenario: {
    consumption: number[]       // kWh values  
    pv_generation: number[]     // kWh values
  }
  kpis: {
    total_consumption_kwh: number
    pv_coverage_pct: number
    co2_savings_ton: number
  }
}
```

## Production deployment notes

- The frontend calls `/api/energy` by default. Serve the built static files and the Express API behind the same origin, or set **`VITE_API_URL`** to the public API base URL (see `.env.example`).
- Configure the API **`DATABASE_URL`** and run **`npm run db:migrate`** (or `prisma migrate deploy`) on the server before starting the process.
- Enable CORS on the API only for the domains that need it (see `server/src/index.ts`).

## Error Logging & Monitoring

The application includes a comprehensive logging system to track and debug errors in real-time.

### Features

- **🔴 Error Console**: Real-time error viewer with filtering and export capabilities
- **📱 Floating Button**: Error counter badge showing total errors/warnings
- **💾 Persistence**: Errors saved to localStorage and survive page reloads
- **🎯 Error Boundaries**: React error boundaries protect against component crashes
- **🌐 Global Capture**: Automatic capture of unhandled errors and promise rejections
- **📊 Context Tracking**: Errors tagged with component context and metadata
- **🔍 Stack Traces**: Full error stack traces in development mode
- **📤 Export Functionality**: Download error logs as JSON for analysis

### Using the Error Console

1. **Access**: Click the red floating button (bottom-right) to open the error console
2. **Filter**: Use level buttons (all, error, warn, info, debug) to filter logs
3. **Inspect**: Click on log entries to expand details and stack traces
4. **Export**: Click "Export" to download logs as JSON file
5. **Clear**: Click "Clear All" to remove all logged entries

### Development Error Testing

In development mode, use the "🐛 Error Demo" button to trigger various error types:
- JavaScript runtime errors
- Promise rejections
- Async errors  
- Calculation errors
- API errors
- Custom log levels

### Programmatic Usage

```typescript
import { logger, useLogger } from './utils'

// Direct logging
logger.error('Something went wrong', 'ComponentName', { userId: 123 })
logger.warn('Warning message', 'ComponentName')
logger.info('Info message', 'ComponentName')

// In React components
function MyComponent() {
  const { error, warn, info, logs, errors } = useLogger()
  
  const handleError = () => {
    error('Component error', 'MyComponent', { action: 'button-click' })
  }
  
  return <div>Errors: {errors.length}</div>
}

// Error tracking helpers
logger.trackError(new Error('Custom error'), 'context')
logger.trackApiError('/api/endpoint', 500, 'Internal Server Error')
logger.trackComponentError('ComponentName', error, errorInfo)
```

### Configuration

```typescript
import { logger } from './utils/logger'

logger.configure({
  maxEntries: 200,           // Maximum log entries to keep
  enableConsoleOutput: true, // Log to browser console
  enableErrorCapture: true,  // Capture global errors
})
```

## Testing

The project includes comprehensive tests:

### Unit Tests
- **Scenario Calculation**: Tests for various PV capacity scenarios
- **Edge Cases**: Negative values, extreme inputs, custom options
- **KPI Accuracy**: Validates calculation correctness
- **Logging System**: Error tracking, persistence, and filtering

### Integration Tests
- **Component Rendering**: Smoke tests for main dashboard
- **API Integration**: Tests with MSW mock server
- **User Interactions**: PV configurator functionality

Run tests:
```bash
npm test          # Run all tests
npm test -- --ui  # Run with UI
npm test -- --coverage  # Run with coverage
```

## Customization

### Styling
- Built with **Tailwind CSS** for utility-first styling
- Custom slider styles in `src/index.css`
- Color scheme can be modified in `tailwind.config.js`

### Chart Configuration
- **Recharts** library for time-series visualization
- Customize colors, tooltips, and interactions in `TimeSeriesChart.tsx`
- Add new chart types or metrics as needed

### Calculation Logic
- Modify constants in `DEFAULT_CALCULATION_OPTIONS`
- Extend `CalculationOptions` interface for new parameters
- Update `calculateScenario()` function for different algorithms

## Example Commit History

```
feat: initial project setup with Vite, React, TypeScript
feat: add TypeScript interfaces and mock data structure  
feat: implement scenario calculation with comprehensive tests
feat: create responsive dashboard components with Recharts
feat: integrate MSW for API mocking and data fetching
docs: add comprehensive README with setup and architecture
```

## Suggested PR Description

```markdown
# Energy Dashboard: Complete Implementation

## Overview
Complete implementation of Energy Dashboard with scenario comparison and PV configurator.

## Features Added
- ✅ Interactive time-series chart with baseline vs scenario comparison
- ✅ Real-time KPI cards (Consumption, PV Coverage, CO₂ Savings)  
- ✅ PV capacity configurator with live updates
- ✅ Responsive design with loading states and error handling
- ✅ MSW-powered mock API for development
- ✅ Comprehensive test coverage (unit + integration)
- ✅ TypeScript interfaces for type safety
- ✅ Documentation and setup instructions

## Technical Implementation
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom components
- **Charts**: Recharts for interactive visualizations  
- **Testing**: Vitest + React Testing Library
- **API Mocking**: MSW for development workflow
- **State**: React hooks with TanStack Query integration

## Testing
- ✅ Unit tests for calculation logic (8 test cases)
- ✅ Component render tests with MSW integration
- ✅ Edge case handling and error scenarios

## Ready for Production
- All scripts working (`dev`, `build`, `test`, `lint`)
- Responsive design tested on multiple screen sizes
- Clear documentation for API replacement
- Extensible architecture for future enhancements
```

## Tech Stack Summary

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Data Fetching**: TanStack Query
- **Testing**: Vitest + React Testing Library
- **Mocking**: MSW (Mock Service Worker)
- **Linting**: ESLint + Prettier

## License

MIT License - feel free to use this project as a starting point for your energy dashboard applications.
