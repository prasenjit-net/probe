import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Globe, ClipboardList, PlayCircle, FileText,
  CheckCircle2, XCircle, Clock, TrendingUp, Activity,
  ArrowRight, Loader2, AlertTriangle,
} from 'lucide-react'
import { api } from '../api/client'
import { listRequests, listTestPlans, listExecutions, listReports } from '../api/client'
import Layout from '../components/Layout'
import type {
  HealthData, HttpRequestSummary, TestPlanSummary,
  Execution, ReportSummary, ExecutionStatus,
} from '../types'

const fmtDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500', POST: 'bg-blue-500', PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500', DELETE: 'bg-red-500', HEAD: 'bg-purple-500', OPTIONS: 'bg-gray-500',
}

const EXEC_STATUS_CONFIG: Record<ExecutionStatus, { label: string; dot: string; text: string }> = {
  queued:    { label: 'Queued',    dot: 'bg-amber-400',  text: 'text-amber-700 dark:text-amber-400' },
  running:   { label: 'Running',   dot: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-400'   },
  completed: { label: 'Completed', dot: 'bg-emerald-500',text: 'text-emerald-700 dark:text-emerald-400' },
  failed:    { label: 'Failed',    dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400'     },
  cancelled: { label: 'Cancelled', dot: 'bg-gray-400',   text: 'text-gray-500 dark:text-gray-400'   },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, gradient,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  gradient?: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 shadow-card ${gradient ?? 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-widest ${gradient ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>
            {label}
          </p>
          <p className={`mt-1.5 text-3xl font-bold ${gradient ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
            {value}
          </p>
          {sub && (
            <p className={`mt-1 text-xs ${gradient ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
              {sub}
            </p>
          )}
        </div>
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${gradient ? 'bg-white/20' : 'bg-indigo-50 dark:bg-indigo-900/30'}`}>
          <span className={gradient ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}>
            {icon}
          </span>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, href, navigate }: { title: string; href: string; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</h3>
      <button
        onClick={() => navigate(href)}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
      >
        View all <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  )
}

function PassRateBar({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-9 text-right ${pct === 100 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
        {pct}%
      </span>
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000

export default function Dashboard() {
  const navigate = useNavigate()
  const [health, setHealth]       = useState<HealthData | null>(null)
  const [requests, setRequests]   = useState<HttpRequestSummary[]>([])
  const [plans, setPlans]         = useState<TestPlanSummary[]>([])
  const [executions, setExecs]    = useState<Execution[]>([])
  const [reports, setReports]     = useState<ReportSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [hRes, req, pl, ex, rep] = await Promise.all([
        api.get<HealthData>('/health').then(r => r.data).catch(() => null),
        listRequests().catch(() => []),
        listTestPlans().catch(() => []),
        listExecutions().catch(() => []),
        listReports().catch(() => []),
      ])
      setHealth(hRes)
      setRequests(req)
      setPlans(pl)
      setExecs(ex)
      setReports(rep)
      setLastRefresh(new Date())
      setError(null)
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
    const id = setInterval(() => void fetchAll(), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchAll])

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const execByStatus = executions.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1
    return acc
  }, {})

  const totalPassed  = reports.reduce((s, r) => s + r.passed_steps, 0)
  const totalSteps   = reports.reduce((s, r) => s + r.total_steps, 0)
  const overallPassRate = totalSteps > 0 ? Math.round((totalPassed / totalSteps) * 100) : null
  const passedReports = reports.filter(r => r.overall_status === 'passed').length

  const activeExecs  = executions.filter(e => e.status === 'queued' || e.status === 'running')
  const recentReports = [...reports]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 5)

  const totalAssertions = requests.reduce((s, r) => s + r.assertion_count, 0)

  return (
    <Layout>
      <div className="space-y-8 page-enter">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {lastRefresh
                ? `Last updated ${lastRefresh.toLocaleTimeString()} · auto-refreshes every 30s`
                : 'Loading…'}
            </p>
          </div>
          <button
            onClick={() => void fetchAll()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-card"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<Globe className="w-5 h-5" />}
              label="HTTP Requests"
              value={loading ? <span className="skeleton h-8 w-16 rounded block" /> : requests.length}
              sub={`${totalAssertions} assertions total`}
              gradient="bg-gradient-to-br from-indigo-500 to-indigo-700"
            />
            <KpiCard
              icon={<ClipboardList className="w-5 h-5" />}
              label="Test Plans"
              value={loading ? <span className="skeleton h-8 w-16 rounded block" /> : plans.length}
              sub={plans.length > 0 ? `avg ${(plans.reduce((s, p) => s + p.step_count, 0) / plans.length).toFixed(1)} steps` : 'No plans yet'}
              gradient="bg-gradient-to-br from-violet-500 to-violet-700"
            />
            <KpiCard
              icon={<PlayCircle className="w-5 h-5" />}
              label="Executions"
              value={loading ? <span className="skeleton h-8 w-16 rounded block" /> : executions.length}
              sub={activeExecs.length > 0 ? `${activeExecs.length} active` : 'None active'}
              gradient="bg-gradient-to-br from-blue-500 to-blue-700"
            />
            <KpiCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Pass Rate"
              value={loading ? <span className="skeleton h-8 w-16 rounded block" /> : overallPassRate !== null ? `${overallPassRate}%` : '—'}
              sub={reports.length > 0 ? `${passedReports}/${reports.length} reports passed` : 'No reports yet'}
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
          </div>
        </section>

        {/* ── Execution Status Breakdown ── */}
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Execution Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(['queued', 'running', 'completed', 'failed', 'cancelled'] as ExecutionStatus[]).map(status => {
              const cfg = EXEC_STATUS_CONFIG[status]
              const count = execByStatus[status] ?? 0
              return (
                <div key={status} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-center shadow-card">
                  <div className={`mx-auto mb-1.5 w-2.5 h-2.5 rounded-full ${cfg.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
                  <p className={`text-2xl font-bold ${cfg.text}`}>{count}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{cfg.label}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Two-column section: Recent Reports + Active Executions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recent Reports */}
          <section>
            <SectionHeader title="Recent Reports" href="/reports" navigate={navigate} />
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-card overflow-hidden">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
                </div>
              ) : recentReports.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No reports yet
                </div>
              ) : (
                <ul className="divide-y divide-gray-50 dark:divide-gray-800/80">
                  {recentReports.map(r => (
                    <li
                      key={r.id}
                      onClick={() => navigate(`/reports/${r.id}`)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                    >
                      {r.overall_status === 'passed'
                        ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                        : <XCircle className="w-4 h-4 shrink-0 text-red-500" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{r.test_plan_name}</p>
                        <PassRateBar passed={r.passed_steps} total={r.total_steps} />
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {fmtDuration(r.duration_ms)}
                        </p>
                        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">
                          {new Date(r.started_at).toLocaleDateString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Request Library & Test Plans */}
          <section className="space-y-4">
            {/* Request Library */}
            <div>
              <SectionHeader title="Request Library" href="/requests" navigate={navigate} />
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-card overflow-hidden">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[1,2,3].map(i => <div key={i} className="skeleton h-9 rounded-lg" />)}
                  </div>
                ) : requests.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">
                    <Globe className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
                    No requests yet
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50 dark:divide-gray-800/80">
                    {requests.slice(0, 4).map(req => (
                      <li
                        key={req.id}
                        onClick={() => navigate(`/requests/${req.id}`)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                      >
                        <span className={`shrink-0 text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${METHOD_COLORS[req.method] ?? 'bg-gray-500'}`}>
                          {req.method}
                        </span>
                        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{req.name}</span>
                        {req.assertion_count > 0 && (
                          <span className="shrink-0 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full">
                            {req.assertion_count} assert
                          </span>
                        )}
                      </li>
                    ))}
                    {requests.length > 4 && (
                      <li className="px-4 py-2 text-xs text-center text-gray-400 dark:text-gray-500">
                        +{requests.length - 4} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Active Executions */}
            <div>
              <SectionHeader title="Active Executions" href="/executions" navigate={navigate} />
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-card overflow-hidden">
                {loading ? (
                  <div className="p-4 space-y-2">
                    {[1,2].map(i => <div key={i} className="skeleton h-9 rounded-lg" />)}
                  </div>
                ) : activeExecs.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">
                    <Activity className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
                    No active executions
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50 dark:divide-gray-800/80">
                    {activeExecs.map(ex => {
                      const cfg = EXEC_STATUS_CONFIG[ex.status]
                      return (
                        <li key={ex.id} className="flex items-center gap-3 px-4 py-2.5">
                          {ex.status === 'running'
                            ? <Loader2 className="w-4 h-4 shrink-0 text-blue-500 animate-spin" />
                            : <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                          }
                          <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{ex.test_plan_name}</span>
                          <span className={`shrink-0 text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── System Health ── */}
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            System Health
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: 'Status',
                value: health ? (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${health.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${health.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {health.status === 'ok' ? 'Healthy' : health.status}
                  </span>
                ) : '—',
              },
              { label: 'Uptime', value: health ? formatUptime(health.uptime_seconds) : '—' },
              { label: 'Version', value: health ? `v${health.version}` : '—', sub: health?.app_name },
              {
                label: 'Server Time',
                value: health ? new Date(health.timestamp).toLocaleTimeString() : '—',
                sub: health ? new Date(health.timestamp).toLocaleDateString() : undefined,
              },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-card">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">{card.label}</p>
                <div className="text-base font-bold text-gray-900 dark:text-white">{card.value}</div>
                {'sub' in card && card.sub && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{card.sub}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  )
}
