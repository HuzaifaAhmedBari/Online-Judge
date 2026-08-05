import { apiFetch } from './api'
import type { Problem, ProblemPayload, ProblemSummary, Sample } from '../types'

const PROBLEMS_CACHE_KEY = 'codejudge:problems'

export function getCachedProblems() {
  const raw = sessionStorage.getItem(PROBLEMS_CACHE_KEY)
  return raw ? (JSON.parse(raw) as ProblemSummary[]) : null
}

export function setCachedProblems(problems: ProblemSummary[]) {
  sessionStorage.setItem(PROBLEMS_CACHE_KEY, JSON.stringify(problems))
}

export function patchCachedProblemStatus(problemId: string, status: ProblemSummary['user_status']) {
  const problems = getCachedProblems()
  if (!problems) return
  setCachedProblems(problems.map((problem) => (problem.id === problemId ? { ...problem, user_status: status } : problem)))
}

export async function fetchProblems() {
  const data = await apiFetch<{ problems: ProblemSummary[] }>('/api/problems')
  setCachedProblems(data.problems)
  return data.problems
}

export async function loadProblem(problemId: string) {
  const cacheKey = `codejudge:problem:${problemId}`
  const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') as { updated_at: string; problem: Problem; samples?: any[] } | null

  // If we have cached data, return it immediately and trigger background revalidate
  if (cached) {
    ;(async () => {
      try {
        const meta = await apiFetch<{ id: string; updated_at: string }>(`/api/problems/${problemId}/meta`)
        if (meta.updated_at !== cached.updated_at) {
          const data = await apiFetch<{ problem: Problem; samples?: any[] }>(`/api/problems/${problemId}`)
          sessionStorage.setItem(cacheKey, JSON.stringify({ updated_at: data.problem.updated_at, problem: data.problem, samples: data.samples || [] }))
          window.dispatchEvent(new CustomEvent('problem-updated', { detail: { problemId, problem: data.problem, samples: data.samples || [] } }))
        }
      } catch (err) {
        // ignore background refresh errors
      }
    })()

    return { problem: cached.problem, samples: cached.samples || [] }
  }

  // No cache: fetch meta then full problem+samples
  const meta = await apiFetch<{ id: string; updated_at: string }>(`/api/problems/${problemId}/meta`)
  const data = await apiFetch<{ problem: Problem; samples?: any[] }>(`/api/problems/${problemId}`)
  sessionStorage.setItem(cacheKey, JSON.stringify({ updated_at: data.problem.updated_at, problem: data.problem, samples: data.samples || [] }))
  return { problem: data.problem, samples: data.samples || [] }
}

export async function fetchSamples(problemId: string) {
  const data = await apiFetch<{ samples: Sample[] }>(`/api/problems/${problemId}/samples`)
  return data.samples
}

export async function createProblem(payload: ProblemPayload) {
  const data = await apiFetch<{ problem: Problem }>('/api/problems', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  sessionStorage.removeItem(PROBLEMS_CACHE_KEY)
  return data.problem
}

export async function updateProblem(problemId: string, payload: Omit<ProblemPayload, 'testcases'>) {
  const data = await apiFetch<{ problem: Problem }>(`/api/problems/${problemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  sessionStorage.removeItem(PROBLEMS_CACHE_KEY)
  sessionStorage.setItem(`codejudge:problem:${problemId}`, JSON.stringify({ updated_at: data.problem.updated_at, problem: data.problem }))
  return data.problem
}

export async function addTestcases(problemId: string, testcases: Array<{ input: string; output: string; is_sample?: boolean; ordinal?: number }>) {
  const data = await apiFetch<{ testcases: any[] }>(`/api/problems/${problemId}/testcases`, {
    method: 'POST',
    body: JSON.stringify({ testcases }),
  })
  // refresh cache for this problem
  const full = await apiFetch<{ problem: Problem; samples?: any[] }>(`/api/problems/${problemId}`)
  sessionStorage.setItem(`codejudge:problem:${problemId}`, JSON.stringify({ updated_at: full.problem.updated_at, problem: full.problem, samples: full.samples || [] }))
  return data.testcases
}

export async function updateTestcase(problemId: string, testcaseId: string, payload: { input?: string; output?: string; is_sample?: boolean; ordinal?: number }) {
  const data = await apiFetch<{ testcase: any }>(`/api/problems/${problemId}/testcases/${testcaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  const full = await apiFetch<{ problem: Problem; samples?: any[] }>(`/api/problems/${problemId}`)
  sessionStorage.setItem(`codejudge:problem:${problemId}`, JSON.stringify({ updated_at: full.problem.updated_at, problem: full.problem, samples: full.samples || [] }))
  return data.testcase
}

export async function deleteTestcase(problemId: string, testcaseId: string) {
  await apiFetch<void>(`/api/problems/${problemId}/testcases/${testcaseId}`, { method: 'DELETE' })
  const full = await apiFetch<{ problem: Problem; samples?: any[] }>(`/api/problems/${problemId}`)
  sessionStorage.setItem(`codejudge:problem:${problemId}`, JSON.stringify({ updated_at: full.problem.updated_at, problem: full.problem, samples: full.samples || [] }))
  return true
}
