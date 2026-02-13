# Job Tracking and Analysis

Vite + React frontend with a Vercel serverless API route at `/api/jobs`.

## Features

- `GET /api/jobs` returns `{ jobs, updatedAt }`
- `POST /api/jobs` accepts `{ jobs: [...] }` or `[...]` and merges into existing jobs by default
  - Set `replaceExisting: true` to overwrite all existing jobs
- `PATCH /api/jobs` updates a job's `applied` status
- `DELETE /api/jobs` clears all jobs
- API key auth for writes (`Authorization: Bearer ...` or `x-api-key`)
- CORS support and `OPTIONS` handling
- Pluggable storage:
  - `file` (default): writes to `data/jobs.json`
  - `kv`: uses Vercel KV (`@vercel/kv`)
  - `neon`: uses Neon Postgres (`@neondatabase/serverless`)
- Frontend table with loading, error, empty state, and auto-refresh
- Frontend controls for tabs (`All` / `Applied`), applied checkboxes, and clear-all
  - If `JOBS_API_KEY` is set, enter that key in the dashboard's `Admin Key` field to enable toggle/clear actions

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
| `JOBS_STORAGE_PROVIDER` | No | `file` (default), `kv`, or `neon` |
| `JOBS_ALLOW_ORIGIN` | No | CORS allow-origin (default `*`) |
| `KV_REST_API_URL` | If `kv` | Vercel KV URL |
| `KV_REST_API_TOKEN` | If `kv` | Vercel KV token |
| `DATABASE_URL` | If `neon` | Neon Postgres connection string |

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

Append behavior:
- Repeated `POST` calls keep existing jobs and add/update by `link`.
- Existing jobs are only fully replaced when `replaceExisting: true` is sent.

### Mark a job as applied

```bash
curl -X PATCH http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JOBS_API_KEY" \
  -d '{ "index": 0, "applied": true }'
```

### Clear all jobs

```bash
curl -X DELETE http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $JOBS_API_KEY"
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
Set the GPT Action Privacy Policy URL to:
- `https://<your-project>.vercel.app/privacy-policy.html`

## Neon Setup (Recommended for Vercel Deploys)

1. Create a Neon project and copy the connection string.
2. In Vercel env vars, set:
   - `JOBS_STORAGE_PROVIDER=neon`
   - `DATABASE_URL=<your neon connection string>`
   - `JOBS_API_KEY=<your random secret>`
3. Redeploy.
4. Test `POST /api/jobs` from your GPT Action.
