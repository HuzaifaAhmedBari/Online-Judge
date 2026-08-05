import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import TopNav from '../components/TopNav'
import { useAuth } from '../App'
import { loadProblem, patchCachedProblemStatus } from '../services/problems'
import { fetchSubmission, submitSolution } from '../services/submissions'
import type { Language, Problem, Sample, Submission } from '../types'
import { renderMarkdown } from '../utils/markdown'

const languageLabels: Record<Language, string> = {
  c: 'C',
  cpp: 'C++ 17',
  java: 'Java 17',
  python: 'Python 3',
}

const monacoLanguages: Record<Language, string> = {
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  python: 'python',
}

const starterCode: Record<Language, string> = {
  c: '#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n\n    }\n}\n',
  python: 'import sys\n\n',
}

export default function ProblemDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [samples, setSamples] = useState<Sample[]>([])
  const [language, setLanguage] = useState<Language>('cpp')
  const [code, setCode] = useState(starterCode.cpp)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const canSubmit = Boolean(user && !user.is_banned)
  const canEdit = Boolean(user && problem && (user.role === 'admin' || problem.created_by === user.id))

  useEffect(() => {
    setLoading(true)
    loadProblem(id)
      .then(({ problem: loadedProblem, samples: loadedSamples }) => {
        setProblem(loadedProblem)
        setSamples(loadedSamples)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load problem.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    function onUpdate(e: any) {
      if (!e?.detail) return
      if (e.detail.problemId === id) {
        setProblem(e.detail.problem)
        setSamples(e.detail.samples || [])
      }
    }

    window.addEventListener('problem-updated', onUpdate as EventListener)
    return () => window.removeEventListener('problem-updated', onUpdate as EventListener)
  }, [id])

  useEffect(() => {
    if (!submission || submission.status === 'done') return
    const timer = window.setInterval(() => {
      fetchSubmission(submission.id)
        .then((next) => {
          setSubmission(next)
          if (next.status === 'done') {
            patchCachedProblemStatus(problem?.id || id, next.verdict === 'AC' ? 'solved' : 'tried')
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not refresh submission.'))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [id, problem?.id, submission])

  function changeLanguage(next: Language) {
    setLanguage(next)
    setCode((current) => (Object.values(starterCode).includes(current) ? starterCode[next] : current))
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension === 'c') setLanguage('c')
    if (extension === 'cpp' || extension === 'cc' || extension === 'cxx') setLanguage('cpp')
    if (extension === 'java') setLanguage('java')
    if (extension === 'py') setLanguage('python')
    setCode(await file.text())
    event.target.value = ''
  }

  async function handleSubmit() {
    if (!problem) return
    setError('')
    try {
      const created = await submitSolution(problem.id, language, code)
      setSubmission(created)
      patchCachedProblemStatus(problem.id, 'tried')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-on-surface">
        <TopNav />
        <main className="p-gutter text-on-surface-variant">Loading problem...</main>
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="min-h-screen bg-black text-on-surface">
        <TopNav />
        <main className="p-gutter text-error">{error || 'Problem not found.'}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-on-surface overflow-hidden">
      <TopNav />
      <main className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-3.5rem)] overflow-hidden">
        <section className="w-full lg:w-1/2 border-r border-outline-variant bg-surface flex flex-col overflow-hidden min-h-[60vh]">
          <div className="px-gutter py-density-high border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <div className="flex gap-2 flex-wrap">
              <span className="text-data-label font-data-label bg-surface-container-highest px-2 py-0.5 rounded border border-outline-variant text-on-surface-variant">Time Limit: {problem.time_limit_ms} ms</span>
              <span className="text-data-label font-data-label bg-surface-container-highest px-2 py-0.5 rounded border border-outline-variant text-on-surface-variant">Memory Limit: {Math.round(problem.memory_limit_kb / 1024)} MB</span>
            </div>
            {canEdit ? (
              <Link to={`/problems/${problem.id}/edit`} className="text-data-label font-data-label text-primary hover:underline">Edit Problem</Link>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-gutter py-6 space-y-6">
            <StatementSection title={problem.title} markdown={problem.statement_md} headline />
            <StatementSection title="Input Format" markdown={problem.input_format_md} />
            <StatementSection title="Output Format" markdown={problem.output_format_md} />
            <StatementSection title="Constraints" markdown={problem.constraints_md} codeLike />
            <SampleBlocks samples={samples} />
            <StatementSection title="Explanation" markdown={problem.explanation_md} accent />
          </div>
        </section>

        <section className="w-full lg:w-1/2 flex flex-col bg-surface-container-lowest overflow-hidden min-h-[70vh]">
          <div className="h-12 flex items-center justify-between px-4 border-b border-outline-variant bg-surface-container-low">
            <div className="flex items-center gap-3">
              <LanguageSelect language={language} onChange={changeLanguage} />
              {language === 'java' ? <span className="font-data-label text-data-label text-error">Use public class Main.</span> : null}
            </div>
            {canSubmit ? (
              <label className="font-data-label text-data-label text-on-surface-variant hover:text-primary cursor-pointer">
                Upload File
                <input onChange={handleFile} className="hidden" type="file" accept=".c,.cpp,.cc,.cxx,.java,.py" />
              </label>
            ) : null}
          </div>
          {canSubmit ? (
            <Editor
              height="100%"
              theme="vs-dark"
              language={monacoLanguages[language]}
              value={code}
              onChange={(value) => setCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontFamily: 'JetBrains Mono',
                fontSize: 13,
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          ) : (
            <LockedEditor banned={Boolean(user?.is_banned)} reason={user?.banned_reason} />
          )}
          <SubmissionFooter canSubmit={canSubmit} submission={submission} error={error} onSubmit={handleSubmit} />
        </section>
      </main>
    </div>
  )
}

function StatementSection({ title, markdown, headline = false, codeLike = false, accent = false }: { title: string; markdown: string; headline?: boolean; codeLike?: boolean; accent?: boolean }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])
  if (!markdown.trim()) return null
  if (headline) {
    return (
      <div>
        <h1 className="font-headline-md text-headline-md text-on-surface mb-4">{title}</h1>
        <div className="markdown-body text-on-surface-variant" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    )
  }
  return (
    <div className={accent ? 'bg-surface-container-high p-4 border-l-4 border-primary' : 'space-y-4'}>
      <h2 className="text-primary font-bold uppercase tracking-wider text-data-label">{title}</h2>
      <div className={`markdown-body text-on-surface-variant ${codeLike ? 'font-code-block text-data-label' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function SampleBlocks({ samples }: { samples: Sample[] }) {
  return (
    <div className="space-y-6">
      {samples.map((sample, index) => {
        const suffix = samples.length > 1 ? ` ${index + 1}` : ''
        return (
          <div key={sample.id} className="space-y-4">
            <SampleBlock title={`Sample Input${suffix}`} value={sample.input} />
            <SampleBlock title={`Sample Output${suffix}`} value={sample.output} />
          </div>
        )
      })}
    </div>
  )
}

function SampleBlock({ title, value }: { title: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-primary font-bold uppercase tracking-wider text-data-label">{title}</h2>
        <button
          className="text-data-label font-data-label text-outline hover:text-primary flex items-center gap-1"
          onClick={() => navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })}
        >
          <Icon name={copied ? 'check' : 'content_copy'} className="!text-[14px]" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-surface-container-lowest border border-outline-variant p-4 font-code-block text-data-label rounded text-on-surface-variant overflow-x-auto">{value}</pre>
    </div>
  )
}

function LanguageSelect({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return (
    <div className="relative">
      <select value={language} onChange={(event) => onChange(event.target.value as Language)} className="appearance-none bg-surface-container-highest border border-outline-variant text-on-surface font-body-md text-[13px] py-1 px-3 pr-8 rounded cursor-pointer focus:outline-none focus:border-primary">
        {(Object.keys(languageLabels) as Language[]).map((key) => <option key={key} value={key}>{languageLabels[key]}</option>)}
      </select>
      <Icon name="expand_more" className="absolute right-2 top-1.5 pointer-events-none text-outline" />
    </div>
  )
}

function LockedEditor({ banned, reason }: { banned: boolean; reason?: string | null }) {
  return (
    <div className="flex-1 relative bg-surface-container-lowest overflow-hidden font-code-block text-code-block">
      <div className="absolute inset-0 opacity-25 p-4 leading-6 text-outline select-none">
        {Array.from({ length: 18 }, (_, index) => <div key={index}>{String(index + 1).padStart(2, ' ')}  {'//'} editor locked</div>)}
      </div>
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-gutter">
        <div className="bg-surface border border-outline-variant rounded p-6 max-w-md text-center">
          <Icon name={banned ? 'block' : 'lock'} className="text-4xl text-primary mb-3" />
          <h2 className="font-headline-md text-headline-md mb-2">{banned ? 'Submission Disabled' : 'Login Required'}</h2>
          <p className="text-on-surface-variant">{banned ? reason || 'Your account is banned, so the editor is not available.' : 'Log in to unlock the editor and submit a solution.'}</p>
        </div>
      </div>
    </div>
  )
}

function SubmissionFooter({ canSubmit, submission, error, onSubmit }: { canSubmit: boolean; submission: Submission | null; error: string; onSubmit: () => void }) {
  const verdict = submission?.verdict
  const statusLabel = verdict || submission?.status || 'Ready'
  const statusClass = verdict === 'AC' ? 'text-secondary border-secondary/30 bg-secondary-container/10' : verdict ? 'text-error border-error/30 bg-error-container/10' : 'text-primary border-primary/30 bg-primary/10'

  return (
    <div className="border-t border-outline-variant bg-surface-container-low p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-1 rounded border ${statusClass}`}>
          {submission && submission.status !== 'done' ? <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" /> : <Icon name={verdict === 'AC' ? 'check_circle' : verdict ? 'cancel' : 'radio_button_unchecked'} filled={Boolean(verdict)} />}
          <span className="font-data-label text-data-label font-bold uppercase">{statusLabel}</span>
          {submission?.time_used_ms ? <span className="font-data-label text-data-label">/ {submission.time_used_ms} ms</span> : null}
          {submission?.memory_used_kb ? <span className="font-data-label text-data-label">/ {Math.round(submission.memory_used_kb / 1024)} MB</span> : null}
        </div>
        <button disabled={!canSubmit || submission?.status === 'queued' || submission?.status === 'judging'} onClick={onSubmit} className="px-8 py-2 bg-primary text-on-primary-container rounded font-bold hover:brightness-110 active:scale-95 transition-all font-body-md disabled:opacity-50">Submit</button>
      </div>
      {error ? <p className="font-data-label text-data-label text-error">{error}</p> : null}
        <div className={`h-full ${verdict === 'AC' ? 'bg-secondary w-full' : verdict ? 'bg-error w-1/3' : 'bg-primary w-1/6'} opacity-80`} />
      </div>
  )
}
