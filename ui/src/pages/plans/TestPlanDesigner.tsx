import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { ArrowDownToLine, ArrowUpFromLine, Play } from 'lucide-react'
import Layout from '../../components/Layout'
import { getTestPlan, createTestPlan, updateTestPlan, listRequests, getRequest, enqueueExecution } from '../../api/client'
import type {
  TestPlanStep, ExtractVariable, HttpRequest, HttpRequestSummary,
  VariableMapping, InputVariable,
} from '../../types'

// ── Constants ──────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500', POST: 'bg-blue-500', PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500', DELETE: 'bg-red-500', HEAD: 'bg-purple-500', OPTIONS: 'bg-gray-500',
}
const METHOD_BORDER: Record<string, string> = {
  GET: 'border-l-emerald-400', POST: 'border-l-blue-400', PUT: 'border-l-amber-400',
  PATCH: 'border-l-orange-400', DELETE: 'border-l-red-400', HEAD: 'border-l-purple-400', OPTIONS: 'border-l-gray-400',
}

// ── Available output variable shape ───────────────────────────────────────────

interface AvailableVar {
  step_id: string
  step_name: string
  step_index: number
  var_name: string
}

// ── Variable Selector ─────────────────────────────────────────────────────────

function VariableSelector({
  value, available, onChange, onClose,
}: {
  value: string
  available: AvailableVar[]
  onChange: (av: AvailableVar) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = available.filter(av =>
    av.var_name.toLowerCase().includes(search.toLowerCase()) ||
    av.step_name.toLowerCase().includes(search.toLowerCase())
  )

  // Group by step
  const grouped = filtered.reduce<Record<string, AvailableVar[]>>((acc, av) => {
    const key = `Step ${av.step_index + 1}: ${av.step_name}`
    ;(acc[key] ??= []).push(av)
    return acc
  }, {})

  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 w-72 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-hidden">
      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search variables…"
          className="w-full rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No available output variables from prior steps.</p>
        ) : (
          Object.entries(grouped).map(([groupLabel, vars]) => (
            <div key={groupLabel}>
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/60">
                {groupLabel}
              </div>
              {vars.map(av => (
                <button
                  key={`${av.step_id}-${av.var_name}`}
                  onClick={() => onChange(av)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors ${
                    value === av.var_name ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200">{av.var_name}</span>
                  <span className="ml-auto text-[10px] text-gray-400">from step {av.step_index + 1}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Mapping Row ────────────────────────────────────────────────────────────────

function MappingRow({
  varName, mapping, available, onChange, onRemove,
}: {
  varName: string
  mapping: VariableMapping | undefined
  available: AvailableVar[]
  onChange: (m: VariableMapping) => void
  onRemove: () => void
}) {
  const [showSelector, setShowSelector] = useState(false)
  const isConstant = !mapping || mapping.source.kind === 'constant'
  const constantVal = mapping?.source.kind === 'constant' ? mapping.source.value : ''
  const stepOutputSource = mapping?.source.kind === 'step_output' ? mapping.source : null

  const setConstant = (value: string) =>
    onChange({ var_name: varName, source: { kind: 'constant', value } })

  const setStepOutput = (av: AvailableVar) => {
    onChange({ var_name: varName, source: { kind: 'step_output', step_id: av.step_id, step_name: av.step_name, var_name: av.var_name } })
    setShowSelector(false)
  }

  return (
    <div className="flex items-center gap-2 group">
      {/* Var name */}
      <div className="w-32 shrink-0">
        <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-mono font-semibold px-2 py-1 rounded-lg">
          <span className="text-blue-400">{`{{`}</span>{varName}<span className="text-blue-400">{`}}`}</span>
        </span>
      </div>

      {/* Source toggle pills */}
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => setConstant(constantVal)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            isConstant
              ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Constant
        </button>
        <button
          onClick={() => !isConstant ? undefined : onChange({ var_name: varName, source: { kind: 'step_output', step_id: '', step_name: '', var_name: '' } })}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            !isConstant
              ? 'bg-emerald-600 text-white'
              : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Step Output
        </button>
      </div>

      {/* Value input */}
      <div className="flex-1 min-w-0 relative">
        {isConstant ? (
          <input
            value={constantVal}
            onChange={e => setConstant(e.target.value)}
            placeholder="Enter constant value…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowSelector(s => !s)}
              className={`w-full flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                stepOutputSource?.var_name
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                  : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-emerald-400 hover:text-emerald-600'
              }`}
            >
              {stepOutputSource?.var_name ? (
                <>
                  <span className="font-mono font-medium flex-1 text-left">{stepOutputSource.var_name}</span>
                  <span className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60 shrink-0">from {stepOutputSource.step_name}</span>
                </>
              ) : (
                <>
                  <span className="flex-1 text-left">Select output variable…</span>
                  <span className="text-xs shrink-0">▾</span>
                </>
              )}
            </button>
            {showSelector && (
              <VariableSelector
                value={stepOutputSource?.var_name ?? ''}
                available={available}
                onChange={setStepOutput}
                onClose={() => setShowSelector(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 text-sm"
      >
        ×
      </button>
    </div>
  )
}

// ── StepCard ──────────────────────────────────────────────────────────────────

function StepCard({
  step, index, total, reqInfo, isExpanded,
  inputVarDefs, outputVarDefs, availableOutputs,
  onToggleExpand, onUpdate, onMove, onRemove,
  onUpdateMapping, onRemoveMapping,
}: {
  step: TestPlanStep
  index: number
  total: number
  reqInfo?: HttpRequestSummary
  isExpanded: boolean
  inputVarDefs: InputVariable[]
  outputVarDefs: ExtractVariable[]
  availableOutputs: AvailableVar[]
  onToggleExpand: () => void
  onUpdate: (patch: Partial<TestPlanStep>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onUpdateMapping: (m: VariableMapping) => void
  onRemoveMapping: (varName: string) => void
}) {
  const [activePanel, setActivePanel] = useState<'mappings' | 'outputs'>('mappings')
  const method = reqInfo?.method ?? 'GET'
  const borderColor = METHOD_BORDER[method] ?? 'border-l-gray-400'
  const mappingCount = step.variable_mappings.length
  const outputCount = outputVarDefs.length
  const totalVarCount = mappingCount + outputCount

  const getMappingFor = (varName: string) =>
    step.variable_mappings.find(m => m.var_name === varName)

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${borderColor} bg-white dark:bg-gray-800 shadow-sm transition-opacity ${!step.enabled ? 'opacity-50' : ''}`}>
      {/* Step header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">
          {index + 1}
        </div>
        <input
          value={step.name}
          onChange={e => onUpdate({ name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-900 dark:text-white focus:outline-none placeholder-gray-300"
          placeholder="Step name…"
        />
        {reqInfo && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 max-w-xs">
            <span className={`${METHOD_COLORS[method]} text-white text-xs font-bold px-2 py-0.5 rounded font-mono`}>{method}</span>
            <span className="text-xs text-gray-400 font-mono truncate">{reqInfo.url}</span>
          </div>
        )}
        {/* Enable toggle */}
        <label className="shrink-0 flex items-center gap-1.5 cursor-pointer" title={step.enabled ? 'Disable step' : 'Enable step'}>
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
        {/* Variables panel toggle */}
        <button
          onClick={onToggleExpand}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            isExpanded
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
              : totalVarCount > 0
              ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-700'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          ⇉ {totalVarCount > 0 ? `${totalVarCount} var${totalVarCount > 1 ? 's' : ''}` : 'Variables'}
        </button>
        {/* Remove */}
        <button onClick={onRemove} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">×</button>
      </div>

      {/* Variable panel */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-700 px-4">
            <button
              onClick={() => setActivePanel('mappings')}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activePanel === 'mappings'
                  ? 'border-blue-500 text-blue-700 dark:text-blue-300'
                  : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <ArrowDownToLine className="w-3 h-3" />
              Input Mappings
              {mappingCount > 0 && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-bold">{mappingCount}</span>}
            </button>
            <button
              onClick={() => setActivePanel('outputs')}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activePanel === 'outputs'
                  ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300'
                  : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <ArrowUpFromLine className="w-3 h-3" />
              Output Variables
              {outputCount > 0 && <span className="ml-1 text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">{outputCount}</span>}
            </button>
          </div>

          {/* Input Mappings panel */}
          {activePanel === 'mappings' && (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs text-gray-400 mb-3">
                Map values to the <span className="text-blue-600 dark:text-blue-400 font-mono">{`{{placeholders}}`}</span> used in this request's URL, headers, and body.
              </p>

              {/* Existing mappings for vars NOT in request definition */}
              {step.variable_mappings.filter(m => !inputVarDefs.find(iv => iv.name === m.var_name)).map(m => (
                <MappingRow
                  key={m.var_name}
                  varName={m.var_name}
                  mapping={m}
                  available={availableOutputs}
                  onChange={onUpdateMapping}
                  onRemove={() => onRemoveMapping(m.var_name)}
                />
              ))}

              {/* Input variable definitions from request */}
              {inputVarDefs.length > 0 ? (
                <div className="space-y-2">
                  {inputVarDefs.map(iv => (
                    <div key={iv.name}>
                      <MappingRow
                        varName={iv.name}
                        mapping={getMappingFor(iv.name)}
                        available={availableOutputs}
                        onChange={onUpdateMapping}
                        onRemove={() => onRemoveMapping(iv.name)}
                      />
                      {iv.description && (
                        <p className="text-[10px] text-gray-400 ml-36 mt-0.5 pl-2">{iv.description}{iv.default_value ? ` · default: ${iv.default_value}` : ''}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : step.variable_mappings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 p-5 text-center">
                  <p className="text-xs text-blue-600/70 dark:text-blue-400/70">This request has no defined input variables.</p>
                  <p className="text-[10px] text-blue-400/60 mt-1">Add <code className="font-mono">{`{{placeholders}}`}</code> to the request and define them in the Variables tab of the Request Builder.</p>
                </div>
              ) : null}

              {/* Custom ad-hoc mapping */}
              <button
                onClick={() => {
                  const varName = prompt('Variable name (as used in {{...}})?')
                  if (varName?.trim()) {
                    onUpdateMapping({ var_name: varName.trim(), source: { kind: 'constant', value: '' } })
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 transition-colors mt-1"
              >
                <span className="w-5 h-5 rounded bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center font-bold">+</span>
                Add custom mapping
              </button>
            </div>
          )}

          {/* Output Variables panel — read-only, defined in Request Designer */}
          {activePanel === 'outputs' && (
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Output variables defined in the <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Request Designer</span>. They are automatically extracted and available to later steps.
                </p>
              </div>

              {outputVarDefs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-5 text-center">
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">No output variables defined for this request.</p>
                  <p className="text-[10px] text-emerald-400/60 mt-1">Open the Request Builder → Variables tab to define output extractions.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[100px_140px_1fr] gap-2 px-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Variable</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Source</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Path / Key</span>
                  </div>
                  {outputVarDefs.map((ev, i) => (
                    <div key={i} className="grid grid-cols-[100px_140px_1fr] gap-2 items-center rounded-lg bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/40 px-3 py-2">
                      <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">{`{{${ev.var_name}}}`}</span>
                      <span className="text-xs text-gray-500">
                        {ev.source === 'response_body' ? '📄 Response Body' : ev.source === 'response_header' ? '📋 Header' : '🔢 Status Code'}
                      </span>
                      <span className="font-mono text-xs text-gray-500 truncate" title={ev.path}>{ev.path || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Connector line ─────────────────────────────────────────────────────────────

function StepConnector({ hasOutputs }: { hasOutputs: boolean }) {
  return (
    <div className="flex items-center justify-center h-5 my-0.5 relative">
      <div className={`w-px h-full ${hasOutputs ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-300 dark:bg-gray-600'}`} />
      {hasOutputs && <div className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500" />}
    </div>
  )
}

// ── Request picker modal ───────────────────────────────────────────────────────

function RequestPicker({ requests, onAdd, onClose }: { requests: HttpRequestSummary[]; onAdd: (r: HttpRequestSummary) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const filtered = requests.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.url.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Add Request to Plan</h3>
            <p className="text-xs text-gray-400 mt-0.5">{requests.length} request{requests.length !== 1 ? 's' : ''} in library</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xl">×</button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input autoFocus type="text" placeholder="Search by name or URL…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="px-5 pb-5 max-h-96 overflow-y-auto space-y-1.5 mt-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <span className="text-3xl mb-2">🔗</span>
              <p className="text-sm font-medium">No requests found</p>
            </div>
          ) : (
            filtered.map(req => (
              <button key={req.id} onClick={() => onAdd(req)}
                className="w-full flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:hover:border-indigo-600 transition-colors group">
                <span className={`shrink-0 ${METHOD_COLORS[req.method] ?? 'bg-gray-500'} text-white text-xs font-bold px-2.5 py-1 rounded font-mono`}>{req.method}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">{req.name}</p>
                  <p className="text-xs text-gray-400 truncate font-mono mt-0.5">{req.url}</p>
                </div>
                {req.assertion_count > 0 && <span className="shrink-0 text-xs text-gray-400">{req.assertion_count} assertion{req.assertion_count > 1 ? 's' : ''}</span>}
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
  const [reqCache, setReqCache]             = useState<Record<string, HttpRequest>>({})
  const [showPicker, setShowPicker]         = useState(false)
  const [expandedStep, setExpandedStep]     = useState<string | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [executing, setExecuting]           = useState(false)
  const [error, setError]                   = useState('')

  useEffect(() => {
    listRequests().then(setRequestLibrary).catch(() => {})
    if (!id) return
    getTestPlan(id).then(plan => {
      setName(plan.name)
      setDescription(plan.description)
      setSteps(plan.steps.map(s => ({
        id: s.id, request_id: s.request_id, name: s.name,
        enabled: s.enabled, extract_variables: s.extract_variables ?? [],
        variable_mappings: s.variable_mappings ?? [],
      })))
    }).catch(() => setError('Failed to load test plan'))
  }, [id])

  // Load a single request into cache (idempotent)
  const loadReqData = async (requestId: string) => {
    if (reqCache[requestId] !== undefined) return
    try {
      const req = await getRequest(requestId)
      setReqCache(prev => ({ ...prev, [requestId]: req }))
    } catch {
      // leave missing — UI will show empty state
    }
  }

  // Eagerly load ALL step requests so getAvailableOutputs can read previous
  // steps' extract_variables even if those steps have never been expanded.
  useEffect(() => {
    const uniqueIds = [...new Set(steps.map(s => s.request_id))]
    uniqueIds.forEach(rid => loadReqData(rid))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map(s => s.request_id).join(',')])

  const handleToggleExpand = (step: TestPlanStep) => {
    if (expandedStep !== step.id) {
      loadReqData(step.request_id)
    }
    setExpandedStep(expandedStep === step.id ? null : step.id)
  }

  const addStep = (req: HttpRequestSummary) => {
    setSteps(prev => [...prev, {
      id: uuidv4(), request_id: req.id, name: req.name,
      enabled: true, extract_variables: [], variable_mappings: [],
    }])
    setShowPicker(false)
  }

  const removeStep   = (stepId: string) => setSteps(prev => prev.filter(s => s.id !== stepId))
  const updateStep   = (stepId: string, patch: Partial<TestPlanStep>) =>
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s))
  const moveStep     = (idx: number, dir: -1 | 1) => {
    const next = [...steps]; const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]; setSteps(next)
  }

  const updateMapping = (stepId: string, m: VariableMapping) =>
    setSteps(prev => prev.map(s => {
      if (s.id !== stepId) return s
      const existing = s.variable_mappings.findIndex(vm => vm.var_name === m.var_name)
      if (existing >= 0) {
        const updated = [...s.variable_mappings]
        updated[existing] = m
        return { ...s, variable_mappings: updated }
      }
      return { ...s, variable_mappings: [...s.variable_mappings, m] }
    }))

  const removeMapping = (stepId: string, varName: string) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, variable_mappings: s.variable_mappings.filter(m => m.var_name !== varName) } : s))

  // Available outputs for step at index i = extract_variables from the requests of all prior enabled steps
  const getAvailableOutputs = (stepIndex: number): AvailableVar[] => {
    const result: AvailableVar[] = []
    for (let i = 0; i < stepIndex; i++) {
      const s = steps[i]
      const req = reqCache[s.request_id]
      for (const ev of req?.extract_variables ?? []) {
        if (ev.var_name.trim()) {
          result.push({ step_id: s.id, step_name: s.name, step_index: i, var_name: ev.var_name })
        }
      }
    }
    return result
  }

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

  const handleExecute = async () => {
    if (!isEdit || !id) {
      setError('Save the plan before executing.')
      return
    }
    setExecuting(true); setError('')
    try {
      await enqueueExecution({ test_plan_id: id })
      navigate('/executions')
    } catch {
      setError('Failed to queue execution.')
      setExecuting(false)
    }
  }

  const enabledCount = steps.filter(s => s.enabled).length

  return (
    <Layout>
      {/* Negate Layout's p-6 so we own the full content area */}
      <div className="-m-6">

        {/* ── Sticky top bar — sticks within <main>'s scroll ── */}
        <div className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/test-plans')} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">←</button>
            <div className="flex-1 min-w-0">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Test plan name…"
                className="w-full bg-transparent text-base font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none" />
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description (optional)"
                className="w-full bg-transparent text-xs text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none mt-0.5" />
            </div>
            {steps.length > 0 && (
              <div className="shrink-0 hidden sm:flex items-center gap-3 text-xs text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5">
                <span><b className="text-gray-700 dark:text-gray-200">{steps.length}</b> steps</span>
                <span className="text-gray-200 dark:text-gray-600">|</span>
                <span><b className="text-indigo-600 dark:text-indigo-400">{enabledCount}</b> enabled</span>
              </div>
            )}
            {error && <span className="shrink-0 text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">⚠ {error}</span>}
            <button onClick={() => navigate('/test-plans')} className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
            {isEdit && (
              <button
                onClick={handleExecute}
                disabled={executing || saving}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Play className="w-3.5 h-3.5" fill="currentColor" />
                {executing ? 'Queuing…' : 'Execute'}
              </button>
            )}
            <button onClick={handleSave} disabled={saving} className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Save Plan'}
            </button>
          </div>
        </div>

        {/* ── Steps area — natural flow, <main> scrolls ── */}
        <div className="px-6 pt-6 pb-16">
          <div className="max-w-3xl mx-auto space-y-0 mt-6">

            {steps.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-20 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors group" onClick={() => setShowPicker(true)}>
                <span className="text-5xl mb-4">🔗</span>
                <p className="text-base font-semibold text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Add your first step</p>
                <p className="text-sm text-gray-400 mt-1">Click to pick a request from your library</p>
              </div>
            )}

            {steps.map((step, idx) => (
              <div key={step.id}>
                <StepCard
                  step={step}
                  index={idx}
                  total={steps.length}
                  reqInfo={requestLibrary.find(r => r.id === step.request_id)}
                  isExpanded={expandedStep === step.id}
                  inputVarDefs={reqCache[step.request_id]?.input_variables ?? []}
                  outputVarDefs={reqCache[step.request_id]?.extract_variables ?? []}
                  availableOutputs={getAvailableOutputs(idx)}
                  onToggleExpand={() => handleToggleExpand(step)}
                  onUpdate={patch => updateStep(step.id, patch)}
                  onMove={dir => moveStep(idx, dir)}
                  onRemove={() => removeStep(step.id)}
                  onUpdateMapping={m => updateMapping(step.id, m)}
                  onRemoveMapping={varName => removeMapping(step.id, varName)}
                />
                {idx < steps.length - 1 && (
                  <StepConnector hasOutputs={(reqCache[step.request_id]?.extract_variables ?? []).some(ev => ev.var_name.trim())} />
                )}
              </div>
            ))}

            {steps.length > 0 && (
              <div className="flex justify-center pt-4">
                <button onClick={() => setShowPicker(true)} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-6 py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors">
                  <span className="text-lg leading-none">+</span>
                  Add Step
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPicker && (
        <RequestPicker requests={requestLibrary} onAdd={addStep} onClose={() => setShowPicker(false)} />
      )}
    </Layout>
  )
}
