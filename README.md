# Meta Ad Intelligence Tool

This project is a practical competitor-research workflow for growth teams: pull fresh ads from Meta, keep only high-signal brand matches, then layer AI analysis on top for strategy insights.

The implementation is intentionally lean. On the backend, ad scraping, filtering, persistence, and AI endpoints all live in one controller for speed of iteration and easy ownership. On the frontend, the app keeps search orchestration in one place and presents AI outputs where they are immediately actionable.

## Why this architecture

We use MongoDB as a cache layer, not just storage. That choice cuts down Apify spend and makes repeat searches feel much faster.

We keep strict brand filtering because quality matters more than volume for decision-making. If a search for `"Vans"` starts mixing in unrelated advertisers, every AI downstream feature gets noisier. It's better to show fewer results you can trust than more results you can't.

We keep AI endpoints focused:
- Ask AI for grounded copy analysis
- Find competitors for quick market exploration
- Cluster ads for creative pattern discovery

## Current stack

- Frontend: React 18 + TypeScript (`App.tsx`, `AISection.tsx`), Vite, Tailwind, axios, react-markdown
- Backend: Node.js, Express, TypeScript
- Database: MongoDB + Mongoose (`Ad` is the single model)
- Scraping: Apify client with `apify/facebook-ads-scraper`
- AI: Groq via OpenAI-compatible SDK (`llama-3.3-70b-versatile`)

## Project structure

```text
upspring-project/
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       ├── config/
│       │   └── db.ts
│       ├── controllers/
│       │   └── adsController.ts
│       ├── middleware/
│       │   └── errorHandler.ts
│       ├── models/
│       │   └── Ad.ts
│       └── routes/
│           └── ads.ts
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── App.tsx
│       ├── AISection.tsx
│       ├── main.jsx
│       ├── index.css
│       └── components/
│           ├── SearchBar.jsx
│           └── AdCard.jsx
└── README.md
```

## Setup

### 1) Server

```bash
cd server
npm install
cp .env.example .env
# Windows PowerShell:
# copy .env.example .env
```

Set these environment variables in `server/.env`:
- `PORT` (defaults to `5000`)
- `MONGODB_URI`
- `APIFY_API_TOKEN`
- `GROQ_API_KEY`
- `GROQ_BASE_URL` (default in example: `https://api.groq.com/openai/v1`)

Run:

```bash
npm run dev
```

Server endpoints:
- API base: `http://localhost:5000/api`
- Health check: `GET http://localhost:5000/health`

### 2) Client

```bash
cd client
npm install
npm run dev
```

Optional type check:

```bash
npm run typecheck
```

Vite proxies `/api` to `http://localhost:5000` in development.

## API endpoints

All endpoints are under `/api`:
- `POST /fetch-ads`
- `POST /ads/ask`
- `POST /ads/competitors`
- `POST /ads/cluster`

## Tradeoffs and real-world challenges

### The filtering problem we had to solve

The biggest product-quality challenge was advertiser ambiguity.

Example: searching for `"Vans"` can pull ads from unrelated pages (including dealership-style pages) if filtering is too loose. We originally experimented with broader matching, but it polluted results and hurt trust in AI outputs. We moved to strict page-name matching for data quality and consistency.

That does mean fewer matches in some edge cases. We accept that tradeoff because this tool is used for strategy decisions, where precision beats recall.

### Robustness decisions

- Clear, user-facing API messages for empty results, provider issues, and slow upstream runs.
- Explicit loading states in UI so users always know whether the app is searching, ready, or failed.
- Graceful failure paths so partial outages (Apify or Groq) do not crash the app.

### What I’d do next for scale

- Move scrape + AI-heavy tasks to queued workers.
- Add TTL caching for high-frequency brand lookups.
- Add stronger observability (provider latency, parse-failure rate, no-result rate, token cost).

## Personal reflections

### Assumptions I made

I optimized for teams that care about official brand creative, not broad keyword discovery. That drove the strict filtering strategy and shaped the UX around confidence in the returned data.

I also assumed copy text is enough signal for a strong V1 insight experience; full image semantics can come later.

### Current limitations

This workflow depends on external providers and upstream page structure. If Meta or provider behavior changes, reliability can degrade quickly without strong monitoring.

AI routes are stateless by design. They answer well for a single brand snapshot, but they do not yet build a long-lived intelligence layer over time.

### If I had more time

I would add:
- historical creative trend tracking
- image-level analysis for visual motifs
- exportable outputs (strategy brief / CSV) for sharing with non-technical stakeholders
