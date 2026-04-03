import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, Eye, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import { listReports, deleteReport } from '../../api/client'
import type { ReportSummary } from '../../types'

const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

function PassRateBar({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{pct}%</span>
    </div>
  )
}

export default function ReportList() {
  const [reports, setReports]           = useState<ReportSummary[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = async () => {
    try { setReports(await listReports()) }
    catch { setError('Failed to load reports') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteReport(deleteTarget)
      setReports(prev => prev.filter(r => r.id !== deleteTarget))
    } catch {
      setError('Failed to delete report')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            View and export test execution results
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Skeletons */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800">
                <div className="skeleton w-20 h-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
                <div className="skeleton w-32 h-4" />
                <div className="flex gap-2">
                  <div className="skeleton w-12 h-8 rounded-lg" />
                  <div className="skeleton w-14 h-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && reports.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <BarChart2 className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No reports yet</p>
            <p className="text-sm text-gray-400 mt-1">Execute a test plan to generate reports.</p>
          </div>
        )}

        {/* Report list */}
        {!loading && reports.length > 0 && (
          <div className="space-y-2">
            {reports.map(r => (
              <div
                key={r.id}
                className="group flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 shadow-card hover:shadow-card-hover hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-150"
              >
                {/* Status badge */}
                <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  r.overall_status === 'passed'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                }`}>
                  {r.overall_status === 'passed'
                    ? <CheckCircle2 className="w-3 h-3" />
                    : <XCircle className="w-3 h-3" />
                  }
                  {r.overall_status === 'passed' ? 'Passed' : 'Failed'}
                </span>

                {/* Plan name + timestamp */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white truncate">{r.test_plan_name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {fmtDate(r.started_at)} · {fmtDuration(r.duration_ms)}
                  </p>
                </div>

                {/* Pass rate */}
                <div className="w-36 hidden sm:block">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                    {r.passed_steps}/{r.total_steps} passed
                  </p>
                  <PassRateBar passed={r.passed_steps} total={r.total_steps} />
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => navigate(`/reports/${r.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    View
                  </button>
                  <button
                    onClick={() => setDeleteTarget(r.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete report"
        message="This report will be permanently removed and cannot be recovered."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Layout>
  )
}

