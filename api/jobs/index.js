import fs from 'node:fs/promises'
import path from 'node:path'

const STORAGE_PROVIDER = (process.env.JOBS_STORAGE_PROVIDER || 'file').toLowerCase()
const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'jobs.json')
const DEFAULT_PAYLOAD = { jobs: [], updatedAt: null }

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function setCorsHeaders(res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', process.env.JOBS_ALLOW_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.status(statusCode).json(payload)
}

function normalizeText(input, fieldName) {
  if (input === undefined || input === null) {
    return ''
  }
  if (typeof input !== 'string') {
    throw new RequestError(400, `"${fieldName}" must be a string`)
  }
  return input.trim()
}

function normalizePercent(input) {
  if (input === undefined || input === null || input === '') {
    return null
  }
  const parsed = Number(input)
  if (!Number.isFinite(parsed)) {
    throw new RequestError(400, '"overallMatchPercent" must be a number')
  }
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100))
}

function normalizeOptionalDate(input, fieldName) {
  if (input === undefined || input === null || input === '') {
    return null
  }
  if (typeof input !== 'string') {
    throw new RequestError(400, `"${fieldName}" must be a string`)
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    throw new RequestError(400, `"${fieldName}" must be a valid date string`)
  }

  return parsed.toISOString()
}

function requireValidUrl(input) {
  if (!input) {
    throw new RequestError(400, '"link" is required')
  }

  try {
    new URL(input)
    return input
  } catch {
    throw new RequestError(400, '"link" must be a valid URL')
  }
}

function normalizeJob(rawJob, index) {
  if (!rawJob || typeof rawJob !== 'object' || Array.isArray(rawJob)) {
    throw new RequestError(400, `Job at index ${index} must be an object`)
  }

  const inputApplied = rawJob.applied
  if (inputApplied !== undefined && inputApplied !== null && typeof inputApplied !== 'boolean') {
    throw new RequestError(400, `"applied" must be a boolean for job at index ${index}`)
  }

  const applied = inputApplied === true
  const appliedAt = applied ? normalizeOptionalDate(rawJob.appliedAt, 'appliedAt') : null

  const normalized = {
    company: normalizeText(rawJob.company, 'company'),
    jobTitle: normalizeText(rawJob.jobTitle, 'jobTitle'),
    location: normalizeText(rawJob.location, 'location'),
    salary: normalizeText(rawJob.salary, 'salary'),
    citizenshipRisk: normalizeText(rawJob.citizenshipRisk, 'citizenshipRisk'),
    overallMatchPercent: normalizePercent(rawJob.overallMatchPercent),
    applyRecommendation: normalizeText(rawJob.applyRecommendation, 'applyRecommendation'),
    link: requireValidUrl(normalizeText(rawJob.link, 'link')),
    applied,
    appliedAt,
  }

  if (!normalized.company) {
    throw new RequestError(400, `"company" is required for job at index ${index}`)
  }
  if (!normalized.jobTitle) {
    throw new RequestError(400, `"jobTitle" is required for job at index ${index}`)
  }

  return normalized
}

function parseJobsPayload(body) {
  const payload = Array.isArray(body) ? body : body?.jobs
  if (!Array.isArray(payload)) {
    throw new RequestError(400, 'Body must be an array or an object containing a "jobs" array')
  }

  return payload.map((job, index) => normalizeJob(job, index))
}

function parseRequestBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      throw new RequestError(400, 'Invalid JSON payload')
    }
  }
  return body ?? {}
}

function parsePatchPayload(body) {
  const payload = parseRequestBody(body)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RequestError(400, 'PATCH body must be an object')
  }

  if (typeof payload.applied !== 'boolean') {
    throw new RequestError(400, '"applied" must be a boolean')
  }

  const hasValidIndex = Number.isInteger(payload.index)
  const hasValidLink = typeof payload.link === 'string' && payload.link.trim() !== ''
  if (!hasValidIndex && !hasValidLink) {
    throw new RequestError(400, 'PATCH body must include either "index" (integer) or "link" (string)')
  }

  return {
    index: hasValidIndex ? payload.index : null,
    link: hasValidLink ? payload.link.trim() : null,
    applied: payload.applied,
  }
}

function extractApiKey(req) {
  const authorization = req.headers.authorization
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }

  const apiKeyHeader = req.headers['x-api-key']
  if (Array.isArray(apiKeyHeader)) {
    return apiKeyHeader[0]
  }
  return apiKeyHeader || ''
}

function ensureAuthorized(req) {
  const expectedApiKey = process.env.JOBS_API_KEY
  if (!expectedApiKey) {
    return
  }

  if (extractApiKey(req) !== expectedApiKey) {
    throw new RequestError(401, 'Unauthorized')
  }
}

function normalizeStoredPayload(rawPayload) {
  if (Array.isArray(rawPayload)) {
    return { jobs: rawPayload, updatedAt: null }
  }
  if (!rawPayload || typeof rawPayload !== 'object') {
    return { ...DEFAULT_PAYLOAD }
  }

  const jobs = Array.isArray(rawPayload.jobs)
    ? rawPayload.jobs
        .filter((job) => job && typeof job === 'object' && !Array.isArray(job))
        .map((job) => ({
          company: typeof job.company === 'string' ? job.company : '',
          jobTitle: typeof job.jobTitle === 'string' ? job.jobTitle : '',
          location: typeof job.location === 'string' ? job.location : '',
          salary: typeof job.salary === 'string' ? job.salary : '',
          citizenshipRisk: typeof job.citizenshipRisk === 'string' ? job.citizenshipRisk : '',
          overallMatchPercent:
            Number.isFinite(Number(job.overallMatchPercent)) || job.overallMatchPercent === 0
              ? Number(job.overallMatchPercent)
              : null,
          applyRecommendation: typeof job.applyRecommendation === 'string' ? job.applyRecommendation : '',
          link: typeof job.link === 'string' ? job.link : '',
          applied: job.applied === true,
          appliedAt: typeof job.appliedAt === 'string' ? job.appliedAt : null,
        }))
    : []

  return {
    jobs,
    updatedAt: typeof rawPayload.updatedAt === 'string' ? rawPayload.updatedAt : null,
  }
}

async function ensureDataFileExists() {
  try {
    await fs.access(DATA_FILE_PATH)
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true })
    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(DEFAULT_PAYLOAD, null, 2), 'utf8')
  }
}

async function readFilePayload() {
  await ensureDataFileExists()

  const rawData = await fs.readFile(DATA_FILE_PATH, 'utf8')
  try {
    return normalizeStoredPayload(JSON.parse(rawData))
  } catch {
    throw new Error(`Unable to parse JSON from ${DATA_FILE_PATH}`)
  }
}

async function writeFilePayload(payload) {
  await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true })
  await fs.writeFile(DATA_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8')
}

async function readKvPayload() {
  let kv
  try {
    ;({ kv } = await import('@vercel/kv'))
  } catch {
    throw new Error(
      'KV provider selected but "@vercel/kv" is unavailable. Install it or switch JOBS_STORAGE_PROVIDER to "file".',
    )
  }

  const payload = await kv.get('jobs_payload')
  return normalizeStoredPayload(payload)
}

async function writeKvPayload(payload) {
  let kv
  try {
    ;({ kv } = await import('@vercel/kv'))
  } catch {
    throw new Error(
      'KV provider selected but "@vercel/kv" is unavailable. Install it or switch JOBS_STORAGE_PROVIDER to "file".',
    )
  }

  await kv.set('jobs_payload', payload)
}

async function getNeonSql() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Neon provider selected but DATABASE_URL is not set.')
  }

  let neon
  try {
    ;({ neon } = await import('@neondatabase/serverless'))
  } catch {
    throw new Error(
      'Neon provider selected but "@neondatabase/serverless" is unavailable. Install it or switch JOBS_STORAGE_PROVIDER.',
    )
  }

  return neon(databaseUrl)
}

async function ensureNeonTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS jobs_snapshot (
      id BIGSERIAL PRIMARY KEY,
      row_order INTEGER NOT NULL,
      company TEXT NOT NULL,
      job_title TEXT NOT NULL,
      location TEXT,
      salary TEXT,
      citizenship_risk TEXT,
      overall_match_percent DOUBLE PRECISION,
      apply_recommendation TEXT,
      link TEXT NOT NULL,
      applied BOOLEAN NOT NULL DEFAULT FALSE,
      applied_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    ALTER TABLE jobs_snapshot
    ADD COLUMN IF NOT EXISTS applied BOOLEAN NOT NULL DEFAULT FALSE
  `

  await sql`
    ALTER TABLE jobs_snapshot
    ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ
  `
}

function toIsoDate(value) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function mapNeonRowToJob(row) {
  return {
    company: row.company || '',
    jobTitle: row.job_title || '',
    location: row.location || '',
    salary: row.salary || '',
    citizenshipRisk: row.citizenship_risk || '',
    overallMatchPercent:
      row.overall_match_percent === null || row.overall_match_percent === undefined
        ? null
        : Number(row.overall_match_percent),
    applyRecommendation: row.apply_recommendation || '',
    link: row.link || '',
    applied: row.applied === true,
    appliedAt: toIsoDate(row.applied_at),
  }
}

async function readNeonPayload() {
  const sql = await getNeonSql()
  await ensureNeonTable(sql)

  const rows = await sql`
    SELECT
      row_order,
      company,
      job_title,
      location,
      salary,
      citizenship_risk,
      overall_match_percent,
      apply_recommendation,
      link,
      applied,
      applied_at,
      updated_at
    FROM jobs_snapshot
    ORDER BY row_order ASC
  `

  const jobs = rows.map(mapNeonRowToJob)
  const updatedAt = rows.reduce((latest, row) => {
    const current = toIsoDate(row.updated_at)
    if (!current) {
      return latest
    }
    if (!latest) {
      return current
    }
    return current > latest ? current : latest
  }, null)

  return { jobs, updatedAt }
}

async function writeNeonPayload(payload) {
  const sql = await getNeonSql()
  await ensureNeonTable(sql)

  const updatedAt = payload.updatedAt || new Date().toISOString()
  await sql`DELETE FROM jobs_snapshot`

  for (let index = 0; index < payload.jobs.length; index += 1) {
    const job = payload.jobs[index]
    await sql`
      INSERT INTO jobs_snapshot (
        row_order,
        company,
        job_title,
        location,
        salary,
        citizenship_risk,
        overall_match_percent,
        apply_recommendation,
        link,
        applied,
        applied_at,
        updated_at
      )
      VALUES (
        ${index},
        ${job.company},
        ${job.jobTitle},
        ${job.location || null},
        ${job.salary || null},
        ${job.citizenshipRisk || null},
        ${job.overallMatchPercent},
        ${job.applyRecommendation || null},
        ${job.link},
        ${job.applied === true},
        ${job.applied === true ? job.appliedAt || updatedAt : null},
        ${updatedAt}
      )
    `
  }
}

function carryForwardAppliedState(incomingJobs, existingJobs) {
  const appliedByLink = new Map()

  for (const job of existingJobs) {
    if (job?.applied === true && typeof job.link === 'string' && job.link) {
      appliedByLink.set(job.link, job.appliedAt || null)
    }
  }

  return incomingJobs.map((job) => {
    if (job.applied === true) {
      return job
    }
    if (!job.link || !appliedByLink.has(job.link)) {
      return job
    }

    return {
      ...job,
      applied: true,
      appliedAt: appliedByLink.get(job.link),
    }
  })
}

function applyAppliedUpdate(payload, update) {
  const nextJobs = [...payload.jobs]
  let targetIndex = -1

  if (update.index !== null) {
    if (update.index < 0 || update.index >= nextJobs.length) {
      throw new RequestError(404, 'Job index not found')
    }
    targetIndex = update.index
  } else if (update.link) {
    targetIndex = nextJobs.findIndex((job) => job.link === update.link)
    if (targetIndex === -1) {
      throw new RequestError(404, 'Job link not found')
    }
  }

  const mutationTimestamp = new Date().toISOString()
  nextJobs[targetIndex] = {
    ...nextJobs[targetIndex],
    applied: update.applied,
    appliedAt: update.applied ? mutationTimestamp : null,
  }

  return {
    jobs: nextJobs,
    updatedAt: mutationTimestamp,
  }
}

function ensureStorageProviderIsSupported(provider) {
  if (provider === 'file' || provider === 'kv' || provider === 'neon') {
    return
  }
  throw new Error(
    `Unsupported JOBS_STORAGE_PROVIDER "${provider}". Use one of: file, kv, neon.`,
  )
}

async function readJobsPayload() {
  ensureStorageProviderIsSupported(STORAGE_PROVIDER)

  if (STORAGE_PROVIDER === 'neon') {
    return readNeonPayload()
  }
  if (STORAGE_PROVIDER === 'kv') {
    return readKvPayload()
  }
  return readFilePayload()
}

async function writeJobsPayload(payload) {
  ensureStorageProviderIsSupported(STORAGE_PROVIDER)

  if (STORAGE_PROVIDER === 'neon') {
    await writeNeonPayload(payload)
    return
  }
  if (STORAGE_PROVIDER === 'kv') {
    await writeKvPayload(payload)
    return
  }
  await writeFilePayload(payload)
}

export default async function handler(req, res) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method === 'GET') {
    try {
      const payload = await readJobsPayload()
      sendJson(res, 200, payload)
      return
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || 'Failed to read jobs' })
      return
    }
  }

  if (req.method === 'POST') {
    try {
      ensureAuthorized(req)
      const requestBody = parseRequestBody(req.body)
      const normalizedJobs = parseJobsPayload(requestBody)
      const existingPayload = await readJobsPayload()
      const mergedJobs = carryForwardAppliedState(normalizedJobs, existingPayload.jobs)
      const nextPayload = {
        jobs: mergedJobs,
        updatedAt: new Date().toISOString(),
      }

      await writeJobsPayload(nextPayload)
      sendJson(res, 200, {
        ok: true,
        count: mergedJobs.length,
        updatedAt: nextPayload.updatedAt,
        storage: STORAGE_PROVIDER,
      })
      return
    } catch (error) {
      const statusCode = error instanceof RequestError ? error.status : 500
      sendJson(res, statusCode, {
        ok: false,
        error: error.message || 'Failed to save jobs',
      })
      return
    }
  }

  if (req.method === 'PATCH') {
    try {
      ensureAuthorized(req)
      const update = parsePatchPayload(req.body)
      const payload = await readJobsPayload()
      const nextPayload = applyAppliedUpdate(payload, update)
      await writeJobsPayload(nextPayload)

      sendJson(res, 200, {
        ok: true,
        updatedAt: nextPayload.updatedAt,
        storage: STORAGE_PROVIDER,
      })
      return
    } catch (error) {
      const statusCode = error instanceof RequestError ? error.status : 500
      sendJson(res, statusCode, {
        ok: false,
        error: error.message || 'Failed to update job',
      })
      return
    }
  }

  if (req.method === 'DELETE') {
    try {
      ensureAuthorized(req)
      const nextPayload = {
        jobs: [],
        updatedAt: new Date().toISOString(),
      }
      await writeJobsPayload(nextPayload)
      sendJson(res, 200, {
        ok: true,
        count: 0,
        updatedAt: nextPayload.updatedAt,
        storage: STORAGE_PROVIDER,
      })
      return
    } catch (error) {
      const statusCode = error instanceof RequestError ? error.status : 500
      sendJson(res, statusCode, {
        ok: false,
        error: error.message || 'Failed to clear jobs',
      })
      return
    }
  }

  sendJson(res, 405, { ok: false, error: 'Method not allowed' })
}
