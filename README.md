# Job Tracking and Analysis

Vite + React frontend with a Vercel serverless API route at `/api/jobs`.

## Features

- `GET /api/jobs` returns `{ jobs, updatedAt }`
- `POST /api/jobs` accepts `{ jobs: [...] }` or `[...]`
- API key auth for writes (`Authorization: Bearer ...` or `x-api-key`)
- CORS support and `OPTIONS` handling
- Pluggable storage:
  - `file` (default): writes to `data/jobs.json`
  - `kv`: uses Vercel KV (`@vercel/kv`)
- Frontend table with loading, error, empty state, and auto-refresh

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

This starts the Vite frontend. For local end-to-end API testing with Vercel routing:

```bash
npx vercel dev
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `JOBS_API_KEY` | Recommended | Secret key required for `POST /api/jobs` |
| `JOBS_STORAGE_PROVIDER` | No | `file` (default) or `kv` |
| `JOBS_ALLOW_ORIGIN` | No | CORS allow-origin (default `*`) |
| `KV_REST_API_URL` | If `kv` | Vercel KV URL |
| `KV_REST_API_TOKEN` | If `kv` | Vercel KV token |

## API Examples

### GET jobs

```bash
curl http://localhost:3000/api/jobs
```

### POST jobs

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JOBS_API_KEY" \
  -d '{
    "jobs": [
      {
        "company": "Harland Medical Systems",
        "jobTitle": "Process Development Engineer",
        "location": "MN",
        "salary": "$70-90k",
        "citizenshipRisk": "Low",
        "overallMatchPercent": 64,
        "applyRecommendation": "Selective",
        "link": "https://www.indeed.com/viewjob?jk=example"
      }
    ]
  }'
```

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel as a Vite project.
3. Add environment variables in Vercel project settings.
4. Deploy and test:
   - `GET https://<project>.vercel.app/api/jobs`
   - `POST https://<project>.vercel.app/api/jobs`

## Custom GPT Action

Use `openapi/job-tracker-action.yaml` in the GPT Action editor, then replace the server URL with your deployed Vercel URL.
# Auto-Job-Tracking-Analysis
