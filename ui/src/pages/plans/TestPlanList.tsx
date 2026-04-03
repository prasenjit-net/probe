import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { listTestPlans, deleteTestPlan } from '../../api/client'
import type { TestPlanSummary } from '../../types'

export default function TestPlanList() {
  const [plans, setPlans] = useState<TestPlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete test plan "${name}"?`)) return
    try {
      await deleteTestPlan(id)
      setPlans(prev => prev.filter(p => p.id !== id))
    } catch {
      alert('Failed to delete test plan')
    }
  }

  const filtered = plans.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Test Plans</h1>
          <Link
            to="/test-plans/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            + New Test Plan
          </Link>
        </div>

        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">No test plans yet. Create one to get started.</p>
        )}

        <div className="space-y-2">
          {filtered.map(plan => (
            <div key={plan.id} className="flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">{plan.name}</p>
                {plan.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{plan.description}</p>}
              </div>
              <span className="shrink-0 text-xs text-gray-400">{plan.step_count} step{plan.step_count !== 1 ? 's' : ''}</span>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(plan.updated_at).toLocaleDateString()}
              </span>
              <div className="flex gap-2 shrink-0">
                <Link
                  to={`/test-plans/${plan.id}/edit`}
                  className="rounded px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
                >
                  Design
                </Link>
                <button
                  onClick={() => handleDelete(plan.id, plan.name)}
                  className="rounded px-3 py-1 text-sm bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                >
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
