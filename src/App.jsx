import { useCallback, useEffect, useMemo, useState } from 'react'
import JobTable from './components/JobTable'

const AUTO_REFRESH_MS = 60_000
const ADMIN_KEY_STORAGE_KEY = 'jobs_admin_key'

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
  const visibleJobs = activeTab === 'applied' ? appliedJobs : indexedJobs

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
              All ({jobs.length})
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
          <div className="write-controls">
            <label className="admin-key-label" htmlFor="admin-key-input">
              Admin Key
            </label>
            <input
              id="admin-key-input"
              type="password"
              className="admin-key-input"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Required if API key is enabled"
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
                : 'No jobs have been submitted yet. Run your GPT action, then refresh.'
            }
          />
        )}
      </main>
      <footer className="page-footer">
        Auto-refresh interval: {Math.round(AUTO_REFRESH_MS / 1000)} seconds
      </footer>
    </div>
  )
}

export default App
