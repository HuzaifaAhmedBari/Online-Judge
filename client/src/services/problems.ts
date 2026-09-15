import { apiFetch } from './api'
import type { Problem, ProblemPayload, ProblemSummary, Sample, Testcase } from '../types'

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

function problemCacheKey(problemId: string) {
  return `codejudge:problem:${problemId}`
}

function samplesCacheKey(problemId: string) {
  return `codejudge:problem:${problemId}:samples`
}

function invalidateProblemCache(problemId: string, includeSamples = true) {
  sessionStorage.removeItem(PROBLEMS_CACHE_KEY)
  sessionStorage.removeItem(problemCacheKey(problemId))
  if (includeSamples) sessionStorage.removeItem(samplesCacheKey(problemId))
}

export async function fetchSamples(problemId: string) {
  const data = await apiFetch<{ samples: Sample[] }>(`/api/problems/${problemId}/samples`)
  return data.samples
}

export async function fetchTestcases(problemId: string) {
  const data = await apiFetch<{ testcases: Testcase[] }>(`/api/problems/${problemId}/testcases`)
  return data.testcases
}

export async function loadProblem(problemId: string) {
  const cacheKey = problemCacheKey(problemId)
  const sampleCacheKey = samplesCacheKey(problemId)
  const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null') as { updated_at: string; problem: Problem } | null
  const cachedSamples = JSON.parse(sessionStorage.getItem(sampleCacheKey) || 'null') as Sample[] | null

  async function loadSamples() {
    if (cachedSamples) return cachedSamples
    const samples = await fetchSamples(problemId)
    sessionStorage.setItem(sampleCacheKey, JSON.stringify(samples))
    return samples
  }

  if (cached) {
    ;(async () => {
      try {
        const meta = await apiFetch<{ id: string; updated_at: string }>(`/api/problems/${problemId}/meta`)
        if (meta.updated_at !== cached.updated_at) {
          const [data, samples] = await Promise.all([
            apiFetch<{ problem: Problem }>(`/api/problems/${problemId}`),
            cachedSamples ? Promise.resolve(cachedSamples) : fetchSamples(problemId),
          ])
          sessionStorage.setItem(cacheKey, JSON.stringify({ updated_at: data.problem.updated_at, problem: data.problem }))
          sessionStorage.setItem(sampleCacheKey, JSON.stringify(samples))
          window.dispatchEvent(new CustomEvent('problem-updated', { detail: { problemId, problem: data.problem, samples } }))
        }
      } catch {
        // Cached content remains usable if background revalidation fails.
      }
    })()

    return { problem: cached.problem, samples: await loadSamples() }
  }

  const [data, samples] = await Promise.all([
    apiFetch<{ problem: Problem }>(`/api/problems/${problemId}`),
    fetchSamples(problemId),
  ])
  sessionStorage.setItem(cacheKey, JSON.stringify({ updated_at: data.problem.updated_at, problem: data.problem }))
  sessionStorage.setItem(sampleCacheKey, JSON.stringify(samples))
  return { problem: data.problem, samples }
}

export async function createProblem(payload: ProblemPayload) {
  const data = await apiFetch<{ problem: Problem }>('/api/problems', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  invalidateProblemCache(data.problem.id)
  return data.problem
}

export async function updateProblem(problemId: string, payload: Omit<ProblemPayload, 'testcases'>) {
  const data = await apiFetch<{ problem: Problem }>(`/api/problems/${problemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  invalidateProblemCache(problemId, false)
  sessionStorage.setItem(problemCacheKey(problemId), JSON.stringify({ updated_at: data.problem.updated_at, problem: data.problem }))
  return data.problem
}

export async function addTestcases(problemId: string, testcases: Array<{ input: string; output: string; is_sample?: boolean; ordinal?: number }>) {
  const data = await apiFetch<{ testcases: Testcase[] }>(`/api/problems/${problemId}/testcases`, {
    method: 'POST',
    body: JSON.stringify({ testcases }),
  })
  invalidateProblemCache(problemId)
  return data.testcases
}

export async function updateTestcase(problemId: string, testcaseId: string, payload: { input?: string; output?: string; is_sample?: boolean; ordinal?: number }) {
  const data = await apiFetch<{ testcase: Testcase }>(`/api/problems/${problemId}/testcases/${testcaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  invalidateProblemCache(problemId)
  return data.testcase
}

export async function deleteTestcase(problemId: string, testcaseId: string) {
  await apiFetch<void>(`/api/problems/${problemId}/testcases/${testcaseId}`, { method: 'DELETE' })
  invalidateProblemCache(problemId)
  return true
}
