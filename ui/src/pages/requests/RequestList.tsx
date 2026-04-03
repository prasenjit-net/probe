import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { listRequests, deleteRequest } from '../../api/client'
import type { HttpRequestSummary } from '../../types'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PUT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  PATCH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  HEAD: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  OPTIONS: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
}

export default function RequestList() {
  const [requests, setRequests] = useState<HttpRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setRequests(await listRequests())
    } catch {
      setError('Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete request "${name}"?`)) return
    try {
      await deleteRequest(id)
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch {
      alert('Failed to delete request')
    }
  }

  const filtered = requests.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.url.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Library</h1>
          <Link
            to="/requests/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            + New Request
          </Link>
        </div>

        <input
          type="text"
          placeholder="Search by name or URL…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && filtered.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">No requests found. Create one to get started.</p>
        )}

        <div className="space-y-2">
          {filtered.map(req => (
            <div key={req.id} className="flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold font-mono ${METHOD_COLORS[req.method] ?? METHOD_COLORS.GET}`}>
                {req.method}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{req.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">{req.url}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">{req.assertion_count} assertion{req.assertion_count !== 1 ? 's' : ''}</span>
              <div className="flex gap-2 shrink-0">
                <Link
                  to={`/requests/${req.id}/edit`}
                  className="rounded px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(req.id, req.name)}
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
