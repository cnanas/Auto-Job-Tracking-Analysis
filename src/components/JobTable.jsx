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

function cellText(value) {
  const normalized = normalizeText(value)
  return normalized || 'N/A'
}

export default function JobTable({ jobs }) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return (
      <p className="status-text">
        No jobs have been submitted yet. Run your GPT action, then refresh.
      </p>
    )
  }

  return (
    <div className="table-wrap">
      <table className="jobs-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Company</th>
            <th>Job Title</th>
            <th>Location</th>
            <th>Salary</th>
            <th>Citizenship Risk</th>
            <th>Overall Match %</th>
            <th>Apply?</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, index) => (
            <tr key={`${job.link || 'job'}-${index}`}>
              <td className="row-index">{index + 1}</td>
              <td>{cellText(job.company)}</td>
              <td>{cellText(job.jobTitle)}</td>
              <td>{cellText(job.location)}</td>
              <td>{cellText(job.salary)}</td>
              <td>
                <span className={`pill ${riskToneClass(job.citizenshipRisk)}`}>
                  {cellText(job.citizenshipRisk)}
                </span>
              </td>
              <td>
                <span className={`pill ${matchToneClass(job.overallMatchPercent)}`}>
                  {formatPercent(job.overallMatchPercent)}
                </span>
              </td>
              <td>
                <span className={`pill ${applyToneClass(job.applyRecommendation)}`}>
                  {cellText(job.applyRecommendation)}
                </span>
              </td>
              <td>
                {normalizeText(job.link) ? (
                  <a href={job.link} target="_blank" rel="noreferrer" className="table-link">
                    View
                  </a>
                ) : (
                  'N/A'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
