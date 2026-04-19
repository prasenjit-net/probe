import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ChevronLeft, Download, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertTriangle, Sparkles, Zap } from 'lucide-react'
import Layout from '../../components/Layout'
import { getReport } from '../../api/client'
import type { ExecutionReport, LoadTestIterationSample, StepResult } from '../../types'

const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500', POST: 'bg-blue-500', PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500', DELETE: 'bg-red-500', HEAD: 'bg-purple-500', OPTIONS: 'bg-gray-500',
}

function SampleIterationCard({ sample }: { sample: LoadTestIterationSample }) {
  const [open, setOpen] = useState(!sample.passed)
  return (
    <div className={`rounded-xl border ${sample.passed ? 'border-emerald-200 dark:border-emerald-800/40' : 'border-red-200 dark:border-red-800/40'} bg-white dark:bg-gray-900 overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${sample.passed ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {sample.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {sample.passed ? 'Passed' : 'Failed'}
        </span>
        <span className="font-semibold text-sm text-gray-900 dark:text-white flex-1">
          Iteration #{sample.iteration}
        </span>
        <span className="text-xs text-gray-400">{fmtDuration(sample.duration_ms)}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
          {sample.step_results.map((step, index) => <StepCard key={`${sample.iteration}-${step.step_id}`} step={step} index={index} />)}
        </div>
      )}
    </div>
  )
}

function StepCard({ step, index }: { step: StepResult; index: number }) {
  const [open, setOpen] = useState(!step.passed)
  const passedAssertions = step.assertion_results.filter(a => a.passed).length

  return (
    <div className={`rounded-xl border ${
      step.passed
        ? 'border-gray-100 dark:border-gray-800 border-l-4 border-l-emerald-400'
        : 'border-red-100 dark:border-red-900/40 border-l-4 border-l-red-400'
    } bg-white dark:bg-gray-900 overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold text-white ${step.passed ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {step.passed ? '✓' : '✗'}
        </span>
        <span className="font-semibold text-[14px] text-gray-900 dark:text-white flex-1 text-left">
          {index + 1}. {step.request_name}
        </span>
        <span className={`shrink-0 hidden sm:flex items-center gap-1.5 text-xs font-mono text-gray-400 dark:text-gray-500`}>
          <span className={`${METHOD_COLORS[step.request.method] ?? 'bg-gray-500'} text-white text-[10px] font-bold px-1.5 py-0.5 rounded`}>
            {step.request.method}
          </span>
          <span className="truncate max-w-48">{step.request.url}</span>
        </span>
        {step.response && (
          <span className={`shrink-0 text-xs font-mono font-bold ${step.response.status_code < 400 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {step.response.status_code}
          </span>
        )}
        {step.response && (
          <span className="shrink-0 text-xs text-gray-400 hidden sm:block">{fmtDuration(step.response.duration_ms)}</span>
        )}
        {step.assertion_results.length > 0 && (
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
            passedAssertions === step.assertion_results.length
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
          }`}>
            {passedAssertions}/{step.assertion_results.length}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
          {step.error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{step.error}</p>
            </div>
          )}

          {/* Variable tracing: input + output */}
          {(step.input_variables?.length > 0 || step.output_variables?.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Input variables */}
              {step.input_variables?.length > 0 && (
                <div className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-900/10 p-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm bg-blue-500 text-white flex items-center justify-center text-[8px]">↓</span>
                    Input Variables
                  </h4>
                  <div className="space-y-1.5">
                    {step.input_variables.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                          {`{{`}{v.name}{`}}`}
                        </span>
                        <span className="text-gray-400 shrink-0">=</span>
                        <span className={`font-mono flex-1 truncate ${v.value !== undefined ? 'text-gray-700 dark:text-gray-300' : 'text-red-400 italic'}`}>
                          {v.value ?? 'unresolved'}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                          {v.source_label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Output variables */}
              {step.output_variables?.length > 0 && (
                <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-900/10 p-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm bg-emerald-500 text-white flex items-center justify-center text-[8px]">↑</span>
                    Output Variables
                  </h4>
                  <div className="space-y-1.5">
                    {step.output_variables.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                          {v.name}
                        </span>
                        <span className="text-gray-400 shrink-0">=</span>
                        <span className={`font-mono flex-1 truncate ${v.value !== undefined ? 'text-gray-700 dark:text-gray-300' : 'text-red-400 italic'}`}
                          title={v.value}>
                          {v.value ?? 'not extracted'}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                          {v.source_label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Request & Response side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Request</h4>
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 text-xs font-mono space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`${METHOD_COLORS[step.request.method] ?? 'bg-gray-500'} text-white text-[10px] font-bold px-1.5 py-0.5 rounded`}>
                    {step.request.method}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 break-all">{step.request.url}</span>
                </div>
                {step.request.headers.map((h, i) => (
                  <p key={i} className="text-gray-500"><span className="text-indigo-500">{h.key}</span>: {h.value}</p>
                ))}
                {step.request.body && (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 max-h-48 overflow-auto bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-[11px]">
                    {step.request.body}
                  </pre>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Response</h4>
              {step.response ? (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 text-xs font-mono space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className={`text-base font-bold ${step.response.status_code < 400 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {step.response.status_code}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="w-3 h-3" />
                      {fmtDuration(step.response.duration_ms)}
                    </span>
                  </div>
                  {step.response.headers.slice(0, 5).map((h, i) => (
                    <p key={i} className="text-gray-500"><span className="text-indigo-500">{h.key}</span>: {h.value}</p>
                  ))}
                  {step.response.body && (
                    <pre className="mt-2 whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 max-h-48 overflow-auto bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-[11px]">
                      {step.response.body}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 text-sm text-gray-400 text-center">
                  No response received
                </div>
              )}
            </div>
          </div>

          {/* Assertion results */}
          {step.assertion_results.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Assertions · {passedAssertions}/{step.assertion_results.length} passed
              </h4>
              <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Type', 'Operator', 'Target', 'Expected', 'Actual', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {step.assertion_results.map((a, i) => (
                      <tr key={i} className={a.passed ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-red-50/50 dark:bg-red-900/10'}>
                        <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{a.type}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{a.operator}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{a.target ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{a.expected}</td>
                        <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={a.actual}>{a.actual}</td>
                        <td className="px-3 py-2">
                          {a.passed
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            : <XCircle className="w-4 h-4 text-red-500" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [report, setReport]   = useState<ExecutionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!id) return
    getReport(id).then(setReport).catch(() => setError('Failed to load report')).finally(() => setLoading(false))
  }, [id])

  const passRate = report ? Math.round((report.passed_steps / report.total_steps) * 100) : 0

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 page-enter">
        {/* Top nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/reports')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Reports
          </button>
          {report && (
            <a
              href={`/api/reports/${report.id}/pdf`}
              download={`report-${report.id.slice(0, 8)}.pdf`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-card"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </a>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            <div className="skeleton h-32 w-full rounded-2xl" />
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {report && (
          <>
            {/* Summary card */}
            <div className={`rounded-2xl border p-6 ${
              report.overall_status === 'passed'
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
                : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{report.test_plan_name}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(report.started_at).toLocaleString()} · {fmtDuration(report.duration_ms)}
                  </p>
                  {report.execution_mode === 'load_test' && report.load_test_summary && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 inline-flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      Load test · {report.load_test_summary.config.concurrency} vu
                      {report.load_test_summary.cancelled ? ' · cancelled' : ''}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-sm ${
                  report.overall_status === 'passed'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {report.overall_status === 'passed'
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <XCircle className="w-4 h-4" />
                  }
                  {report.overall_status === 'passed' ? 'PASSED' : 'FAILED'}
                </span>
              </div>

              {/* Stats */}
              <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.total_steps}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{report.execution_mode === 'load_test' ? 'Iterations' : 'Total'}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{report.passed_steps}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{report.execution_mode === 'load_test' ? 'Passed Iterations' : 'Passed'}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{report.failed_steps}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{report.execution_mode === 'load_test' ? 'Failed Iterations' : 'Failed'}</p>
                </div>
                <div className="hidden sm:block text-center">
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{passRate}%</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pass Rate</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="h-2 rounded-full bg-white/60 dark:bg-gray-800/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${report.overall_status === 'passed' ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${passRate}%` }}
                  />
                </div>
              </div>
            </div>

            {/* AI Summary */}
            {report.ai_summary && (
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-900/10 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">AI Summary</h2>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none
                  prose-headings:text-gray-800 dark:prose-headings:text-gray-200
                  prose-headings:font-semibold prose-headings:text-sm prose-headings:mt-3 prose-headings:mb-1
                  prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:text-sm prose-p:leading-relaxed prose-p:my-1
                  prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:text-sm
                  prose-ul:my-1 prose-ol:my-1
                  prose-code:text-indigo-700 dark:prose-code:text-indigo-300
                  prose-code:bg-indigo-100 dark:prose-code:bg-indigo-900/40
                  prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  prose-strong:text-gray-900 dark:prose-strong:text-white">
                  <ReactMarkdown>{report.ai_summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {report.execution_mode === 'load_test' && report.load_test_summary && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                    <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold">Requests</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{report.load_test_summary.total_requests}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                    <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold">Iter/s</p>
                    <p className="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400">{report.load_test_summary.throughput_iterations_per_sec.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                    <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold">Req/s</p>
                    <p className="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400">{report.load_test_summary.throughput_requests_per_sec.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                    <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold">P95 Iteration</p>
                    <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{fmtDuration(report.load_test_summary.p95_iteration_duration_ms)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Per-step latency</h2>
                  <div className="space-y-3">
                    {report.load_test_summary.per_step.map(step => (
                      <div key={step.step_id} className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">{step.step_name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {step.total_requests} requests · {step.failed_requests} failed
                            </p>
                          </div>
                          <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                            <p>avg {fmtDuration(step.avg_duration_ms)}</p>
                            <p>p95 {fmtDuration(step.p95_duration_ms)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {report.load_test_summary.error_counts.length > 0 && (
                  <div className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10 p-5">
                    <h2 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">Top errors</h2>
                    <div className="space-y-2">
                      {report.load_test_summary.error_counts.map((error, index) => (
                        <div key={`${error.step_id}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-white/70 dark:bg-gray-900/40 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{error.step_name}</p>
                            <p className="text-xs text-red-600 dark:text-red-400">{error.error}</p>
                          </div>
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">{error.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.load_test_summary.sampled_iterations.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sampled iterations</h2>
                    {report.load_test_summary.sampled_iterations.map(sample => (
                      <SampleIterationCard key={sample.iteration} sample={sample} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Step results */}
            {report.step_results.length > 0 && (
              <div className="space-y-2">
                {report.step_results.map((step, i) => (
                  <StepCard key={step.step_id} step={step} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
