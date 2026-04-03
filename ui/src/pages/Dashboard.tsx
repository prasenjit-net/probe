import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import Layout from '../components/Layout'
import type { HealthData, MetricsData } from '../types'

// ── Small stat card ──────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: ReactNode
  sub?: string
  accent?: boolean
}

function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${
        accent
          ? 'bg-brand-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-white'
      }`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${accent ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && (
        <p className={`mt-1 text-xs ${accent ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'ok'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Healthy' : status}
    </span>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Dashboard page ───────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000

export default function Dashboard() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [hRes, mRes] = await Promise.all([
        api.get<HealthData>('/health'),
        api.get<MetricsData>('/metrics/summary'),
      ])
      setHealth(hRes.data)
      setMetrics(mRes.data)
      setLastRefresh(new Date())
      setError(null)
    } catch {
      setError('Failed to fetch data from the server.')
    }
  }, [])

  useEffect(() => {
    void fetchAll()
    const id = setInterval(() => void fetchAll(), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchAll])

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          {lastRefresh && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              Last updated {lastRefresh.toLocaleTimeString()} · auto-refreshes every 30 s
            </p>
          )}
        </div>
        <button
          onClick={() => void fetchAll()}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm
                     text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Health section ── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Health
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Status"
            value={health ? <StatusBadge status={health.status} /> : '—'}
            accent
          />
          <StatCard
            label="Uptime"
            value={health ? formatUptime(health.uptime_seconds) : '—'}
          />
          <StatCard
            label="App"
            value={health?.app_name ?? '—'}
            sub={`v${health?.version ?? '…'}`}
          />
          <StatCard
            label="Server Time"
            value={
              health
                ? new Date(health.timestamp).toLocaleTimeString()
                : '—'
            }
            sub={health ? new Date(health.timestamp).toLocaleDateString() : undefined}
          />
        </div>
      </section>

      {/* ── Metrics section ── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Metrics
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Requests"
            value={metrics?.requests_total ?? '—'}
            sub="health endpoint hits"
          />
          <StatCard
            label="Active Sessions"
            value={metrics?.active_sessions ?? '—'}
            sub="authenticated users"
          />
          <StatCard
            label="Login Success"
            value={metrics?.login_success_total ?? '—'}
          />
          <StatCard
            label="Login Failures"
            value={metrics?.login_failure_total ?? '—'}
          />
        </div>
      </section>

      {/* ── Prometheus link ── */}
      <section className="mt-8">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Prometheus metrics are available at{' '}
          <a
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-brand-600 dark:hover:text-brand-500"
          >
            /metrics
          </a>
        </p>
      </section>
    </Layout>
  )
}
