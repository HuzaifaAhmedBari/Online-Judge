export type Role = 'participant' | 'author' | 'admin'
export type UserStatus = 'none' | 'tried' | 'solved'
export type Language = 'c' | 'cpp' | 'java' | 'python'
export type SubmissionStatus = 'queued' | 'judging' | 'done'
export type Verdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE'

export type User = {
  id: string
  username: string
  email: string
  role: Role
  is_banned: boolean
  banned_reason?: string | null
}

export type ProblemSummary = {
  id: string
  title: string
  time_limit_ms: number
  memory_limit_kb: number
  checker_type: 'token' | 'float' | 'custom'
  visibility: 'public' | 'private'
  created_by: string
  created_at: string
  updated_at: string
  user_status: UserStatus
  creator?: {
    id: string
    username: string
  }
}

export type Problem = ProblemSummary & {
  statement_md: string
  input_format_md: string
  output_format_md: string
  constraints_md: string
  explanation_md: string
}

export type Sample = {
  id: string
  input: string
  output: string
  is_sample: boolean
  ordinal: number
}

export type Testcase = Sample

export type Submission = {
  id: string
  user_id: string
  problem_id: string
  contest_id: string | null
  language: Language
  status: SubmissionStatus
  verdict: Verdict | null
  time_used_ms: number | null
  memory_used_kb: number | null
  submitted_at: string
}

export type ProblemPayload = {
  title: string
  statement_md: string
  input_format_md: string
  output_format_md: string
  constraints_md: string
  explanation_md: string
  time_limit_ms: number
  memory_limit_kb: number
  checker_type: 'token' | 'float'
  visibility: 'public' | 'private'
  testcases?: Array<{
    input: string
    output: string
    is_sample: boolean
    ordinal: number
  }>
}
