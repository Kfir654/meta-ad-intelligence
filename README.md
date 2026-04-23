# Meta Ad Intelligence Tool

This project is a practical competitor-research workflow for growth teams: pull fresh ads from Meta, keep only high-signal brand matches, then layer AI analysis on top for strategy insights.

The implementation is intentionally lean. On the backend, ad scraping, filtering, persistence, and AI endpoints all live in one controller for speed of iteration and easy ownership. On the frontend, the app keeps search orchestration in one place and presents AI outputs where they are immediately actionable.

## Live Access

- Frontend: [https://ad-intel-frontend.onrender.com](https://ad-intel-frontend.onrender.com)
- Backend API: [https://ad-intel-api.onrender.com](https://ad-intel-api.onrender.com)

Note: The application is fully deployed on Render. While it can run locally, the online version is recommended for immediate testing.

## Why this architecture

We use MongoDB as an active 2-hour TTL-style cache layer, not just storage. On every fetch request, the server checks for recent brand data first and returns it immediately when available. That avoids redundant scraping, protects Apify quota, and makes repeat searches feel instant.

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

## Configuration highlights

- Scraping provider: Apify (Meta Ads Library actor)
- AI provider: Groq, using Llama 3.3 (`llama-3.3-70b-versatile`) for analysis routes

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

## Usage Notes

**Efficiency & Caching:** The system implements a 2-hour server-side cache. Repeat searches for the same brand within this window are served instantly from MongoDB.

**API Quota:** The app uses Apify's free tier. If the search limit is reached, you can still test the AI features using cached data from previous searches (e.g., `Nike`, `Coca-Cola`).

## Written questions

**Q1: What assumptions did you make?**  
I assumed a 2-hour window is sufficient for ad creative consistency and that the advertiser's page name is the primary filter for brand relevance.

**Q2: What are the biggest limitations of your current approach?**  
Dependency on a single third-party scraper (Apify) and the 20-30s latency required for initial 'cold' searches of new brands.

**Q3: If this needed to support 100× more usage, what would you change first?**  
Implement an asynchronous message queue for scraping tasks and migrate to a distributed cache like Redis for global scaling.

**Q4: How would you monitor this system in production?**  
Track scraping success rates and latency via Prometheus, implement structured logging for API errors, and set up alerts for quota depletion.

**Q5: What would you improve next if you had more time?**  
Add multi-competitor side-by-side comparison dashboards and implement visual analysis of ad images using a Vision LLM.
