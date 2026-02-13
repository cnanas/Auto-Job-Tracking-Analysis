import { useCallback, useEffect, useMemo, useState } from 'react'
import JobTable from './components/JobTable'

const AUTO_REFRESH_MS = 60_000
const ADMIN_KEY_STORAGE_KEY = 'jobs_admin_key'
const SORT_BY_MATCH_DESC = 'match_desc'
const SORT_BY_MATCH_ASC = 'match_asc'

function formatUpdatedAt(timestamp) {
  if (!timestamp) {
    return 'No submissions yet'
  }

  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }

  return parsed.toLocaleString()
}

async function readApiError(response, fallbackMessage) {
  try {
    const payload = await response.json()
    if (typeof payload?.error === 'string' && payload.error) {
      return payload.error
    }
  } catch {
    return `${fallbackMessage} (${response.status})`
  }
  return `${fallbackMessage} (${response.status})`
}

function normalizeMatchScore(value) {
  const score = Number(value)
  if (!Number.isFinite(score)) {
    return null
  }
  return Math.max(0, Math.min(100, score))
}

function sortJobsByMatch(jobs, sortMode) {
  const direction = sortMode === SORT_BY_MATCH_ASC ? 1 : -1

  return [...jobs].sort((left, right) => {
    const leftScore = normalizeMatchScore(left.overallMatchPercent)
    const rightScore = normalizeMatchScore(right.overallMatchPercent)

    if (leftScore === null && rightScore === null) {
      return 0
    }
    if (leftScore === null) {
      return 1
    }
    if (rightScore === null) {
      return -1
    }

    if (leftScore === rightScore) {
      return 0
    }
    return (leftScore - rightScore) * direction
  })
}

function App() {
  const [jobs, setJobs] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [mutatingIndex, setMutatingIndex] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [sortMode, setSortMode] = useState(SORT_BY_MATCH_DESC)

  useEffect(() => {
    const savedKey = window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY)
    if (savedKey) {
      setAdminKey(savedKey)
    }
  }, [])

  useEffect(() => {
    if (adminKey) {
      window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, adminKey)
      return
    }
    window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY)
  }, [adminKey])

  const buildWriteHeaders = useCallback(() => {
    const headers = {
      'Content-Type': 'application/json',
    }

    if (adminKey.trim()) {
      headers.Authorization = `Bearer ${adminKey.trim()}`
    }

    return headers
  }, [adminKey])

  const loadJobs = useCallback(async ({ silent = false, signal } = {}) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch('/api/jobs', { signal })
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const payload = await response.json()
      const nextJobs = Array.isArray(payload.jobs) ? payload.jobs : []
      const nextUpdatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : null

      setJobs(nextJobs)
      setUpdatedAt(nextUpdatedAt)
      setError('')
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError('Failed to load jobs. Verify the API route and try again.')
      }
    } finally {
      if (silent) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const initialRequestController = new AbortController()
    loadJobs({ signal: initialRequestController.signal })

    const intervalId = setInterval(() => {
      loadJobs({ silent: true })
    }, AUTO_REFRESH_MS)

    return () => {
      initialRequestController.abort()
      clearInterval(intervalId)
    }
  }, [loadJobs])

  const indexedJobs = useMemo(
    () => jobs.map((job, sourceIndex) => ({ ...job, _sourceIndex: sourceIndex })),
    [jobs],
  )
  const appliedJobs = useMemo(
    () => indexedJobs.filter((job) => job.applied === true),
    [indexedJobs],
  )
  const openJobs = useMemo(
    () => indexedJobs.filter((job) => job.applied !== true),
    [indexedJobs],
  )
  const sortedOpenJobs = useMemo(() => sortJobsByMatch(openJobs, sortMode), [openJobs, sortMode])
  const sortedAppliedJobs = useMemo(
    () => sortJobsByMatch(appliedJobs, sortMode),
    [appliedJobs, sortMode],
  )
  const visibleJobs = activeTab === 'applied' ? sortedAppliedJobs : sortedOpenJobs

  const handleToggleApplied = useCallback(
    async (index, applied) => {
      setActionError('')
      setMutatingIndex(index)

      try {
        const response = await fetch('/api/jobs', {
          method: 'PATCH',
          headers: buildWriteHeaders(),
          body: JSON.stringify({ index, applied }),
        })

        if (!response.ok) {
          throw new Error(await readApiError(response, 'Failed to update job'))
        }

        const payload = await response.json()
        setJobs((currentJobs) =>
          currentJobs.map((job, jobIndex) =>
            jobIndex === index
              ? {
                  ...job,
                  applied,
                  appliedAt: applied ? new Date().toISOString() : null,
                }
              : job,
          ),
        )
        setUpdatedAt(
          typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
        )
      } catch (updateError) {
        setActionError(updateError.message || 'Failed to update job')
      } finally {
        setMutatingIndex(null)
      }
    },
    [buildWriteHeaders],
  )

  const handleClearAll = useCallback(async () => {
    if (jobs.length === 0) {
      return
    }

    const confirmed = window.confirm('Clear all jobs? This cannot be undone.')
    if (!confirmed) {
      return
    }

    setActionError('')
    setClearing(true)

    try {
      const response = await fetch('/api/jobs', {
        method: 'DELETE',
        headers: buildWriteHeaders(),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to clear jobs'))
      }

      const payload = await response.json()
      setJobs([])
      setUpdatedAt(
        typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
      )
      setActiveTab('all')
    } catch (deleteError) {
      setActionError(deleteError.message || 'Failed to clear jobs')
    } finally {
      setClearing(false)
    }
  }, [buildWriteHeaders, jobs.length])

  return (
    <div className="app-shell">
      <header className="page-header">
        <p className="eyebrow">Job Tracking and Analysis</p>
        <h1>Application Decisions Dashboard</h1>
        <p className="subtitle">
          Jobs submitted from your custom GPT action land here automatically.
        </p>
        <div className="meta-row">
          <span className="updated-at">
            Last updated: <strong>{formatUpdatedAt(updatedAt)}</strong>
          </span>
          <button
            type="button"
            className="refresh-button"
            onClick={() => loadJobs({ silent: true })}
            disabled={loading || refreshing || clearing || mutatingIndex !== null}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="toolbar">
          <div className="tabs" role="tablist" aria-label="Job tabs">
            <button
              type="button"
              role="tab"
              className={`tab-button ${activeTab === 'all' ? 'is-active' : ''}`}
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
            >
              All ({openJobs.length})
            </button>
            <button
              type="button"
              role="tab"
              className={`tab-button ${activeTab === 'applied' ? 'is-active' : ''}`}
              aria-selected={activeTab === 'applied'}
              onClick={() => setActiveTab('applied')}
            >
              Applied ({appliedJobs.length})
            </button>
          </div>
          <div className="sort-controls">
            <label className="sort-label" htmlFor="sort-mode-select">
              Sort
            </label>
            <select
              id="sort-mode-select"
              className="sort-select"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
              disabled={loading || refreshing}
            >
              <option value={SORT_BY_MATCH_DESC}>Best Match (High to Low)</option>
              <option value={SORT_BY_MATCH_ASC}>Best Match (Low to High)</option>
            </select>
          </div>
          <div className="write-controls">
            <label className="admin-key-label" htmlFor="admin-key-input">
              Admin Key (Clear All)
            </label>
            <input
              id="admin-key-input"
              type="password"
              className="admin-key-input"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Only needed for Clear All when API key is enabled"
              autoComplete="off"
            />
            <button
              type="button"
              className="danger-button"
              onClick={handleClearAll}
              disabled={jobs.length === 0 || clearing || mutatingIndex !== null}
            >
              {clearing ? 'Clearing...' : 'Clear All'}
            </button>
          </div>
        </div>
      </header>

      <main className="table-card">
        {loading && <p className="status-text">Loading jobs...</p>}
        {!loading && error && <p className="status-text status-error">{error}</p>}
        {!loading && !error && actionError && <p className="status-text status-error">{actionError}</p>}
        {!loading && !error && (
          <JobTable
            jobs={visibleJobs}
            onToggleApplied={handleToggleApplied}
            pendingIndex={mutatingIndex}
            emptyMessage={
              activeTab === 'applied'
                ? 'No jobs have been marked as applied yet.'
                : 'No open jobs in All. Check the Applied tab or submit new jobs.'
            }
          />
        )}
      </main>
      <footer className="page-footer">
        <span>Auto-refresh interval: {Math.round(AUTO_REFRESH_MS / 1000)} seconds</span>
        <a
          className="footer-link"
          href="/privacy-policy.html"
          target="_blank"
          rel="noreferrer"
        >
          Privacy Policy
        </a>
      </footer>
    </div>
  )
}

export default App
