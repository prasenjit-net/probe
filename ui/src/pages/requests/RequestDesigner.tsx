import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import Layout from '../../components/Layout'
import { getRequest, createRequest, updateRequest } from '../../api/client'
import type { HttpMethod, BodyType, KeyValue, Assertion, AssertionType, AssertionOperator } from '../../types'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'form_url_encoded', label: 'Form URL Encoded' },
]
const ASSERTION_TYPES: { value: AssertionType; label: string }[] = [
  { value: 'status_code', label: 'Status Code' },
  { value: 'body_contains', label: 'Body Contains' },
  { value: 'json_path', label: 'JSON Path' },
  { value: 'header', label: 'Header' },
  { value: 'response_time', label: 'Response Time (ms)' },
]
const OPERATORS: { value: AssertionOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not Contains' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'regex', label: 'Matches Regex' },
]

const emptyKV = (): KeyValue => ({ key: '', value: '' })
const emptyAssertion = (): Assertion => ({
  id: uuidv4(), type: 'status_code', operator: 'equals', expected_value: '200',
})

export default function RequestDesigner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<KeyValue[]>([emptyKV()])
  const [bodyType, setBodyType] = useState<BodyType>('none')
  const [body, setBody] = useState('')
  const [assertions, setAssertions] = useState<Assertion[]>([emptyAssertion()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getRequest(id).then(r => {
      setName(r.name); setDescription(r.description); setMethod(r.method)
      setUrl(r.url); setHeaders(r.headers.length ? r.headers : [emptyKV()])
      setBodyType(r.body_type); setBody(r.body ?? '')
      setAssertions(r.assertions.length ? r.assertions : [emptyAssertion()])
    }).catch(() => setError('Failed to load request'))
  }, [id])

  const updateKV = (list: KeyValue[], idx: number, field: keyof KeyValue, val: string) =>
    list.map((kv, i) => i === idx ? { ...kv, [field]: val } : kv)

  const updateAssertion = (idx: number, patch: Partial<Assertion>) =>
    setAssertions(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a))

  const handleSave = async () => {
    if (!name.trim()) return setError('Name is required')
    if (!url.trim()) return setError('URL is required')
    setSaving(true); setError('')
    const payload = {
      name, description, method, url,
      headers: headers.filter(h => h.key.trim()),
      body: bodyType !== 'none' ? body : undefined,
      body_type: bodyType,
      assertions: assertions.filter(a => a.expected_value.trim()),
    }
    try {
      if (isEdit && id) await updateRequest(id, payload)
      else await createRequest(payload)
      navigate('/requests')
    } catch {
      setError('Failed to save request')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const selectCls = inputCls

  return (
    <Layout>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isEdit ? 'Edit Request' : 'New Request'}</h1>
          <button onClick={() => navigate('/requests')} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">← Back</button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Basic Info */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Login API" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Optional description" />
            </div>
          </div>
        </section>

        {/* Method + URL */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Request</h2>
          <div className="flex gap-3">
            <select value={method} onChange={e => setMethod(e.target.value as HttpMethod)} className={`${selectCls} w-36`}>
              {METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
            <input value={url} onChange={e => setUrl(e.target.value)} className={`${inputCls} flex-1`} placeholder="https://api.example.com/endpoint" />
          </div>
          <p className="text-xs text-gray-400">Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{`{{variable}}`}</code> placeholders to reference variables from previous steps.</p>
        </section>

        {/* Headers */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Headers</h2>
            <button onClick={() => setHeaders(h => [...h, emptyKV()])} className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">+ Add Header</button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={h.key} onChange={e => setHeaders(updateKV(headers, i, 'key', e.target.value))} className={`${inputCls} flex-1`} placeholder="Header name" />
              <input value={h.value} onChange={e => setHeaders(updateKV(headers, i, 'value', e.target.value))} className={`${inputCls} flex-1`} placeholder="Value" />
              <button onClick={() => setHeaders(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          ))}
        </section>

        {/* Body */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Body</h2>
            <select value={bodyType} onChange={e => setBodyType(e.target.value as BodyType)} className={`${selectCls} w-48`}>
              {BODY_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
            </select>
          </div>
          {bodyType !== 'none' && (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              className={`${inputCls} font-mono text-xs resize-y`}
              placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : ''}
            />
          )}
        </section>

        {/* Assertions */}
        <section className="rounded-lg bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Assertions</h2>
            <button onClick={() => setAssertions(a => [...a, emptyAssertion()])} className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">+ Add Assertion</button>
          </div>
          {assertions.map((a, i) => (
            <div key={a.id} className="flex gap-2 items-center flex-wrap bg-gray-50 dark:bg-gray-700/50 rounded-md p-3">
              <select value={a.type} onChange={e => updateAssertion(i, { type: e.target.value as AssertionType })} className={`${selectCls} w-44`}>
                {ASSERTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={a.operator} onChange={e => updateAssertion(i, { operator: e.target.value as AssertionOperator })} className={`${selectCls} w-40`}>
                {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              {(a.type === 'json_path' || a.type === 'header') && (
                <input value={a.target ?? ''} onChange={e => updateAssertion(i, { target: e.target.value })} className={`${inputCls} w-48`}
                  placeholder={a.type === 'json_path' ? '$.data.token' : 'content-type'} />
              )}
              <input value={a.expected_value} onChange={e => updateAssertion(i, { expected_value: e.target.value })} className={`${inputCls} flex-1 min-w-24`} placeholder="Expected value" />
              <button onClick={() => setAssertions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          ))}
        </section>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Request'}
          </button>
          <button onClick={() => navigate('/requests')} className="rounded-md border border-gray-300 dark:border-gray-600 px-6 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </Layout>
  )
}
