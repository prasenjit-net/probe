import { useEffect, useState } from 'react'
import {
  Globe, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight,
  AlertTriangle, Variable,
} from 'lucide-react'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import {
  createEnvironment, updateEnvironment, deleteEnvironment,
} from '../../api/client'
import { useEnvironment } from '../../context/EnvironmentContext'
import type { Environment } from '../../types'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// ── Key-Value editor ──────────────────────────────────────────────────────────

interface KVRow { key: string; value: string }

function KVEditor({ rows, onChange }: { rows: KVRow[]; onChange: (rows: KVRow[]) => void }) {
  const update = (i: number, field: 'key' | 'value', val: string) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
    onChange(next)
  }
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const add = () => onChange([...rows, { key: '', value: '' }])

  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-gray-400"
            placeholder="KEY"
            value={row.key}
            onChange={e => update(i, 'key', e.target.value)}
          />
          <span className="text-gray-400 text-xs shrink-0">=</span>
          <input
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-gray-400"
            placeholder="value"
            value={row.value}
            onChange={e => update(i, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(i)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium mt-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add variable
      </button>
    </div>
  )
}

// ── Env form (create / edit) ──────────────────────────────────────────────────

interface EnvFormProps {
  initial?: Environment
  onSave: (name: string, description: string, vars: Record<string, string>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function toKVRows(vars: Record<string, string>): KVRow[] {
  return Object.entries(vars).map(([key, value]) => ({ key, value }))
}

function fromKVRows(rows: KVRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, value } of rows) {
    if (key.trim()) out[key.trim()] = value
  }
  return out
}

function EnvForm({ initial, onSave, onCancel, saving }: EnvFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [rows, setRows] = useState<KVRow[]>(() => initial ? toKVRows(initial.variables) : [])

  const handleSave = async () => {
    if (!name.trim()) return
    await onSave(name.trim(), description.trim(), fromKVRows(rows))
  }

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-700/50 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input
            autoFocus
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Production, Staging, Local…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Optional"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Variables <span className="text-gray-400 font-normal">(referenced as <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{key}}'}</code> in requests)</span>
        </label>
        <KVEditor rows={rows} onChange={setRows} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving
            ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <Check className="w-3.5 h-3.5" />
          }
          {initial ? 'Save changes' : 'Create'}
        </button>
      </div>
    </div>
  )
}

// ── Env card ──────────────────────────────────────────────────────────────────

interface EnvCardProps {
  env: Environment
  isActive: boolean
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
}

function EnvCard({ env, isActive, onActivate, onEdit, onDelete }: EnvCardProps) {
  const [open, setOpen] = useState(false)
  const varCount = Object.keys(env.variables).length

  return (
    <div className={`rounded-xl border bg-white dark:bg-gray-900 shadow-card transition-all duration-150 ${
      isActive
        ? 'border-indigo-300 dark:border-indigo-600 ring-1 ring-indigo-200 dark:ring-indigo-700/50'
        : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
    }`}>
      <div className="flex items-center gap-3 p-4">
        {/* Active indicator */}
        <button
          onClick={onActivate}
          title={isActive ? 'Active environment' : 'Set as active'}
          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            isActive
              ? 'border-indigo-500 bg-indigo-500'
              : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
          }`}
        >
          {isActive && <span className="w-2 h-2 rounded-full bg-white" />}
        </button>

        {/* Icon */}
        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
          <Globe className="w-4.5 h-4.5 text-indigo-500" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[14px] text-gray-900 dark:text-white truncate">{env.name}</p>
            {isActive && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-800/40 text-indigo-600 dark:text-indigo-300 uppercase tracking-wide">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Variable className="w-3 h-3" />
              {varCount} variable{varCount !== 1 ? 's' : ''}
            </span>
            <span>· {fmtDate(env.updated_at)}</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setOpen(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={open ? 'Hide variables' : 'Show variables'}
          >
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Variable preview */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 pb-4 pt-3">
          {varCount === 0 ? (
            <p className="text-xs text-gray-400 italic">No variables defined.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(env.variables).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">{`{{${k}}}`}</span>
                  <span className="text-gray-400">=</span>
                  <span className="text-gray-600 dark:text-gray-300 truncate">{v || <em className="text-gray-300 dark:text-gray-600">empty</em>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EnvironmentsPage() {
  const { environments, activeEnvId, setActiveEnvId, reload } = useEnvironment()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { reload() }, [reload])   // refresh on mount

  const handleCreate = async (name: string, description: string, variables: Record<string, string>) => {
    setSaving(true)
    setError('')
    try {
      await createEnvironment({ name, description, variables })
      setShowCreate(false)
      await reload()
    } catch {
      setError('Failed to create environment.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string, name: string, description: string, variables: Record<string, string>) => {
    setSaving(true)
    setError('')
    try {
      await updateEnvironment(id, { name, description, variables })
      setEditingId(null)
      await reload()
    } catch {
      setError('Failed to save environment.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteEnvironment(deleteTarget)
      if (activeEnvId === deleteTarget) setActiveEnvId(null)
      setDeleteTarget(null)
      await reload()
    } catch {
      setError('Failed to delete environment.')
      setDeleteTarget(null)
    }
  }

  const deleteTargetName = environments.find(e => e.id === deleteTarget)?.name ?? ''

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Environments</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Define variable sets for different targets. The active environment is used for test-fire and executions.
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditingId(null) }}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Environment
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Usage tip */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/40 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <p className="font-semibold mb-0.5">How environments work</p>
          <p className="text-blue-600/80 dark:text-blue-400/80">
            Variables defined here can be used in any request as <code className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">{'{{key}}'}</code>.
            The <strong>active environment</strong> (the filled circle) is automatically applied when you test-fire a request or run a test plan.
            Step-level mappings override environment values.
          </p>
        </div>

        {/* Create form */}
        {showCreate && !editingId && (
          <EnvForm
            saving={saving}
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {/* List */}
        {environments.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
              <Globe className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No environments yet</p>
            <p className="text-sm text-gray-400 mt-1">Create one to start using <code className="font-mono">{'{{variables}}'}</code> in your requests.</p>
          </div>
        )}

        <div className="space-y-3">
          {environments.map(env => (
            <div key={env.id}>
              {editingId === env.id ? (
                <EnvForm
                  initial={env}
                  saving={saving}
                  onSave={(name, description, variables) => handleUpdate(env.id, name, description, variables)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <EnvCard
                  env={env}
                  isActive={activeEnvId === env.id}
                  onActivate={() => setActiveEnvId(activeEnvId === env.id ? null : env.id)}
                  onEdit={() => { setEditingId(env.id); setShowCreate(false) }}
                  onDelete={() => setDeleteTarget(env.id)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete environment?"
        message={`"${deleteTargetName}" and all its variables will be permanently removed. Test plans that relied on these variables may fail.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Layout>
  )
}
