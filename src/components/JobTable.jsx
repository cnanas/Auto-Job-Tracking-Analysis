import { useState } from 'react'

function normalizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function normalizePercent(value) {
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) {
    return null
  }
  return Math.max(0, Math.min(100, Math.round(asNumber)))
}

function matchToneClass(value) {
  const score = normalizePercent(value)
  if (score === null) {
    return 'pill-neutral'
  }
  if (score >= 80) {
    return 'pill-high'
  }
  if (score >= 60) {
    return 'pill-medium'
  }
  return 'pill-low'
}

function riskToneClass(value) {
  const risk = normalizeText(value).toLowerCase()
  if (risk === 'low') {
    return 'pill-low-risk'
  }
  if (risk === 'medium') {
    return 'pill-medium-risk'
  }
  if (risk === 'high') {
    return 'pill-high-risk'
  }
  return 'pill-neutral'
}

function applyToneClass(value) {
  const recommendation = normalizeText(value).toLowerCase()
  if (recommendation.includes('very strong')) {
    return 'pill-very-strong'
  }
  if (recommendation.includes('strong')) {
    return 'pill-strong'
  }
  if (recommendation.includes('selective')) {
    return 'pill-selective'
  }
  return 'pill-neutral'
}

function formatPercent(value) {
  const normalized = normalizePercent(value)
  if (normalized === null) {
    return 'N/A'
  }
  return `${normalized}%`
}

function ExpandableText({ value, fallback = 'N/A', maxChars = 80 }) {
  const text = normalizeText(value) || fallback
  const isExpandable = text.length > maxChars
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="expandable-text">
      <p className={`expandable-copy ${!expanded && isExpandable ? 'is-clamped' : ''}`}>{text}</p>
      {isExpandable && (
        <button
          type="button"
          className="expand-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show less' : 'Expand'}
        </button>
      )}
    </div>
  )
}

function maybeLink(value) {
  const normalized = normalizeText(value)
  return normalized || ''
}

export default function JobTable({
  jobs,
  onToggleApplied,
  pendingIndex = null,
  emptyMessage = 'No jobs have been submitted yet. Run your GPT action, then refresh.',
}) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return <p className="status-text">{emptyMessage}</p>
  }

  return (
    <div className="card-grid">
      {jobs.map((job, index) => {
        const sourceIndex = job._sourceIndex ?? index
        const pending = pendingIndex === sourceIndex
        const link = maybeLink(job.link)

        return (
          <article className="job-card" key={`${link || 'job'}-${sourceIndex}`}>
            <div className="job-card-top">
              <span className="row-index">#{index + 1}</span>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="table-link">
                  View Listing
                </a>
              ) : (
                <span className="status-text">N/A</span>
              )}
            </div>

            <div className="job-headline-grid">
              <div className="data-cell">
                <p className="cell-label">Company</p>
                <ExpandableText value={job.company} maxChars={64} />
              </div>
              <div className="data-cell">
                <p className="cell-label">Job Title</p>
                <ExpandableText value={job.jobTitle} maxChars={64} />
              </div>
            </div>

            <div className="job-meta-grid">
              <div className="data-cell">
                <p className="cell-label">Location</p>
                <ExpandableText value={job.location} maxChars={62} />
              </div>
              <div className="data-cell">
                <p className="cell-label">Salary</p>
                <ExpandableText value={job.salary} maxChars={62} />
              </div>
              <div className="data-cell">
                <p className="cell-label">Citizenship Risk</p>
                <div className={`pill pill-block ${riskToneClass(job.citizenshipRisk)}`}>
                  <ExpandableText value={job.citizenshipRisk} maxChars={68} />
                </div>
              </div>
              <div className="data-cell">
                <p className="cell-label">Apply Recommendation</p>
                <div className={`pill pill-block ${applyToneClass(job.applyRecommendation)}`}>
                  <ExpandableText value={job.applyRecommendation} maxChars={68} />
                </div>
              </div>
            </div>

            <div className="job-card-bottom">
              <span className={`pill ${matchToneClass(job.overallMatchPercent)}`}>
                Match {formatPercent(job.overallMatchPercent)}
              </span>
              <label className="checkbox-wrap">
                <input
                  type="checkbox"
                  checked={job.applied === true}
                  disabled={!onToggleApplied || pending}
                  onChange={(event) => onToggleApplied?.(sourceIndex, event.target.checked)}
                />
                <span>{pending ? 'Saving...' : 'Applied'}</span>
              </label>
            </div>
          </article>
        )
      })}
    </div>
  )
}
