import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Trash2, Zap, FileJson, Calendar, Hash,
  AlertCircle, CheckCircle2, X, ChevronRight,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { listSpecs, uploadSpec, deleteSpec } from '../../api/client'
import type { SpecSummary } from '../../types'

const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric',
})

export default function SpecList() {
  const navigate = useNavigate()
  const [specs, setSpecs]         = useState<SpecSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)

  // Upload form state
  const [specName, setSpecName]   = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [dragOver, setDragOver]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      setLoading(true)
      setSpecs(await listSpecs())
    } catch {
      setError('Failed to load specs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  const handleFile = (f: File) => {
    setFile(f)
    if (!specName) setSpecName(f.name.replace(/\.(json|yaml|yml)$/, ''))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleUpload = async () => {
    if (!file) { setError('Please select a file'); return }
    const name = specName.trim() || file.name
    setUploading(true)
    setError(null)
    try {
      await uploadSpec(name, file)
      setFile(null)
      setSpecName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      showSuccess(`"${name}" uploaded successfully`)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await deleteSpec(id)
      showSuccess(`"${name}" deleted`)
      setSpecs(prev => prev.filter(s => s.id !== id))
    } catch {
      setError('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const handleGenerate = (id: string) => {
    navigate(`/specs/${id}/generate`)
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              API Specifications
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Upload OpenAPI 3.x specs and generate test suites with AI
            </p>
          </div>
        </div>

        {/* Toast messages */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Upload card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-500" />
            Upload OpenAPI Specification
          </h2>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors px-6 py-8 text-center ${
              dragOver
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                : file
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10'
                  : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.yaml,.yml"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileJson className="w-8 h-8 text-emerald-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.name}</span>
                <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileJson className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Drop your OpenAPI spec here, or <span className="text-indigo-600 dark:text-indigo-400">browse</span>
                </p>
                <p className="text-xs text-gray-400">Supports JSON and YAML · OpenAPI 3.x</p>
              </div>
            )}
          </div>

          {/* Name field + submit */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Spec name (optional – auto-detected from filename)"
              value={specName}
              onChange={e => setSpecName(e.target.value)}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-colors"
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>

        {/* Specs list */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Uploaded Specifications
            </h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {specs.length}
            </span>
          </div>

          {loading ? (
            <div className="px-5 py-8 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : specs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <FileJson className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No specs uploaded yet</p>
              <p className="text-xs text-gray-400">Upload an OpenAPI 3.x spec above to get started</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {specs.map(spec => (
                <li key={spec.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <FileJson className="w-5 h-5 text-indigo-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {spec.name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {fmt(spec.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {spec.endpoint_count} endpoint{spec.endpoint_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleGenerate(spec.id)}
                      title="Generate Tests"
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Generate Tests
                    </button>
                    <button
                      onClick={() => handleDelete(spec.id, spec.name)}
                      disabled={deleting === spec.id}
                      title="Delete"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      {deleting === spec.id
                        ? <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  )
}
