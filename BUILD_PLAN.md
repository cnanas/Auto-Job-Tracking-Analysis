# Job Analysis Website — Build Plan

A step-by-step plan to build a Vite site on Vercel that displays job analyses, with a Custom GPT Action that pushes new analyses to your site automatically.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Phase 1: Project Setup](#3-phase-1-project-setup)
4. [Phase 2: Data Storage](#4-phase-2-data-storage)
5. [Phase 3: API Routes (Vercel)](#5-phase-3-api-routes-vercel)
6. [Phase 4: Vite Frontend](#6-phase-4-vite-frontend)
7. [Phase 5: Deploy to Vercel](#7-phase-5-deploy-to-vercel)
8. [Phase 6: Custom GPT + Action](#8-phase-6-custom-gpt--action)
9. [Phase 7: Testing & Going Live](#9-phase-7-testing--going-live)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

| Component | Purpose |
|-----------|--------|
| **Vite app** | Displays the job tracking table (company, title, location, salary, match %, etc.) |
| **Vercel API** | `POST /api/jobs` — receives data from ChatGPT; `GET /api/jobs` — serves data to the site |
| **Storage** | Holds job entries (options: Vercel KV, Supabase, or JSON in repo) |
| **Custom GPT** | Your existing job-analysis GPT + an Action that calls `POST /api/jobs` when the table is ready |

**Flow:** You chat with GPT → GPT analyzes jobs → GPT calls your API with the table → API saves data → Your site fetches and shows the latest table.

---

## 2. Prerequisites

- [ ] **Node.js** 18+ installed ([nodejs.org](https://nodejs.org))
- [ ] **npm** or **yarn**
- [ ] **Git** installed and a **GitHub** account
- [ ] **Vercel** account ([vercel.com](https://vercel.com)) — sign in with GitHub
- [ ] **ChatGPT Plus** (or Team/Enterprise) so you can create Custom GPTs with Actions

---

## 3. Phase 1: Project Setup

### 3.1 Create the Vite project

```bash
cd "/Users/christiannanas/Documents/Personal Projects/Job Analysis"
npm create vite@latest . -- --template react
```

When prompted to install dependencies, choose **Yes** (or run `npm install` after).

### 3.2 Install dependencies you’ll need

```bash
npm install
# Optional: if you use React Router for future pages
# npm install react-router-dom
```

### 3.3 Folder structure (create these as you build)

Aim for this layout:

```
Job Analysis/
├── src/
│   ├── App.jsx (or .tsx)
│   ├── main.jsx
│   ├── components/
│   │   └── JobTable.jsx
│   └── styles/
├── api/                    # Vercel serverless functions
│   └── jobs/
│       ├── index.js        # GET + POST handler, or separate get.js / post.js
│       └── (optional) get.js, post.js
├── package.json
├── vite.config.js
└── vercel.json             # Optional: route /api/* to api folder
```

You’ll create `api/` and `vercel.json` in Phase 3.

---

## 4. Phase 2: Data Storage

Pick **one** option. For “automatic update,” all work; the difference is cost and complexity.

### Option A: In-repo JSON (simplest, no extra services)

- **Store:** A file like `data/jobs.json` in your repo.
- **How it updates:** Your `POST /api/jobs` handler uses the **GitHub API** to commit and push the updated `jobs.json` to the same repo. Vercel redeploys on push, so the site (and any server-side read of the file) gets new data after deploy.
- **Pros:** No database signup, free, version history.
- **Cons:** Requires a GitHub Personal Access Token (PAT) with `repo` scope; updates trigger a full deploy (usually 30–60 seconds).

**Steps:**

1. Create a **GitHub Personal Access Token**: GitHub → Settings → Developer settings → Personal access tokens → Generate (classic). Give it `repo` scope. Copy the token and store it securely.
2. In Vercel: Project → Settings → Environment Variables. Add:
   - `GITHUB_TOKEN` = your PAT
   - `GITHUB_REPO` = e.g. `your-username/job-analysis` (full repo name)
3. In your repo, create `data/jobs.json` with an initial value: `[]` or `{ "jobs": [], "updatedAt": "" }`.

### Option B: Vercel KV (Redis)

- **Store:** Vercel KV key-value store.
- **How it updates:** `POST /api/jobs` writes to KV; `GET /api/jobs` reads from KV. No deploy needed; updates are instant.
- **Pros:** Fast, simple API, fits Vercel.
- **Cons:** Requires Vercel KV setup (free tier available).

**Steps:**

1. In Vercel: Storage → Create Database → KV. Create a KV store and connect it to your project.
2. Vercel will add env vars like `KV_REST_API_URL` and `KV_REST_API_TOKEN`. No extra code in your app for env — they’re injected.

### Option C: Supabase

- **Store:** Supabase table, e.g. `jobs` (columns: id, company, job_title, location, salary, citizenship_risk, match_percent, apply_recommendation, link, created_at, etc.).
- **How it updates:** `POST /api/jobs` inserts/upserts rows; `GET /api/jobs` reads from the table (e.g. order by `created_at` desc).
- **Pros:** Free tier, SQL, good for many rows and future features.
- **Cons:** Sign up and table setup required.

**Steps:**

1. Create a project at [supabase.com](https://supabase.com). Create a table `jobs` with columns matching your schema (see API section below).
2. Get **Project URL** and **anon (or service) key** from Settings → API. Add them to Vercel env as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

**Recommendation for your first version:** Option A (in-repo JSON) or Option B (Vercel KV). Use Option A if you want zero external services; use B if you want instant updates without deploys.

---

## 5. Phase 3: API Routes (Vercel)

Vercel runs serverless functions from the `api/` directory. Each file under `api/` becomes a route: `api/jobs/index.js` → `https://your-app.vercel.app/api/jobs`.

### 5.1 Create the API directory

```bash
mkdir -p api/jobs
```

### 5.2 Data shape (same for all storage options)

Every job entry should look like this (align with your screenshot and GPT output):

```json
{
  "company": "Harland Medical Systems",
  "jobTitle": "Process Development Engineer",
  "location": "MN",
  "salary": "$70-90k",
  "citizenshipRisk": "Low",
  "overallMatchPercent": 64,
  "applyRecommendation": "Selective",
  "link": "https://www.indeed.com/viewjob?jk=..."
}
```

- **POST body:** Accept either `{ "jobs": [ ... ] }` or `[ ... ]` (array of jobs). Normalize to an array.
- **GET response:** Return `{ "jobs": [ ... ], "updatedAt": "ISO date" }` so the frontend can show “Last updated at …”.

### 5.3 Implement GET and POST

- **GET `/api/jobs`**
  - **Option A (JSON file):** Read `data/jobs.json` from the repo (e.g. via `fetch` to raw GitHub URL, or read from filesystem if you use a build step that includes it). Return `{ jobs, updatedAt }`.
  - **Option B (KV):** Get the value stored at key `jobs` (and optionally `updatedAt`). Parse JSON and return.
  - **Option C (Supabase):** `SELECT * FROM jobs ORDER BY created_at DESC` (or by your chosen order). Map rows to the same JSON shape and return.

- **POST `/api/jobs`**
  - **Auth (recommended):** Check a header, e.g. `Authorization: Bearer YOUR_API_KEY` or `x-api-key: YOUR_API_KEY`. Generate a long random string and set it in Vercel env as `JOBS_API_KEY`. Reject with 401 if missing or wrong.
  - **Body:** Parse JSON, validate that it’s an array (or an object with `jobs` array). Optionally validate each item has `company`, `jobTitle`, `link`, etc.
  - **Option A:** Use GitHub API to update `data/jobs.json` (read current file, merge or replace with new jobs, commit and push). Set `updatedAt` to now.
  - **Option B:** Write the array (and `updatedAt`) to KV at key `jobs` (and `updatedAt`).
  - **Option C:** Insert or upsert into Supabase `jobs` table; set `updatedAt` in your response from DB or from server time.
  - **Response:** `{ "ok": true, "count": number }` or `{ "ok": false, "error": "message" }`.

### 5.4 CORS (if you call API from a different domain later)

In both GET and POST handlers, set headers:

```js
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',  // or your Vite dev origin
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

For `OPTIONS` requests, return `200` with these headers (and no body).

### 5.5 Optional: vercel.json

If your app is a Vite SPA and you want `/api/*` to go only to serverless functions:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ]
}
```

Often unnecessary — Vercel already maps `api/` to functions. Add only if you need custom routing.

---

## 6. Phase 4: Vite Frontend

### 6.1 Fetch jobs on load

- In your main app component (or a dedicated page), on mount call `GET /api/jobs` (use your Vercel URL in production and `http://localhost:5173` or proxy in dev — see Vite proxy below).
- Store result in React state: `jobs` and optionally `updatedAt`.
- Handle loading and error states (e.g. “No jobs yet” or “Failed to load”).

### 6.2 Proxy in development

In `vite.config.js`, add:

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',  // or where Vercel dev runs the API
        changeOrigin: true,
      },
    },
  },
});
```

So in code you can always use `fetch('/api/jobs')`. For local API testing, run `vercel dev` so both the app and API run together.

### 6.3 Job table component

- Build a `<JobTable>` (or similar) that takes `jobs` and `updatedAt`.
- Columns (match your screenshot): **#**, **Company**, **Job Title**, **Location**, **Salary**, **Citizenship Risk**, **Overall Match %**, **Apply?**, **Link**.
- **Link:** render as a clickable “View” or the URL; open in new tab.
- **Match %:** you can color or style by range (e.g. green for high, yellow for medium).
- **Apply?:** show “Selective” / “Strong” / “Very Strong” with optional icons (e.g. dot or check).
- **Citizenship Risk:** “Low” / “Medium” with optional indicator.

Use a simple `<table>` or a component library (e.g. TanStack Table) — your choice.

### 6.4 Optional: auto-refresh

- Every 60 seconds (or 5 minutes), call `GET /api/jobs` again and update state so the table “auto-updates” when GPT has pushed new data.

---

## 7. Phase 5: Deploy to Vercel

### 7.1 Connect repo

1. Push your project to GitHub (create a repo and push).
2. Vercel → Add New Project → Import the repo.
3. Framework: **Vite**. Build command: `npm run build`. Output directory: `dist`. Root directory: `.` (or leave default).
4. Add **Environment Variables** (same as in Phase 2 and 5.3):
   - For Option A: `GITHUB_TOKEN`, `GITHUB_REPO`
   - For Option B: KV vars are usually added when you link the store
   - For Option C: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - For API auth: `JOBS_API_KEY` (your secret for POST)

### 7.2 Deploy

- Deploy. Your site will be at `https://your-project.vercel.app` and the API at `https://your-project.vercel.app/api/jobs`.
- Test:
  - Open `https://your-project.vercel.app/api/jobs` in the browser → should return `{ "jobs": [], "updatedAt": "..." }` or your stored data.
  - Use curl or Postman to send a POST with a valid `Authorization` (or `x-api-key`) header and a sample `jobs` array; then reload GET and the site to see the new row.

---

## 8. Phase 6: Custom GPT + Action

This is where you “tell GPT to push to” your API.

### 8.1 Create or edit your Custom GPT

1. ChatGPT → Explore GPTs → Create (or edit your existing job-analysis GPT).
2. **Name / description:** e.g. “Job Analyzer” and a short description that it analyzes jobs and can submit results to your site.

### 8.2 Define the Action (OpenAPI)

In the GPT editor, go to **Configure → Actions → Create new action**.

You’ll define an OpenAPI spec. Example (replace `YOUR_VERCEL_URL` and describe the schema clearly):

```yaml
openapi: 3.0.0
info:
  title: Job Tracker API
  version: 1.0.0
servers:
  - url: https://YOUR_VERCEL_URL.vercel.app
paths:
  /api/jobs:
    post:
      summary: Submit analyzed jobs to the user's tracking site
      operationId: submitJobs
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [jobs]
              properties:
                jobs:
                  type: array
                  items:
                    type: object
                    required: [company, jobTitle, link]
                    properties:
                      company: { type: string }
                      jobTitle: { type: string }
                      location: { type: string }
                      salary: { type: string }
                      citizenshipRisk: { type: string }
                      overallMatchPercent: { type: number }
                      applyRecommendation: { type: string }
                      link: { type: string, format: uri }
      responses:
        '200':
          description: Jobs submitted successfully
```

- **Authentication:** In the Action configuration, choose **API Key**. Set:
  - **Auth type:** Bearer (or Custom header, e.g. `x-api-key`).
  - **Key:** paste your `JOBS_API_KEY` (the same value you set in Vercel). This way the GPT sends the key with every request and you don’t expose it in the instructions.

### 8.3 Instructions for the GPT

Add (or merge) instructions like these:

- “When you have finished building the job tracking table (with columns: Company, Job Title, Location, Salary, Citizenship Risk, Overall Match %, Apply?, Link), you MUST call the `submitJobs` action with the full list of jobs.”
- “Send exactly one request: body must be a JSON object with a key `jobs` whose value is an array of objects. Each object must have: `company`, `jobTitle`, `location`, `salary`, `citizenshipRisk`, `overallMatchPercent` (number), `applyRecommendation`, `link`.”
- “After calling the action, confirm to the user that the jobs have been sent to their tracking site and they can refresh the page to see them.”

Adjust wording to match how your GPT usually phrases the table (e.g. “Selective” / “Strong” / “Very Strong” for `applyRecommendation`).

### 8.4 Test the Action

- In a chat with your Custom GPT, run a small job analysis (e.g. one or two jobs).
- After it produces the table, it should call `submitJobs` automatically (or when you say “submit these”).
- Check Vercel logs (Project → Deployments → Function logs for `/api/jobs`) to see the incoming POST. Then open your site and confirm the new row appears.

---

## 9. Phase 7: Testing & Going Live

### 9.1 Checklist

- [ ] GET `/api/jobs` returns valid JSON with `jobs` and `updatedAt`.
- [ ] POST `/api/jobs` with correct `Authorization` (or `x-api-key`) and a sample payload updates storage; GET then returns the new data.
- [ ] POST without auth returns 401.
- [ ] Vite app loads and displays the table; “No jobs” and error states work.
- [ ] Custom GPT completes an analysis and calls the Action; site shows the new entries (after refresh or auto-refresh).
- [ ] Optional: “Last updated at …” displays correctly.

### 9.2 Going live

- Use a custom domain in Vercel if you want (e.g. `jobs.yourdomain.com`).
- Keep `JOBS_API_KEY` secret and rotate it if it’s ever exposed. Only the GPT Action (and your own scripts) should use it.

---

## 10. Troubleshooting

| Issue | What to check |
|-------|----------------|
| POST returns 401 | GPT Action auth: Bearer token or custom header must match `JOBS_API_KEY` in Vercel. |
| POST 404 | Confirm `api/jobs/index.js` exists and is deployed; URL is `https://.../api/jobs` with no trailing slash (or match your route). |
| GPT doesn’t call the Action | Instructions must explicitly say to call `submitJobs` after the table is ready; check Action name and operationId. |
| Table empty on site | Frontend must call GET from the same origin (or CORS is set). Check network tab for `/api/jobs` and response body. |
| Option A: “File not updated” | GitHub token has `repo`; `GITHUB_REPO` is correct; path `data/jobs.json` exists in the repo; API has correct branch and file path in the GitHub API call. |

---

## Next Steps

1. Run Phase 1 (scaffold Vite project).
2. Choose storage (Phase 2) and implement GET/POST (Phase 3).
3. Build the table UI (Phase 4) and deploy (Phase 5).
4. Add the Custom GPT Action and instructions (Phase 6).
5. Test end-to-end and go live (Phase 7).

If you want, the next thing to generate can be: (a) the actual `api/jobs` handler code for your chosen storage (A, B, or C), (b) the OpenAPI YAML with your real Vercel URL placeholder, or (c) a minimal `JobTable` component and `App` fetch logic.
