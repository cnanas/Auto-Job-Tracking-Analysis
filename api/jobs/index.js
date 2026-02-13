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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

  const normalized = {
    company: normalizeText(rawJob.company, 'company'),
    jobTitle: normalizeText(rawJob.jobTitle, 'jobTitle'),
    location: normalizeText(rawJob.location, 'location'),
    salary: normalizeText(rawJob.salary, 'salary'),
    citizenshipRisk: normalizeText(rawJob.citizenshipRisk, 'citizenshipRisk'),
    overallMatchPercent: normalizePercent(rawJob.overallMatchPercent),
    applyRecommendation: normalizeText(rawJob.applyRecommendation, 'applyRecommendation'),
    link: requireValidUrl(normalizeText(rawJob.link, 'link')),
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

  return {
    jobs: Array.isArray(rawPayload.jobs) ? rawPayload.jobs : [],
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

async function readJobsPayload() {
  if (STORAGE_PROVIDER === 'kv') {
    return readKvPayload()
  }
  return readFilePayload()
}

async function writeJobsPayload(payload) {
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
      const nextPayload = {
        jobs: normalizedJobs,
        updatedAt: new Date().toISOString(),
      }

      await writeJobsPayload(nextPayload)
      sendJson(res, 200, {
        ok: true,
        count: normalizedJobs.length,
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

  sendJson(res, 405, { ok: false, error: 'Method not allowed' })
}
