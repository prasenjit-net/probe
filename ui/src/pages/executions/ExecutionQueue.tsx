import { useEffect, useState, useCallback } from 'react'
import Layout from '../../components/Layout'
import { listExecutions, listTestPlans, enqueueExecution, cancelExecution } from '../../api/client'
import type { Execution, ExecutionStatus, TestPlanSummary } from '../../types'

const STATUS_STYLES: Record<ExecutionStatus, string> = {
  queued:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  running:   'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 animate-pulse',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  failed:    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

export default function ExecutionQueue() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [plans, setPlans] = useState<TestPlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [error, setError] = useState('')
  const navigate = (url: string) => window.location.href = url

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
    // Auto-refresh while any execution is running or queued
    const id = setInterval(() => {
      setExecutions(prev => {
        const hasActive = prev.some(e => e.status === 'running' || e.status === 'queued')
        if (hasActive) load()
        return prev
      })
    }, 3000)
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
      alert('Failed to cancel execution')
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Execution Queue</h1>
          <div className="flex gap-2">
            <button onClick={load} className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              ↻ Refresh
            </button>
            <button onClick={() => setShowModal(true)} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
              ▶ Run Test Plan
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
        {!loading && executions.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">No executions yet. Run a test plan to get started.</p>
        )}

        <div className="space-y-2">
          {executions.map(ex => (
            <div key={ex.id} className="flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[ex.status]}`}>
                {ex.status}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{ex.test_plan_name}</p>
                <p className="text-xs text-gray-400">
                  {ex.scheduled_at
                    ? `Scheduled: ${new Date(ex.scheduled_at).toLocaleString()}`
                    : `Created: ${new Date(ex.created_at).toLocaleString()}`}
                  {ex.started_at && ` · Started: ${new Date(ex.started_at).toLocaleString()}`}
                  {ex.completed_at && ` · Finished: ${new Date(ex.completed_at).toLocaleString()}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {ex.report_id && (
                  <button
                    onClick={() => navigate(`/reports/${ex.report_id}`)}
                    className="rounded px-3 py-1 text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                  >
                    View Report
                  </button>
                )}
                {ex.status === 'queued' && (
                  <button
                    onClick={() => handleCancel(ex.id)}
                    className="rounded px-3 py-1 text-sm bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Run modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Run Test Plan</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Test Plan</label>
              <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} className={inputCls}>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Schedule (leave empty to run immediately)
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleRun} disabled={scheduling || !selectedPlan} className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {scheduling ? 'Queuing…' : scheduleAt ? 'Schedule' : 'Run Now'}
              </button>
              <button onClick={() => setShowModal(false)} className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
