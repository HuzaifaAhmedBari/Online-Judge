import { apiFetch } from './api'
import type { Language, Submission } from '../types'

export async function submitSolution(problemId: string, language: Language, sourceCode: string) {
  const data = await apiFetch<{ submission: Submission }>('/api/submissions', {
    method: 'POST',
    body: JSON.stringify({
      problem_id: problemId,
      language,
      source_code: sourceCode,
    }),
  })
  return data.submission
}

export async function fetchSubmission(submissionId: string) {
  const data = await apiFetch<{ submission: Submission }>(`/api/submissions/${submissionId}`)
  return data.submission
}
