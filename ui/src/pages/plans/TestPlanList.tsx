import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, Trash2, ClipboardList, Play } from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import { listTestPlans, deleteTestPlan, enqueueExecution } from '../../api/client'
import type { TestPlanSummary } from '../../types'

function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800">
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-3 w-1/2" />
      </div>
      <div className="skeleton w-16 h-6 rounded-full" />
      <div className="skeleton w-20 h-5 rounded-md" />
      <div className="flex gap-2">
        <div className="skeleton w-16 h-8 rounded-lg" />
        <div className="skeleton w-14 h-8 rounded-lg" />
      </div>
    </div>
  )
}

export default function TestPlanList() {
  const navigate = useNavigate()
  const [plans, setPlans]               = useState<TestPlanSummary[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [search, setSearch]             = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TestPlanSummary | null>(null)
  const [executing, setExecuting]       = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setPlans(await listTestPlans())
    } catch {
      setError('Failed to load test plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteTestPlan(deleteTarget.id)
      setPlans(prev => prev.filter(p => p.id !== deleteTarget.id))
    } catch {
      setError('Failed to delete test plan')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleExecute = async (plan: TestPlanSummary) => {
    setExecuting(plan.id)
    try {
      await enqueueExecution({ test_plan_id: plan.id })
      navigate('/executions')
    } catch {
      setError(`Failed to queue execution for "${plan.name}"`)
      setExecuting(null)
    }
  }

  const filtered = plans.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Test Plans</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sequence requests into automated test flows
            </p>
          </div>
          <Link
            to="/test-plans/new"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New Test Plan
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-card transition-shadow"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Skeletons */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <ClipboardList className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
              {search ? 'No matching test plans' : 'No test plans yet'}
            </p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">
              {search ? 'Try a different search term.' : 'Create a test plan to chain requests into a regression suite.'}
            </p>
            {!search && (
              <Link
                to="/test-plans/new"
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Create Test Plan
              </Link>
            )}
          </div>
        )}

        {/* Plan list */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(plan => (
              <div
                key={plan.id}
                className="group flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 shadow-card hover:shadow-card-hover hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-150"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{plan.name}</p>
                  {plan.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{plan.description}</p>
                  )}
                </div>

                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  {plan.step_count} step{plan.step_count !== 1 ? 's' : ''}
                </span>

                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                  {fmtDate(plan.updated_at)}
                </span>

                <div className="flex gap-2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleExecute(plan)}
                    disabled={executing === plan.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors"
                  >
                    <Play className="w-3 h-3" fill="currentColor" />
                    {executing === plan.id ? 'Queuing…' : 'Execute'}
                  </button>
                  <Link
                    to={`/test-plans/${plan.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Design
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(plan)}
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
        title="Delete test plan"
        message={`"${deleteTarget?.name}" and all its configuration will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Layout>
  )
}

