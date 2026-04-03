import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getReport } from '../../api/client'
import type { ExecutionReport, StepResult } from '../../types'

function exportToPDF(report: ExecutionReport) {
  const win = window.open('', '_blank')
  if (!win) return
  const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const stepsHtml = report.step_results.map((step, i) => `
    <div class="step ${step.passed ? 'pass' : 'fail'}">
      <h3>${i + 1}. ${esc(step.request_name)} <span class="badge ${step.passed ? 'badge-pass' : 'badge-fail'}">${step.passed ? 'PASSED' : 'FAILED'}</span></h3>
      ${step.error ? `<p class="error">Error: ${esc(step.error)}</p>` : ''}
      <div class="row">
        <div class="col">
          <h4>Request</h4>
          <p><b>Method:</b> ${esc(step.request.method)} &nbsp; <b>URL:</b> ${esc(step.request.url)}</p>
          ${step.request.headers.length ? `<p><b>Headers:</b> ${step.request.headers.map(h => `${esc(h.key)}: ${esc(h.value)}`).join(', ')}</p>` : ''}
          ${step.request.body ? `<pre>${esc(step.request.body)}</pre>` : ''}
        </div>
        ${step.response ? `<div class="col">
          <h4>Response</h4>
          <p><b>Status:</b> ${step.response.status_code} &nbsp; <b>Duration:</b> ${fmtDuration(step.response.duration_ms)}</p>
          <pre>${esc(step.response.body.slice(0, 1000))}${step.response.body.length > 1000 ? '\n…(truncated)' : ''}</pre>
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
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
    h1 { font-size: 20px; } h2 { font-size: 16px; } h3 { font-size: 14px; margin-top: 16px; }
    h4 { font-size: 12px; color: #555; margin: 8px 0 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-pass { background: #d1fae5; color: #065f46; } .badge-fail { background: #fee2e2; color: #991b1b; }
    .step { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin: 12px 0; }
    .step.pass { border-left: 4px solid #10b981; } .step.fail { border-left: 4px solid #ef4444; }
    .row { display: flex; gap: 12px; } .col { flex: 1; min-width: 0; }
    pre { background: #f5f5f5; padding: 8px; border-radius: 4px; overflow: auto; white-space: pre-wrap; word-break: break-all; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
    th { background: #f5f5f5; } .a-pass td { background: #f0fdf4; } .a-fail td { background: #fff1f2; }
    .error { color: #dc2626; font-weight: bold; }
    .summary { display: flex; gap: 24px; margin: 12px 0; }
    .stat { text-align: center; } .stat .val { font-size: 24px; font-weight: bold; }
    @media print { .no-print { display: none; } }
  </style></head><body>
  <h1>Test Report: ${esc(report.test_plan_name)}</h1>
  <p>
    <b>Status:</b> <span class="badge ${report.overall_status === 'passed' ? 'badge-pass' : 'badge-fail'}">${report.overall_status.toUpperCase()}</span> &nbsp;
    <b>Started:</b> ${new Date(report.started_at).toLocaleString()} &nbsp;
    <b>Duration:</b> ${fmtDuration(report.duration_ms)}
  </p>
  <div class="summary">
    <div class="stat"><div class="val">${report.total_steps}</div><div>Total</div></div>
    <div class="stat"><div class="val" style="color:#10b981">${report.passed_steps}</div><div>Passed</div></div>
    <div class="stat"><div class="val" style="color:#ef4444">${report.failed_steps}</div><div>Failed</div></div>
  </div>
  <hr/>
  ${stepsHtml}
  <script>window.print()</script>
  </body></html>`)
  win.document.close()
}

function StepCard({ step, index }: { step: StepResult; index: number }) {
  const [open, setOpen] = useState(!step.passed)
  return (
    <div className={`rounded-lg border ${step.passed ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'} bg-white dark:bg-gray-800`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold text-white ${step.passed ? 'bg-green-500' : 'bg-red-500'}`}>
          {step.passed ? '✓' : '✗'}
        </span>
        <span className="font-medium text-gray-900 dark:text-white flex-1">{index + 1}. {step.request_name}</span>
        <span className="text-xs font-mono text-gray-500">{step.request.method} {step.request.url}</span>
        {step.response && <span className="text-xs text-gray-400">{step.response.duration_ms}ms</span>}
        <span className={`text-xs font-semibold ${step.passed ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
          {step.passed ? 'PASSED' : 'FAILED'}
        </span>
        <span className="text-gray-400 ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-4">
          {step.error && (
            <p className="text-red-600 dark:text-red-400 text-sm font-medium">⚠ {step.error}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Request */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Request</h4>
              <div className="rounded bg-gray-50 dark:bg-gray-700 p-3 text-xs font-mono space-y-1">
                <p><span className="font-bold">{step.request.method}</span> {step.request.url}</p>
                {step.request.headers.map((h, i) => (
                  <p key={i} className="text-gray-500">{h.key}: {h.value}</p>
                ))}
                {step.request.body && (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300 max-h-40 overflow-auto">{step.request.body}</pre>
                )}
              </div>
            </div>

            {/* Response */}
            {step.response ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Response</h4>
                <div className="rounded bg-gray-50 dark:bg-gray-700 p-3 text-xs font-mono space-y-1">
                  <p>
                    <span className={`font-bold ${step.response.status_code < 400 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {step.response.status_code}
                    </span>
                    <span className="text-gray-400 ml-2">{step.response.duration_ms}ms</span>
                  </p>
                  {step.response.headers.slice(0, 6).map((h, i) => (
                    <p key={i} className="text-gray-500">{h.key}: {h.value}</p>
                  ))}
                  {step.response.body && (
                    <pre className="mt-2 whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300 max-h-40 overflow-auto">{step.response.body}</pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Response</h4>
                <p className="text-sm text-gray-400">No response received</p>
              </div>
            )}
          </div>

          {/* Assertions */}
          {step.assertion_results.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assertions ({step.assertion_results.filter(a => a.passed).length}/{step.assertion_results.length} passed)</h4>
              <div className="rounded overflow-hidden border border-gray-200 dark:border-gray-600">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Operator</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Target</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Expected</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Actual</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {step.assertion_results.map((a, i) => (
                      <tr key={i} className={a.passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}>
                        <td className="px-3 py-2 font-mono">{a.type}</td>
                        <td className="px-3 py-2 font-mono">{a.operator}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{a.target ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">{a.expected}</td>
                        <td className="px-3 py-2 font-mono">{a.actual.slice(0, 80)}</td>
                        <td className={`px-3 py-2 font-semibold ${a.passed ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {a.passed ? '✓ Pass' : '✗ Fail'}
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
  const [report, setReport] = useState<ExecutionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getReport(id).then(setReport).catch(() => setError('Failed to load report')).finally(() => setLoading(false))
  }, [id])

  const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/reports')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">← Back to Reports</button>
          {report && (
            <button
              onClick={() => exportToPDF(report)}
              className="rounded-md bg-gray-800 dark:bg-gray-200 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
            >
              ⬇ Export PDF
            </button>
          )}
        </div>

        {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}

        {report && (
          <>
            {/* Header banner */}
            <div className={`rounded-xl p-6 ${report.overall_status === 'passed' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{report.test_plan_name}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(report.started_at).toLocaleString()} · Duration: {fmtDuration(report.duration_ms)}
                  </p>
                </div>
                <span className={`text-lg font-bold px-4 py-2 rounded-lg ${report.overall_status === 'passed' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                  {report.overall_status === 'passed' ? '✓ PASSED' : '✗ FAILED'}
                </span>
              </div>

              <div className="flex gap-8 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{report.total_steps}</p>
                  <p className="text-xs text-gray-500">Total Steps</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{report.passed_steps}</p>
                  <p className="text-xs text-gray-500">Passed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{report.failed_steps}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              </div>
            </div>

            {/* Step results */}
            <div className="space-y-3">
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
