import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import Layout from '../../components/Layout'
import { getTestPlan, createTestPlan, updateTestPlan, listRequests } from '../../api/client'
import type { TestPlanStep, ExtractVariable, HttpRequestSummary, VariableSource } from '../../types'

// ── Constants ──────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET:     'bg-emerald-500',
  POST:    'bg-blue-500',
  PUT:     'bg-amber-500',
  PATCH:   'bg-orange-500',
  DELETE:  'bg-red-500',
  HEAD:    'bg-purple-500',
  OPTIONS: 'bg-gray-500',
}

const METHOD_BORDER: Record<string, string> = {
  GET:     'border-l-emerald-400',
  POST:    'border-l-blue-400',
  PUT:     'border-l-amber-400',
  PATCH:   'border-l-orange-400',
  DELETE:  'border-l-red-400',
  HEAD:    'border-l-purple-400',
  OPTIONS: 'border-l-gray-400',
}

const emptyExtract = (): ExtractVariable => ({ var_name: '', path: '$', source: 'response_body' })

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepCard({
  step, index, total, reqInfo, isExpanded,
  onToggleExpand, onUpdate, onMove, onRemove,
  onAddExtract, onUpdateExtract, onRemoveExtract,
}: {
  step: TestPlanStep
  index: number
  total: number
  reqInfo?: HttpRequestSummary
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdate: (patch: Partial<TestPlanStep>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onAddExtract: () => void
  onUpdateExtract: (idx: number, patch: Partial<ExtractVariable>) => void
  onRemoveExtract: (idx: number) => void
}) {
  const method = reqInfo?.method ?? 'GET'
  const borderColor = METHOD_BORDER[method] ?? 'border-l-gray-400'

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${borderColor} bg-white dark:bg-gray-800 shadow-sm overflow-hidden transition-opacity ${!step.enabled ? 'opacity-50' : ''}`}>
      {/* Step header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Step number */}
        <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">
          {index + 1}
        </div>

        {/* Editable step name */}
        <input
          value={step.name}
          onChange={e => onUpdate({ name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-900 dark:text-white focus:outline-none placeholder-gray-300"
          placeholder="Step name…"
        />

        {/* Method + URL pill */}
        {reqInfo && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 max-w-xs">
            <span className={`${METHOD_COLORS[method]} text-white text-xs font-bold px-2 py-0.5 rounded font-mono`}>
              {method}
            </span>
            <span className="text-xs text-gray-400 font-mono truncate">{reqInfo.url}</span>
          </div>
        )}

        {/* Enable toggle */}
        <label className="shrink-0 flex items-center gap-1.5 cursor-pointer group" title={step.enabled ? 'Disable step' : 'Enable step'}>
          <div className={`relative w-8 h-4 rounded-full transition-colors ${step.enabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${step.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <input type="checkbox" checked={step.enabled} onChange={e => onUpdate({ enabled: e.target.checked })} className="sr-only" />
        </label>

        {/* Reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="w-5 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors text-xs">▲</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="w-5 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors text-xs">▼</button>
        </div>

        {/* Variables toggle */}
        <button
          onClick={onToggleExpand}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            isExpanded
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
              : step.extract_variables.length > 0
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          ⇉ {step.extract_variables.length > 0 ? `${step.extract_variables.length} var${step.extract_variables.length > 1 ? 's' : ''}` : 'Variables'}
        </button>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
        >
          ×
        </button>
      </div>

      {/* Variable extraction panel */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Variable Extraction</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Capture values from this response to use as <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded font-mono text-indigo-600 dark:text-indigo-400">{`{{variableName}}`}</code> in later steps.
              </p>
            </div>
            <button
              onClick={onAddExtract}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg transition-colors"
            >
              + Extract
            </button>
          </div>

          {step.extract_variables.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-1">No extractions. Click "+ Extract" to capture a value.</p>
          ) : (
            <div className="space-y-2">
              {/* Column labels */}
              <div className="grid grid-cols-[100px_140px_1fr_28px] gap-2 px-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Variable</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Source</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Path / Key</span>
                <span />
              </div>
              {step.extract_variables.map((ev, evIdx) => (
                <div key={evIdx} className="grid grid-cols-[100px_140px_1fr_28px] gap-2 items-center group">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs font-mono pointer-events-none">{`{{`}</span>
                    <input
                      value={ev.var_name}
                      onChange={e => onUpdateExtract(evIdx, { var_name: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 pl-7 pr-2 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="token"
                    />
                  </div>
                  <select
                    value={ev.source}
                    onChange={e => onUpdateExtract(evIdx, { source: e.target.value as VariableSource })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="response_body">📄 Response Body</option>
                    <option value="response_header">📋 Response Header</option>
                    <option value="status_code">🔢 Status Code</option>
                  </select>
                  <input
                    value={ev.path}
                    onChange={e => onUpdateExtract(evIdx, { path: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={ev.source === 'response_header' ? 'authorization' : ev.source === 'status_code' ? '—' : '$.data.token'}
                    disabled={ev.source === 'status_code'}
                  />
                  <button
                    onClick={() => onRemoveExtract(evIdx)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Connector line between steps ───────────────────────────────────────────────
function StepConnector() {
  return (
    <div className="flex items-center justify-center h-5 my-0.5">
      <div className="w-px h-full bg-gray-300 dark:bg-gray-600" />
    </div>
  )
}

// ── Request picker modal ───────────────────────────────────────────────────────
function RequestPicker({
  requests, onAdd, onClose,
}: {
  requests: HttpRequestSummary[]
  onAdd: (r: HttpRequestSummary) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = requests.filter(
    r => r.name.toLowerCase().includes(search.toLowerCase()) ||
         r.url.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Add Request to Plan</h3>
            <p className="text-xs text-gray-400 mt-0.5">{requests.length} request{requests.length !== 1 ? 's' : ''} in library</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xl">×</button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              autoFocus
              type="text"
              placeholder="Search by name or URL…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="px-5 pb-5 max-h-96 overflow-y-auto space-y-1.5 mt-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <span className="text-3xl mb-2">🔗</span>
              <p className="text-sm font-medium">No requests found</p>
              <p className="text-xs mt-1">Create requests in the Request Library first.</p>
            </div>
          ) : (
            filtered.map(req => (
              <button
                key={req.id}
                onClick={() => onAdd(req)}
                className="w-full flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:hover:border-indigo-600 transition-colors group"
              >
                <span className={`shrink-0 ${METHOD_COLORS[req.method] ?? 'bg-gray-500'} text-white text-xs font-bold px-2.5 py-1 rounded font-mono`}>
                  {req.method}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">{req.name}</p>
                  <p className="text-xs text-gray-400 truncate font-mono mt-0.5">{req.url}</p>
                </div>
                {req.assertion_count > 0 && (
                  <span className="shrink-0 text-xs text-gray-400">{req.assertion_count} assertion{req.assertion_count > 1 ? 's' : ''}</span>
                )}
                <span className="shrink-0 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">＋</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TestPlanDesigner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [name, setName]                     = useState('')
  const [description, setDescription]       = useState('')
  const [steps, setSteps]                   = useState<TestPlanStep[]>([])
  const [requestLibrary, setRequestLibrary] = useState<HttpRequestSummary[]>([])
  const [showPicker, setShowPicker]         = useState(false)
  const [expandedStep, setExpandedStep]     = useState<string | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

  useEffect(() => {
    listRequests().then(setRequestLibrary).catch(() => {})
    if (!id) return
    getTestPlan(id).then(plan => {
      setName(plan.name)
      setDescription(plan.description)
      setSteps(plan.steps.map(s => ({
        id: s.id, request_id: s.request_id, name: s.name,
        enabled: s.enabled, extract_variables: s.extract_variables,
      })))
    }).catch(() => setError('Failed to load test plan'))
  }, [id])

  const addStep = (req: HttpRequestSummary) => {
    setSteps(prev => [...prev, {
      id: uuidv4(), request_id: req.id, name: req.name,
      enabled: true, extract_variables: [],
    }])
    setShowPicker(false)
  }

  const removeStep = (stepId: string) => setSteps(prev => prev.filter(s => s.id !== stepId))

  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...steps]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSteps(next)
  }

  const updateStep = (stepId: string, patch: Partial<TestPlanStep>) =>
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s))

  const addExtract = (stepId: string) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, extract_variables: [...s.extract_variables, emptyExtract()] } : s))

  const updateExtract = (stepId: string, idx: number, patch: Partial<ExtractVariable>) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, extract_variables: s.extract_variables.map((e, i) => i === idx ? { ...e, ...patch } : e) } : s))

  const removeExtract = (stepId: string, idx: number) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, extract_variables: s.extract_variables.filter((_, i) => i !== idx) } : s))

  const handleSave = async () => {
    if (!name.trim()) { setError('Plan name is required'); return }
    setSaving(true); setError('')
    try {
      if (isEdit && id) await updateTestPlan(id, { name, description, steps })
      else await createTestPlan({ name, description, steps })
      navigate('/test-plans')
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const enabledCount = steps.filter(s => s.enabled).length

  return (
    <Layout>
      <div className="flex flex-col h-full space-y-0 -m-6">

        {/* ── Sticky top bar ────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/test-plans')}
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              ←
            </button>

            <div className="flex-1 min-w-0">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Test plan name…"
                className="w-full bg-transparent text-base font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              />
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add a description (optional)"
                className="w-full bg-transparent text-xs text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none mt-0.5"
              />
            </div>

            {/* Step stats */}
            {steps.length > 0 && (
              <div className="shrink-0 hidden sm:flex items-center gap-3 text-xs text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5">
                <span><b className="text-gray-700 dark:text-gray-200">{steps.length}</b> steps</span>
                <span className="text-gray-200 dark:text-gray-600">|</span>
                <span><b className="text-indigo-600 dark:text-indigo-400">{enabledCount}</b> enabled</span>
              </div>
            )}

            {error && (
              <span className="shrink-0 text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">
                ⚠ {error}
              </span>
            )}

            <button
              onClick={() => navigate('/test-plans')}
              className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Save Plan'}
            </button>
          </div>
        </div>

        {/* ── Steps area ───────────────────────────────────────────────────── */}
        <div className="px-6 py-5 flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto space-y-0">

            {/* Empty state */}
            {steps.length === 0 && (
              <div
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-20 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors group"
                onClick={() => setShowPicker(true)}
              >
                <span className="text-5xl mb-4">🔗</span>
                <p className="text-base font-semibold text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Add your first step</p>
                <p className="text-sm text-gray-400 mt-1">Click to pick a request from your library</p>
              </div>
            )}

            {/* Step list with connectors */}
            {steps.map((step, idx) => (
              <div key={step.id}>
                <StepCard
                  step={step}
                  index={idx}
                  total={steps.length}
                  reqInfo={requestLibrary.find(r => r.id === step.request_id)}
                  isExpanded={expandedStep === step.id}
                  onToggleExpand={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  onUpdate={patch => updateStep(step.id, patch)}
                  onMove={dir => moveStep(idx, dir)}
                  onRemove={() => removeStep(step.id)}
                  onAddExtract={() => addExtract(step.id)}
                  onUpdateExtract={(evIdx, patch) => updateExtract(step.id, evIdx, patch)}
                  onRemoveExtract={evIdx => removeExtract(step.id, evIdx)}
                />
                {idx < steps.length - 1 && <StepConnector />}
              </div>
            ))}

            {/* Add step button (when steps exist) */}
            {steps.length > 0 && (
              <div className="flex justify-center pt-3">
                <button
                  onClick={() => setShowPicker(true)}
                  className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-6 py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors"
                >
                  <span className="text-lg leading-none">+</span>
                  Add Step
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request picker modal */}
      {showPicker && (
        <RequestPicker
          requests={requestLibrary}
          onAdd={addStep}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Layout>
  )
}


