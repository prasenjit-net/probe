import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, PlayCircle, X, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Ban, FileText } from 'lucide-react'
import Layout from '../../components/Layout'
import { listExecutions, listTestPlans, enqueueExecution, cancelExecution } from '../../api/client'
import type { Execution, ExecutionStatus, TestPlanSummary } from '../../types'

const STATUS_CONFIG: Record<ExecutionStatus, { label: string; dot: string; text: string; bg: string; icon: typeof Clock }> = {
  queued:    { label: 'Queued',    dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20',   icon: Clock },
  running:   { label: 'Running',   dot: 'bg-blue-500',    text: 'text-blue-700 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-900/20',     icon: Loader2 },
  completed: { label: 'Completed', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle2 },
  failed:    { label: 'Failed',    dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20',       icon: XCircle },
  cancelled: { label: 'Cancelled', dot: 'bg-gray-400',    text: 'text-gray-500 dark:text-gray-400',     bg: 'bg-gray-100 dark:bg-gray-800',       icon: Ban },
}

function StatusBadge({ status }: { status: ExecutionStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.text} ${cfg.bg}`}>
      {status === 'running'
        ? <Icon className="w-3 h-3 animate-spin" />
        : <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      }
      {cfg.label}
    </span>
  )
}

const inp = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow'

export default function ExecutionQueue() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [plans, setPlans]           = useState<TestPlanSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [error, setError]           = useState('')
  const navigate = (url: string) => { window.location.href = url }

  const load = useCallback(async () => {
    try {
      const [execs, testPlans] = await Promise.all([listExecutions(), listTestPlans()])
      setExecutions(execs)
      setPlans(testPlans)
      if (testPlans.length > 0 && !selectedPlan) setSelectedPlan(testPlans[0].id)
    } catch {
      setError('Failed to load executions')
    } finally {
      setLoading(false)
    }
  }, [selectedPlan])

  useEffect(() => {
    load()
    const id = setInterval(() => {
      setExecutions(prev => {
        const hasActive = prev.some(e => e.status === 'running' || e.status === 'queued')
        if (hasActive) load()
        return prev
      })
    }, 5000)
    return () => clearInterval(id)
  }, [load])

  const handleRun = async () => {
    if (!selectedPlan) return
    setScheduling(true)
    try {
      await enqueueExecution({
        test_plan_id: selectedPlan,
        scheduled_at: scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
      })
      setShowModal(false); setScheduleAt('')
      await load()
    } catch {
      setError('Failed to enqueue execution')
    } finally {
      setScheduling(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelExecution(id)
      setExecutions(prev => prev.map(e => e.id === id ? { ...e, status: 'cancelled' } : e))
    } catch {
      setError('Failed to cancel execution')
    }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const activeCount = executions.filter(e => e.status === 'running' || e.status === 'queued').length

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Execution Queue</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {activeCount > 0
                ? `${activeCount} active execution${activeCount > 1 ? 's' : ''} — auto-refreshing`
                : 'Run test plans immediately or schedule for later'}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-card"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
              Refresh
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <PlayCircle className="w-4 h-4" strokeWidth={2} />
              Run Test Plan
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800">
                <div className="skeleton w-20 h-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
                <div className="skeleton w-24 h-8 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && executions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <PlayCircle className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No executions yet</p>
            <p className="text-sm text-gray-400 mt-1">Run a test plan to see executions here.</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <PlayCircle className="w-4 h-4" strokeWidth={2} />
              Run Test Plan
            </button>
          </div>
        )}

        {/* Execution list */}
        {!loading && executions.length > 0 && (
          <div className="space-y-2">
            {executions.map(ex => (
              <div
                key={ex.id}
                className="group flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 shadow-card hover:shadow-card-hover hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-150"
              >
                <StatusBadge status={ex.status} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white truncate">{ex.test_plan_name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {ex.scheduled_at
                      ? `Scheduled · ${fmtTime(ex.scheduled_at)}`
                      : `Created · ${fmtTime(ex.created_at)}`}
                    {ex.started_at && ` · Started ${fmtTime(ex.started_at)}`}
                    {ex.completed_at && ` · Finished ${fmtTime(ex.completed_at)}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  {ex.report_id && (
                    <button
                      onClick={() => navigate(`/reports/${ex.report_id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      Report
                    </button>
                  )}
                  {ex.status === 'queued' && (
                    <button
                      onClick={() => handleCancel(ex.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Run modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-modal animate-slide-up">
            <div className="px-6 pt-6 pb-5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Run Test Plan</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Execute immediately or schedule for later</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Test Plan</label>
                <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} className={inp}>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                  Schedule (leave empty to run now)
                </label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={e => setScheduleAt(e.target.value)}
                  className={inp}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleRun}
                  disabled={scheduling || !selectedPlan}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  {scheduling ? 'Queuing…' : scheduleAt ? 'Schedule' : 'Run Now'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}


