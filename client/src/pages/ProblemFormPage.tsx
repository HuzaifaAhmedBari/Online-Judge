import { useEffect, useState, useMemo } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import TopNav from '../components/TopNav'
import { useAuth } from '../App'
import { createProblem, loadProblem, fetchTestcases, updateProblem, addTestcases, updateTestcase, deleteTestcase } from '../services/problems'
import type { Problem, ProblemPayload } from '../types'

type ProblemFormPageProps = {
  mode: 'create' | 'edit'
}

const emptyProblem: Omit<ProblemPayload, 'testcases'> = {
  title: '',
  statement_md: '',
  input_format_md: '',
  output_format_md: '',
  constraints_md: '',
  explanation_md: '',
  time_limit_ms: 1000,
  memory_limit_kb: 262144,
  checker_type: 'token',
  visibility: 'public',
}

export default function ProblemFormPage({ mode }: ProblemFormPageProps) {
  const { id = '' } = useParams()
  const { user, authLoading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyProblem)
  
  const [samples, setSamples] = useState<Array<{ id?: string; input: string; output: string; is_sample?: boolean; ordinal?: number; _deleted?: boolean }>>([])
  const [loadedProblem, setLoadedProblem] = useState<Problem | null>(null)
  const [initialForm, setInitialForm] = useState<Omit<ProblemPayload, 'testcases'> | null>(null)
  const [initialSamples, setInitialSamples] = useState<Array<{ id?: string | null; input: string; output: string; is_sample?: boolean; ordinal?: number }>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(mode === 'edit')
  const canAuthor = user?.role === 'author' || user?.role === 'admin'

  useEffect(() => {
    if (mode !== 'edit') {
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([loadProblem(id), fetchTestcases(id)])
      .then(([{ problem }, loadedTestcases]) => {
        setLoadedProblem(problem)
        setForm({
          title: problem.title,
          statement_md: problem.statement_md,
          input_format_md: problem.input_format_md,
          output_format_md: problem.output_format_md,
          constraints_md: problem.constraints_md,
          explanation_md: problem.explanation_md,
          time_limit_ms: problem.time_limit_ms,
          memory_limit_kb: problem.memory_limit_kb,
          checker_type: problem.checker_type === 'float' ? 'float' : 'token',
          visibility: problem.visibility,
        })
        const mapped = loadedTestcases.map(s => ({ id: s.id, input: s.input, output: s.output, is_sample: s.is_sample, ordinal: s.ordinal }))
        setSamples(mapped)
        setInitialForm({
          title: problem.title,
          statement_md: problem.statement_md,
          input_format_md: problem.input_format_md,
          output_format_md: problem.output_format_md,
          constraints_md: problem.constraints_md,
          explanation_md: problem.explanation_md,
          time_limit_ms: problem.time_limit_ms,
          memory_limit_kb: problem.memory_limit_kb,
          checker_type: problem.checker_type === 'float' ? 'float' : 'token',
          visibility: problem.visibility,
        })
        setInitialSamples(mapped.map(s => ({ id: s.id || null, input: s.input, output: s.output, is_sample: s.is_sample, ordinal: s.ordinal })))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load problem.'))
      .finally(() => setLoading(false))
  }, [id, mode])

  const canEditLoaded = mode === 'create' || Boolean(user && loadedProblem && (user.role === 'admin' || loadedProblem.created_by === user.id))

  const isDirty = useMemo(() => {
    if (mode === 'create') {
      // any non-default form field or any sample present
      const defaultJson = JSON.stringify(emptyProblem)
      if (JSON.stringify(form) !== defaultJson) return true
      if (samples.some((s) => (s.input || '').trim() || (s.output || '').trim())) return true
      return false
    }

    if (!initialForm) return false

    if (JSON.stringify(form) !== JSON.stringify(initialForm)) return true

    const norm = (arr: typeof samples) => arr.filter((s) => !s._deleted).map((s) => ({ id: s.id || null, input: s.input || '', output: s.output || '', is_sample: Boolean(s.is_sample), ordinal: s.ordinal }))
    try {
      if (JSON.stringify(norm(samples)) !== JSON.stringify(initialSamples)) return true
    } catch (e) {
      return true
    }

    return false
  }, [mode, form, samples, initialForm, initialSamples])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'create') {
        // collect non-empty, non-deleted samples/cases and preserve order (no dedupe)
        const cleaned = samples.filter((s) => !s._deleted && (s.input || '').trim() && (s.output || '').trim())
        const testcases = cleaned.map((s, i) => ({ input: s.input, output: s.output, is_sample: Boolean(s.is_sample), ordinal: i + 1 }))

        const payload: ProblemPayload = {
          ...form,
          testcases,
        }
        const problem = await createProblem(payload)
        navigate(`/problems/${problem.id}`)
      } else {
        const problem = await updateProblem(id, form)

        // Persist samples: delete marked, update existing, and add new drafts
        const samplesToDelete = samples.filter((s) => s.id && s._deleted)
        const initialById = new Map(initialSamples.filter((s) => s.id).map((s) => [s.id, s]))
        const existingSamplesToUpdate = samples.filter((s) => {
          if (!s.id || s._deleted) return false
          const initial = initialById.get(s.id)
          return !initial || initial.input !== s.input || initial.output !== s.output || initial.is_sample !== Boolean(s.is_sample) || initial.ordinal !== s.ordinal
        })
        const newSamples = samples.filter((s) => !s.id && !s._deleted && s.input?.trim() && s.output?.trim())

        // Delete marked samples
        if (samplesToDelete.length > 0) {
          await Promise.all(samplesToDelete.map((s) => deleteTestcase(id, s.id as string)))
        }

        // Update existing samples
        if (existingSamplesToUpdate.length > 0) {
          await Promise.all(existingSamplesToUpdate.map((s) => updateTestcase(id, s.id as string, { input: s.input, output: s.output, is_sample: Boolean(s.is_sample), ordinal: s.ordinal })))
        }

        // Add new samples in batch if any
        if (newSamples.length > 0) {
          await addTestcases(id, newSamples.map((s) => ({ input: s.input, output: s.output, is_sample: Boolean(s.is_sample) })))
        }

        // Refresh cache and UI
        await loadProblem(id)

        navigate(`/problems/${problem.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save problem.')
    } finally {
      setBusy(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black text-on-surface">
        <TopNav />
        <main className="max-w-3xl mx-auto px-gutter py-12">Loading problem editor...</main>
      </div>
    )
  }

  if (error && mode === 'edit' && !loadedProblem) {
    return (
      <div className="min-h-screen bg-black text-on-surface">
        <TopNav />
        <main className="max-w-3xl mx-auto px-gutter py-12 text-error">{error}</main>
      </div>
    )
  }
  if (!canAuthor) {
    return (
      <div className="relative min-h-screen bg-black text-on-surface code-grid-bg overflow-hidden">
        <div className="scanline absolute inset-0 pointer-events-none" />
        <div className="relative z-10">
          <TopNav />
          <main className="max-w-3xl mx-auto px-gutter py-12">
            <div className="bg-surface border border-outline-variant rounded p-6">
              <h1 className="font-headline-md text-headline-md text-primary mb-3">Author Access Required</h1>
              <p className="text-on-surface-variant">Create and edit problem tools are available to authors and admins.</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (!canEditLoaded) {
    return (
      <div className="relative min-h-screen bg-black text-on-surface code-grid-bg overflow-hidden">
        <div className="scanline absolute inset-0 pointer-events-none" />
        <div className="relative z-10">
          <TopNav />
          <main className="max-w-3xl mx-auto px-gutter py-12">
            <p className="text-error">Only the creator or an admin can edit this problem.</p>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-black text-on-surface code-grid-bg overflow-hidden">
      <div className="scanline absolute inset-0 pointer-events-none" />
      <div className="relative z-10">
        <TopNav />
        <main className="max-w-5xl mx-auto px-gutter py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-headline-lg text-headline-lg">{mode === 'create' ? 'Create Problem' : 'Edit Problem'}</h1>
            <p className="text-on-surface-variant">Use separate markdown sections so the detail page can render cleanly.</p>
          </div>
            {isDirty && (
              <div className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">Unsaved changes</div>
            )}
          {mode === 'edit' ? (
            <div>
              <Link to={`/problems/${id}`} className="text-data-label font-data-label text-primary hover:underline">Back to Problem</Link>
            </div>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="bg-surface border border-outline-variant rounded p-5 space-y-5">
          <Field label="Title">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required className="field" />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Time Limit (ms)">
              <input type="number" min={1} value={form.time_limit_ms} onChange={(event) => setForm({ ...form, time_limit_ms: Number(event.target.value) })} required className="field" />
            </Field>
            <Field label="Memory Limit (KB)">
              <input type="number" min={1} value={form.memory_limit_kb} onChange={(event) => setForm({ ...form, memory_limit_kb: Number(event.target.value) })} required className="field" />
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Checker">
              <select value={form.checker_type} onChange={(event) => setForm({ ...form, checker_type: event.target.value as 'token' | 'float' })} className="field">
                <option value="token">Token diff</option>
                <option value="float">Float diff</option>
              </select>
            </Field>
            <Field label="Visibility">
              <select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as 'public' | 'private' })} className="field">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </Field>
          </div>
          <MarkdownField label="Statement.md" value={form.statement_md} onChange={(value) => setForm({ ...form, statement_md: value })} required />
          <MarkdownField label="Input Format.md" value={form.input_format_md} onChange={(value) => setForm({ ...form, input_format_md: value })} />
          <MarkdownField label="Output Format.md" value={form.output_format_md} onChange={(value) => setForm({ ...form, output_format_md: value })} />
          <MarkdownField label="Constraints.md" value={form.constraints_md} onChange={(value) => setForm({ ...form, constraints_md: value })} />
          <MarkdownField label="Explanation.md" value={form.explanation_md} onChange={(value) => setForm({ ...form, explanation_md: value })} />
          {(mode === 'create' || mode === 'edit') ? (
            <div className="grid gap-4 border-t border-outline-variant pt-5">
              <h3 className="font-data-label text-data-label text-outline uppercase tracking-wider mb-2">Samples and Main Testcases</h3>
              {/* Samples and hidden/main testcases are edited together from the complete testcase list. */}
              {mode === 'create' || mode === 'edit' ? (
                <>
                  <div>
                    {samples.filter(s => !s._deleted && (s.is_sample !== false)).map((s, idx) => (
                      <div key={s.id || idx} className="grid md:grid-cols-2 gap-4">
                        <MarkdownField label={`Sample Input ${idx + 1}`} value={s.input} onChange={(v) => setSamples(samples.map((x) => x === s ? { ...x, input: v } : x))} />
                        <div>
                          <MarkdownField label={`Sample Output ${idx + 1}`} value={s.output} onChange={(v) => setSamples(samples.map((x) => x === s ? { ...x, output: v } : x))} />
                            <div className="flex gap-2 mt-2">
                              <button type="button" className="px-3 py-1 bg-error text-on-primary rounded hover:scale-105 hover:shadow-md transition-transform hover:bg-error-700 hover:ring-2 hover:ring-offset-1 hover:ring-red-300 hover:brightness-90 active:brightness-75" onClick={() => {
                              if (s.id) {
                                setSamples(samples.map((x) => x.id === s.id ? { ...x, _deleted: true } : x))
                              } else {
                                setSamples(samples.filter((x) => x !== s))
                              }
                            }}>Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <button type="button" className="px-3 py-1 bg-primary text-on-primary rounded hover:scale-105 hover:shadow-md transition-transform hover:bg-primary-700 hover:ring-2 hover:ring-offset-1 hover:ring-primary-300 hover:brightness-90 active:brightness-75" onClick={() => setSamples([...samples, { input: '', output: '', is_sample: true }])}>Add Sample</button>
                    </div>
                  </div>

                  <div className="border-t border-outline-variant pt-4 mt-4">
                    <h4 className="font-data-label text-data-label text-outline uppercase tracking-wider mb-2">Testcases</h4>
                    {samples.filter(s => !s._deleted && s.is_sample === false).map((s, idx) => (
                      <div key={s.id || idx} className="grid md:grid-cols-2 gap-4">
                        <MarkdownField label={`Testcase Input ${idx + 1}`} value={s.input} onChange={(v) => setSamples(samples.map((x) => x === s ? { ...x, input: v } : x))} />
                        <div>
                          <MarkdownField label={`Testcase Output ${idx + 1}`} value={s.output} onChange={(v) => setSamples(samples.map((x) => x === s ? { ...x, output: v } : x))} />
                          <div className="flex gap-2 mt-2">
                            <button type="button" className="px-3 py-1 bg-error text-on-primary rounded hover:scale-105 hover:shadow-md transition-transform hover:bg-error-700 hover:ring-2 hover:ring-offset-1 hover:ring-red-300 hover:brightness-90 active:brightness-75" onClick={() => {
                              if (s.id) {
                                setSamples(samples.map((x) => x.id === s.id ? { ...x, _deleted: true } : x))
                              } else {
                                setSamples(samples.filter((x) => x !== s))
                              }
                            }}>Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                      <div className="flex gap-2 mt-2">
                        <button type="button" className="px-3 py-1 bg-primary text-on-primary rounded hover:scale-105 hover:shadow-md transition-transform hover:bg-primary-700 hover:ring-2 hover:ring-offset-1 hover:ring-primary-300 hover:brightness-90 active:brightness-75" onClick={() => setSamples([...samples, { input: '', output: '', is_sample: false }])}>Add Testcase</button>
                      </div>
                  </div>
                </>
              ) : (
                <>
                  {samples.filter(s => !s._deleted).map((s, idx) => (
                    <div key={s.id || idx} className="grid md:grid-cols-2 gap-4">
                      <MarkdownField label={`Sample Input ${idx + 1}`} value={s.input} onChange={(v) => setSamples(samples.map((x) => x === s ? { ...x, input: v } : x))} />
                      <div>
                        <MarkdownField label={`Sample Output ${idx + 1}`} value={s.output} onChange={(v) => setSamples(samples.map((x) => x === s ? { ...x, output: v } : x))} />
                          <div className="flex gap-2 mt-2">
                              <button type="button" className="px-3 py-1 bg-error text-on-primary rounded hover:scale-105 hover:shadow-md transition-transform hover:bg-error-700 hover:ring-2 hover:ring-offset-1 hover:ring-red-300 hover:brightness-90 active:brightness-75" onClick={() => {
                              if (s.id) {
                                setSamples(samples.map((x) => x.id === s.id ? { ...x, _deleted: true } : x))
                              } else {
                                setSamples(samples.filter((x) => x !== s))
                              }
                            }}>Delete</button>
                          </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="px-3 py-1 bg-primary text-on-primary rounded hover:scale-105 hover:shadow-md transition-transform hover:bg-primary-700 hover:ring-2 hover:ring-offset-1 hover:ring-primary-300 hover:brightness-90 active:brightness-75" onClick={() => setSamples([...samples, { input: '', output: '', is_sample: true }])}>Add Sample</button>
                  </div>
                </>
              )}
            </div>
          ) : null}
          {error ? <p className="font-data-label text-data-label text-error">{error}</p> : null}
          <button disabled={busy} className="bg-green-600 text-white px-6 py-2 rounded font-bold disabled:opacity-50 hover:scale-105 hover:shadow-md transition-transform hover:bg-green-700 hover:ring-2 hover:ring-offset-1 hover:ring-green-300 hover:brightness-90 active:brightness-75">{busy ? 'Saving...' : 'Save Problem'}</button>
        </form>
        </main>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-data-label text-data-label text-outline uppercase tracking-wider mb-2">{label}</span>
      {children}
    </label>
  )
}

function MarkdownField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <Field label={label}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} required={required} rows={5} className="field font-code-block text-code-block resize-y" />
    </Field>
  )
}
