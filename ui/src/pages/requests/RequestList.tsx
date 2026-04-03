import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, Link2, Zap } from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import { listRequests, deleteRequest } from '../../api/client'
import type { HttpRequestSummary } from '../../types'

const METHOD_COLORS: Record<string, string> = {
  GET:     'bg-emerald-500',
  POST:    'bg-blue-500',
  PUT:     'bg-amber-500',
  PATCH:   'bg-orange-500',
  DELETE:  'bg-red-500',
  HEAD:    'bg-purple-500',
  OPTIONS: 'bg-gray-500',
}

function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800">
      <div className="skeleton w-14 h-6" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-3 w-2/3" />
      </div>
      <div className="skeleton w-16 h-6 rounded-full" />
      <div className="flex gap-2">
        <div className="skeleton w-14 h-8 rounded-lg" />
        <div className="skeleton w-14 h-8 rounded-lg" />
      </div>
    </div>
  )
}

export default function RequestList() {
  const [requests, setRequests]   = useState<HttpRequestSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [deleteTarget, setDeleteTarget] = useState<HttpRequestSummary | null>(null)

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

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteRequest(deleteTarget.id)
      setRequests(prev => prev.filter(r => r.id !== deleteTarget.id))
    } catch {
      setError('Failed to delete request')
    } finally {
      setDeleteTarget(null)
    }
  }

  const filtered = requests.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.url.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 page-enter">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Request Library</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Design and manage reusable HTTP requests
            </p>
          </div>
          <Link
            to="/requests/new"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New Request
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by name or URL…"
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

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <Link2 className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
              {search ? 'No matching requests' : 'No requests yet'}
            </p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">
              {search ? 'Try a different search term.' : 'Create your first HTTP request to get started.'}
            </p>
            {!search && (
              <Link
                to="/requests/new"
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Create Request
              </Link>
            )}
          </div>
        )}

        {/* Request list */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(req => (
              <div
                key={req.id}
                className="group flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 shadow-card hover:shadow-card-hover hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-150"
              >
                <span className={`shrink-0 ${METHOD_COLORS[req.method] ?? 'bg-gray-500'} text-white text-xs font-bold font-mono px-2.5 py-1 rounded-md`}>
                  {req.method}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white truncate">{req.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate font-mono mt-0.5">{req.url}</p>
                </div>
                {req.assertion_count > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                    <Zap className="w-3 h-3" strokeWidth={2} />
                    {req.assertion_count}
                  </span>
                )}
                <div className="flex gap-2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <Link
                    to={`/requests/${req.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(req)}
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
        title="Delete request"
        message={`"${deleteTarget?.name}" will be permanently removed from your library.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Layout>
  )
}

