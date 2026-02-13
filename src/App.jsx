import { useCallback, useEffect, useState } from 'react'
import JobTable from './components/JobTable'

const AUTO_REFRESH_MS = 60_000

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

function App() {
  const [jobs, setJobs] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

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
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="table-card">
        {loading && <p className="status-text">Loading jobs...</p>}
        {!loading && error && <p className="status-text status-error">{error}</p>}
        {!loading && !error && <JobTable jobs={jobs} />}
      </main>
      <footer className="page-footer">
        Auto-refresh interval: {Math.round(AUTO_REFRESH_MS / 1000)} seconds
      </footer>
    </div>
  )
}

export default App
