import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import Layout from '../../components/Layout'
import { getTestPlan, createTestPlan, updateTestPlan, listRequests } from '../../api/client'
import type { TestPlanStep, ExtractVariable, HttpRequestSummary, VariableSource } from '../../types'

const emptyExtract = (): ExtractVariable => ({ var_name: '', path: '$', source: 'response_body' })

export default function TestPlanDesigner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<TestPlanStep[]>([])
  const [requestLibrary, setRequestLibrary] = useState<HttpRequestSummary[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listRequests().then(setRequestLibrary).catch(() => {})
    if (!id) return
    getTestPlan(id).then(plan => {
      setName(plan.name); setDescription(plan.description)
      setSteps(plan.steps.map(s => ({
        id: s.id, request_id: s.request_id, name: s.name,
        enabled: s.enabled, extract_variables: s.extract_variables,
      })))
    }).catch(() => setError('Failed to load test plan'))
  }, [id])

  const addStep = (req: HttpRequestSummary) => {
    setSteps(prev => [...prev, {
      id: uuidv4(), request_id: req.id, name: req.name,
      enabled: true, extract_variables: [],
    }])
    setShowPicker(false); setPickerSearch('')
  }

  const removeStep = (stepId: string) => setSteps(prev => prev.filter(s => s.id !== stepId))

  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...steps]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSteps(next)
  }

  const updateStep = (stepId: string, patch: Partial<TestPlanStep>) =>
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s))

  const addExtract = (stepId: string) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, extract_variables: [...s.extract_variables, emptyExtract()] }
      : s))

  const updateExtract = (stepId: string, idx: number, patch: Partial<ExtractVariable>) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, extract_variables: s.extract_variables.map((e, i) => i === idx ? { ...e, ...patch } : e) }
      : s))

  const removeExtract = (stepId: string, idx: number) =>
    setSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, extract_variables: s.extract_variables.filter((_, i) => i !== idx) }
      : s))

  const handleSave = async () => {
    if (!name.trim()) return setError('Name is required')
    setSaving(true); setError('')
    try {
      if (isEdit && id) await updateTestPlan(id, { name, description, steps })
      else await createTestPlan({ name, description, steps })
      navigate('/test-plans')
    } catch {
      setError('Failed to save test plan')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const selectCls = inputCls
  const filtered = requestLibrary.filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()) || r.url.toLowerCase().includes(pickerSearch.toLowerCase()))

  return (
    <Layout>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isEdit ? 'Edit Test Plan' : 'New Test Plan'}</h1>
          <button onClick={() => navigate('/test-plans')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">← Back</button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Info */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="User Auth Flow" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Optional description" />
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Steps ({steps.length})</h2>
            <button onClick={() => setShowPicker(true)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors">
              + Add Step
            </button>
          </div>

          {steps.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No steps yet. Add a request from the library.</p>
          )}

          <div className="space-y-2">
            {steps.map((step, idx) => {
              const reqInfo = requestLibrary.find(r => r.id === step.request_id)
              const isExpanded = expandedStep === step.id
              return (
                <div key={step.id} className={`rounded-lg border ${step.enabled ? 'border-gray-200 dark:border-gray-600' : 'border-dashed border-gray-300 dark:border-gray-600 opacity-60'} bg-gray-50 dark:bg-gray-700/40`}>
                  <div className="flex items-center gap-2 p-3">
                    <span className="w-6 text-center text-xs text-gray-400 shrink-0">{idx + 1}</span>
                    <input
                      value={step.name}
                      onChange={e => updateStep(step.id, { name: e.target.value })}
                      className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-white focus:outline-none"
                    />
                    {reqInfo && (
                      <span className="text-xs text-gray-400 font-mono truncate max-w-48">{reqInfo.method} {reqInfo.url}</span>
                    )}
                    <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={step.enabled} onChange={e => updateStep(step.id, { enabled: e.target.checked })} className="rounded" />
                      Enabled
                    </label>
                    <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm px-1">↑</button>
                    <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm px-1">↓</button>
                    <button onClick={() => setExpandedStep(isExpanded ? null : step.id)} className="text-xs text-indigo-500 hover:text-indigo-700 px-2">
                      {isExpanded ? 'Hide' : 'Variables'}
                    </button>
                    <button onClick={() => removeStep(step.id)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Extract Variables (for next steps)</p>
                        <button onClick={() => addExtract(step.id)} className="text-xs text-indigo-500 hover:text-indigo-700">+ Add</button>
                      </div>
                      {step.extract_variables.map((ev, evIdx) => (
                        <div key={evIdx} className="flex gap-2 items-center">
                          <input value={ev.var_name} onChange={e => updateExtract(step.id, evIdx, { var_name: e.target.value })} className={`${inputCls} w-28`} placeholder="token" />
                          <select value={ev.source} onChange={e => updateExtract(step.id, evIdx, { source: e.target.value as VariableSource })} className={`${selectCls} w-44`}>
                            <option value="response_body">Response Body</option>
                            <option value="response_header">Response Header</option>
                            <option value="status_code">Status Code</option>
                          </select>
                          <input value={ev.path} onChange={e => updateExtract(step.id, evIdx, { path: e.target.value })} className={`${inputCls} flex-1`} placeholder="$.data.token" />
                          <button onClick={() => removeExtract(step.id, evIdx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                        </div>
                      ))}
                      {step.extract_variables.length === 0 && (
                        <p className="text-xs text-gray-400">No variable extractions configured.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Test Plan'}
          </button>
          <button onClick={() => navigate('/test-plans')} className="rounded-md border border-gray-300 dark:border-gray-600 px-6 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
        </div>
      </div>

      {/* Request picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Add Request to Plan</h3>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Search requests…"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              className={inputCls}
            />
            <div className="max-h-80 overflow-y-auto space-y-2">
              {filtered.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No requests found. Create some in the Request Library first.</p>}
              {filtered.map(req => (
                <button
                  key={req.id}
                  onClick={() => addStep(req)}
                  className="w-full flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                >
                  <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold font-mono bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">{req.method}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{req.name}</p>
                    <p className="text-xs text-gray-400 truncate font-mono">{req.url}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
