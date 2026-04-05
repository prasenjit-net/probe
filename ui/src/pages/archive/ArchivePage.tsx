import { useEffect, useState } from 'react'
import {
  Archive, Download, RotateCcw, Trash2, Plus, AlertTriangle,
  HardDrive, Clock, Package,
} from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import {
  listArchives, createArchive, restoreArchive, deleteArchive,
  downloadArchiveUrl, type ArchiveMeta,
} from '../../api/client'

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

type Dialog =
  | { type: 'restore'; name: string }
  | { type: 'delete'; name: string }
  | null

export default function ArchivePage() {
  const [archives, setArchives] = useState<ArchiveMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = async () => {
    try {
      setArchives(await listArchives())
    } catch {
      setError('Failed to load archives')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const clearMessages = () => { setError(''); setSuccess('') }

  const handleCreate = async () => {
    clearMessages()
    setCreating(true)
    try {
      const meta = await createArchive()
      setArchives(prev => [meta, ...prev])
      setSuccess(`Archive "${meta.name}" created successfully (${fmtBytes(meta.size_bytes)}).`)
    } catch {
      setError('Failed to create archive.')
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async () => {
    if (dialog?.type !== 'restore') return
    clearMessages()
    setRestoring(true)
    setDialog(null)
    try {
      await restoreArchive(dialog.name)
      setSuccess(`Data restored from "${dialog.name}". The application data has been fully replaced.`)
    } catch {
      setError('Restore failed. The archive may be corrupted.')
    } finally {
      setRestoring(false)
    }
  }

  const handleDelete = async () => {
    if (dialog?.type !== 'delete') return
    const name = dialog.name
    setDialog(null)
    clearMessages()
    try {
      await deleteArchive(name)
      setArchives(prev => prev.filter(a => a.name !== name))
      setSuccess(`Archive "${name}" deleted.`)
    } catch {
      setError('Failed to delete archive.')
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Data Archives</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Create ZIP snapshots of all data. Download or restore at any time.
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white shadow-sm transition-colors shrink-0"
          >
            {creating
              ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <Plus className="w-4 h-4" />
            }
            {creating ? 'Creating…' : 'Create Archive'}
          </button>
        </div>

        {/* Restore in-progress banner */}
        {restoring && (
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <span className="w-4 h-4 rounded-full border-2 border-amber-400/40 border-t-amber-500 animate-spin shrink-0" />
            Restoring data — please wait and do not refresh…
          </div>
        )}

        {/* Error / Success alerts */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {success}
          </div>
        )}

        {/* Info card */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/40 px-4 py-3 text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><HardDrive className="w-4 h-4" /> What gets archived?</p>
          <p className="text-blue-600/80 dark:text-blue-400/80">
            All application data is captured — requests, test plans, collections, specs, executions, and reports.
            Archives are stored as ZIP files in the <code className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">data/archives/</code> directory.
          </p>
          <p className="text-blue-600/80 dark:text-blue-400/80 font-medium">
            ⚠ Restoring an archive <strong>completely replaces</strong> all current data. This action cannot be undone.
          </p>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800">
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-3 w-32" />
                </div>
                <div className="flex gap-2">
                  <div className="skeleton w-24 h-8 rounded-lg" />
                  <div className="skeleton w-20 h-8 rounded-lg" />
                  <div className="skeleton w-16 h-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && archives.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <Archive className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No archives yet</p>
            <p className="text-sm text-gray-400 mt-1">Click <strong>Create Archive</strong> to snapshot your data.</p>
          </div>
        )}

        {/* Archive list */}
        {!loading && archives.length > 0 && (
          <div className="space-y-2">
            {archives.map(a => (
              <div
                key={a.name}
                className="group flex items-center gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 shadow-card hover:shadow-card-hover hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-150"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white truncate font-mono">
                    {a.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {fmtBytes(a.size_bytes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtDate(a.created_at)}
                    </span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <a
                    href={downloadArchiveUrl(a.name)}
                    download={a.name}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </a>
                  <button
                    onClick={() => setDialog({ type: 'restore', name: a.name })}
                    disabled={restoring}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                  <button
                    onClick={() => setDialog({ type: 'delete', name: a.name })}
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

      {/* Restore confirmation — extra warning */}
      <ConfirmDialog
        open={dialog?.type === 'restore'}
        title="Restore from archive?"
        message={`This will completely replace ALL current data with the contents of "${dialog?.type === 'restore' ? dialog.name : ''}". Every request, test plan, report, and execution will be overwritten. This cannot be undone.`}
        confirmLabel="Yes, restore & overwrite"
        danger
        onConfirm={handleRestore}
        onCancel={() => setDialog(null)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Delete archive?"
        message={`"${dialog?.type === 'delete' ? dialog.name : ''}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDialog(null)}
      />
    </Layout>
  )
}
