import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Globe, Link2, ListTree, Send, Timer, Variable } from 'lucide-react'
import Layout from '../../components/Layout'
import { listTestPlans } from '../../api/client'
import { useEnvironment } from '../../context/EnvironmentContext'
import type { TestPlanSummary } from '../../types'

const fieldClassName = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500'

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      onClick={() => void handleCopy()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <CopyButton value={value} />
      </div>
      <pre className="overflow-x-auto bg-gray-50 dark:bg-gray-950 px-4 py-4 text-xs leading-6 text-gray-700 dark:text-gray-300">
        <code>{value}</code>
      </pre>
    </div>
  )
}

export default function WebhookGuidePage() {
  const { environments, activeEnvId } = useEnvironment()
  const [plans, setPlans] = useState<TestPlanSummary[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')

  useEffect(() => {
    listTestPlans()
      .then(items => {
        setPlans(items)
        if (!selectedPlanId && items[0]) setSelectedPlanId(items[0].id)
      })
      .catch(() => setPlans([]))
  }, [])

  useEffect(() => {
    if (!selectedEnvironmentId) {
      setSelectedEnvironmentId(activeEnvId ?? environments[0]?.id ?? '')
    }
  }, [activeEnvId, environments, selectedEnvironmentId])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const endpoint = `${origin}/api/webhooks/trigger`
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId)
  const selectedEnvironment = environments.find(environment => environment.id === selectedEnvironmentId)

  const queryExample = useMemo(() => {
    const params = new URLSearchParams()
    if (selectedPlanId) params.set('test_plan', selectedPlanId)
    if (selectedEnvironmentId) params.set('environment', selectedEnvironmentId)
    params.set('customer_id', '12345')
    params.set('region', 'us-east-1')
    if (scheduleAt) {
      params.set('scheduled_at', new Date(scheduleAt).toISOString())
    }

    return `curl -X POST "${endpoint}?${params.toString()}"`
  }, [endpoint, scheduleAt, selectedEnvironmentId, selectedPlanId])

  const formExample = useMemo(() => {
    const lines = [
      `curl -X POST "${endpoint}" \\`,
      '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    ]

    if (selectedPlanId) lines.push(`  --data-urlencode "test_plan=${selectedPlanId}" \\`)
    if (selectedEnvironmentId) lines.push(`  --data-urlencode "environment=${selectedEnvironmentId}" \\`)
    lines.push('  --data-urlencode "customer_id=12345" \\')
    lines.push('  --data-urlencode "region=us-east-1" \\')
    if (scheduleAt) {
      lines.push(`  --data-urlencode "scheduled_at=${new Date(scheduleAt).toISOString()}" \\`)
    }
    lines.push('  --data-urlencode "build_number=2026.04.18"')
    return lines.join('\n')
  }, [endpoint, scheduleAt, selectedEnvironmentId, selectedPlanId])

  const fetchExample = useMemo(() => {
    const scheduleLine = scheduleAt
      ? `  scheduled_at: '${new Date(scheduleAt).toISOString()}',\n`
      : ''

    return `await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    test_plan: '${selectedPlanId}',
    environment: '${selectedEnvironmentId}',
${scheduleLine}    customer_id: '12345',
    region: 'us-east-1',
    build_number: '2026.04.18',
  }),
})`
  }, [endpoint, scheduleAt, selectedEnvironmentId, selectedPlanId])

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 page-enter">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Webhooks</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Trigger a test plan from external systems using query parameters or an urlencoded POST body.
            </p>
          </div>
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 px-4 py-3 text-sm text-indigo-700 dark:text-indigo-300">
            <div className="font-semibold">Endpoint</div>
            <code className="mt-1 block text-xs">{endpoint}</code>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-card space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Example builder</h2>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <ListTree className="w-3.5 h-3.5" />
                Test plan
              </label>
              <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} className={fieldClassName}>
                <option value="">Select test plan</option>
                {plans.map(plan => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
              {selectedPlan && (
                <p className="mt-1 text-xs text-gray-400">{selectedPlan.step_count} embedded step(s)</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Globe className="w-3.5 h-3.5" />
                Environment
              </label>
              <select value={selectedEnvironmentId} onChange={e => setSelectedEnvironmentId(e.target.value)} className={fieldClassName}>
                <option value="">Select environment</option>
                {environments.map(environment => (
                  <option key={environment.id} value={environment.id}>{environment.name}</option>
                ))}
              </select>
              {selectedEnvironment && (
                <p className="mt-1 text-xs text-gray-400">
                  {Object.keys(selectedEnvironment.variables).length} saved variable(s) will be merged with webhook overrides
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Timer className="w-3.5 h-3.5" />
                Scheduled time (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className={fieldClassName}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-card">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">How it works</h2>
            <ul className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex gap-2">
                <Send className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                Send a <strong>POST</strong> request to <code className="font-mono">/api/webhooks/trigger</code>.
              </li>
              <li className="flex gap-2">
                <Variable className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                Reserved fields are <code className="font-mono">test_plan</code>, <code className="font-mono">environment</code>, and optional <code className="font-mono">scheduled_at</code>.
              </li>
              <li className="flex gap-2">
                <Link2 className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                All other fields become runtime environment overrides for that execution only.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                Query params and form fields are merged together. If both send the same key, the form value wins.
              </li>
            </ul>

            <div className="mt-5 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Field</th>
                    <th className="px-3 py-2 text-left font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">test_plan</td>
                    <td className="px-3 py-2">Test plan ID or exact name to execute</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">environment</td>
                    <td className="px-3 py-2">Environment ID or exact name to seed variables from</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">scheduled_at</td>
                    <td className="px-3 py-2">Optional RFC 3339 timestamp for delayed execution</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">any_other_key</td>
                    <td className="px-3 py-2">Merged into the selected environment as per-run overrides</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <CodeBlock title="Query parameter trigger" value={queryExample} />
        <CodeBlock title="application/x-www-form-urlencoded POST" value={formExample} />
        <CodeBlock title="JavaScript fetch example" value={fetchExample} />
      </div>
    </Layout>
  )
}
