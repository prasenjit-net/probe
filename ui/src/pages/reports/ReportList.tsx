import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { listReports, deleteReport } from '../../api/client'
import type { ReportSummary } from '../../types'

export default function ReportList() {
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const load = async () => {
    try { setReports(await listReports()) }
    catch { setError('Failed to load reports') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report?')) return
    try {
      await deleteReport(id)
      setReports(prev => prev.filter(r => r.id !== id))
    } catch { alert('Failed to delete report') }
  }

  const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!loading && reports.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">No reports yet. Execute a test plan to generate one.</p>
        )}
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${r.overall_status === 'passed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}`}>
                {r.overall_status === 'passed' ? '✓ PASSED' : '✗ FAILED'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{r.test_plan_name}</p>
                <p className="text-xs text-gray-400">
                  {new Date(r.started_at).toLocaleString()} · {fmtDuration(r.duration_ms)} ·{' '}
                  <span className="text-green-600 dark:text-green-400">{r.passed_steps} passed</span>
                  {r.failed_steps > 0 && <span className="text-red-500"> · {r.failed_steps} failed</span>}
                  {' '}/ {r.total_steps} steps
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => navigate(`/reports/${r.id}`)} className="rounded px-3 py-1 text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors">
                  View
                </button>
                <button onClick={() => handleDelete(r.id)} className="rounded px-3 py-1 text-sm bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
