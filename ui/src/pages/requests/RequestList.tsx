import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2, Zap, ChevronDown, ChevronRight,
  Folder, FolderOpen, FolderPlus, Check, X, Pencil,
} from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import { listRequests, deleteRequest, listCollections, createCollection as apiCreateCollection, deleteCollection as apiDeleteCollection, updateCollection, moveRequest } from '../../api/client'
import type { HttpRequestSummary, CollectionSummary } from '../../types'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500', POST: 'bg-blue-500', PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500', DELETE: 'bg-red-500', HEAD: 'bg-purple-500', OPTIONS: 'bg-gray-500',
}

const PALETTE: Record<string, { dot: string; border: string; header: string; badge: string }> = {
  indigo:  { dot: 'bg-indigo-500',  border: 'border-l-indigo-500',  header: 'bg-indigo-50 dark:bg-indigo-900/10',  badge: 'bg-indigo-100 dark:bg-indigo-800/30 text-indigo-700 dark:text-indigo-300' },
  emerald: { dot: 'bg-emerald-500', border: 'border-l-emerald-500', header: 'bg-emerald-50 dark:bg-emerald-900/10', badge: 'bg-emerald-100 dark:bg-emerald-800/30 text-emerald-700 dark:text-emerald-300' },
  blue:    { dot: 'bg-blue-500',    border: 'border-l-blue-500',    header: 'bg-blue-50 dark:bg-blue-900/10',    badge: 'bg-blue-100 dark:bg-blue-800/30 text-blue-700 dark:text-blue-300' },
  amber:   { dot: 'bg-amber-500',   border: 'border-l-amber-500',   header: 'bg-amber-50 dark:bg-amber-900/10',   badge: 'bg-amber-100 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300' },
  rose:    { dot: 'bg-rose-500',    border: 'border-l-rose-500',    header: 'bg-rose-50 dark:bg-rose-900/10',    badge: 'bg-rose-100 dark:bg-rose-800/30 text-rose-700 dark:text-rose-300' },
  purple:  { dot: 'bg-purple-500',  border: 'border-l-purple-500',  header: 'bg-purple-50 dark:bg-purple-900/10',  badge: 'bg-purple-100 dark:bg-purple-800/30 text-purple-700 dark:text-purple-300' },
  teal:    { dot: 'bg-teal-500',    border: 'border-l-teal-500',    header: 'bg-teal-50 dark:bg-teal-900/10',    badge: 'bg-teal-100 dark:bg-teal-800/30 text-teal-700 dark:text-teal-300' },
  orange:  { dot: 'bg-orange-500',  border: 'border-l-orange-500',  header: 'bg-orange-50 dark:bg-orange-900/10',  badge: 'bg-orange-100 dark:bg-orange-800/30 text-orange-700 dark:text-orange-300' },
}
const PALETTE_KEYS = Object.keys(PALETTE)
const pal = (color: string) => PALETTE[color] ?? PALETTE.indigo

// ── Sub-components ──────────────────────────────────────────────────────────

function RequestRow({
  req, collections, onDelete, onMoved,
}: {
  req: HttpRequestSummary
  collections: CollectionSummary[]
  onDelete: (r: HttpRequestSummary) => void
  onMoved: (updated: HttpRequestSummary) => void
}) {
  const [showMove, setShowMove] = useState(false)
  const [moving, setMoving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMove) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowMove(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMove])

  const handleMove = async (collectionId: string | null) => {
    setMoving(true)
    try {
      const updated = await moveRequest(req.id, collectionId)
      onMoved(updated)
    } finally {
      setMoving(false)
      setShowMove(false)
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg bg-white dark:bg-gray-900 px-4 py-2.5 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm transition-all duration-100">
      <span className={`shrink-0 ${METHOD_COLORS[req.method] ?? 'bg-gray-500'} text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded`}>
        {req.method}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{req.name}</p>
        <p className="text-[11px] text-gray-400 font-mono truncate mt-0.5">{req.url}</p>
      </div>
      {req.assertion_count > 0 && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full">
          <Zap className="w-2.5 h-2.5" strokeWidth={2} />
          {req.assertion_count}
        </span>
      )}
      <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity items-center">
        {/* Move to collection */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setShowMove(v => !v)}
            disabled={moving}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
            title="Move to collection"
          >
            <Folder className="w-3 h-3" />
          </button>
          {showMove && (
            <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                Move to collection
              </div>
              <button
                onClick={() => handleMove(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                No collection
                {!req.collection_id && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
              </button>
              {collections.map(col => (
                <button
                  key={col.id}
                  onClick={() => handleMove(col.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${pal(col.color).dot}`} />
                  <span className="truncate">{col.name}</span>
                  {req.collection_id === col.id && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <Link
          to={`/requests/${req.id}/edit`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300 transition-colors"
        >
          <Edit2 className="w-3 h-3" />
          Edit
        </Link>
        <button
          onClick={() => onDelete(req)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  )
}

function CollectionGroup({
  collection, items, allCollections,
  onDeleteCollection, onDeleteItem, onItemMoved,
}: {
  collection: CollectionSummary
  items: HttpRequestSummary[]
  allCollections: CollectionSummary[]
  onDeleteCollection: (c: CollectionSummary) => void
  onDeleteItem: (r: HttpRequestSummary) => void
  onItemMoved: (updated: HttpRequestSummary) => void
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(collection.name)
  const [editColor, setEditColor] = useState(collection.color)
  const [saving, setSaving] = useState(false)
  const p = pal(collection.color)

  const handleRename = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await updateCollection(collection.id, { name: editName, description: collection.description, color: editColor })
      collection.name = editName
      collection.color = editColor
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${p.border}`}>
      {/* Collection header */}
      <div className={`${p.header} flex items-center gap-2 px-3 py-2`}>
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <span className="shrink-0 text-gray-500 dark:text-gray-400">
            {open ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
          </span>
          {editing ? (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
              className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          ) : (
            <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">{collection.name}</span>
          )}
          <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${p.badge}`}>
            {items.length}
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-auto" />}
        </button>
        {/* Color picker (when editing) */}
        {editing && (
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {PALETTE_KEYS.map(k => (
              <button
                key={k}
                onClick={() => setEditColor(k)}
                className={`w-4 h-4 rounded-full ${PALETTE[k].dot} ${editColor === k ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
              />
            ))}
          </div>
        )}
        {/* Actions */}
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {editing ? (
            <>
              <button onClick={handleRename} disabled={saving} className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded p-1"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1"><X className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <>
              <Link
                to={`/requests/new?collection_id=${collection.id}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-gray-800 rounded-md px-2 py-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Request
              </Link>
              <button onClick={() => { setEditName(collection.name); setEditColor(collection.color); setEditing(true) }} className="text-gray-400 hover:text-gray-600 hover:bg-white dark:hover:bg-gray-800 rounded p-1 transition-colors" title="Rename">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDeleteCollection(collection)} className="text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 rounded p-1 transition-colors" title="Delete collection">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      {open && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800 bg-white dark:bg-gray-900/50">
          {items.length === 0 ? (
            <div className="px-4 py-4 text-center text-xs text-gray-400">
              No requests yet.{' '}
              <Link to={`/requests/new?collection_id=${collection.id}`} className="text-indigo-500 hover:underline">Create one</Link>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {items.map(req => (
                <RequestRow key={req.id} req={req} collections={allCollections} onDelete={onDeleteItem} onMoved={onItemMoved} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RequestList() {
  const [requests, setRequests]     = useState<HttpRequestSummary[]>([])
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [deleteTarget, setDeleteTarget] = useState<HttpRequestSummary | null>(null)
  const [deleteCollection, setDeleteCollectionTarget] = useState<CollectionSummary | null>(null)

  // Create collection form
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newColor, setNewColor]     = useState('indigo')
  const [creating, setCreating]     = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [reqs, cols] = await Promise.all([listRequests(), listCollections('request')])
      setRequests(reqs)
      setCollections(cols)
    } catch {
      setError('Failed to load')
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

  const handleDeleteCollection = async () => {
    if (!deleteCollection) return
    try {
      await apiDeleteCollection(deleteCollection.id)
      setCollections(prev => prev.filter(c => c.id !== deleteCollection.id))
      // Also remove requests that belonged to this collection from local state
      setRequests(prev => prev.filter(r => r.collection_id !== deleteCollection.id))
    } catch {
      setError('Failed to delete collection')
    } finally {
      setDeleteCollectionTarget(null)
    }
  }

  const handleCreateCollection = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const col = await apiCreateCollection({ name: newName.trim(), color: newColor, kind: 'request' })
      setCollections(prev => [...prev, col].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setNewColor('indigo')
      setShowCreate(false)
    } catch {
      setError('Failed to create collection')
    } finally {
      setCreating(false)
    }
  }

  const handleItemMoved = (updated: HttpRequestSummary) => {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  // Group by collection
  const filtered = requests.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.url.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = new Map<string, HttpRequestSummary[]>()
  const uncollected: HttpRequestSummary[] = []
  for (const col of collections) grouped.set(col.id, [])
  for (const req of filtered) {
    if (req.collection_id && grouped.has(req.collection_id)) {
      grouped.get(req.collection_id)!.push(req)
    } else {
      uncollected.push(req)
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Request Library</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Design and manage reusable HTTP requests
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New Collection
            </button>
            <Link
              to="/requests/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New Request
            </Link>
          </div>
        </div>

        {/* Create collection inline form */}
        {showCreate && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/10 p-4 flex flex-wrap items-center gap-3">
            <FolderPlus className="w-4 h-4 text-indigo-500 shrink-0" />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateCollection(); if (e.key === 'Escape') setShowCreate(false) }}
              placeholder="Collection name…"
              autoFocus
              className="flex-1 min-w-[160px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-1.5 items-center">
              {PALETTE_KEYS.map(k => (
                <button
                  key={k}
                  onClick={() => setNewColor(k)}
                  className={`w-5 h-5 rounded-full ${PALETTE[k].dot} transition-transform ${newColor === k ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                  title={k}
                />
              ))}
            </div>
            <button
              onClick={handleCreateCollection}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search requests…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-shadow"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex justify-between">
            {error}
            <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="skeleton h-10 w-full rounded-none" />
                <div className="p-3 space-y-2">
                  {[1, 2].map(j => <div key={j} className="skeleton h-10 rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Collections */}
        {!loading && (
          <div className="space-y-4">
            {collections.map(col => (
              <CollectionGroup
                key={col.id}
                collection={col}
                items={grouped.get(col.id) ?? []}
                allCollections={collections}
                onDeleteCollection={setDeleteCollectionTarget}
                onDeleteItem={setDeleteTarget}
                onItemMoved={handleItemMoved}
              />
            ))}

            {/* Uncollected */}
            {uncollected.length > 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
                  <Folder className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-sm text-gray-500 dark:text-gray-400">Uncollected</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                    {uncollected.length}
                  </span>
                </div>
                <div className="p-2 space-y-1 bg-white dark:bg-gray-900/50">
                  {uncollected.map(req => (
                    <RequestRow key={req.id} req={req} collections={collections} onDelete={setDeleteTarget} onMoved={handleItemMoved} />
                  ))}
                </div>
              </div>
            )}

            {/* Truly empty state */}
            {collections.length === 0 && uncollected.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                  <Folder className="w-7 h-7 text-indigo-400" />
                </div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No requests yet</p>
                <p className="text-sm text-gray-400 mt-1 max-w-xs">Create a collection to organise your requests, then add HTTP requests to it.</p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    <FolderPlus className="w-4 h-4" /> New Collection
                  </button>
                  <Link to="/requests/new" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
                    <Plus className="w-4 h-4" strokeWidth={2.5} /> New Request
                  </Link>
                </div>
              </div>
            )}
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
      <ConfirmDialog
        open={!!deleteCollection}
        title="Delete collection"
        message={(() => {
          const count = requests.filter(r => r.collection_id === deleteCollection?.id).length
          const itemNote = count > 0
            ? ` ${count} request${count !== 1 ? 's' : ''} inside it will also be permanently deleted.`
            : ' No requests are inside it.'
          return `"${deleteCollection?.name}" will be permanently removed.${itemNote}`
        })()}
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteCollection}
        onCancel={() => setDeleteCollectionTarget(null)}
      />
    </Layout>
  )
}
