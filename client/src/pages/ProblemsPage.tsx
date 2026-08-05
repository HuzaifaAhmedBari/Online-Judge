import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import Icon from '../components/Icon'
import TopNav from '../components/TopNav'
import { fetchProblems, getCachedProblems } from '../services/problems'
import type { ProblemSummary, UserStatus } from '../types'

export default function ProblemsPage() {
  const [problems, setProblems] = useState<ProblemSummary[]>(() => getCachedProblems() || [])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!getCachedProblems())

  useEffect(() => {
    fetchProblems()
      .then(setProblems)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load problems.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return problems
    return problems.filter((problem) => {
      const author = problem.creator?.username || ''
      return problem.title.toLowerCase().includes(normalized) || author.toLowerCase().includes(normalized)
    })
  }, [problems, query])

  return (
    <div className="relative min-h-screen bg-black text-on-surface code-grid-bg overflow-hidden">
      <div className="scanline absolute inset-0 pointer-events-none" />
      <div className="relative z-10">
        <TopNav />
        <main className="max-w-[1600px] mx-auto px-gutter py-8 min-h-screen">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Problem Library</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Master algorithms through high-precision challenges.</p>
          </div>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="bg-surface border border-outline-variant rounded px-10 py-2 w-full md:w-80 font-body-md text-body-md focus:border-primary focus:ring-0 outline-none text-on-surface" placeholder="Filter by title or author..." />
          </div>
        </div>

        <div className="bg-surface border border-outline-variant rounded overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant">
                  <th className="px-4 py-3 font-data-label text-data-label text-outline uppercase tracking-wider w-12">Status</th>
                  <th className="px-4 py-3 font-data-label text-data-label text-outline uppercase tracking-wider">Problem Title</th>
                  <th className="px-4 py-3 font-data-label text-data-label text-outline uppercase tracking-wider w-56">Author</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filtered.map((problem) => (
                  <tr key={problem.id} className="hover:bg-surface-container-low transition-colors group">
                    <td className="px-4 py-3"><ProblemStatus status={problem.user_status} /></td>
                    <td className="px-4 py-3">
                      <Link to={`/problems/${problem.id}`} className="font-body-md text-body-md text-on-surface font-semibold group-hover:text-primary transition-colors">{problem.title}</Link>
                    </td>
                    <td className="px-4 py-3 font-code-block text-code-block text-on-surface-variant">{problem.creator?.username || 'unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? <p className="p-6 text-on-surface-variant">Loading problems...</p> : null}
          {error ? <p className="p-6 text-error">{error}</p> : null}
          {!loading && filtered.length === 0 ? <p className="p-6 text-on-surface-variant">No problems match that filter.</p> : null}
        </div>
        <div className="flex items-center justify-between font-data-label text-data-label text-outline mt-4">
          <span>Showing {filtered.length} of {problems.length} problems</span>
        </div>
        </main>
        <Footer />
      </div>
    </div>
  )
}

function ProblemStatus({ status }: { status: UserStatus }) {
  if (status === 'solved') return <Icon name="check_circle" filled className="text-secondary" />
  if (status === 'tried') return <Icon name="error" filled className="text-tertiary" />
  return <Icon name="radio_button_unchecked" className="text-outline/40" />
}
