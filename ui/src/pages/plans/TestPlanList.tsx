import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Pencil, Trash2, ClipboardList, Play, ChevronDown, ChevronRight,
  Folder, FolderOpen, FolderPlus, Check, X,
} from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import { listTestPlans, deleteTestPlan, enqueueExecution, listCollections, createCollection, deleteCollection, updateCollection, moveTestPlan } from '../../api/client'
import type { TestPlanSummary, CollectionSummary } from '../../types'

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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// ── PlanRow ──────────────────────────────────────────────────────────────────

function PlanRow({
  plan, collections, executing, onExecute, onDelete, onMoved,
}: {
  plan: TestPlanSummary
  collections: CollectionSummary[]
  executing: string | null
  onExecute: (p: TestPlanSummary) => void
  onDelete: (p: TestPlanSummary) => void
  onMoved: (updated: TestPlanSummary) => void
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
      const updated = await moveTestPlan(plan.id, collectionId)
      onMoved(updated)
    } finally {
      setMoving(false)
      setShowMove(false)
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg bg-white dark:bg-gray-900 px-4 py-2.5 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm transition-all duration-100">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{plan.name}</p>
        {plan.description && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{plan.description}</p>
        )}
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
        {plan.step_count} step{plan.step_count !== 1 ? 's' : ''}
      </span>
      <span className="shrink-0 text-[11px] text-gray-400 hidden sm:block">{fmtDate(plan.updated_at)}</span>

      <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity items-center">
        {/* Move to collection */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setShowMove(v => !v)}
            disabled={moving}
            className="inline-flex items-center rounded-md px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
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
                {!plan.collection_id && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
              </button>
              {collections.map(col => (
                <button
                  key={col.id}
                  onClick={() => handleMove(col.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${pal(col.color).dot}`} />
                  <span className="truncate">{col.name}</span>
                  {plan.collection_id === col.id && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onExecute(plan)}
          disabled={executing === plan.id}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 transition-colors font-medium"
        >
          <Play className="w-3 h-3" fill="currentColor" />
          {executing === plan.id ? '…' : 'Run'}
        </button>
        <Link
          to={`/test-plans/${plan.id}/edit`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Design
        </Link>
        <button
          onClick={() => onDelete(plan)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  )
}

// ── CollectionGroup ──────────────────────────────────────────────────────────

function CollectionGroup({
  collection, items, collections, executing, onExecute, onDeleteCollection, onDeleteItem, onItemMoved,
}: {
  collection: CollectionSummary
  items: TestPlanSummary[]
  collections: CollectionSummary[]
  executing: string | null
  onExecute: (p: TestPlanSummary) => void
  onDeleteCollection: (c: CollectionSummary) => void
  onDeleteItem: (p: TestPlanSummary) => void
  onItemMoved: (updated: TestPlanSummary) => void
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
        {editing && (
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {PALETTE_KEYS.map(k => (
              <button key={k} onClick={() => setEditColor(k)}
                className={`w-4 h-4 rounded-full ${PALETTE[k].dot} ${editColor === k ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />
            ))}
          </div>
        )}
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {editing ? (
            <>
              <button onClick={handleRename} disabled={saving} className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded p-1"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1"><X className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <>
              <Link
                to={`/test-plans/new?collection_id=${collection.id}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-gray-800 rounded-md px-2 py-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Plan
              </Link>
              <button onClick={() => { setEditName(collection.name); setEditColor(collection.color); setEditing(true) }} className="text-gray-400 hover:text-gray-600 hover:bg-white dark:hover:bg-gray-800 rounded p-1 transition-colors" title="Rename">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDeleteCollection(collection)} className="text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 rounded p-1 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="bg-white dark:bg-gray-900/50">
          {items.length === 0 ? (
            <div className="px-4 py-4 text-center text-xs text-gray-400">
              No plans yet.{' '}
              <Link to={`/test-plans/new?collection_id=${collection.id}`} className="text-indigo-500 hover:underline">Create one</Link>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {items.map(plan => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  collections={collections}
                  executing={executing}
                  onExecute={onExecute}
                  onDelete={onDeleteItem}
                  onMoved={onItemMoved}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TestPlanList() {
  const navigate = useNavigate()
  const [plans, setPlans]             = useState<TestPlanSummary[]>([])
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState('')
  const [deleteTarget, setDeleteTarget]   = useState<TestPlanSummary | null>(null)
  const [deleteColTarget, setDeleteColTarget] = useState<CollectionSummary | null>(null)
  const [executing, setExecuting]     = useState<string | null>(null)

  const [showCreate, setShowCreate]   = useState(false)
  const [newName, setNewName]         = useState('')
  const [newColor, setNewColor]       = useState('indigo')
  const [creating, setCreating]       = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [ps, cols] = await Promise.all([listTestPlans(), listCollections('plan')])
      setPlans(ps)
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
      await deleteTestPlan(deleteTarget.id)
      setPlans(prev => prev.filter(p => p.id !== deleteTarget.id))
    } catch {
      setError('Failed to delete test plan')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleDeleteCol = async () => {
    if (!deleteColTarget) return
    try {
      await deleteCollection(deleteColTarget.id)
      setCollections(prev => prev.filter(c => c.id !== deleteColTarget.id))
      // Also remove plans that belonged to this collection from local state
      setPlans(prev => prev.filter(p => p.collection_id !== deleteColTarget.id))
    } catch {
      setError('Failed to delete collection')
    } finally {
      setDeleteColTarget(null)
    }
  }

  const handleCreateCollection = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const col = await createCollection({ name: newName.trim(), color: newColor, kind: 'plan' })
      setCollections(prev => [...prev, col].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName(''); setNewColor('indigo'); setShowCreate(false)
    } catch {
      setError('Failed to create collection')
    } finally {
      setCreating(false)
    }
  }

  const handleExecute = async (plan: TestPlanSummary) => {
    setExecuting(plan.id)
    try {
      await enqueueExecution({ test_plan_id: plan.id })
      navigate('/executions')
    } catch {
      setError(`Failed to queue "${plan.name}"`)
      setExecuting(null)
    }
  }

  const handleItemMoved = (updated: TestPlanSummary) => {
    setPlans(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  const filtered = plans.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const grouped = new Map<string, TestPlanSummary[]>()
  const uncollected: TestPlanSummary[] = []
  for (const col of collections) grouped.set(col.id, [])
  for (const plan of filtered) {
    if (plan.collection_id && grouped.has(plan.collection_id)) {
      grouped.get(plan.collection_id)!.push(plan)
    } else {
      uncollected.push(plan)
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Test Plans</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Sequence requests into automated test flows</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <FolderPlus className="w-4 h-4" /> New Collection
            </button>
            <Link
              to="/test-plans/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} /> New Test Plan
            </Link>
          </div>
        </div>

        {/* Create collection form */}
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
                <button key={k} onClick={() => setNewColor(k)}
                  className={`w-5 h-5 rounded-full ${PALETTE[k].dot} ${newColor === k ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'} transition-transform`} />
              ))}
            </div>
            <button onClick={handleCreateCollection} disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <Check className="w-3.5 h-3.5" /> Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search plans…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-shadow"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex justify-between">
            {error}<button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="skeleton h-10 w-full rounded-none" />
                <div className="p-3 space-y-2">{[1, 2].map(j => <div key={j} className="skeleton h-10 rounded-lg" />)}</div>
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
                collections={collections}
                executing={executing}
                onExecute={handleExecute}
                onDeleteCollection={setDeleteColTarget}
                onDeleteItem={setDeleteTarget}
                onItemMoved={handleItemMoved}
              />
            ))}

            {uncollected.length > 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
                  <Folder className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-sm text-gray-500 dark:text-gray-400">Uncollected</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-medium">{uncollected.length}</span>
                </div>
                <div className="p-2 space-y-1 bg-white dark:bg-gray-900/50">
                  {uncollected.map(plan => (
                    <PlanRow key={plan.id} plan={plan} collections={collections} executing={executing}
                      onExecute={handleExecute} onDelete={setDeleteTarget} onMoved={handleItemMoved} />
                  ))}
                </div>
              </div>
            )}

            {collections.length === 0 && uncollected.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                  <ClipboardList className="w-7 h-7 text-indigo-400" />
                </div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No test plans yet</p>
                <p className="text-sm text-gray-400 mt-1 max-w-xs">Create a collection to organise your test plans, then add plans to it.</p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    <FolderPlus className="w-4 h-4" /> New Collection
                  </button>
                  <Link to="/test-plans/new" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
                    <Plus className="w-4 h-4" strokeWidth={2.5} /> New Test Plan
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete test plan"
        message={`"${deleteTarget?.name}" and all its configuration will be permanently removed.`}
        confirmLabel="Delete" danger
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteColTarget}
        title="Delete collection"
        message={(() => {
          const count = plans.filter(p => p.collection_id === deleteColTarget?.id).length
          const itemNote = count > 0
            ? ` ${count} test plan${count !== 1 ? 's' : ''} inside it will also be permanently deleted.`
            : ' No test plans are inside it.'
          return `"${deleteColTarget?.name}" will be permanently removed.${itemNote}`
        })()}
        confirmLabel="Delete" danger
        onConfirm={handleDeleteCol} onCancel={() => setDeleteColTarget(null)}
      />
    </Layout>
  )
}
