import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import Layout from '../../components/Layout'
import { getReport } from '../../api/client'
import type { ExecutionReport, StepResult } from '../../types'

const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500', POST: 'bg-blue-500', PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500', DELETE: 'bg-red-500', HEAD: 'bg-purple-500', OPTIONS: 'bg-gray-500',
}

function exportToPDF(report: ExecutionReport) {
  const win = window.open('', '_blank')
  if (!win) return
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stepsHtml = report.step_results.map((step, i) => `
    <div class="step ${step.passed ? 'pass' : 'fail'}">
      <h3>${i + 1}. ${esc(step.request_name)} <span class="badge ${step.passed ? 'badge-pass' : 'badge-fail'}">${step.passed ? 'PASSED' : 'FAILED'}</span></h3>
      ${step.error ? `<p class="error">Error: ${esc(step.error)}</p>` : ''}
      <div class="row">
        <div class="col"><h4>Request</h4>
          <p><b>Method:</b> ${esc(step.request.method)} &nbsp; <b>URL:</b> ${esc(step.request.url)}</p>
          ${step.request.headers.length ? `<p><b>Headers:</b> ${step.request.headers.map(h => `${esc(h.key)}: ${esc(h.value)}`).join(', ')}</p>` : ''}
          ${step.request.body ? `<pre>${esc(step.request.body)}</pre>` : ''}
        </div>
        ${step.response ? `<div class="col"><h4>Response</h4>
          <p><b>Status:</b> ${step.response.status_code} &nbsp; <b>Duration:</b> ${fmtDuration(step.response.duration_ms)}</p>
          <pre>${esc(step.response.body.slice(0, 2000))}${step.response.body.length > 2000 ? '\n…(truncated)' : ''}</pre>
        </div>` : ''}
      </div>
      ${step.assertion_results.length ? `
        <h4>Assertions</h4>
        <table><tr><th>Type</th><th>Operator</th><th>Target</th><th>Expected</th><th>Actual</th><th>Result</th></tr>
        ${step.assertion_results.map(a => `<tr class="${a.passed ? 'a-pass' : 'a-fail'}">
          <td>${esc(a.type)}</td><td>${esc(a.operator)}</td><td>${esc(a.target ?? '')}</td>
          <td>${esc(a.expected)}</td><td>${esc(a.actual)}</td>
          <td>${a.passed ? '✓ Pass' : '✗ Fail'}</td>
        </tr>`).join('')}</table>` : ''}
    </div>
  `).join('')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Report: ${esc(report.test_plan_name)}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#111;}
    h1{font-size:20px;}h2{font-size:16px;}h3{font-size:14px;margin-top:16px;}h4{font-size:12px;color:#555;margin:8px 0 4px;}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;}
    .badge-pass{background:#d1fae5;color:#065f46;}.badge-fail{background:#fee2e2;color:#991b1b;}
    .step{border:1px solid #ddd;border-radius:6px;padding:12px;margin:12px 0;}
    .step.pass{border-left:4px solid #10b981;}.step.fail{border-left:4px solid #ef4444;}
    .row{display:flex;gap:12px;}.col{flex:1;min-width:0;}
    pre{background:#f5f5f5;padding:8px;border-radius:4px;overflow:auto;white-space:pre-wrap;word-break:break-all;font-size:11px;}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;}
    th,td{border:1px solid #ddd;padding:4px 8px;text-align:left;}th{background:#f5f5f5;}
    .a-pass td{background:#f0fdf4;}.a-fail td{background:#fff1f2;}
    .error{color:#dc2626;font-weight:bold;}
    .summary{display:flex;gap:24px;margin:12px 0;}.stat{text-align:center;}.stat .val{font-size:24px;font-weight:bold;}
    @media print{.no-print{display:none;}}
  </style></head><body>
  <h1>Test Report: ${esc(report.test_plan_name)}</h1>
  <p><b>Status:</b> <span class="badge ${report.overall_status === 'passed' ? 'badge-pass' : 'badge-fail'}">${report.overall_status.toUpperCase()}</span>
  &nbsp;<b>Started:</b> ${new Date(report.started_at).toLocaleString()} &nbsp;<b>Duration:</b> ${fmtDuration(report.duration_ms)}</p>
  <div class="summary">
    <div class="stat"><div class="val">${report.total_steps}</div><div>Total</div></div>
    <div class="stat"><div class="val" style="color:#10b981">${report.passed_steps}</div><div>Passed</div></div>
    <div class="stat"><div class="val" style="color:#ef4444">${report.failed_steps}</div><div>Failed</div></div>
  </div><hr/>${stepsHtml}
  <script>window.print()</script></body></html>`)
  win.document.close()
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
            <button
              onClick={() => exportToPDF(report)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-card"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{report.passed_steps}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Passed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{report.failed_steps}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Failed</p>
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

            {/* Step results */}
            <div className="space-y-2">
              {report.step_results.map((step, i) => (
                <StepCard key={step.step_id} step={step} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}


