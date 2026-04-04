import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, Zap, Check, X, AlertCircle, ArrowRight,
  Globe, Code2, Settings2, ChevronDown, ChevronUp,
  Variable, ListTree, PlayCircle,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { generateTests, importGeneration } from '../../api/client'
import type { GenerationPreview, GeneratedRequest, PlanStepPreview, MappingSourcePreview } from '../../types'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500', POST: 'bg-blue-500', PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500', DELETE: 'bg-red-500', HEAD: 'bg-purple-500', OPTIONS: 'bg-gray-500',
}

function RequestCard({ req, index }: { req: GeneratedRequest; index: number }) {
  const [open, setOpen] = useState(false)
  const method = String(req.method).toUpperCase()

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
          {index + 1}
        </span>
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded text-white shrink-0 ${METHOD_COLORS[method] ?? 'bg-gray-400'}`}>
          {method}
        </span>
        <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
          {req.name}
        </span>
        <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
          {req.assertions.length > 0 && (
            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
              {req.assertions.length} assertion{req.assertions.length !== 1 ? 's' : ''}
            </span>
          )}
          {req.extract_variables.length > 0 && (
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
              {req.extract_variables.length} output var{req.extract_variables.length !== 1 ? 's' : ''}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {/* URL */}
          <div className="px-4 py-3 bg-gray-50/60 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{req.url}</code>
            </div>
          </div>

          {/* Description */}
          {req.description && (
            <div className="px-4 py-2.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">{req.description}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-700">
            {/* Assertions */}
            {req.assertions.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Assertions</p>
                <ul className="space-y-1">
                  {req.assertions.map((a, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="font-mono text-gray-500 dark:text-gray-500">{a.type}</span>
                      <ArrowRight className="w-3 h-3 text-gray-300" />
                      <span>{a.operator} <strong>{a.expected_value}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Variables */}
            {(req.input_variables.length > 0 || req.extract_variables.length > 0) && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Variables</p>
                <ul className="space-y-1">
                  {req.input_variables.map((v, i) => (
                    <li key={`in-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1 py-0.5 rounded text-[10px] font-medium shrink-0">IN</span>
                      <code className="font-mono text-gray-700 dark:text-gray-300">{`{{${v.name}}}`}</code>
                      {v.default_value && <span className="text-gray-400">= {v.default_value}</span>}
                    </li>
                  ))}
                  {req.extract_variables.map((v, i) => (
                    <li key={`out-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1 py-0.5 rounded text-[10px] font-medium shrink-0">OUT</span>
                      <code className="font-mono text-gray-700 dark:text-gray-300">{v.var_name}</code>
                      <span className="text-gray-400 truncate">{v.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Request body */}
          {req.body && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <Code2 className="w-3 h-3" /> Request Body
              </p>
              <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded-lg px-3 py-2 overflow-x-auto text-gray-700 dark:text-gray-300 max-h-32">
                {req.body}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PlanStepCard({
  step, index, requests,
}: {
  step: PlanStepPreview; index: number; requests: GeneratedRequest[]
}) {
  const req = requests.find(r => r.name === step.request_name)
  const method = req ? String(req.method).toUpperCase() : '?'

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
          {index + 1}
        </span>
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded text-white shrink-0 ${METHOD_COLORS[method] ?? 'bg-gray-400'}`}>
          {method}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{step.step_name}</p>
          {step.step_name !== step.request_name && (
            <p className="text-xs text-gray-400 truncate">{step.request_name}</p>
          )}
        </div>
      </div>

      {step.variable_mappings.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
            <Variable className="w-3 h-3" /> Variable Mappings
          </p>
          <ul className="space-y-1.5">
            {step.variable_mappings.map((vm, i) => (
              <li key={i} className="flex items-center gap-2 text-xs flex-wrap">
                <code className="font-mono bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                  {`{{${vm.var_name}}}`}
                </code>
                <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                <MappingSourceBadge source={vm.source} requests={requests} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MappingSourceBadge({
  source, requests,
}: {
  source: MappingSourcePreview; requests: GeneratedRequest[]
}) {
  if (source.kind === 'constant') {
    return (
      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono text-[11px]">
        "{source.value}"
      </span>
    )
  }
  const srcReq = requests[source.step_index]
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <span className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">
        Step {source.step_index + 1}{srcReq ? ` · ${srcReq.name}` : ''}
      </span>
      <span className="text-gray-400">→</span>
      <code className="font-mono text-green-600 dark:text-green-400">{source.var_name}</code>
    </span>
  )
}

export default function GeneratePreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [preview, setPreview]   = useState<GenerationPreview | null>(null)
  const [loading, setLoading]   = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [imported, setImported] = useState<{ plan_id: string; plan_name: string } | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    generateTests(id)
      .then(setPreview)
      .catch(err => {
        const msg = (err as { response?: { data?: { error?: string } } })
          ?.response?.data?.error ?? 'Generation failed'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleImport = async () => {
    if (!preview) return
    setImporting(true)
    setError(null)
    try {
      const result = await importGeneration(preview)
      setImported({ plan_id: result.test_plan_id, plan_name: result.test_plan_name })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? 'Import failed'
      setError(msg)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/specs')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Specs
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              AI Test Generation
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Review the generated requests and test plan, then import into your library
            </p>
          </div>
          {preview && !imported && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {importing ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
              ) : (
                <><Check className="w-4 h-4" /> Approve & Import</>
              )}
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Success / imported state */}
        {imported && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-800/40 flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                  Import successful!
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {preview?.requests.length ?? 0} requests saved · Test plan "{imported.plan_name}" created
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/requests')}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                View Requests
              </button>
              <button
                onClick={() => navigate(`/test-plans/${imported.plan_id}/edit`)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                <ListTree className="w-4 h-4" />
                Open Test Plan
              </button>
              <button
                onClick={() => navigate('/executions')}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <PlayCircle className="w-4 h-4" />
                Execute Now
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-6 py-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-800/40 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-indigo-800 dark:text-indigo-300">
                    AI is generating your tests…
                  </p>
                  <p className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
                    Analysing endpoints, creating requests and building test plan.
                    This may take 30–60 seconds.
                  </p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview content */}
        {preview && !loading && (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Requests', value: preview.requests.length, color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Test Steps', value: preview.plan_steps.length, color: 'text-indigo-600 dark:text-indigo-400' },
                {
                  label: 'Variable Mappings',
                  value: preview.plan_steps.reduce((n, s) => n + s.variable_mappings.length, 0),
                  color: 'text-emerald-600 dark:text-emerald-400',
                },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Generated requests */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-500" />
                Generated Requests
                <span className="text-xs font-normal text-gray-400">({preview.requests.length})</span>
              </h2>
              <div className="space-y-2">
                {preview.requests.map((req, i) => (
                  <RequestCard key={i} req={req} index={i} />
                ))}
              </div>
            </div>

            {/* Test plan */}
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <ListTree className="w-4 h-4 text-indigo-500" />
                  Generated Test Plan
                </h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  <strong>{preview.plan_name}</strong>
                  {preview.plan_description && ` – ${preview.plan_description}`}
                </p>
              </div>
              <div className="space-y-2">
                {preview.plan_steps.map((step, i) => (
                  <PlanStepCard key={i} step={step} index={i} requests={preview.requests} />
                ))}
              </div>
            </div>

            {/* Bottom import button */}
            {!imported && (
              <div className="flex justify-end pb-8">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-sm font-medium text-white transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {importing ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
                  ) : (
                    <><Check className="w-4 h-4" /> Approve & Import into Library</>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
