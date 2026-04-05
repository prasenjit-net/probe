import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { ArrowDownToLine, ArrowUpFromLine, Info, Play, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import Layout from '../../components/Layout'
import { getRequest, createRequest, updateRequest, testFireRequest } from '../../api/client'
import type {
  HttpMethod, BodyType, KeyValue, Assertion, AssertionType, AssertionOperator,
  InputVariable, ExtractVariable, VariableSource, StepResult,
} from '../../types'

// ── Constants ──────────────────────────────────────────────────────────────────

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET:     'bg-emerald-500',
  POST:    'bg-blue-500',
  PUT:     'bg-amber-500',
  PATCH:   'bg-orange-500',
  DELETE:  'bg-red-500',
  HEAD:    'bg-purple-500',
  OPTIONS: 'bg-gray-500',
}

const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'none',            label: 'None' },
  { value: 'json',            label: 'JSON' },
  { value: 'text',            label: 'Plain Text' },
  { value: 'form_url_encoded',label: 'Form URL Encoded' },
]

const ASSERTION_TYPES: { value: AssertionType; label: string; icon: string }[] = [
  { value: 'status_code',   label: 'Status Code',      icon: '🔢' },
  { value: 'body_contains', label: 'Body Contains',    icon: '📄' },
  { value: 'json_path',     label: 'JSON Path',        icon: '🔍' },
  { value: 'header',        label: 'Header',           icon: '📋' },
  { value: 'response_time', label: 'Response Time',    icon: '⏱' },
]

const OPERATORS: { value: AssertionOperator; label: string }[] = [
  { value: 'equals',       label: '= Equals' },
  { value: 'not_equals',   label: '≠ Not Equals' },
  { value: 'contains',     label: '⊃ Contains' },
  { value: 'not_contains', label: '⊅ Not Contains' },
  { value: 'greater_than', label: '> Greater Than' },
  { value: 'less_than',    label: '< Less Than' },
  { value: 'regex',        label: '~ Regex' },
]

const VAR_SOURCES: { value: VariableSource; label: string }[] = [
  { value: 'response_body',   label: 'Response Body (JSON Path)' },
  { value: 'response_header', label: 'Response Header' },
  { value: 'status_code',     label: 'Status Code' },
]

type Tab = 'headers' | 'body' | 'assertions' | 'variables'

const inp = 'w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const sel = inp

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold w-5 h-5">
      {n}
    </span>
  )
}

// ── TestFireVariableModal ─────────────────────────────────────────────────────

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
    const init: Record<string, string> = {}
    variables.forEach(v => { init[v.name] = v.default_value ?? '' })
    return init
  })

  const set = (name: string, val: string) =>
    setValues(prev => ({ ...prev, [name]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Test Fire — Input Variables</h2>
            <p className="text-xs text-gray-400 mt-0.5">Provide constant values for this test run. These won't be saved.</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xl leading-none">×</button>
        </div>

        {/* Variable inputs */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {variables.map(v => (
            <div key={v.name}>
              <label className="block mb-1">
                <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                  <span className="text-blue-400">{'{{'}</span>{v.name}<span className="text-blue-400">{'}}'}</span>
                </span>
                {v.description && (
                  <span className="ml-2 text-[11px] text-gray-400">{v.description}</span>
                )}
              </label>
              <input
                type="text"
                value={values[v.name] ?? ''}
                onChange={e => set(v.name, e.target.value)}
                placeholder={v.default_value ? `default: ${v.default_value}` : 'Enter value…'}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(values)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
            Fire Request
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TestFirePanel ─────────────────────────────────────────────────────────────

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function TestFirePanel({ result, onClose }: { result: StepResult; onClose: () => void }) {
  const [showReq, setShowReq]   = useState(false)
  const [showResp, setShowResp] = useState(true)
  const statusCode = result.response?.status_code
  const statusOk   = statusCode !== undefined && statusCode < 400
  const passed     = result.passed

  return (
    <div className={`rounded-xl border-2 ${passed ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700'} bg-white dark:bg-gray-800 shadow-lg overflow-hidden`}>
      {/* Header bar */}
      <div className={`flex items-center gap-3 px-4 py-3 ${passed ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${passed ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {passed ? <Check className="w-4 h-4" strokeWidth={3} /> : <X className="w-4 h-4" strokeWidth={3} />}
        </div>
        <span className={`font-semibold text-sm ${passed ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
          {passed ? 'Request Passed' : 'Request Failed'}
        </span>
        {statusCode && (
          <span className={`font-mono font-bold text-sm ${statusOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>
            {statusCode}
          </span>
        )}
        {result.response && (
          <span className="text-xs text-gray-400">{fmtDuration(result.response.duration_ms)}</span>
        )}
        {result.error && (
          <span className="text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">{result.error}</span>
        )}
        <button onClick={onClose} className="ml-auto shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">×</button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">

        {/* Request sent */}
        <div>
          <button
            onClick={() => setShowReq(s => !s)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
          >
            {showReq ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Request Sent
            <span className="ml-auto font-mono text-gray-400">{result.request.method} {result.request.url}</span>
          </button>
          {showReq && (
            <div className="px-4 pb-3 space-y-2">
              {result.request.headers.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Headers</p>
                  <div className="space-y-0.5">
                    {result.request.headers.map((h, i) => (
                      <div key={i} className="flex gap-2 text-xs font-mono">
                        <span className="text-gray-500 shrink-0">{h.key}:</span>
                        <span className="text-gray-800 dark:text-gray-200 break-all">{h.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.request.body && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Body</p>
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">{result.request.body}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Response */}
        <div>
          <button
            onClick={() => setShowResp(s => !s)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
          >
            {showResp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Response
            {result.response && (
              <span className={`ml-auto font-mono font-bold text-xs ${statusOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {result.response.status_code}
              </span>
            )}
          </button>
          {showResp && result.response && (
            <div className="px-4 pb-3 space-y-2">
              {result.response.headers.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Headers</p>
                  <div className="space-y-0.5">
                    {result.response.headers.slice(0, 8).map((h, i) => (
                      <div key={i} className="flex gap-2 text-xs font-mono">
                        <span className="text-gray-500 shrink-0">{h.key}:</span>
                        <span className="text-gray-800 dark:text-gray-200 break-all">{h.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.response.body && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Body</p>
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all max-h-64">{result.response.body}</pre>
                </div>
              )}
            </div>
          )}
          {showResp && !result.response && (
            <p className="px-4 pb-3 text-xs text-gray-400 italic">No response received.</p>
          )}
        </div>

        {/* Assertions */}
        {result.assertion_results.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
              Assertions · {result.assertion_results.filter(a => a.passed).length}/{result.assertion_results.length} passed
            </p>
            <div className="space-y-1">
              {result.assertion_results.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${a.passed ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                  <span className={`shrink-0 font-bold ${a.passed ? 'text-emerald-600' : 'text-red-500'}`}>{a.passed ? '✓' : '✗'}</span>
                  <span className="text-gray-700 dark:text-gray-300 flex-1">{a.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input variables used */}
        {result.input_variables.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Input Variables Used</p>
            <div className="space-y-1">
              {result.input_variables.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded shrink-0">{v.name}</span>
                  <span className="text-gray-400 shrink-0">=</span>
                  {v.value !== null && v.value !== undefined
                    ? <span className="font-mono text-gray-700 dark:text-gray-200 truncate">{v.value}</span>
                    : <em className="text-gray-400">unresolved</em>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Output variables extracted */}
        {result.output_variables.length > 0 ? (
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
              Extracted Output Variables · {result.output_variables.filter(v => v.value !== null && v.value !== undefined).length}/{result.output_variables.length} extracted
            </p>
            <div className="space-y-1">
              {result.output_variables.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`font-mono px-2 py-0.5 rounded shrink-0 ${v.value !== null && v.value !== undefined ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                    {v.name}
                  </span>
                  <span className="text-gray-400 shrink-0">=</span>
                  {v.value !== null && v.value !== undefined
                    ? <span className="font-mono text-gray-700 dark:text-gray-200 truncate">{v.value}</span>
                    : <em className="text-red-400 dark:text-red-500">not found</em>}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const emptyKV = (): KeyValue => ({ key: '', value: '' })
const emptyAssertion = (): Assertion => ({
  id: uuidv4(), type: 'status_code', operator: 'equals', expected_value: '200',
})
const emptyInputVar = (): InputVariable => ({ name: '', description: '', default_value: '' })
const emptyExtractVar = (): ExtractVariable => ({ var_name: '', path: '$.', source: 'response_body' })

export default function RequestDesigner() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [method, setMethod]         = useState<HttpMethod>('GET')
  const [url, setUrl]               = useState('')
  const [headers, setHeaders]       = useState<KeyValue[]>([emptyKV()])
  const [bodyType, setBodyType]     = useState<BodyType>('none')
  const [body, setBody]             = useState('')
  const [assertions, setAssertions] = useState<Assertion[]>([emptyAssertion()])
  const [inputVars, setInputVars]   = useState<InputVariable[]>([])
  const [extractVars, setExtractVars] = useState<ExtractVariable[]>([])
  const [collectionId, setCollectionId] = useState<string | null>(searchParams.get('collection_id'))
  const [activeTab, setActiveTab]   = useState<Tab>('headers')
  const [saving, setSaving]               = useState(false)
  const [firing, setFiring]               = useState(false)
  const [fireResult, setFireResult]       = useState<StepResult | null>(null)
  const [showVarModal, setShowVarModal]   = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    if (!id) return
    getRequest(id).then(r => {
      setName(r.name); setDescription(r.description); setMethod(r.method)
      setUrl(r.url)
      setHeaders(r.headers.length ? r.headers : [emptyKV()])
      setBodyType(r.body_type); setBody(r.body ?? '')
      setAssertions(r.assertions.length ? r.assertions : [emptyAssertion()])
      setInputVars(r.input_variables ?? [])
      setExtractVars(r.extract_variables ?? [])
      setCollectionId(r.collection_id ?? null)
      if (r.body_type !== 'none') setActiveTab('body')
    }).catch(() => setError('Failed to load request'))
  }, [id])

  const updateKV = (list: KeyValue[], idx: number, field: keyof KeyValue, val: string) =>
    list.map((kv, i) => i === idx ? { ...kv, [field]: val } : kv)

  const updateAssertion = (idx: number, patch: Partial<Assertion>) =>
    setAssertions(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a))

  const updateInputVar = (idx: number, patch: Partial<InputVariable>) =>
    setInputVars(prev => prev.map((v, i) => i === idx ? { ...v, ...patch } : v))

  const updateExtractVar = (idx: number, patch: Partial<ExtractVariable>) =>
    setExtractVars(prev => prev.map((v, i) => i === idx ? { ...v, ...patch } : v))

  const handleSave = async () => {
    if (!name.trim()) { setError('Request name is required'); return }
    if (!url.trim())  { setError('URL is required'); return }
    setSaving(true); setError('')
    const payload = {
      name, description, method, url,
      headers: headers.filter(h => h.key.trim()),
      body: bodyType !== 'none' ? body : undefined,
      body_type: bodyType,
      assertions: assertions.filter(a => a.expected_value.trim()),
      input_variables: inputVars.filter(v => v.name.trim()),
      extract_variables: extractVars.filter(v => v.var_name.trim()),
      collection_id: collectionId,
    }
    try {
      if (isEdit && id) await updateRequest(id, payload)
      else await createRequest(payload)
      navigate('/requests')
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const buildPayload = () => ({
    name: name || 'Untitled',
    description,
    method,
    url,
    headers: headers.filter(h => h.key.trim()),
    body: bodyType !== 'none' ? body : undefined,
    body_type: bodyType,
    assertions: assertions.filter(a => a.expected_value.trim()),
    input_variables: inputVars.filter(v => v.name.trim()),
    extract_variables: extractVars.filter(v => v.var_name.trim()),
  })

  const handleTestFire = async () => {
    if (!url.trim()) { setError('URL is required to test fire'); return }
    setError('')
    const activeVars = inputVars.filter(v => v.name.trim())
    if (activeVars.length > 0) {
      setShowVarModal(true)
      return
    }
    await doFire({})
  }

  const doFire = async (variableValues: Record<string, string>) => {
    setShowVarModal(false)
    setFiring(true); setFireResult(null)
    try {
      const result = await testFireRequest({ ...buildPayload(), variable_values: variableValues })
      setFireResult(result)
    } catch {
      setError('Test fire failed. Is the server running?')
    } finally {
      setFiring(false)
    }
  }

  const filledHeaders   = headers.filter(h => h.key.trim()).length
  const filledAsserts   = assertions.filter(a => a.expected_value.trim()).length
  const varCount        = inputVars.filter(v => v.name.trim()).length + extractVars.filter(v => v.var_name.trim()).length

  return (
    <Layout>
      <div className="-m-6">

        {/* ── Sticky top bar ───────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/requests')}
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Back"
            >
              ←
            </button>

            <div className="flex-1 min-w-0">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Request name…"
                className="w-full bg-transparent text-base font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              />
              {(description || !name) && (
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add a description (optional)"
                  className="w-full bg-transparent text-xs text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none mt-0.5"
                />
              )}
            </div>

            {error && (
              <span className="shrink-0 text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">
                ⚠ {error}
              </span>
            )}

            <button
              onClick={() => navigate('/requests')}
              className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleTestFire}
              disabled={firing || saving}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
              title="Execute the request as-is without saving"
            >
              <Play className="w-3.5 h-3.5" fill="currentColor" />
              {firing ? 'Firing…' : 'Test Fire'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Save Request'}
            </button>
          </div>
        </div>

        <div className="px-6 pt-8 pb-16 space-y-4">

          {/* ── URL bar ────────────────────────────────────────────────────── */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm bg-white dark:bg-gray-800">
            <div className={`relative flex items-center ${METHOD_COLORS[method]}`}>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as HttpMethod)}
                className="appearance-none bg-transparent text-white font-bold text-sm pl-4 pr-8 py-3.5 cursor-pointer focus:outline-none"
              >
                {METHODS.map(m => <option key={m} value={m} className="bg-gray-800 text-white">{m}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2 text-white/80 text-xs">▾</span>
            </div>
            <div className="w-px bg-white/20 self-stretch" />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://api.example.com/v1/endpoint"
              className="flex-1 px-4 py-3.5 text-sm font-mono text-gray-800 dark:text-gray-100 bg-transparent placeholder-gray-400 focus:outline-none"
            />
          </div>
          <p className="text-xs text-gray-400 -mt-2 ml-1">
            Use <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-indigo-600 dark:text-indigo-400">{`{{variableName}}`}</code> to inject runtime values from the variable mapping system.
          </p>

          {/* ── Tab panel ──────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">

            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2">
              <TabButton active={activeTab === 'headers'} onClick={() => setActiveTab('headers')}>
                Headers <Badge n={filledHeaders} />
              </TabButton>
              <TabButton active={activeTab === 'body'} onClick={() => setActiveTab('body')}>
                Body
                {bodyType !== 'none' && (
                  <span className="ml-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">{bodyType.toUpperCase()}</span>
                )}
              </TabButton>
              <TabButton active={activeTab === 'assertions'} onClick={() => setActiveTab('assertions')}>
                Assertions <Badge n={filledAsserts} />
              </TabButton>
              <TabButton active={activeTab === 'variables'} onClick={() => setActiveTab('variables')}>
                Variables <Badge n={varCount} />
              </TabButton>
            </div>

            {/* ── Headers tab ──────────────────────────────────────────────── */}
            {activeTab === 'headers' && (
              <div className="p-4 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Key</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Value</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {headers.map((h, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center group">
                      <input value={h.key} onChange={e => setHeaders(updateKV(headers, i, 'key', e.target.value))} className={inp} placeholder="Content-Type" list="common-headers" />
                      <input value={h.value} onChange={e => setHeaders(updateKV(headers, i, 'value', e.target.value))} className={inp} placeholder="application/json" />
                      <button onClick={() => setHeaders(prev => prev.filter((_, j) => j !== i))} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100">×</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setHeaders(h => [...h, emptyKV()])} className="mt-2 flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-base leading-none">+</span>
                  Add Header
                </button>
                <datalist id="common-headers">
                  {['Authorization','Content-Type','Accept','X-API-Key','X-Request-ID','User-Agent','Cache-Control','Accept-Language'].map(h => <option key={h} value={h} />)}
                </datalist>
              </div>
            )}

            {/* ── Body tab ─────────────────────────────────────────────────── */}
            {activeTab === 'body' && (
              <div className="p-4 space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {BODY_TYPES.map(bt => (
                    <button key={bt.value} onClick={() => setBodyType(bt.value)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${bodyType === bt.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
                      {bt.label}
                    </button>
                  ))}
                </div>
                {bodyType === 'none' ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <span className="text-4xl mb-2">∅</span>
                    <p className="text-sm">This request has no body.</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute top-2 right-3 flex gap-2">
                      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-mono">
                        {bodyType === 'json' ? 'application/json' : bodyType === 'form_url_encoded' ? 'application/x-www-form-urlencoded' : 'text/plain'}
                      </span>
                      {bodyType === 'json' && body && (
                        <button onClick={() => { try { setBody(JSON.stringify(JSON.parse(body), null, 2)) } catch { /* invalid JSON — ignore */ } }} className="text-xs text-indigo-500 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">Format</button>
                      )}
                    </div>
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={14} spellCheck={false}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-4 pt-4 pb-3 text-sm font-mono text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed"
                      placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : bodyType === 'form_url_encoded' ? 'key1=value1&key2=value2' : 'Enter request body…'} />
                  </div>
                )}
              </div>
            )}

            {/* ── Assertions tab ───────────────────────────────────────────── */}
            {activeTab === 'assertions' && (
              <div className="p-4 space-y-3">
                {assertions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                    <span className="text-4xl mb-2">✓</span>
                    <p className="text-sm">No assertions yet.</p>
                  </div>
                )}
                {assertions.map((a, i) => {
                  const typeInfo = ASSERTION_TYPES.find(t => t.value === a.type)!
                  const needsTarget = a.type === 'json_path' || a.type === 'header'
                  return (
                    <div key={a.id} className="group flex gap-0 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                      <div className="flex flex-col justify-center items-center w-10 bg-gray-50 dark:bg-gray-700/50 border-r border-gray-200 dark:border-gray-600 shrink-0">
                        <span className="text-base" title={typeInfo.label}>{typeInfo.icon}</span>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2 p-3 items-center">
                        <select value={a.type} onChange={e => updateAssertion(i, { type: e.target.value as AssertionType, target: undefined })} className={`${sel} w-44`}>
                          {ASSERTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select value={a.operator} onChange={e => updateAssertion(i, { operator: e.target.value as AssertionOperator })} className={`${sel} w-40`}>
                          {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                        {needsTarget && (
                          <input value={a.target ?? ''} onChange={e => updateAssertion(i, { target: e.target.value })} className={`${inp} w-44`} placeholder={a.type === 'json_path' ? '$.data.token' : 'content-type'} />
                        )}
                        <div className="flex-1 min-w-32">
                          <input value={a.expected_value} onChange={e => updateAssertion(i, { expected_value: e.target.value })} className={inp} placeholder={a.type === 'status_code' ? '200' : a.type === 'response_time' ? '2000' : 'Expected value'} />
                        </div>
                      </div>
                      <button onClick={() => setAssertions(prev => prev.filter((_, j) => j !== i))} className="w-10 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors border-l border-gray-200 dark:border-gray-600 shrink-0">×</button>
                    </div>
                  )
                })}
                <button onClick={() => setAssertions(a => [...a, emptyAssertion()])} className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors">
                  <span className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-base leading-none">+</span>
                  Add Assertion
                </button>
                <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Quick add:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '200 OK',     patch: { type: 'status_code' as AssertionType, operator: 'equals' as AssertionOperator, expected_value: '200' } },
                      { label: '201 Created',patch: { type: 'status_code' as AssertionType, operator: 'equals' as AssertionOperator, expected_value: '201' } },
                      { label: '< 2s',       patch: { type: 'response_time' as AssertionType, operator: 'less_than' as AssertionOperator, expected_value: '2000' } },
                      { label: 'JSON body',  patch: { type: 'header' as AssertionType, operator: 'contains' as AssertionOperator, target: 'content-type', expected_value: 'application/json' } },
                    ].map(({ label, patch }) => (
                      <button key={label} onClick={() => setAssertions(a => [...a, { id: uuidv4(), ...patch }])} className="px-3 py-1 rounded-full text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                        + {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Variables tab ────────────────────────────────────────────── */}
            {activeTab === 'variables' && (
              <div className="p-4 space-y-6">

                {/* Input Variables */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Input Variables</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">— document the <code className="font-mono text-blue-600 dark:text-blue-400">{`{{placeholders}}`}</code> this request uses</span>
                    <div className="ml-auto group relative">
                      <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="absolute right-0 top-6 hidden group-hover:block w-64 rounded-lg bg-gray-800 text-white text-xs p-3 shadow-xl z-10">
                        Input variables are injected into this request's URL, headers and body at runtime. Define them here so the test plan builder can map values to them.
                      </div>
                    </div>
                  </div>

                  {inputVars.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 p-6 text-center">
                      <p className="text-sm text-blue-600/70 dark:text-blue-400/70">No input variables defined.</p>
                      <p className="text-xs text-blue-400/60 mt-1">Add one if your URL/headers/body contains <code className="font-mono">{`{{placeholders}}`}</code>.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_1.5fr_1fr_32px] gap-2 px-1">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</span>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Description</span>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Default Value</span>
                        <span />
                      </div>
                      {inputVars.map((v, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1.5fr_1fr_32px] gap-2 items-center group">
                          <div className="relative">
                            <input
                              value={v.name}
                              onChange={e => updateInputVar(i, { name: e.target.value.replace(/\s/g, '_') })}
                              className={`${inp} pr-6`}
                              placeholder="userId"
                            />
                            {v.name && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-400 font-mono pointer-events-none">{`{{}}`}</span>}
                          </div>
                          <input value={v.description} onChange={e => updateInputVar(i, { description: e.target.value })} className={inp} placeholder="ID of the user" />
                          <input value={v.default_value ?? ''} onChange={e => updateInputVar(i, { default_value: e.target.value || undefined })} className={inp} placeholder="(optional)" />
                          <button onClick={() => setInputVars(prev => prev.filter((_, j) => j !== i))} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => setInputVars(v => [...v, emptyInputVar()])} className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors">
                    <span className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center text-base leading-none font-bold">+</span>
                    Add Input Variable
                  </button>
                </div>

                {/* Divider */}
                <div className="border-t border-dashed border-gray-200 dark:border-gray-700" />

                {/* Output Variables (defined here, used in test plan steps) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                      <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Output Variables</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">— extract values from the response for downstream steps</span>
                    <div className="ml-auto group relative">
                      <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="absolute right-0 top-6 hidden group-hover:block w-64 rounded-lg bg-gray-800 text-white text-xs p-3 shadow-xl z-10">
                        Output variables are extracted from the response after this step runs. They become available as inputs for subsequent steps in the test plan.
                      </div>
                    </div>
                  </div>

                  {extractVars.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-6 text-center">
                      <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70">No output variables defined.</p>
                      <p className="text-xs text-emerald-400/60 mt-1">Add one to extract values (e.g. a token) for use in later steps.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_1.5fr_1fr_32px] gap-2 px-1">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Variable Name</span>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Path / Key</span>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Source</span>
                        <span />
                      </div>
                      {extractVars.map((v, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1.5fr_1fr_32px] gap-2 items-center group">
                          <input value={v.var_name} onChange={e => updateExtractVar(i, { var_name: e.target.value.replace(/\s/g, '_') })} className={inp} placeholder="authToken" />
                          <input value={v.path} onChange={e => updateExtractVar(i, { path: e.target.value })} className={`${inp} font-mono`} placeholder={v.source === 'response_body' ? '$.data.token' : v.source === 'response_header' ? 'authorization' : 'status_code'} />
                          <select value={v.source} onChange={e => updateExtractVar(i, { source: e.target.value as VariableSource })} className={sel}>
                            {VAR_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <button onClick={() => setExtractVars(prev => prev.filter((_, j) => j !== i))} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => setExtractVars(v => [...v, emptyExtractVar()])} className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors">
                    <span className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center text-base leading-none font-bold">+</span>
                    Add Output Variable
                  </button>
                </div>

              </div>
            )}
          </div>

          {/* ── Test Fire result panel ─────────────────────────────────────── */}
          {fireResult && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Test Fire Result</span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              </div>
              <TestFirePanel result={fireResult} onClose={() => setFireResult(null)} />
            </div>
          )}

          {firing && !fireResult && (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 py-8 text-emerald-600 dark:text-emerald-400">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm font-medium">Firing request…</span>
            </div>
          )}

        </div>
      </div>

      {/* Variable values modal */}
      {showVarModal && (
        <TestFireVariableModal
          variables={inputVars.filter(v => v.name.trim())}
          onConfirm={doFire}
          onCancel={() => setShowVarModal(false)}
        />
      )}
    </Layout>
  )
}
