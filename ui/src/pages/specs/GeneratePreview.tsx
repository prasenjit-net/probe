import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronUp, Code2,
  Globe, ListTree, PlayCircle, Settings2, Variable, X, Zap,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { generateTests, importGeneration } from '../../api/client'
import type { GenerationPreview, MappingSourcePreview, PlanStepPreview } from '../../types'
import { useEnvironment } from '../../context/EnvironmentContext'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500',
  POST: 'bg-blue-500',
  PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500',
  DELETE: 'bg-red-500',
  HEAD: 'bg-purple-500',
  OPTIONS: 'bg-gray-500',
}

function MappingSourceBadge({
  source,
  steps,
}: {
  source: MappingSourcePreview
  steps: PlanStepPreview[]
}) {
  if (source.kind === 'constant') {
    return (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        "{source.value}"
      </span>
    )
  }

  const srcStep = steps[source.step_index]
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700 dark:bg-green-900/20 dark:text-green-400">
        Step {source.step_index + 1}{srcStep ? ` · ${srcStep.step_name}` : ''}
      </span>
      <span className="text-gray-400">→</span>
      <code className="font-mono text-green-600 dark:text-green-400">{source.var_name}</code>
    </span>
  )
}

function StepRequestCard({
  step,
  index,
}: {
  step: PlanStepPreview
  index: number
}) {
  const [open, setOpen] = useState(false)
  const req = step.request
  const method = String(req.method).toUpperCase()

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-gray-700">
          {index + 1}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${METHOD_COLORS[method] ?? 'bg-gray-400'}`}>
          {method}
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
          {step.step_name}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
          {req.extract_variables.length > 0 && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {req.extract_variables.length} output var{req.extract_variables.length !== 1 ? 's' : ''}
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700 dark:border-gray-700">
          <div className="bg-gray-50/60 px-4 py-3 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <code className="break-all text-xs font-mono text-gray-700 dark:text-gray-300">{req.url}</code>
            </div>
          </div>

          {req.description && (
            <div className="px-4 py-2.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">{req.description}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-0 divide-y divide-gray-100 dark:divide-gray-700 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {req.assertions.length > 0 && (
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Assertions</p>
                <ul className="space-y-1">
                  {req.assertions.map((assertion, assertionIndex) => (
                    <li key={assertionIndex} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                      <span className="font-mono text-gray-500 dark:text-gray-500">{assertion.type}</span>
                      <ArrowRight className="h-3 w-3 text-gray-300" />
                      <span>{assertion.operator} <strong>{assertion.expected_value}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(req.input_variables.length > 0 || req.extract_variables.length > 0) && (
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Variables</p>
                <ul className="space-y-1">
                  {req.input_variables.map((variable, variableIndex) => (
                    <li key={`input-${variableIndex}`} className="flex items-center gap-1.5 text-xs">
                      <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">IN</span>
                      <code className="font-mono text-gray-700 dark:text-gray-300">{`{{${variable.name}}}`}</code>
                      {variable.default_value && <span className="text-gray-400">= {variable.default_value}</span>}
                    </li>
                  ))}
                  {req.extract_variables.map((variable, variableIndex) => (
                    <li key={`output-${variableIndex}`} className="flex items-center gap-1.5 text-xs">
                      <span className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">OUT</span>
                      <code className="font-mono text-gray-700 dark:text-gray-300">{variable.var_name}</code>
                      <span className="truncate text-gray-400">{variable.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {req.body && (
            <div className="px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <Code2 className="h-3 w-3" /> Request Body
              </p>
              <pre className="max-h-32 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-xs font-mono text-gray-700 dark:bg-gray-900 dark:text-gray-300">
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
  step,
  index,
  steps,
}: {
  step: PlanStepPreview
  index: number
  steps: PlanStepPreview[]
}) {
  const method = String(step.request.method).toUpperCase()

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
          {index + 1}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${METHOD_COLORS[method] ?? 'bg-gray-400'}`}>
          {method}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{step.step_name}</p>
          {step.step_name !== step.request.name && (
            <p className="truncate text-xs text-gray-400">{step.request.name}</p>
          )}
        </div>
      </div>

      {step.variable_mappings.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <Variable className="h-3 w-3" /> Variable Mappings
          </p>
          <ul className="space-y-1.5">
            {step.variable_mappings.map((mapping, mappingIndex) => (
              <li key={mappingIndex} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  {`{{${mapping.var_name}}}`}
                </code>
                <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
                <MappingSourceBadge source={mapping.source} steps={steps} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function GeneratePreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { setActiveEnvId, reload: reloadEnvs } = useEnvironment()

  const [showModal, setShowModal] = useState(true)
  const [customPrompt, setCustomPrompt] = useState('')
  const [preview, setPreview] = useState<GenerationPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<{
    plan_id: string
    plan_name: string
    env_id?: string
    env_name?: string
    base_url?: string
  } | null>(null)

  const startGeneration = (prompt: string) => {
    if (!id) return
    setShowModal(false)
    setLoading(true)
    setError(null)
    generateTests(id, prompt.trim() || undefined)
      .then(setPreview)
      .catch(err => {
        const message = (err as { response?: { data?: { error?: string } } })
          ?.response?.data?.error ?? 'Generation failed'
        setError(message)
      })
      .finally(() => setLoading(false))
  }

  const handleImport = async () => {
    if (!preview) return
    setImporting(true)
    setError(null)
    try {
      const result = await importGeneration(preview)
      if (result.environment_id) {
        setActiveEnvId(result.environment_id)
        await reloadEnvs()
      }
      setImported({
        plan_id: result.test_plan_id,
        plan_name: result.test_plan_name,
        env_id: result.environment_id,
        env_name: result.environment_name,
        base_url: result.base_url,
      })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? 'Import failed'
      setError(message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Layout>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-700">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
                <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Generate Test Plan with AI</h2>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  Optionally guide the embedded test-plan generation with custom instructions
                </p>
              </div>
              <button
                onClick={() => navigate('/specs')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Custom Instructions
                  <span className="ml-1.5 font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={customPrompt}
                  onChange={event => setCustomPrompt(event.target.value)}
                  rows={5}
                  placeholder={`Examples:\n• Focus on error-case scenarios and edge cases\n• Use Bearer token authentication for secured endpoints\n• Prefer realistic test data with proper email/name formats\n• Include performance assertions (response time < 500ms)`}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                />
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                  These instructions are appended to the AI prompt for endpoint analysis and test-plan assembly.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { icon: '🧩', label: 'Steps', desc: 'embedded requests' },
                  { icon: '✅', label: 'Assertions', desc: 'auto-generated' },
                  { icon: '🌍', label: 'Environment', desc: 'base_url ready' },
                ].map(item => (
                  <div key={item.label} className="rounded-lg bg-gray-50 px-2 py-2.5 dark:bg-gray-800">
                    <div className="text-lg">{item.icon}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">{item.label}</div>
                    <div className="text-[10px] text-gray-400">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/50">
              <button
                onClick={() => navigate('/specs')}
                className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {customPrompt.trim() && (
                  <button
                    onClick={() => {
                      setCustomPrompt('')
                      startGeneration('')
                    }}
                    className="text-sm text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    Clear &amp; use defaults
                  </button>
                )}
                <button
                  onClick={() => startGeneration(customPrompt)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  <Zap className="h-4 w-4" />
                  {customPrompt.trim() ? 'Generate with Instructions' : 'Generate Test Plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl space-y-6 page-enter">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/specs')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Specs
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">AI Test Generation</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Review the generated embedded test plan and environment, then import them into the app
            </p>
          </div>
          {preview && !imported && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing
                ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Importing…</>
                : <><Check className="h-4 w-4" /> Approve &amp; Import</>}
            </button>
          )}
        </div>

        {!showModal && customPrompt.trim() && !loading && (
          <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 dark:border-indigo-700 dark:bg-indigo-900/20">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">Custom instructions applied: </span>
              <span className="text-xs italic text-indigo-600 dark:text-indigo-300">{customPrompt.trim()}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {imported && (
          <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-700 dark:bg-emerald-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-800/40">
                <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">Import successful!</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Test plan "{imported.plan_name}" created with an environment ready for execution
                </p>
              </div>
            </div>

            {imported.env_id && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-white px-4 py-3 dark:border-emerald-600 dark:bg-gray-900/50">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    Environment "{imported.env_name}" created &amp; activated
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="rounded bg-gray-100 px-1 font-mono dark:bg-gray-800">{"{{base_url}}"}</span>
                    {imported.base_url ? ` = ${imported.base_url}` : ' — update this in Environments to point to your server'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    All generated step URLs use <span className="font-mono">{"{{base_url}}"}</span>.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate(`/test-plans/${imported.plan_id}/edit`)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                <ListTree className="h-4 w-4" />
                Open Test Plan
              </button>
              <button
                onClick={() => navigate('/test-plans')}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-600 dark:bg-gray-900 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              >
                <Settings2 className="h-4 w-4" />
                View Test Plans
              </button>
              <button
                onClick={() => navigate('/executions')}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <PlayCircle className="h-4 w-4" />
                Execute Now
              </button>
              {imported.env_id && (
                <button
                  onClick={() => navigate('/environments')}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <Globe className="h-4 w-4" />
                  Edit Environment
                </button>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-8 text-center dark:border-indigo-700 dark:bg-indigo-900/20">
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-800/40">
                  <Zap className="h-6 w-6 animate-pulse text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="font-semibold text-indigo-800 dark:text-indigo-300">AI is generating your test plan…</p>
                  <p className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
                    Analysing endpoints and building an embedded test plan with environment defaults. This may take 30-60 seconds.
                  </p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map(index => (
                    <div
                      key={index}
                      className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 dark:bg-indigo-500"
                      style={{ animationDelay: `${index * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {preview && !loading && (
          <>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Test Steps', value: preview.plan_steps.length, color: 'text-indigo-600 dark:text-indigo-400' },
                {
                  label: 'Variable Mappings',
                  value: preview.plan_steps.reduce((count, step) => count + step.variable_mappings.length, 0),
                  color: 'text-emerald-600 dark:text-emerald-400',
                },
                { label: 'Environments', value: 1, color: 'text-blue-600 dark:text-blue-400' },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center dark:border-gray-700 dark:bg-gray-900">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                <Globe className="h-4 w-4 text-blue-500" />
                Generated Environment
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Base URL variable</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  The imported environment will set <span className="font-mono">{"{{base_url}}"}</span> for the generated test plan.
                </p>
                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">{"{{base_url}}"}</span>
                  <span className="mx-2 text-gray-400">=</span>
                  <span className="break-all font-mono">{preview.base_url || 'Set this after import'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                  <ListTree className="h-4 w-4 text-indigo-500" />
                  Generated Test Plan
                </h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  <strong>{preview.plan_name}</strong>
                  {preview.plan_description && ` – ${preview.plan_description}`}
                </p>
              </div>

              <div className="space-y-2">
                {preview.plan_steps.map((step, index) => (
                  <StepRequestCard key={`request-${index}`} step={step} index={index} />
                ))}
              </div>

              <div className="space-y-2">
                {preview.plan_steps.map((step, index) => (
                  <PlanStepCard key={index} step={step} index={index} steps={preview.plan_steps} />
                ))}
              </div>
            </div>

            {!imported && (
              <div className="flex justify-end pb-8">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing
                    ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Importing…</>
                    : <><Check className="h-4 w-4" /> Approve &amp; Import</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
