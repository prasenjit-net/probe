import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { createTestPlan, enqueueExecution, getTestPlan, testFireRequest, updateTestPlan } from '../../api/client'
import { useEnvironment } from '../../context/EnvironmentContext'
import type {
  Assertion,
  BodyType,
  ExtractVariable,
  HttpMethod,
  HttpRequest,
  InputVariable,
  KeyValue,
  StepResult,
  TestPlanStep,
  VariableMapping,
} from '../../types'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'form_url_encoded', label: 'Form' },
]
const ASSERTION_TYPES: Assertion['type'][] = ['status_code', 'response_time', 'body_contains', 'json_path', 'header']
const ASSERTION_OPERATORS: Assertion['operator'][] = ['equals', 'not_equals', 'contains', 'not_contains', 'less_than', 'greater_than', 'regex']
const VARIABLE_SOURCES: ExtractVariable['source'][] = ['response_body', 'response_header', 'status_code']

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500',
  POST: 'bg-blue-500',
  PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500',
  DELETE: 'bg-red-500',
  HEAD: 'bg-purple-500',
  OPTIONS: 'bg-gray-500',
}

const METHOD_LABELS: Record<HttpMethod, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
}

const inputClassName = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'

interface AvailableVar {
  step_id: string
  step_name: string
  step_index: number
  var_name: string
}

const emptyHeader = (): KeyValue => ({ key: '', value: '' })
const emptyInputVariable = (): InputVariable => ({ name: '', description: '', default_value: '' })
const emptyExtractVariable = (): ExtractVariable => ({ var_name: '', path: '', source: 'response_body' })
const emptyAssertion = (): Assertion => ({
  id: uuidv4(),
  type: 'status_code',
  operator: 'equals',
  target: '',
  expected_value: '200',
})

const createBlankRequest = (): HttpRequest => {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name: '',
    description: '',
    method: 'GET',
    url: '',
    headers: [emptyHeader()],
    body: '',
    body_type: 'none',
    assertions: [],
    input_variables: [],
    extract_variables: [],
    created_at: now,
    updated_at: now,
  }
}

const normalizeRequest = (request: HttpRequest): HttpRequest => ({
  ...request,
  headers: request.headers.length > 0 ? request.headers : [emptyHeader()],
  assertions: request.assertions ?? [],
  input_variables: request.input_variables ?? [],
  extract_variables: request.extract_variables ?? [],
  body: request.body ?? '',
  body_type: request.body_type ?? 'none',
  updated_at: new Date().toISOString(),
})

const formatDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`)

function prettifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2)
}

function prettifyForm(text: string): string {
  return new URLSearchParams(text).toString()
}

function escapeHtml(text: string): string {
  return text
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
}

function highlightForm(text: string): string {
  if (!text.trim()) return ''
  let mode: 'key' | 'value' = 'key'

  return text
    .split(/([=&\n])/)
    .map(part => {
      if (part === '=') {
        mode = 'value'
        return '<span class="token punctuation">=</span>'
      }
      if (part === '&') {
        mode = 'key'
        return '<span class="token punctuation">&amp;</span>'
      }
      if (part === '\n') {
        mode = 'key'
        return '\n'
      }
      if (part === '') {
        return ''
      }

      const className = mode === 'key' ? 'attr-name' : 'attr-value'
      return `<span class="token ${className}">${escapeHtml(part)}</span>`
    })
    .join('')
}

function highlightBody(text: string, bodyType: BodyType): string {
  if (bodyType === 'json') {
    try {
      return Prism.highlight(text, Prism.languages.json, 'json')
    } catch {
      return `<span class="token error">${escapeHtml(text)}</span>`
    }
  }
  if (bodyType === 'form_url_encoded') {
    return highlightForm(text)
  }
  return escapeHtml(text)
}

function deriveStepDisplayName(step: TestPlanStep, index: number): string {
  if (step.name.trim()) return step.name
  if (step.request.url.trim()) return `${METHOD_LABELS[step.request.method]} ${step.request.url}`
  return `Step ${index + 1}`
}

function VariableSelector({
  value,
  available,
  onChange,
  onClose,
}: {
  value: string
  available: AvailableVar[]
  onChange: (av: AvailableVar) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = available.filter(av =>
    av.var_name.toLowerCase().includes(search.toLowerCase()) ||
    av.step_name.toLowerCase().includes(search.toLowerCase()),
  )

  const grouped = filtered.reduce<Record<string, AvailableVar[]>>((acc, av) => {
    const key = `Step ${av.step_index + 1}: ${av.step_name}`
    ;(acc[key] ??= []).push(av)
    return acc
  }, {})

  return (
    <div ref={ref} className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-100 p-2 dark:border-gray-800">
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search variables..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">No prior step outputs available.</p>
        ) : (
          Object.entries(grouped).map(([group, vars]) => (
            <div key={group}>
              <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                {group}
              </div>
              {vars.map(av => (
                <button
                  key={`${av.step_id}-${av.var_name}`}
                  onClick={() => onChange(av)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20 ${
                    value === av.var_name ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  }`}
                >
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-mono font-medium text-gray-800 dark:text-gray-200">{av.var_name}</span>
                  <span className="ml-auto text-[10px] text-gray-400">step {av.step_index + 1}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function MappingRow({
  varName,
  mapping,
  available,
  onChange,
  onRemove,
}: {
  varName: string
  mapping?: VariableMapping
  available: AvailableVar[]
  onChange: (mapping: VariableMapping) => void
  onRemove: () => void
}) {
  const [showSelector, setShowSelector] = useState(false)
  const isConstant = !mapping || mapping.source.kind === 'constant'
  const constantVal = mapping?.source.kind === 'constant' ? mapping.source.value : ''
  const stepOutput = mapping?.source.kind === 'step_output' ? mapping.source : null

  return (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0">
        <span className="inline-flex items-center rounded bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {`{{${varName}}}`}
        </span>
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => onChange({ var_name: varName, source: { kind: 'constant', value: constantVal } })}
          className={`rounded px-2 py-1 text-[11px] font-medium ${
            isConstant
              ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800'
          }`}
        >
          Constant
        </button>
        <button
          onClick={() => onChange({ var_name: varName, source: { kind: 'step_output', step_id: '', step_name: '', var_name: '' } })}
          className={`rounded px-2 py-1 text-[11px] font-medium ${
            !isConstant
              ? 'bg-emerald-600 text-white'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800'
          }`}
        >
          Step
        </button>
      </div>

      <div className="relative min-w-0 flex-1">
        {isConstant ? (
          <input
            value={constantVal}
            onChange={e => onChange({ var_name: varName, source: { kind: 'constant', value: e.target.value } })}
            placeholder="Value"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-950"
          />
        ) : (
          <button
            onClick={() => setShowSelector(s => !s)}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
              stepOutput?.var_name
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                : 'border-dashed border-gray-300 text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:border-gray-700'
            }`}
          >
            {stepOutput?.var_name ? (
              <>
                <span className="flex-1 text-left font-mono font-medium">{stepOutput.var_name}</span>
                <span className="text-[10px] opacity-70">{stepOutput.step_name}</span>
              </>
            ) : (
              <>
                <span className="flex-1 text-left">Select output...</span>
                <span>▾</span>
              </>
            )}
          </button>
        )}
        {!isConstant && showSelector && (
          <VariableSelector
            value={stepOutput?.var_name ?? ''}
            available={available}
            onChange={av => {
              onChange({ var_name: varName, source: { kind: 'step_output', step_id: av.step_id, step_name: av.step_name, var_name: av.var_name } })
              setShowSelector(false)
            }}
            onClose={() => setShowSelector(false)}
          />
        )}
      </div>

      <button onClick={onRemove} className="rounded p-1 text-gray-300 hover:text-red-500">
        ×
      </button>
    </div>
  )
}

function TestFireVariableModal({
  variables,
  onConfirm,
  onCancel,
}: {
  variables: InputVariable[]
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {}
    variables.forEach(v => { next[v.name] = v.default_value ?? '' })
    return next
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
            <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Test Fire variables</h2>
            <p className="text-xs text-gray-400">These values are only used for this run.</p>
          </div>
          <button onClick={onCancel} className="text-xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">×</button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3">
          {variables.map(variable => (
            <div key={variable.name}>
              <label className="mb-1 block">
                <span className="inline-flex rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {`{{${variable.name}}}`}
                </span>
                {variable.description && <span className="ml-2 text-[11px] text-gray-400">{variable.description}</span>}
              </label>
              <input
                value={values[variable.name] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                placeholder={variable.default_value ? `default: ${variable.default_value}` : 'Enter value...'}
                className={inputClassName}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/80">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
            Cancel
          </button>
          <button onClick={() => onConfirm(values)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            <Play className="h-3.5 w-3.5" fill="currentColor" />
            Fire Request
          </button>
        </div>
      </div>
    </div>
  )
}

function TestFirePanel({ result, onClose }: { result: StepResult; onClose: () => void }) {
  const [showReq, setShowReq] = useState(false)
  const [showResp, setShowResp] = useState(true)
  const passed = result.passed
  const statusCode = result.response?.status_code
  const statusOk = statusCode !== undefined && statusCode < 400

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-gray-900 ${passed ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700'}`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${passed ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${passed ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {passed ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
        </div>
        <span className={`text-sm font-semibold ${passed ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
          {passed ? 'Request passed' : 'Request failed'}
        </span>
        {statusCode && <span className={`font-mono text-sm font-bold ${statusOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>{statusCode}</span>}
        {result.response && <span className="text-xs text-gray-400">{formatDuration(result.response.duration_ms)}</span>}
        {result.error && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-300">{result.error}</span>}
        <button onClick={onClose} className="ml-auto text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">×</button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        <div>
          <button onClick={() => setShowReq(s => !s)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60">
            {showReq ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Request
            <span className="ml-auto font-mono normal-case tracking-normal text-gray-400">{result.request.method} {result.request.url}</span>
          </button>
          {showReq && (
            <div className="space-y-2 px-4 pb-3">
              {result.request.headers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Headers</p>
                  {result.request.headers.map((header, index) => (
                    <div key={index} className="flex gap-2 text-xs font-mono">
                      <span className="text-gray-500">{header.key}:</span>
                      <span className="break-all text-gray-800 dark:text-gray-200">{header.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.request.body && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Body</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">{result.request.body}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <button onClick={() => setShowResp(s => !s)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60">
            {showResp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Response
            {result.response && <span className={`ml-auto font-mono normal-case tracking-normal ${statusOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{result.response.status_code}</span>}
          </button>
          {showResp && result.response && (
            <div className="space-y-2 px-4 pb-3">
              {result.response.headers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Headers</p>
                  {result.response.headers.slice(0, 8).map((header, index) => (
                    <div key={index} className="flex gap-2 text-xs font-mono">
                      <span className="text-gray-500">{header.key}:</span>
                      <span className="break-all text-gray-800 dark:text-gray-200">{header.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.response.body && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Body</p>
                  <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">{result.response.body}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function StepListItem({
  step,
  index,
  selected,
  onSelect,
  onMove,
  onRemove,
}: {
  step: TestPlanStep
  index: number
  selected: boolean
  onSelect: () => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const title = deriveStepDisplayName(step, index)

  return (
    <div className={`rounded-xl border transition-all ${selected ? 'border-indigo-500 bg-indigo-50/70 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/30' : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}`}>
      <button onClick={onSelect} className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${METHOD_COLORS[step.request.method]}`}>
              {step.request.method}
            </span>
            {!step.enabled && <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">Off</span>}
          </div>
          <p className="mt-1 truncate text-[13px] font-semibold leading-4 text-gray-900 dark:text-white">{title}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] leading-4 text-gray-500 dark:text-gray-400">{step.request.url || 'No URL yet'}</p>
          <div className="mt-1 flex items-center gap-2 text-[10px] leading-4 text-gray-400">
            <span>{step.request.input_variables.filter(v => v.name.trim()).length} in</span>
            <span>{step.request.extract_variables.filter(v => v.var_name.trim()).length} out</span>
            <span>{step.request.assertions.filter(v => v.expected_value.trim()).length} assert</span>
          </div>
        </div>
      </button>
      <div className="flex items-center justify-end gap-0.5 px-2 pb-1.5">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-800">
          <ArrowUpFromLine className="h-3 w-3" />
        </button>
        <button onClick={() => onMove(1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
          <ArrowDownToLine className="h-3 w-3" />
        </button>
        <button onClick={onRemove} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function BodyEditor({
  request,
  onUpdate,
  onPrettify,
}: {
  request: HttpRequest
  onUpdate: (request: HttpRequest) => void
  onPrettify: () => void
}) {
  const showPreview = request.body_type === 'json' || request.body_type === 'form_url_encoded'
  const placeholder = request.body_type === 'json'
    ? '{\n  "name": "example"\n}'
    : request.body_type === 'form_url_encoded'
      ? 'key=value&other=123'
      : 'Body content'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {BODY_TYPES.map(bodyType => (
          <button
            key={bodyType.value}
            onClick={() => onUpdate(normalizeRequest({ ...request, body_type: bodyType.value }))}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              request.body_type === bodyType.value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-300 bg-white text-gray-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300'
            }`}
          >
            {bodyType.label}
          </button>
        ))}
        {showPreview && (
          <button
            onClick={onPrettify}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Prettify
          </button>
        )}
      </div>

      {request.body_type !== 'none' && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {request.body_type === 'json' ? 'JSON Editor' : request.body_type === 'form_url_encoded' ? 'Form Editor' : 'Body Editor'}
            </span>
            <span className="text-[10px] text-slate-500">
              {showPreview ? 'Syntax highlighted' : 'Plain text input'}
            </span>
          </div>
          <div className="border-l-2 border-indigo-500/50">
            <Editor
              value={request.body ?? ''}
              onValueChange={value => onUpdate(normalizeRequest({ ...request, body: value }))}
              highlight={value => highlightBody(value, request.body_type)}
              padding={12}
              textareaClassName="body-code-editor__textarea"
              preClassName="body-code-editor__pre"
              className="body-code-editor min-h-[220px] text-xs leading-6"
              placeholder={placeholder}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function TestPlanDesigner() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const cloneFrom = searchParams.get('clone')
  const { activeEnvId, activeEnv } = useEnvironment()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [steps, setSteps] = useState<TestPlanStep[]>([])
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(id || cloneFrom))
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [firing, setFiring] = useState(false)
  const [fireResult, setFireResult] = useState<StepResult | null>(null)
  const [showVarModal, setShowVarModal] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const sourceId = id || cloneFrom
    if (!sourceId) return

    setLoading(true)
    getTestPlan(sourceId)
      .then(plan => {
        const normalizedSteps = plan.steps.map(step => ({
          ...step,
          request: normalizeRequest(step.request),
          variable_mappings: step.variable_mappings ?? [],
        }))
        setName(cloneFrom ? `${plan.name} Copy` : plan.name)
        setDescription(plan.description)
        setCollectionId(plan.collection_id ?? null)
        setSteps(normalizedSteps)
        setSelectedStepId(normalizedSteps[0]?.id ?? null)
      })
      .catch(() => setError('Failed to load test plan'))
      .finally(() => setLoading(false))
  }, [id, cloneFrom])

  useEffect(() => {
    if (steps.length === 0) {
      setSelectedStepId(null)
      return
    }
    if (!selectedStepId || !steps.some(step => step.id === selectedStepId)) {
      setSelectedStepId(steps[0].id)
    }
  }, [selectedStepId, steps])

  const selectedStepIndex = steps.findIndex(step => step.id === selectedStepId)
  const selectedStep = selectedStepIndex >= 0 ? steps[selectedStepIndex] : null

  const availableOutputsByStep = useMemo(
    () => steps.map((_, index) =>
      steps
        .slice(0, index)
        .flatMap((step, prevIndex) =>
          step.request.extract_variables
            .filter(variable => variable.var_name.trim())
            .map(variable => ({
              step_id: step.id,
              step_name: deriveStepDisplayName(step, prevIndex),
              step_index: prevIndex,
              var_name: variable.var_name,
            })),
        )),
    [steps],
  )

  const selectedAvailableOutputs = selectedStepIndex >= 0 ? availableOutputsByStep[selectedStepIndex] ?? [] : []

  const setStep = (stepId: string, updater: (step: TestPlanStep) => TestPlanStep) => {
    setSteps(prev => prev.map(step => step.id === stepId ? updater(step) : step))
    setFireResult(null)
  }

  const updateSelectedRequest = (updater: (request: HttpRequest) => HttpRequest) => {
    if (!selectedStep) return
    setStep(selectedStep.id, current => ({ ...current, request: normalizeRequest(updater(current.request)) }))
  }

  const addStep = () => {
    const newStep: TestPlanStep = {
      id: uuidv4(),
      request: createBlankRequest(),
      name: '',
      enabled: true,
      variable_mappings: [],
    }
    setSteps(prev => [...prev, newStep])
    setSelectedStepId(newStep.id)
    setFireResult(null)
  }

  const removeStep = (stepId: string) => {
    const index = steps.findIndex(step => step.id === stepId)
    const nextSteps = steps.filter(step => step.id !== stepId)
    setSteps(nextSteps)
    if (selectedStepId === stepId) {
      const nextSelected = nextSteps[index] ?? nextSteps[index - 1] ?? null
      setSelectedStepId(nextSelected?.id ?? null)
    }
    setFireResult(null)
  }

  const moveStep = (stepId: string, direction: -1 | 1) => {
    setSteps(prev => {
      const index = prev.findIndex(step => step.id === stepId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev
      const updated = [...prev]
      ;[updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]]
      return updated
    })
    setFireResult(null)
  }

  const prettifySelectedBody = () => {
    if (!selectedStep) return
    try {
      let body = selectedStep.request.body ?? ''
      if (selectedStep.request.body_type === 'json') body = prettifyJson(body)
      if (selectedStep.request.body_type === 'form_url_encoded') body = prettifyForm(body)
      updateSelectedRequest(request => ({ ...request, body }))
      setError('')
    } catch {
      setError(selectedStep.request.body_type === 'json' ? 'Unable to prettify invalid JSON body' : 'Unable to prettify form body')
    }
  }

  const buildRequestPayload = (step: TestPlanStep) => ({
    name: step.name || `${METHOD_LABELS[step.request.method]} request`,
    description: step.request.description,
    method: step.request.method,
    url: step.request.url,
    headers: step.request.headers.filter(header => header.key.trim()),
    body: step.request.body_type !== 'none' ? step.request.body || undefined : undefined,
    body_type: step.request.body_type,
    assertions: step.request.assertions.filter(assertion => assertion.expected_value.trim()),
    input_variables: step.request.input_variables.filter(variable => variable.name.trim()),
    extract_variables: step.request.extract_variables.filter(variable => variable.var_name.trim()),
  })

  const handleTestFire = async () => {
    if (!selectedStep) return
    if (!selectedStep.request.url.trim()) {
      setError('URL is required to test fire the selected request')
      return
    }

    setError('')
    const activeInputs = selectedStep.request.input_variables.filter(variable => variable.name.trim())
    if (activeInputs.length > 0) {
      setShowVarModal(true)
      return
    }
    await doFire({})
  }

  const doFire = async (variableValues: Record<string, string>) => {
    if (!selectedStep) return
    setShowVarModal(false)
    setFiring(true)
    setFireResult(null)

    try {
      const result = await testFireRequest({
        ...buildRequestPayload(selectedStep),
        variable_values: variableValues,
        environment_id: activeEnvId ?? undefined,
      })
      setFireResult(result)
    } catch {
      setError('Test fire failed. Is the server running?')
    } finally {
      setFiring(false)
    }
  }

  const persistPlan = async (runAfterSave = false) => {
    if (!name.trim()) {
      setError('Test plan name is required')
      return
    }
    if (steps.length === 0) {
      setError('Add at least one step to the test plan')
      return
    }

    const invalidStep = steps.find(step => !step.request.url.trim())
    if (invalidStep) {
      setError(`Step "${deriveStepDisplayName(invalidStep, steps.indexOf(invalidStep))}" needs a URL`)
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      name: name.trim(),
      description: description.trim(),
      collection_id: collectionId,
      steps: steps.map(step => ({
        ...step,
        request: normalizeRequest({
          ...step.request,
          name: step.name.trim() || `${METHOD_LABELS[step.request.method]} request`,
        }),
      })),
    }

    try {
      const saved = id ? await updateTestPlan(id, payload) : await createTestPlan(payload)
      const planId = (saved as { id?: string }).id ?? id

      if (runAfterSave && planId) {
        setRunning(true)
        await enqueueExecution({
          test_plan_id: planId,
          environment_id: activeEnvId ?? undefined,
        })
        navigate('/executions')
        return
      }

      navigate('/test-plans')
    } catch {
      setError('Failed to save test plan')
    } finally {
      setSaving(false)
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="p-8 text-sm text-gray-500 dark:text-gray-400">Loading test plan...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto flex h-full max-w-[1650px] flex-col gap-3 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{id ? 'Edit Test Plan' : 'New Test Plan'}</h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Compact list-detail editor with embedded requests, mappings, and test fire.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Plan name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Checkout flow" className={inputClassName} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Description</span>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Smoke test for login and purchase" className={inputClassName} />
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => navigate('/test-plans')} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
              Cancel
            </button>
            <button onClick={() => persistPlan(false)} disabled={saving || running} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => persistPlan(true)} disabled={saving || running} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
              <Play className="h-4 w-4" />
              {running ? 'Running...' : 'Save & Run'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[280px,minmax(0,1fr)]">
          <aside className="min-h-0 rounded-2xl border border-gray-200 bg-gray-50/70 p-2.5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Steps</h2>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Select a step to edit its request.</p>
              </div>
              <button onClick={addStep} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 text-center dark:border-gray-700 dark:bg-gray-950/40">
                <ClipboardList className="h-7 w-7 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">No steps yet.</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add a step to start designing requests.</p>
              </div>
            ) : (
              <div className="space-y-1.5 overflow-y-auto pr-1">
                {steps.map((step, index) => (
                  <StepListItem
                    key={step.id}
                    step={step}
                    index={index}
                    selected={step.id === selectedStepId}
                    onSelect={() => {
                      setSelectedStepId(step.id)
                      setFireResult(null)
                    }}
                    onMove={direction => moveStep(step.id, direction)}
                    onRemove={() => removeStep(step.id)}
                  />
                ))}
              </div>
            )}
          </aside>

          <div className="min-h-0 overflow-y-auto pr-1">
            {!selectedStep ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 text-center dark:border-gray-700 dark:bg-gray-900">
                <Sparkles className="h-9 w-9 text-gray-300 dark:text-gray-600" />
                <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Select or create a step</h2>
                <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">The selected step request editor, mappings, and test fire result appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <SectionCard
                  title={deriveStepDisplayName(selectedStep, selectedStepIndex)}
                  description={`Environment: ${activeEnv?.name ?? 'No environment selected'}`}
                  action={
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={selectedStep.enabled}
                          onChange={e => setStep(selectedStep.id, current => ({ ...current, enabled: e.target.checked }))}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Enabled
                      </label>
                      <button
                        onClick={handleTestFire}
                        disabled={firing || saving}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Play className="h-3.5 w-3.5" fill="currentColor" />
                        {firing ? 'Firing...' : 'Test Fire'}
                      </button>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Step name</span>
                      <input
                        value={selectedStep.name}
                        onChange={e => setStep(selectedStep.id, current => ({ ...current, name: e.target.value }))}
                        placeholder="Optional step label"
                        className={inputClassName}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Description</span>
                      <input
                        value={selectedStep.request.description}
                        onChange={e => updateSelectedRequest(request => ({ ...request, description: e.target.value }))}
                        placeholder="Optional description"
                        className={inputClassName}
                      />
                    </label>
                  </div>

                  <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="flex flex-col md:flex-row">
                      <div className={`relative flex items-center ${METHOD_COLORS[selectedStep.request.method]}`}>
                        <select
                          value={selectedStep.request.method}
                          onChange={e => updateSelectedRequest(request => ({ ...request, method: e.target.value as HttpMethod }))}
                          className="appearance-none bg-transparent py-3 pl-4 pr-9 text-sm font-bold text-white focus:outline-none"
                        >
                          {METHODS.map(method => (
                            <option key={method} value={method} className="bg-gray-900 text-white">{method}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 text-white/80">▾</span>
                      </div>
                      <input
                        value={selectedStep.request.url}
                        onChange={e => updateSelectedRequest(request => ({ ...request, url: e.target.value }))}
                        placeholder="{{base_url}}/endpoint"
                        className="min-w-0 flex-1 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none dark:bg-gray-950 dark:text-white"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">
                    Use <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-indigo-600 dark:bg-gray-800 dark:text-indigo-300">{'{{variableName}}'}</code> for runtime values.
                  </p>
                </SectionCard>

                <SectionCard
                  title="Headers"
                  description="Saved inside this step request."
                  action={
                    <button
                      onClick={() => updateSelectedRequest(request => ({ ...request, headers: [...request.headers, emptyHeader()] }))}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      Add header
                    </button>
                  }
                >
                  <div className="space-y-2">
                    {selectedStep.request.headers.map((header, index) => (
                      <div key={index} className="grid gap-2 md:grid-cols-[1fr,1fr,auto]">
                        <input
                          value={header.key}
                          onChange={e => updateSelectedRequest(request => ({ ...request, headers: request.headers.map((item, i) => i === index ? { ...item, key: e.target.value } : item) }))}
                          placeholder="Authorization"
                          className={inputClassName}
                        />
                        <input
                          value={header.value}
                          onChange={e => updateSelectedRequest(request => ({ ...request, headers: request.headers.map((item, i) => i === index ? { ...item, value: e.target.value } : item) }))}
                          placeholder="Bearer {{token}}"
                          className={inputClassName}
                        />
                        <button
                          onClick={() => updateSelectedRequest(request => ({ ...request, headers: request.headers.length === 1 ? [emptyHeader()] : request.headers.filter((_, i) => i !== index) }))}
                          className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Body" description="Prettify and preview JSON or form bodies.">
                  <BodyEditor request={selectedStep.request} onUpdate={request => updateSelectedRequest(() => request)} onPrettify={prettifySelectedBody} />
                </SectionCard>

                <SectionCard
                  title="Assertions"
                  description="Executed during test fire and plan runs."
                  action={
                    <button
                      onClick={() => updateSelectedRequest(request => ({ ...request, assertions: [...request.assertions, emptyAssertion()] }))}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      Add assertion
                    </button>
                  }
                >
                  <div className="space-y-2">
                    {selectedStep.request.assertions.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No assertions yet.</p>
                    ) : (
                      selectedStep.request.assertions.map((assertion, index) => (
                        <div key={assertion.id} className="grid gap-2 md:grid-cols-[0.9fr,0.9fr,1fr,1fr,auto]">
                          <select
                            value={assertion.type}
                            onChange={e => updateSelectedRequest(request => ({ ...request, assertions: request.assertions.map((item, i) => i === index ? { ...item, type: e.target.value as Assertion['type'] } : item) }))}
                            className={inputClassName}
                          >
                            {ASSERTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                          </select>
                          <select
                            value={assertion.operator}
                            onChange={e => updateSelectedRequest(request => ({ ...request, assertions: request.assertions.map((item, i) => i === index ? { ...item, operator: e.target.value as Assertion['operator'] } : item) }))}
                            className={inputClassName}
                          >
                            {ASSERTION_OPERATORS.map(operator => <option key={operator} value={operator}>{operator}</option>)}
                          </select>
                          <input
                            value={assertion.target ?? ''}
                            onChange={e => updateSelectedRequest(request => ({ ...request, assertions: request.assertions.map((item, i) => i === index ? { ...item, target: e.target.value } : item) }))}
                            placeholder="$.data.id"
                            className={inputClassName}
                          />
                          <input
                            value={assertion.expected_value}
                            onChange={e => updateSelectedRequest(request => ({ ...request, assertions: request.assertions.map((item, i) => i === index ? { ...item, expected_value: e.target.value } : item) }))}
                            placeholder="200"
                            className={inputClassName}
                          />
                          <button
                            onClick={() => updateSelectedRequest(request => ({ ...request, assertions: request.assertions.filter((_, i) => i !== index) }))}
                            className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Output variables"
                  description="Extract values for later steps."
                  action={
                    <button
                      onClick={() => updateSelectedRequest(request => ({ ...request, extract_variables: [...request.extract_variables, emptyExtractVariable()] }))}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      Add output
                    </button>
                  }
                >
                  <div className="space-y-2">
                    {selectedStep.request.extract_variables.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No output variables configured.</p>
                    ) : (
                      selectedStep.request.extract_variables.map((variable, index) => (
                        <div key={index} className="grid gap-2 md:grid-cols-[1fr,1.1fr,0.8fr,auto]">
                          <input
                            value={variable.var_name}
                            onChange={e => updateSelectedRequest(request => ({ ...request, extract_variables: request.extract_variables.map((item, i) => i === index ? { ...item, var_name: e.target.value } : item) }))}
                            placeholder="session_id"
                            className={inputClassName}
                          />
                          <input
                            value={variable.path}
                            onChange={e => updateSelectedRequest(request => ({ ...request, extract_variables: request.extract_variables.map((item, i) => i === index ? { ...item, path: e.target.value } : item) }))}
                            placeholder="$.token"
                            className={`${inputClassName} font-mono`}
                          />
                          <select
                            value={variable.source}
                            onChange={e => updateSelectedRequest(request => ({ ...request, extract_variables: request.extract_variables.map((item, i) => i === index ? { ...item, source: e.target.value as ExtractVariable['source'] } : item) }))}
                            className={inputClassName}
                          >
                            {VARIABLE_SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
                          </select>
                          <button
                            onClick={() => updateSelectedRequest(request => ({ ...request, extract_variables: request.extract_variables.filter((_, i) => i !== index) }))}
                            className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Input variables"
                  description="Define inputs and map them from constants or prior step outputs."
                  action={
                    <button
                      onClick={() => updateSelectedRequest(request => ({ ...request, input_variables: [...request.input_variables, emptyInputVariable()] }))}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      Add input
                    </button>
                  }
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {selectedStep.request.input_variables.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No input variables defined for this request.</p>
                      ) : (
                        selectedStep.request.input_variables.map((variable, index) => (
                          <div key={index} className="grid gap-2 md:grid-cols-[1fr,1.2fr,1fr,auto]">
                            <input
                              value={variable.name}
                              onChange={e => updateSelectedRequest(request => ({ ...request, input_variables: request.input_variables.map((item, i) => i === index ? { ...item, name: e.target.value } : item) }))}
                              placeholder="user_id"
                              className={inputClassName}
                            />
                            <input
                              value={variable.description}
                              onChange={e => updateSelectedRequest(request => ({ ...request, input_variables: request.input_variables.map((item, i) => i === index ? { ...item, description: e.target.value } : item) }))}
                              placeholder="User identifier"
                              className={inputClassName}
                            />
                            <input
                              value={variable.default_value ?? ''}
                              onChange={e => updateSelectedRequest(request => ({ ...request, input_variables: request.input_variables.map((item, i) => i === index ? { ...item, default_value: e.target.value } : item) }))}
                              placeholder="Optional default"
                              className={inputClassName}
                            />
                            <button
                              onClick={() => setStep(selectedStep.id, current => ({
                                ...current,
                                request: normalizeRequest({ ...current.request, input_variables: current.request.input_variables.filter((_, i) => i !== index) }),
                                variable_mappings: current.variable_mappings.filter(mapping => mapping.var_name !== variable.name),
                              }))}
                              className="rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {selectedStep.request.input_variables.filter(variable => variable.name.trim()).length > 0 && (
                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-950/50">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Input mappings</h4>
                        <div className="space-y-2">
                          {selectedStep.request.input_variables
                            .filter(variable => variable.name.trim())
                            .map(variable => {
                              const mapping = selectedStep.variable_mappings.find(item => item.var_name === variable.name)
                              return (
                                <MappingRow
                                  key={variable.name}
                                  varName={variable.name}
                                  mapping={mapping}
                                  available={selectedAvailableOutputs}
                                  onChange={updatedMapping => setStep(selectedStep.id, current => ({
                                    ...current,
                                    variable_mappings: [
                                      ...current.variable_mappings.filter(item => item.var_name !== variable.name),
                                      updatedMapping,
                                    ],
                                  }))}
                                  onRemove={() => setStep(selectedStep.id, current => ({
                                    ...current,
                                    variable_mappings: current.variable_mappings.filter(item => item.var_name !== variable.name),
                                  }))}
                                />
                              )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>

                {fireResult && (
                  <SectionCard title="Test fire result" description="Runs the selected request immediately with the active environment.">
                    <TestFirePanel result={fireResult} onClose={() => setFireResult(null)} />
                  </SectionCard>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showVarModal && selectedStep && (
        <TestFireVariableModal
          variables={selectedStep.request.input_variables.filter(variable => variable.name.trim())}
          onConfirm={doFire}
          onCancel={() => setShowVarModal(false)}
        />
      )}
    </Layout>
  )
}
