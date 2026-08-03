# Online Judge Platform — Full Specification

A self-hosted competitive programming judge combining a **vjudge-style browsing/submission interface** with **DOMjudge-style self-authored judging** — own problems, own test cases, own checkers, own sandboxed execution. No proxying to external online judges.

---

## 1. Purpose & Scope

### Goals
- Authors can create problems (statement, samples, hidden test cases, custom checkers) and contests
- Participants can browse problems, submit code, receive verdicts, view their own submission history
- Admins can oversee everything: view any user's submissions (filterable), ban users for cheating
- Support timed contests with live scoreboards
- Execute untrusted code safely via a sandboxed engine (Judge0)
- Run on minimal, cost-controlled infrastructure (free tiers + a single VM)

### Non-goals (v1)
- Scraping/mirroring problems from external OJs
- Massive concurrency (hundreds+ simultaneous submitters)
- Plagiarism detection, ratings, discussion/editorial features
- Mobile app

### Users & Roles

Three roles, each a strict superset of the one below it, plus an unauthenticated tier:

| Tier | Can do |
|---|---|
| **Logged out** | Browse problems, see contest listings (title/time/problem count) — cannot open a contest or submit code |
| **Participant** | Everything logged-out can, **plus**: open/enter contests, submit code, view own submission history |
| **Author** | Everything a Participant can, **plus**: create/edit problems, create/edit contests, upload test cases and checkers. **Cannot** view other users' submitted code — that stays admin-only. |
| **Admin** | Everything an Author can, **plus**: view any user's submissions (filterable by contest/user/problem) including source code, ban/unban users, change user roles |

**Author approval flow**: Author is not self-service. A user requests author status; the role only changes when an **admin approves it**. Model as a `role_requested` field (or a lightweight `role_requests` table: `user_id, status ('pending'|'approved'|'denied'), requested_at`) — admin reviews pending requests and approves/denies, which updates the user's actual `role`.

**Unified interface, not separate dashboards**: All roles share the same UI. Extra capabilities surface only as additional nav tabs/buttons visible when the logged-in user's role permits them (e.g. "Create Problem", "Admin Panel" tabs only render for authors/admins respectively) — there is no separate author-only or admin-only application, just conditional rendering plus server-side enforcement of the same rules.

Role/ban state is stored on the `users` row and enforced **server-side on every relevant route** (never trust a frontend-only check) — middleware validates role/ban status before allowing problem/contest mutation endpoints, contest entry, submission creation, or the admin views.

### Access control matrix

| Tier | Browse problems | See contest listing | Open/enter a contest | Submit code | View others' code |
|---|---|---|---|---|---|
| Logged out | ✅ | ✅ | ❌ | ❌ | ❌ |
| Banned | ✅ | ✅ | ❌ | ❌ | ❌ |
| Participant | ✅ | ✅ | ✅ | ✅ | ❌ |
| Author | ✅ | ✅ | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS + Monaco Editor |
| Routing | React Router |
| Realtime | WebSocket (`ws` or Socket.IO) |
| API/backend | Node.js + Express |
| ORM | Prisma |
| Auth | JWT + bcrypt, or Supabase Auth |
| Database | PostgreSQL (via Supabase, free tier) |
| Job queue | Redis (via Upstash, free tier) + BullMQ |
| Scoreboard cache | Redis sorted set |
| Worker | Node.js + BullMQ consumer |
| Execution engine | Judge0 (self-hosted via Docker/docker-compose) |
| Checker | Node.js logic (token/float diff) + optional testlib-style C++ binary |
| Process management | pm2 or systemd |
| Frontend hosting | Vercel (free tier) |
| Backend/worker/Judge0 hosting | Local Docker (dev) → Azure VM (final cloud test) |

---

## 3. System Architecture

```
React (frontend, Vercel)
   ↕ HTTP + WebSocket
Express/Node API server (Azure VM / local)
   ↕                              ↕
PostgreSQL (Supabase)         Redis (Upstash)
  - source of truth              - job queue
  - problems, testcases           - scoreboard sorted set
  - submissions, users
                                   ↕
                              Node worker process (Azure VM / local)
                                   ↕
                              Judge0 (Docker, Azure VM / local)
                                   - sandboxed compile/execute
```

### Component responsibilities

| Component | Role |
|---|---|
| Frontend | Problem browsing, statement view, code editor, submission, contests, live scoreboard |
| API server | Auth, CRUD, submission intake, WebSocket broadcast, stateless request handling |
| PostgreSQL | Durable storage: users, problems, testcases, submissions, contests, wrong-attempt/AC history |
| Redis | Job queue (producer: API, consumer: worker) + scoreboard cache — per-cell state (wrong counts, solve times) mirrored on every verdict; ranking sorted set updated only on AC (see 5.8) |
| Worker | Consumes queue jobs, calls Judge0 per test case, runs checker, computes penalty, writes verdict, updates scoreboard |
| Judge0 | Sandboxed execution only — compiles/runs code, enforces time/memory limits, returns stdout/exit status/resource usage. Never determines correctness. |
| Checker | Compares Judge0's output against expected output — lives inside worker code (or as a compiled binary the worker shells out to), not separately hosted |

---

## 4. Data Model (PostgreSQL)

```sql
users
  id, username, email, password_hash,
  role ('participant' | 'author' | 'admin'),
  is_banned (bool, default false), banned_reason (nullable), banned_at (nullable),
  created_at

role_requests
  id, user_id, status ('pending' | 'approved' | 'denied'),
  requested_at, reviewed_by (nullable, references users.id), reviewed_at (nullable)

problems
  id, title, statement_md, time_limit_ms, memory_limit_kb,
  checker_type ('token' | 'float' | 'custom'), checker_source (nullable),
  visibility ('public' | 'private', default 'public'),
  created_by, created_at, updated_at
  -- private = visible/usable only by created_by and admins; public = visible to everyone,
  -- addable to any contest by any author; updated_at drives client-side cache invalidation (5.3)

system_settings
  id (singleton row), disable_non_contest_submissions (bool, default false),
  updated_by (references users.id), updated_at
  -- admin-only global toggle; when true, submissions with no contest_id are rejected —
  -- intended to reduce judging load during an active contest

testcases
  id, problem_id, input_path, output_path, is_sample (bool), ordinal

contests
  id, title, start_time, end_time, created_by,
  visibility ('public' | 'private' | 'restricted', default 'public'),
  password_hash (nullable — only meaningful when visibility = 'private'),
  penalty_minutes_per_wrong (int, default 20)
  -- ICPC-style penalty setting, configurable per contest rather than hardcoded;
  -- shown explicitly on the contest overview page (5.7)

contest_access
  user_id, contest_id, granted_at
  PRIMARY KEY (user_id, contest_id)
  -- presence of a row = lifetime access to a 'private' contest, once the password was
  -- correctly entered one time; never re-checked again for that user/contest pair

contest_final_results
  contest_id (unique, references contests.id),
  results_json (text/jsonb — the full computed final leaderboard),
  finalized_at
  -- immutable-until-recomputed snapshot; overwritten (not appended) if a post-contest
  -- ban requires recalculation (see 5.8)

first_blood_overrides
  contest_id, problem_id, user_id, overridden_by (references users.id), overridden_at
  PRIMARY KEY (contest_id, problem_id)
  -- manual admin correction, applied on top of derived state during any scoreboard
  -- rebuild (live or final) so it survives restarts/finalization

contest_sessions
  id, user_id, contest_id, device_id, ip_address, user_agent,
  first_seen, last_seen, connection_count
  -- one row per (user, contest, device_id); repeated tabs/reconnects under the same
  -- device_id increment connection_count rather than creating new rows — admin-only signal

contest_problems
  contest_id, problem_id, label (A, B, C, ...)

submissions
  id, user_id, problem_id, contest_id (nullable),
  language ('python' | 'cpp' | 'java'),
  source_code, status ('queued'|'judging'|'done'),
  verdict ('AC'|'WA'|'TLE'|'MLE'|'RE'|'CE'|null),
  -- MLE is a DERIVED label, not a raw Judge0 status — see 5.6 for how it's inferred
  time_used_ms, memory_used_kb, submitted_at
```

Penalty/wrong-attempt tracking is derived from `submissions` directly (no separate table needed):
- First AC time per (user, problem) within a contest
- Count of non-AC submissions before that AC time

---

## 5. Functional Modules

### 5.1 Site Landing Page

A single landing page that explains what the platform is and what the visitor can do on it — **content adapts to the viewer's role**, defaulting to the participant-level explanation for anyone not logged in (never assume elevated capability; an anonymous visitor sees exactly what a participant would be told they can do, not what an author/admin could do).

```javascript
function getLandingContent(user) {
  const role = user?.role ?? 'participant'; // logged-out visitors get the participant framing
  return LANDING_SECTIONS.filter(section => section.roles.includes(role));
}
```

**Sections shown, additively by role:**

| Section | Shown to |
|---|---|
| What this platform is (brief pitch: self-hosted judge, practice problems, contests) | Everyone |
| How to browse problems & submit code | Everyone |
| How contests work (visibility modes, scoreboards, penalties) | Everyone |
| "Want to create problems/contests? Request author access from your profile" | Participant only (hidden once already an author/admin, since it's no longer relevant to them) |
| How problem/contest authoring works, ownership rules | Author, Admin |
| Admin capabilities overview (moderation, oversight) | Admin only |

This is a **static/lightly-templated page**, not a data-heavy one — the adaptive part is just conditional section rendering based on `user.role`, no new backend endpoints beyond the user's own profile data already available on login.

### 5.2 Problem Authoring (Author, Admin)
- Form-based statement entry: title, description, input/output format, constraints, notes (stored as markdown)
- Time limit / memory limit fields
- Test case upload: input/output file pairs, flagged sample vs hidden
- Checker configuration:
  - `token` (default): whitespace-insensitive exact match
  - `float`: token-wise comparison with epsilon tolerance
  - `custom`: upload a testlib-style checker source, compiled once and cached as a binary

**Full edit access, ownership-or-admin:**
- The **creating author** can edit every field of their own problem at any time — statement, time/memory limits, checker configuration, test cases (add/replace/remove input-output pairs), and visibility
- **Admins can edit any problem** in full, regardless of who created it — same fields, same capability, no restriction
- No other author can edit a problem they didn't create, regardless of its visibility (a public problem is viewable/addable-to-contests by any author, per 5.7, but still only editable by its creator or an admin)
```javascript
app.patch('/api/problems/:id', async (req, res) => {
  const problem = await prisma.problems.findUnique({ where: { id: req.params.id } });
  const isOwner = problem.created_by === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Only the creator or an admin can edit this problem.' });

  // statement_md, time_limit_ms, memory_limit_kb, checker_type/checker_source, visibility all editable here
  await prisma.problems.update({ where: { id: req.params.id }, data: req.body });
});
// Test case add/replace/remove endpoints follow the identical isOwner-or-isAdmin check
```

**Visibility (private/public)** — one of the fields covered by the full-edit capability above, worth calling out specifically since it also affects contest-linking (5.7):

| Visibility | Who can view/use it |
|---|---|
| **public** | Anyone browsing problems; any author can add it to a contest by ID |
| **private** | Only its creating author and any admin — invisible in general browsing, and cannot be added to a contest by anyone else |

- Hide (make private) / unhide (make public) is just this field being set via the same `PATCH /api/problems/:id` endpoint and the same isOwner-or-isAdmin check — no separate mechanism
- This is the same ownership-or-admin pattern used for contest visibility changes (5.7)

### 5.3 Problem Browsing & Layout
- List/filter problems (visible to logged-out users too) — **private problems are excluded from this listing for everyone except their creating author and admins**
- Problem detail page: **split-view, single page** — statement (description, I/O format, constraints, samples) on one side, Monaco editor + submission controls on the other (side-by-side on desktop; stacked/tab-toggle on narrow/mobile viewports). Not a separate page for the editor — users need constant reference to the statement while coding.

**Client-side caching, once loaded:**
- The first time a problem's statement is fetched, cache it in the browser (`sessionStorage`, keyed by problem ID) — subsequent visits to that same problem in the same session read straight from the cache, no repeat DB query
- **Lightweight invalidation via `updated_at`:** since an author/admin can edit a problem at any time (5.2's full-edit rule), a naive infinite cache risks showing stale content after an edit. Store the problem's `updated_at` alongside the cached statement, and compare it against a cheap freshness check on load:
```javascript
async function loadProblem(problemId) {
  const cacheKey = `problem:${problemId}`;
  const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');

  // Cheap check: ask the server only for the current updated_at, not the full statement
  const { updatedAt } = await fetch(`/api/problems/${problemId}/meta`).then(r => r.json());

  if (cached && cached.updatedAt === updatedAt) {
    return cached.data; // cache hit, no full-statement fetch needed
  }

  // Cache miss or stale — fetch the full problem, then cache it
  const fresh = await fetch(`/api/problems/${problemId}`).then(r => r.json());
  sessionStorage.setItem(cacheKey, JSON.stringify({ updatedAt: fresh.updatedAt, data: fresh }));
  return fresh;
}
```
- This keeps the common case (repeatedly revisiting a problem you're working on) essentially free after the first load, while still self-correcting if the author edits the statement mid-session, at the cost of one small metadata request per visit (far cheaper than re-fetching the full statement/samples every time)
- Same `sessionStorage` pattern already used for cached submission code (5.5) — consistent caching approach across the app

### 5.4 Code Submission

**Supported languages: Python, C++, Java only.**

| Language | Judge0 `language_id`* | Notes |
|---|---|---|
| Python | 71 (verify against your Judge0 instance's `/languages`) | No special constraints |
| C++ | 54 or 76 (pick one standard, e.g. C++17) | No special constraints |
| Java | 62 | Public class **must be named `Main`** — Judge0 must write your code to a file before compiling, and the JVM requires the file name to match the public class name. Document this requirement near the language selector; optionally add a client-side regex check (`public class Main`) to warn before submission rather than surfacing a cryptic Compile Error. |

*IDs vary by Judge0 version — always confirm via `GET /languages` on your deployed instance rather than hardcoding from memory.

**Two input methods, unified into one submission path:**
- **Type directly in Monaco** — standard editing experience
- **Upload a file** — file picker/drag-and-drop; on upload, read the file as text and load it into the Monaco editor via `editor.setValue(contents)` (rather than a separate upload endpoint) so the user can review/edit before submitting, and the rest of the pipeline only ever deals with one code path: `editor.getValue()` at submit time
  - Auto-detect language from file extension (`.py`/`.cpp`/`.java`) and pre-select the language dropdown, allowing override
  - Restrict file picker `accept` to `.py,.cpp,.java`; enforce a reasonable size cap (e.g. 1MB) server-side

**Submission flow:**
- Monaco Editor captures code via `editor.getValue()` on submit click
- Language selection mapped to both Monaco's syntax-highlight language and Judge0's `language_id` via an explicit 3-entry mapping table
- POST `{ problem_id, language, source_code }` → API creates submission row (`status: queued`) → pushes job to Redis queue
  - Server rejects the request if the requesting user `is_banned` (see 5.9) or not authenticated (contest submissions require login)
- Frontend shows live status (queued → judging → verdict) via polling or WebSocket push

### 5.5 Submission History (per user, per contest)

A tab on the contest page showing the logged-in user's **own** past submissions within that contest (problem, verdict, time, timestamp). Users can click one to view the exact code they submitted and copy it.

**Query/caching behavior (deliberately minimal DB load):**
- Listing submissions (problem, verdict, timestamp — no code) is a normal Postgres query, run each time the tab is opened. This is small metadata, cheap regardless of frequency.
- **Source code is only fetched on demand** — clicking a specific submission triggers a fetch of just that submission's `source_code` column, not eagerly loaded with the list.
- On fetching source code, **cache it in `sessionStorage`** keyed by submission ID (e.g. `submission_code:<submissionId>`).
- Before fetching, always check `sessionStorage` first — if present, render instantly from storage with **zero DB query**. Only hit the API/DB if the key is absent.
- This cache is safe to keep indefinitely for the session since submitted code is immutable once judged (a submission's `source_code` never changes after creation) — no invalidation logic needed.

```javascript
async function viewSubmission(submissionId) {
  const cacheKey = `submission_code:${submissionId}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    return JSON.parse(cached); // no network/DB call at all
  }
  const res = await fetch(`/api/submissions/${submissionId}/code`);
  const data = await res.json();
  sessionStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}
```

- A "Copy" button on the viewed code uses `navigator.clipboard.writeText(code)`.
- Scope this endpoint server-side to **only return code for submissions owned by the requesting user** (or, for admins, any user's — see 5.9) — never trust the submission ID alone as authorization.

### 5.6 Judging Pipeline
```
Worker pulls job
  → fetch problem + testcases from Postgres
  → for each testcase:
      - send code + input + limits to Judge0
      - poll Judge0 for result (Judge0 status ID, stdout, exit code, time, peak memory)
      - map Judge0's status to a verdict (see "Verdict mapping" below — MLE is inferred, not a raw status)
      - stop on the first non-AC verdict (RE/TLE/MLE/CE/WA)
      - else (Judge0 status = Accepted) run checker(input, user_output, expected_output) → AC or WA, stop on WA
  → write final verdict + resource usage to submissions row (Postgres — always, unconditionally)
  → update scoreboard state (see 5.8) — triggered on EVERY verdict, not just AC:
      - update in-memory per-cell state (wrong count, solved flag, solve time)
      - mirror the same update into Redis (per-cell hash)
      - if verdict === AC: additionally compute penalty and update the Redis sorted set (ranking)
      - broadcast the updated scoreboard via WebSocket to all connected clients
```

**Verdict mapping — MLE has no dedicated Judge0 status and must be inferred:**

Judge0 CE's status list has no distinct "Memory Limit Exceeded" ID — a process that exceeds its memory limit gets killed by the OS/sandbox and reported as a **Runtime Error variant** (status IDs 7–12: SIGSEGV, SIGABRT, NZEC, "Other", etc.), same as any other crash. The worker must derive MLE itself:

```javascript
function mapJudge0StatusToVerdict(judge0Status, memoryUsedKb, memoryLimitKb) {
  const id = judge0Status.id;
  if (id === 3) return 'AC_CANDIDATE'; // Accepted by Judge0 — still needs the checker to confirm actual correctness
  if (id === 4) return 'WA';
  if (id === 5) return 'TLE';
  if (id === 6) return 'CE';
  if (id >= 7 && id <= 12) {
    // Runtime Error range — infer MLE if peak memory was at/near the configured limit
    if (memoryUsedKb && memoryUsedKb >= memoryLimitKb * 0.9) return 'MLE';
    return 'RE'; // genuine runtime error, unrelated to memory
  }
  return 'RE'; // status 13/14 (Internal Error/Exec Format Error) — treat as a runtime-side failure
}
```
- The `memory` field in Judge0's response (peak memory used, in KB) is the actual signal — proximity to the configured limit (e.g. ≥90%) is treated as MLE; otherwise it's reported as a genuine RE
- This is an approximation, not a certainty — it's the same approach most real judges (Codeforces included) use under the hood, since a clean, unambiguous MLE signal generally isn't available from the OS layer
- **Config check worth doing once, during Judge0 setup (milestone 3):** confirm `ENABLE_PER_PROCESS_AND_OR_THREAD_MEMORY_LIMIT` in `judge0.conf` — if disabled, memory limits still get enforced at the container/cgroup level rather than Judge0's finer per-process accounting, which doesn't change the inference logic above but is worth knowing when interpreting borderline cases

### 5.7 Contests

**Time-boxed set of problems** (`contest_problems`), ICPC-style scoring: rank by most-solved (desc), then least-penalty (asc).

**Contest overview page (landing page for the contest itself):** after entering a contest (password gate cleared if `private`, identity check passed if `restricted`), the user lands on an overview page **before** the Problems/Scoreboard/My Submissions tabs — this is the contest's own "front page":
```
Contest: Weekly Practice #3
Runs: Aug 1, 10:00 AM – 1:00 PM (3 hours)
Problems: 7
Scoring: ICPC-style — most solved, tiebreak by least penalty
Penalty: +{penalty_minutes_per_wrong} minutes per wrong submission before a problem's first accepted solution

Problems:
  A — Two Sum              [Enter →]
  B — Binary Search Tree    [Enter →]
  C — Graph Coloring         [Enter →]
  ...
```
- **Metadata shown:** problem count, start/end time (and duration), scoring rule in plain language, and the contest's actual **configured penalty value** (`penalty_minutes_per_wrong`, default 20 but editable per contest by its creator/admin per the full-edit rule below) spelled out explicitly rather than left as an assumed constant
- **Problem list**: label + title, each linking directly into that problem's split-view submission page (5.4's layout), scoped to this contest
- This overview is the natural landing point for `[Problems]` in the tab bar — clicking a problem row here is equivalent to opening it from that tab; both routes lead to the same problem page

**Full edit access, ownership-or-admin:** once a contest exists, its **creator** and any **admin** can edit it at any time — title/description, `start_time`/`end_time`, `penalty_minutes_per_wrong`, add or remove problems (by ID, subject to the visibility rule in the next section), and visibility mode. No other author can modify a contest they didn't create.
```javascript
app.patch('/api/contests/:id', async (req, res) => {
  const contest = await prisma.contests.findUnique({ where: { id: req.params.id } });
  const isOwner = contest.created_by === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Only the creator or an admin can edit this contest.' });

  // title, start_time, end_time, visibility all editable here
  await prisma.contests.update({ where: { id: req.params.id }, data: req.body });
});
// Adding/removing contest_problems rows, and the /enter password-check flow below,
// follow the identical isOwner-or-isAdmin check for any mutation
```
The one exception to "edit anytime" is the live-window guard on switching **to** `restricted` visibility, covered below.

**Three visibility modes:**

| Mode | Who can view/enter | Shows in general listing? |
|---|---|---|
| **public** | Anyone (including logged-out, for listing/problem browsing per the access matrix) | Yes, to everyone |
| **private** | Anyone who enters the correct password — **one time only**, then permanent (lifetime) access | Yes, to everyone (existence visible, entry gated) |
| **restricted** | Only the contest's creator and any admin — no password can unlock this, it's identity-based | No — invisible to everyone except creator + admins |

**Private contest entry (one-time password, lifetime access):**
```javascript
POST /api/contests/:id/enter { password }

async function enterContest(userId, contestId, password) {
  const contest = await getContest(contestId);
  if (contest.visibility !== 'private') return { ok: true };

  const existing = await prisma.contest_access.findUnique({
    where: { user_id_contest_id: { user_id: userId, contest_id: contestId } }
  });
  if (existing) return { ok: true }; // already granted, never re-prompted

  const valid = await bcrypt.compare(password, contest.password_hash);
  if (!valid) throw new UnauthorizedError('Incorrect contest password');

  await prisma.contest_access.create({ data: { user_id: userId, contest_id: contestId, granted_at: new Date() } });
  return { ok: true };
}
```
Every contest-scoped route (problems, scoreboard, submission) checks `contest_access` the same way — once granted, switching between Problems/Scoreboard/My Submissions tabs or refreshing never re-prompts. If the contest is later made `public`, access rows become irrelevant (the `visibility` flag gates access, not row presence); if flipped back to `private` later, **previously granted rows still count** — access, once given, is permanent.

**Restricted mode**: purely identity-based, no password bypass possible.
```javascript
if (contest.visibility === 'restricted') {
  const isOwner = contest.created_by === userId;
  const isAdmin = await isUserAdmin(userId);
  if (!isOwner && !isAdmin) throw new ForbiddenError('This contest is restricted to its creator and admins.');
}
```
Restricted contests are excluded from the general listing entirely, except for their creator and admins.

**Guard against restricting a live contest:** switching **to** `restricted` is blocked while `start_time <= now <= end_time` — restricting mid-contest would lock out active participants, almost certainly by mistake. Use user-level bans instead for live cheating concerns.
```javascript
if (newVisibility === 'restricted' && now >= contest.start_time && now <= contest.end_time) {
  throw new BadRequestError('Cannot restrict a contest while it is live.');
}
```
Making a contest `public` (e.g. after it ends, to open results up) has no such restriction — it's a manual admin/creator action at any time, never automatic just because `end_time` passed.

**Adding problems to a contest (by problem ID):**
- The contest-problem-linking form takes a **problem ID**, not a picker limited to "your own problems" — but the server enforces two separate checks: (1) the requester is allowed to edit *this contest* (ownership-or-admin, from the full-edit rule above), and (2) the requester is allowed to use *this problem* (its own visibility rule):
```javascript
app.post('/api/contests/:contestId/problems', async (req, res) => {
  const { problem_id, label } = req.body;
  const contest = await prisma.contests.findUnique({ where: { id: req.params.contestId } });
  const problem = await prisma.problems.findUnique({ where: { id: problem_id } });
  const isAdmin = req.user.role === 'admin';

  const canEditContest = contest.created_by === req.user.id || isAdmin;
  if (!canEditContest) return res.status(403).json({ error: 'Only this contest\'s creator or an admin can add problems to it.' });

  const isProblemOwner = problem.created_by === req.user.id;
  if (problem.visibility === 'private' && !isProblemOwner && !isAdmin) {
    return res.status(403).json({ error: 'You cannot add another author\'s private problem to a contest.' });
  }
  // public problems: any author/admin who can edit this contest may add them, regardless of who created them

  await prisma.contest_problems.create({ data: { contest_id: req.params.contestId, problem_id, label } });
});
```

| Requesting user | Can add a `public` problem | Can add their **own** `private` problem | Can add **someone else's** `private` problem |
|---|---|---|---|
| Author | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ (any author's) | ✅ (any author's) |

- This mirrors the visibility-check logic already used for viewing a problem — attaching it to a contest doesn't bypass the same ownership rule
- The contest itself can still be `public`/`private`/`restricted` independently of the visibility of the problems inside it — e.g. a `public` contest can contain problems that were `private` at authoring time, as long as the author/admin who added them was authorized to do so

**Post-contest state:** ended contests are view-only — problem set and final leaderboard remain visible, submissions are rejected (see 5.8 for the enforcement mechanism, which is server-side and independent of any disabled button).

### 5.8 Live Scoreboard

**Per-cell display, not just rank/penalty totals.** Each (user, problem) cell in the scoreboard shows:

| Cell state | Display |
|---|---|
| Solved, no prior wrong attempts | Solve time in green, e.g. `12:04` |
| Solved, N prior wrong attempts | `12:04 +2` in green (the `+2` folded into penalty) |
| First solve of that problem across the entire contest | Same as above, additionally marked (star/trophy/gold highlight — "first blood") |
| Attempted, not yet solved | Wrong count in red, e.g. `WA×2` |
| Not attempted | Blank |

**Two things update at different rates, both driven by every verdict:**
1. **Per-cell state** (wrong count, solved flag, solve time) — must update on **every** verdict (AC or WA), not just AC, so red wrong-attempt cells appear live rather than only becoming visible retroactively once a user eventually solves that problem
2. **Rank/penalty** (solved count, total penalty, sort order) — only changes on AC, since ICPC penalty is only assessed against problems actually solved

**Update path, triggered by every verdict:**
```javascript
async function onVerdict(contestId, userId, problemId, verdict, submittedAt) {
  // 1. Postgres — always, unconditionally (source of truth, never skipped)
  await prisma.submissions.update({ /* verdict data */ });

  // 2. Update in-memory per-cell state
  const cell = scoreboardState[contestId][userId][problemId] ??= { wrongCount: 0, solved: false };
  if (verdict === 'AC' && !cell.solved) {
    cell.solved = true;
    cell.solveTime = submittedAt;
  } else if (verdict !== 'AC' && !cell.solved) {
    cell.wrongCount += 1;
  }

  // 3. Mirror into Redis (per-cell hash; sorted-set ranking updated only on AC)
  await redis.hset(`contest:${contestId}:cell:${userId}:${problemId}`, cell);
  if (verdict === 'AC') {
    const { solvedCount, penalty } = computeUserStats(scoreboardState[contestId], userId);
    await redis.zadd(scoreboardKey, { score: computeScore(solvedCount, penalty), member: userId });
  }

  // 4. Broadcast fresh state to everyone connected — event-driven, not polled
  broadcastScoreboard(contestId);
}
```

**Shared Redis instance, separated by key prefix only:** the job queue (milestone 4, BullMQ) and the scoreboard (this section) use the **same single Upstash Redis instance** — no separate database needed. BullMQ automatically namespaces all of its own keys under a `bull:` prefix (e.g. `bull:judge:wait`, `bull:judge:42`); the scoreboard's own keys use the `contest:{contestId}:...` prefix shown above (e.g. `contest:abc123:scoreboard`, `contest:abc123:cell:userX:problemY`). Since Redis is one flat key-value space, this prefix convention is the *only* thing keeping the two systems from colliding — as long as scoreboard code never writes a key starting with `bull:` (no reason it would), the two are fully isolated while sharing one connection string, one free-tier quota, and one `REDIS_URL` in `.env`.

**Delivery to clients: WebSocket push, not polling.**
- Clients open one WebSocket connection per contest page (with jittered connect delay — see 5.11) and simply listen; they never poll on a timer
- Every verdict (AC or WA, for any participant) triggers an immediate broadcast of the updated scoreboard to all connected clients for that contest — updates are near-real-time, not bound to a fixed interval
- New connections (tab refresh, multiple tabs) immediately receive the current state on connect via the fallback chain below — no blank screen, no extra cost from refresh-spamming

**Three-tier fallback chain for reading/reconstructing scoreboard state** (handles server restarts and Redis flushes without losing correctness, since Postgres is the only true source of truth):
```javascript
async function getScoreboard(contestId) {
  // 1. In-memory (fastest, normal hot path)
  if (scoreboardState[contestId]) return scoreboardState[contestId];

  // 2. In-memory empty (e.g. just restarted) — try Redis
  const fromRedis = await loadScoreboardFromRedis(contestId);
  if (fromRedis && Object.keys(fromRedis).length > 0) {
    scoreboardState[contestId] = fromRedis;
    return fromRedis;
  }

  // 3. Redis also empty/flushed — rebuild from Postgres (always correct, source of truth)
  const fromPostgres = await rebuildScoreboardFromPostgres(contestId);
  scoreboardState[contestId] = fromPostgres;
  await saveScoreboardToRedis(contestId, fromPostgres); // repopulate Redis too
  return fromPostgres;
}
```
- Rebuilding from Postgres replays every submission row for the contest (ordered by time) to reconstruct per-cell wrong counts, solve times, and first-blood markers — correct by construction since Postgres has every verdict ever written
- This fallback only triggers when a faster layer is missing/empty; normal operation never touches Postgres for a scoreboard read, only for the initial per-verdict write
- An admin recovery endpoint (`POST /api/admin/contests/:id/rebuild-scoreboard`) is worth keeping as a manual trigger for this rebuild, in case Redis or memory ever desyncs unexpectedly

**Banned users on the scoreboard:**
- Forced to the **bottom of the ranking**, below every legitimate 0-solved participant, via a worst-possible sort score:
```javascript
function computeScore(solvedCount, penalty, isBanned) {
  if (isBanned) return Number.MAX_SAFE_INTEGER; // always sorts last, regardless of anyone else's score
  return (totalProblems - solvedCount) * 1_000_000 + penalty;
}
```
- **Display**: name shown with strikethrough + a "Banned" badge; their per-problem cells remain visible (greyed/struck-through) showing what they actually attempted, for transparency — but contribute nothing to rank
- **First-blood credit is handled differently live vs. final, matching the "no automatic recalculation" rule established for live contests:**
  - **Live**: if a banned user already held a first-blood marker before the ban, it **stays frozen on their row as-is** — banning does not automatically reassign it to the next-earliest non-banned solver. Reassignment only happens via the manual admin override (5.9), if the admin chooses to correct it while the contest is still running.
  - **Final** (contest finalization, or a recompute triggered by a post-finalization ban): first-blood is **fully stripped from any banned user, unconditionally** — the computation is a fresh from-scratch pass using only non-banned users' AC timestamps, so a banned user's row in the permanent snapshot shows their solve as an ordinary green AC (with wrong-count badge and strikethrough/banned styling as normal), never a first-blood star, regardless of what their live-view row showed before the ban. The first-blood credit moves to whichever non-banned user actually solved it next-earliest.
- Historical submissions/ACs are **never deleted** — only the *display/ranking* is overridden; this preserves the audit trail for reviewing the cheating case

**Submission cutoff — server-side, timestamp-authoritative:**
- `submitted_at` is **always assigned by the server** at the moment of request receipt — never accepted from the client, since a client-supplied timestamp could be spoofed to bypass the cutoff or to falsely claim an earlier solve/first-blood credit
```javascript
app.post('/api/submissions', async (req, res) => {
  const now = new Date(); // server clock, authoritative
  const contest = await prisma.contests.findUnique({ where: { id: req.body.contest_id } });
  if (contest && now > contest.end_time) {
    return res.status(403).json({ error: 'Contest has ended. Submissions are no longer accepted.' });
  }
  const submission = await prisma.submissions.create({ data: { ...fields, submitted_at: now, status: 'queued' } });
  // ... push to queue ...
});
```
- This same `submitted_at` value is what all leaderboard computations (first-AC, first-blood, penalty minutes) are derived from — one authoritative source, both live and final
- **The frontend's disabled Submit button is cosmetic only, not a security control** — it can be re-enabled via devtools/inspect, or bypassed entirely with a raw request (curl/Postman). The 403 check above is the only real guardrail, runs on every request regardless of client-side state, and is what actually prevents late submissions
- The disable timing itself should be driven by **server time, not the browser's own clock** (which could be wrong or deliberately altered) — either compute a client/server clock offset via a `/api/server-time` endpoint on page load, or (preferred) have the server push a `{ type: 'contest_ended' }` WebSocket event at the exact moment `end_time` passes, so all clients disable in sync without relying on individual timer drift

**Contest finalization (after end_time, once all submissions are judged):**
- `end_time` passing does not necessarily mean judging is finished — submissions made near the deadline may still be `queued`/`judging`. Finalization triggers only once **both** conditions hold: contest has ended **and** zero submissions for it remain unjudged.
```javascript
// Checked after every submission is judged
async function onSubmissionJudged(contestId) {
  const contest = await prisma.contests.findUnique({ where: { id: contestId } });
  if (contest && new Date() > contest.end_time) {
    const pending = await prisma.submissions.count({ where: { contest_id: contestId, status: { in: ['queued', 'judging'] } } });
    if (pending === 0) await finalizeContest(contestId);
  }
}

async function finalizeContest(contestId) {
  const already = await prisma.contest_final_results.findUnique({ where: { contest_id: contestId } });
  if (already) return; // guard against double-finalization races

  const allSubmissions = await prisma.submissions.findMany({ where: { contest_id: contestId }, orderBy: { submitted_at: 'asc' }, include: { user: true } });
  const finalState = computeFinalScoreboard(allSubmissions); // full correct recompute — first-blood
    // is fully stripped from any banned user and reassigned to the next-earliest non-banned
    // solver; the banned user's own AC still shows as a normal green solve (strikethrough/banned
    // styling, no star), bottom-ranked, with full attempt history retained for transparency

  await prisma.contest_final_results.create({ data: { contest_id: contestId, results_json: JSON.stringify(finalState), finalized_at: new Date() } });
  broadcastFinalScoreboard(contestId, finalState);
  closeAllConnections(contestId); // nothing more will ever change — tear down sockets
  delete scoreboardState[contestId];
  await redis.del(`contest:${contestId}:scoreboard`); // clear live-tier caches, no longer needed
}
```
- Once `contest_final_results` has a row, reads become a single indexed query — no live computation, no Redis, no in-memory state:
```javascript
async function getScoreboard(contestId) {
  const finalResult = await prisma.contest_final_results.findUnique({ where: { contest_id: contestId } });
  if (finalResult) return JSON.parse(finalResult.results_json); // finalized: one query, done
  return getLiveScoreboard(contestId); // still live: fall through to the three-tier chain above
}
```

**Post-contest ban → recalculation:**
- If a user is banned **after** a contest has already been finalized, the frozen snapshot must be recomputed and overwritten, since a ban changes first-blood eligibility and ranking position
```javascript
async function banUser(userId, reason, adminId) {
  await prisma.users.update({ where: { id: userId }, data: { is_banned: true, banned_reason: reason, banned_at: new Date() } });
  closeUserWebSocket(userId);

  for (const contestId of await getContestsUserParticipatedIn(userId)) {
    const contest = await prisma.contests.findUnique({ where: { id: contestId } });
    if (new Date() > contest.end_time) {
      await recalculateFinalResults(contestId); // ended: recompute + overwrite the frozen snapshot
    } else {
      await forceZeroScore(contestId, userId); // still live: normal live-ban handling
      broadcastScoreboard(contestId);
    }
  }
}

async function recalculateFinalResults(contestId) {
  const allSubmissions = await prisma.submissions.findMany({ where: { contest_id: contestId }, orderBy: { submitted_at: 'asc' }, include: { user: true } });
  const finalState = computeFinalScoreboard(allSubmissions); // reads user.is_banned fresh — naturally
    // reassigns first-blood and bottom-ranks the now-banned user, no special-case logic needed
  await prisma.contest_final_results.upsert({
    where: { contest_id: contestId },
    update: { results_json: JSON.stringify(finalState), finalized_at: new Date() },
    create: { contest_id: contestId, results_json: JSON.stringify(finalState), finalized_at: new Date() }
  });
  broadcastFinalScoreboard(contestId, finalState); // in case anyone is still viewing
}
```
- Raw `submissions` rows are never altered by this — only the derived final snapshot is recomputed, preserving the full audit trail

**Ended contests remain accessible, view-only:**
- Problem statements, the final leaderboard, and the user's own past submissions in that contest all remain viewable
- Submission is blocked (via the server-side cutoff above) — this is the only functional restriction post-end

### 5.9 Admin Console

Admin-only capabilities, gated by `role === 'admin'` middleware. Lives within the same unified UI as an "Admin" nav tab, not a separate application.

**Author role requests**
- Users request author status from their profile; request stored in `role_requests` (`status: pending`)
- Admin sees a list of pending requests, approves or denies each — approval updates the user's `role` to `'author'`

**Disable non-contest ("practice") submissions during an active contest**
- A single global toggle (`system_settings.disable_non_contest_submissions`), manually flipped by an admin — intended to reduce judging load on Judge0/the worker while a contest is running, by pausing unrelated practice submissions
```javascript
PATCH /api/admin/settings { disable_non_contest_submissions: true }
```
```javascript
// Submission endpoint checks this in addition to the contest end-time cutoff (5.8)
app.post('/api/submissions', async (req, res) => {
  const settings = await getSystemSettings();
  if (!req.body.contest_id && settings.disable_non_contest_submissions) {
    return res.status(503).json({ error: 'Practice submissions are temporarily paused while a contest is running.' });
  }
  // ... existing contest end-time check, then submission creation ...
});
```
- Scope: only affects submissions with **no** `contest_id` (practice/standalone problem submissions) — in-contest submissions are never affected by this toggle, since throttling those would undermine the very contest the load-reduction is meant to protect
- This is a manual on/off switch, not automatic — an admin turns it on before a contest and off after, at their discretion; it doesn't infer "a contest is running" on its own

**View any user's submissions, filterable**
- Endpoint accepts optional filters: `contest_id`, `user_id`, `problem_id` (any combination, all optional — omit for "all submissions")
- Returns metadata (user, problem, contest, verdict, timestamp) by default; source code fetched on demand per submission (same on-demand + view pattern as 5.5, but scoped to any user rather than just the requester)
```
GET /api/admin/submissions?contest_id=&user_id=&problem_id=
GET /api/admin/submissions/:id/code   (admin bypasses the "own submissions only" check from 5.5)
```
- Useful for manually reviewing suspiciously similar solutions across users, or auditing a specific contest/problem
- **This code-viewing capability is admin-exclusive** — authors, despite their elevated content-creation permissions, cannot view other users' submitted code

**User profile view — reachable two ways**
- From a **contest's participant list** (click a participant's name)
- From a standalone **user search by name** (admin-only search bar)
- Both routes land on the same user profile page, which exposes: ban/unban action, role-change control, and (from here) a link into that user's submission history (via the filtered admin submissions endpoint above)

**Change user role**
- `PATCH /api/admin/users/:id/role` with `{ role: 'participant' | 'author' | 'admin' }` — lets an admin promote/demote directly from the profile view (separate from, or in addition to, the request/approval flow above)

**Ban a user**
- `PATCH /api/admin/users/:id/ban` with a required `reason` field → sets `is_banned = true`, `banned_reason`, `banned_at`
- **Immediate, multi-layer enforcement:**
  1. **Active WebSocket connection is force-closed by the server** the instant the ban is applied (server maintains a `userId → socket` mapping to find and close it) — the frontend's `onclose` handler detects this as a ban (via a distinguishing close code or a final `{ type: 'banned' }` message sent just before closing) and immediately logs the user out client-side with a "you have been banned" notice, rather than attempting to reconnect
  2. **Every authenticated REST request re-checks `is_banned`** in auth middleware (not just at login) — this is the backstop for any request made without an active WebSocket, or if the socket-close step is missed for any reason
  3. **Submission endpoint explicitly rejects** any submit attempt from a banned user, even if some other check is somehow bypassed — belt-and-suspenders on the one action a ban most needs to prevent
- **Post-ban access matches the logged-out tier**: banned users can still browse problems and see contest listings, but cannot open/enter contests or submit code (same restrictions as an unauthenticated visitor)
- **Scoreboard effect depends on contest state (see 5.8 for full logic):** if any of the user's contests are still live, they're immediately forced to the bottom of the live scoreboard; if a contest has already been finalized, its frozen `contest_final_results` snapshot is recomputed and overwritten to reflect the ban (bottom rank, first-blood reassigned to the next eligible non-banned solver)
- Banning does **not** delete or hide their past submissions/scoreboard entries — historical contest results stay intact for integrity; the ban only prevents further participation and future ranking credit
- `unban` endpoint (`is_banned = false`, clear ban fields) available for appeals/mistakes

**Manual first-blood override (live contests only)**
- If an admin needs to reassign first-blood credit *during* a still-live contest (e.g. suspected cheating not yet confirmed via a full ban), a dedicated override exists rather than relying on automatic recalculation:
```javascript
PATCH /api/admin/contests/:contestId/problems/:problemId/first-blood
{ userId: "..." }
```
- Stored in a `first_blood_overrides` table (`contest_id, problem_id, user_id, overridden_by, overridden_at`) for auditability, and applied on top of the derived state whenever the scoreboard is rebuilt from Postgres (live rebuild or final recompute both check this table) — so the manual correction survives restarts and finalization rather than being a fragile in-memory-only patch
- This is a narrow, deliberate exception; general "edit any scoreboard value" admin tooling is out of scope

### 5.10 Device/Session Monitoring (Admin-Only)

A heuristic signal for spotting account-sharing or multi-device cheating during a contest — **not proof, a prompt for manual review**. Every signal involved is spoofable by a motivated user (fake User-Agent, VPN, cleared local storage); this tool surfaces suspicious patterns for an admin to investigate, not an automated verdict.

**Capture — sent by every contest participant (not just suspects), invisible to the user:**
```javascript
// Client: persistent per-browser-profile identifier, generated once and reused across tabs
function getOrCreateDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('device_id', id); }
  return id;
}
// Sent on WebSocket connect for any contest-scoped page (Problems/Scoreboard/My Submissions)
socket.send(JSON.stringify({ type: 'session_info', deviceId: getOrCreateDeviceId() }));
```
```javascript
// Server: upsert on every contest WebSocket connection
async function recordSession(userId, contestId, deviceId, req) {
  await prisma.contest_sessions.upsert({
    where: { user_id_contest_id_device_id: { user_id: userId, contest_id: contestId, device_id: deviceId } },
    update: { last_seen: new Date(), connection_count: { increment: 1 } },
    create: {
      user_id: userId, contest_id: contestId, device_id: deviceId,
      ip_address: req.socket.remoteAddress, user_agent: req.headers['user-agent'],
      first_seen: new Date(), last_seen: new Date(), connection_count: 1
    }
  });
}
```
- **Multiple tabs of the same browser share `localStorage`**, so they report the same `device_id` and collapse into the same row (`connection_count` increments instead of creating a new row) — this is what correctly avoids the "3 tabs looks like 3 devices" false positive
- Multiple *browsers* on the same physical machine (e.g. Chrome + Firefox) will still appear as separate `device_id`s — an inherent limitation of this approach, not something this design claims to solve

**Admin-only tab, inside a contest's admin view:**
- New "Device Sessions" tab, visible only when `role === 'admin'` — same gating pattern as the rest of the admin console; not visible to participants or authors
```
GET /api/admin/contests/:id/sessions?user=<optional name search>
```
- **Grouped by user, each group showing a distinct-device count** (`COUNT(DISTINCT device_id)` per user within that contest), expandable to the individual device rows (device ID, IP, browser/OS, first seen, last active)
- **Sorted descending by distinct-device count** — accounts with the most simultaneous devices surface at the top automatically, so an admin scanning the tab sees the most suspicious activity first without manual sorting
- **Searchable by username**, narrowing to one user's session rows directly — same UX pattern as the existing admin user-search (5.9)

```sql
SELECT user_id, COUNT(DISTINCT device_id) as distinct_devices
FROM contest_sessions
WHERE contest_id = ?
GROUP BY user_id
ORDER BY distinct_devices DESC
```

### 5.11 Connection Load Smoothing (Jitter)

To avoid many clients hammering the server with heavy operations at the exact same instant (e.g. everyone's frontend reconnecting a WebSocket simultaneously after a deploy/restart, or many browsers opening tabs at the same contest-start second), add a **small random delay before opening WebSocket connections and other connection-heavy requests**:

```javascript
// Frontend: jitter before opening a WebSocket connection
function connectWithJitter() {
  const jitterMs = Math.random() * 300; // e.g. 0–300ms random delay
  setTimeout(() => {
    const socket = new WebSocket('wss://your-server.com/scoreboard');
    // ... onmessage, onclose, reconnect logic
  }, jitterMs);
}
```

- Apply the same jitter pattern to reconnect logic (don't reconnect all clients instantly and simultaneously after a server restart — stagger them)
- Also apply lightly to other connection-establishing calls that could spike simultaneously (e.g. initial page-load API calls firing the moment a contest starts and many users are watching a countdown) — a small random delay (tens to low hundreds of ms) is enough to smooth a thundering-herd spike into a gentle ramp, without being noticeable to any individual user
- This is purely a client-side smoothing technique — it doesn't change server logic, just prevents synchronized bursts from many clients at once

---

## 6. Execution Safety (Judge0)

- Self-hosted via `docker-compose` (server, internal workers, internal Postgres, internal Redis — separate from your own app's Redis instance)
- Enforces per-submission: CPU time limit, memory limit, wall-clock timeout, output size cap, process/thread limit, no network access, read-only filesystem except scratch dir
- Requires Linux (or WSL2/Docker Desktop's Linux VM) and privileged container mode — this is why Judge0 runs on a VM (local machine or Azure), not on restrictive PaaS platforms like Vercel/Railway

---

## 7. Hosting & Deployment Plan

| Stage | Where | Notes |
|---|---|---|
| Dev/testing | Local machine (Docker for Judge0, Node for API/worker) | Zero cost, fastest iteration |
| Database | Supabase (free tier) | Hosted Postgres, optionally use Supabase Auth/Storage too |
| Queue + scoreboard | Upstash (free tier, 500K commands/month) | Event-driven scoreboard design keeps usage far under quota |
| Judge0 + worker (prelim cloud test) | Stay local via Docker; Railway only viable for the lightweight worker (Judge0 likely blocked by privileged-container restrictions) | Judge0 needs privileged containers |
| Final cloud test | Azure VM (Ubuntu, e.g. Standard_B4ms, 4 vCPU/16GB) | Same docker-compose.yml as local, one env var change (`JUDGE0_URL`), NSG rule restricting port 2358 |
| Frontend | Vercel (free tier) | Stateless, no persistent-process requirement |

### Local → Azure migration steps
1. Provision Ubuntu VM, install Docker + Docker Compose
2. Copy the same `judge0/` folder (with your `judge0.conf`) to the VM
3. Run `docker-compose up -d` — identical command as local
4. Update worker's `JUDGE0_URL` env var to the VM's IP
5. Open port 2358 in the Network Security Group, restricted to your API server's IP

### Cost posture
- Supabase, Upstash, Vercel: free tiers, sufficient at this scale
- Azure: only real cost — run VM on-demand (start for dev/test sessions, deallocate when idle) to stretch a $100 credit across the entire build-and-cloud-test phase

---

## 8. Build Order (Milestones for an Agent)

**How to use this section:** each milestone ends with a **✅ Test checkpoint** — a concrete, verifiable outcome (via curl/Postman, a seeded script, or manual UI check) that must pass before moving to the next milestone. Milestones are ordered so every checkpoint is reachable using only what's been built so far — no milestone requires a piece from a later one to verify itself. Sub-numbered steps (e.g. 7.1, 7.2) exist specifically because the parent feature (scoreboard, admin console) is too large to validate as one unit — each sub-step is independently testable before composing into the next.

---

**1. Schema + Auth + Roles**
- Postgres (Supabase) + Prisma schema: `users` (`role`, `is_banned`), `role_requests`, `problems` (`visibility`, `updated_at`), `testcases`, `contests` (`visibility`, `password_hash`, `penalty_minutes_per_wrong`), `contest_access`, `contest_final_results`, `first_blood_overrides`, `system_settings`, `contest_problems`, `contest_sessions`, `submissions` — full schema defined upfront (cheap with Prisma migrations), even though most tables aren't exercised until later milestones
- Auth routes: register/login (JWT), password hashing (bcrypt)
- Role middleware (`requireRole('author')`, `requireRole('admin')`) and ban middleware (`is_banned` checked on every authenticated request) — wired now even though nothing can set `is_banned = true` yet until milestone 9.4; the check being present early is a deliberate defensive default
- **✅ Test checkpoint:** register 3 users, manually set one's `role` to `author` and one to `admin` directly in the DB (no UI yet), confirm JWT login works for all three and that a protected test route correctly 403s a plain participant while allowing the author/admin through

**2. Problem CRUD (API only, no frontend yet)**
- `POST/GET/PATCH /api/problems` — full field set (statement, limits, checker config placeholder, visibility), ownership-or-admin enforcement on edit
- Test case upload endpoint (input/output pairs, sample/hidden flag)
- Problem visibility enforcement: private problems excluded from the list endpoint for non-owners/non-admins
- **✅ Test checkpoint:** via curl/Postman — author A creates a private problem; author B's list request doesn't include it; author B's direct GET-by-ID returns 403/404; admin's GET-by-ID succeeds; author A can PATCH it, author B cannot

**3. Judge0 standalone (local, isolated from the rest of the app)**
- `docker-compose up -d` Judge0 locally
- **✅ Test checkpoint:** raw `curl` submissions directly against Judge0's own `/submissions` endpoint (bypassing your API entirely) for at least 2 of the 3 languages — confirm compile, stdout, exit status, time, and memory all report correctly. This validates Judge0 in isolation before anything in your app depends on it.

**4. Queue + worker, wired end-to-end (still no frontend)**
- Redis (Upstash) + BullMQ producer (API) / consumer (worker)
- Worker: pull job → fetch problem/testcases from Postgres → call Judge0 → run checker (**token-diff only for now**, custom checkers come later) → write verdict to `submissions`
- **✅ Test checkpoint:** seed one problem + testcases via the milestone-2 API, POST a submission directly via curl, confirm the row transitions `queued` → `judging` → `done` with the correct verdict, without touching a browser at all. Also submit a deliberately memory-hungry solution (e.g. allocating a huge array) against a low memory limit, and confirm the worker correctly derives `MLE` rather than storing a raw `RE` — this is the one verdict that isn't a direct Judge0 status, so it's worth confirming the inference logic actually fires here rather than assuming it works.

**5. Frontend — landing page, problem browsing, submission**
- Site landing page: role-adaptive sections (5.1) — test by logging in as each of the 3 roles and confirming the right sections appear/disappear
- Problem list/detail pages, `sessionStorage` caching keyed by problem ID + `updated_at` invalidation
- Monaco editor + language selector + Judge0 language-id mapping + file upload
- Submit → POST → poll/display verdict
- **✅ Test checkpoint:** as a participant in the browser, browse to a problem, submit working and broken solutions in each of the 3 languages, see correct verdicts appear; edit the problem as its author, refresh, confirm the cached copy updates rather than showing stale content

**6. Contests — structure and access, no scoreboard yet**
- Contest CRUD (`penalty_minutes_per_wrong` included), contest overview/landing page (5.7)
- `contest_problems` linking by problem ID, with the dual ownership check (contest-edit permission + problem-visibility permission)
- Three visibility modes: password entry + `contest_access` lifetime grant for private; identity gate + listing exclusion for restricted; ownership-or-admin for visibility changes; live-window guard blocking transition to `restricted`
- Submissions tagged with `contest_id`; server-side `now > end_time` cutoff enforced (cosmetic disabled-button state is a separate, later frontend touch, not required for this checkpoint)
- Admin-only global toggle to pause non-contest submissions
- **✅ Test checkpoint:** create a public, a private (with password), and a restricted contest as different users; confirm listing visibility matches the table in 5.7; confirm a second author cannot add a third author's private problem to their own contest; confirm submitting after manually editing `end_time` into the past is rejected with a 403

**7. Scoreboard — split into sub-steps, each independently verifiable:**

- **7.1 Static ICPC computation (Postgres only, no live layer, no UI)**
  - A pure function: given a contest's raw `submissions`, compute per-user solved count, penalty, and per-problem cell state (wrong count, solve time, first-blood)
  - **✅ Test checkpoint:** seed a small fixed set of submissions with known timestamps/verdicts, run the function, hand-verify the output matches expected ICPC ranking and first-blood assignment

- **7.2 Live per-cell state + Redis mirror**
  - Worker updates in-memory cell state + Redis hash on every verdict (AC or WA); Redis sorted set (ranking) updated only on AC
  - **✅ Test checkpoint:** submit a WA then an AC for the same user/problem via the API, inspect Redis directly (`redis-cli`) to confirm the hash reflects wrong-count-then-solved correctly, and the sorted set only changed on the AC

- **7.3 WebSocket broadcast**
  - Server pushes updated scoreboard to all connected clients on every verdict
  - **✅ Test checkpoint:** open the scoreboard page in two browser tabs, submit from a third session, confirm both tabs update simultaneously without a manual refresh

- **7.4 Frontend scoreboard rendering**
  - Per-cell display: green solve time (+wrong count), red WA count, first-blood highlight, banned-user bottom/strikethrough
  - **✅ Test checkpoint:** visually confirm all cell states render correctly against the data seeded in 7.1–7.3

- **7.5 Three-tier read fallback (memory → Redis → Postgres)**
  - **✅ Test checkpoint:** with a contest live and some verdicts already in, kill and restart the API server process; confirm the scoreboard reconstructs correctly on the next request without manual intervention. Then manually flush the relevant Redis keys and confirm it still reconstructs correctly from Postgres.

- **7.6 Banned-user live handling**
  - Ban a participant mid-contest → forced to bottom, WebSocket force-closed, broadcast reflects it immediately; first-blood stays frozen (no auto-reassignment) unless the manual override (7.8) is used
  - **✅ Test checkpoint:** ban a user mid-contest who currently holds first-blood on a problem; confirm they drop to the bottom with strikethrough, their own active tab gets force-logged-out, and the first-blood marker is unchanged until you explicitly override it

- **7.7 Contest finalization**
  - Trigger once `end_time` has passed **and** no submissions remain `queued`/`judging`; full recompute saved to `contest_final_results`; connections closed; live-tier caches cleared
  - **✅ Test checkpoint:** set a contest's `end_time` to the near future with one submission deliberately delayed in the queue; confirm finalization does *not* fire until that last submission finishes judging, and that a banned user's first-blood is correctly stripped and reassigned in the final snapshot

- **7.8 Post-finalization ban recalculation + manual first-blood override**
  - Ban a user after finalization → recompute and overwrite `contest_final_results`; admin manual first-blood override endpoint, applied on top of any rebuild
  - **✅ Test checkpoint:** ban a user after a contest is finalized, confirm the snapshot is overwritten correctly; separately, use the manual override endpoint on a still-live contest and confirm it survives a subsequent server restart (i.e. it's read from `first_blood_overrides`, not just in-memory)

**8. Custom checker support**
- testlib-style checker source upload, compiled once per problem, cached binary; worker invokes it as a subprocess instead of token-diff when configured
- **✅ Test checkpoint:** author a problem with multiple valid outputs (e.g. "print any topological order"), upload a custom checker, submit a correct-but-non-canonical answer, confirm AC — then confirm a token-diff-only version of the same problem would have wrongly marked it WA, validating the custom checker actually mattered

**9. Submission history + admin console — split into sub-steps:**

- **9.1 Submission history (participant-facing)**
  - Per-contest tab: metadata list + on-demand code fetch + `sessionStorage` caching (fetch once per session)
  - **✅ Test checkpoint:** view a past submission's code, refresh the page, confirm the second view triggers no network request (check devtools network tab), then log out and back in (new session) and confirm it re-fetches once

- **9.2 Author request + approval flow**
  - Request-author UI, admin approve/deny list
  - **✅ Test checkpoint:** a plain participant requests author access, an admin approves it, confirm the user's role updates and author-only nav tabs now appear for them on next login/refresh

- **9.3 Admin submissions explorer + user profile**
  - Filterable submissions view (contest/user/problem), user search, profile page (reachable via contest participant list or search) with role-change control
  - **✅ Test checkpoint:** as admin, filter submissions by a specific problem across all users, open one's code; confirm an author account cannot reach the equivalent endpoint (403)

- **9.4 Ban/unban + full enforcement chain**
  - Ban endpoint, WebSocket force-close with client-detectable signal, `is_banned` checked in auth + submission middleware, unban endpoint
  - **✅ Test checkpoint:** ban a user with an active session — confirm their WebSocket closes and their client force-logs-out; confirm a raw curl submission attempt from their (still-valid, if reused) JWT is rejected by the middleware independent of the WebSocket signal; unban and confirm normal access returns

**10. Device/session monitoring**
- `contest_sessions` table, client-side persistent `device_id`, server upsert-on-connect, admin-only grouped/sorted/searchable tab
- **✅ Test checkpoint:** open the same contest from 2 different browsers (simulating 2 devices) and 3 tabs within one of them; confirm the admin view shows exactly 2 distinct devices for that user, with the 3 tabs collapsed into one row's `connection_count`

**11. Connection load smoothing (jitter)**
- Randomized delay before WebSocket connect/reconnect and other burst-prone requests
- **✅ Test checkpoint:** simulate several clients connecting at the same instant (e.g. a script opening 20 WebSocket connections simultaneously) and confirm server-side connection timestamps show a spread rather than a single spike

**12. Move to Azure, harden, load test**
- Migrate Judge0 + worker to Azure VM (Section 7 steps), configure NSG rules, deploy frontend to Vercel pointed at the Azure-hosted API
- **✅ Test checkpoint:** repeat the milestone-4 and milestone-7 checkpoints end-to-end against the Azure-hosted stack instead of local Docker, confirming identical behavior; run a simulated burst of concurrent submissions to observe the actual concurrency ceiling on the provisioned VM size

---

## 9. Key Design Decisions Worth Preserving

- **Judge0 only executes — it never judges correctness.** Correctness is always determined by your own checker code, run against Judge0's raw output.
- **Checker is trusted code, not sandboxed** — only user-submitted code needs isolation.
- **Scoreboard cell state updates on every verdict (AC and WA)**, but ranking/penalty only recomputes on AC — wrong-attempt counts must be live, not just retroactively visible once a problem is eventually solved.
- **Postgres is the only true source of truth.** In-memory scoreboard state and Redis are both caches for speed and are always rebuildable from Postgres — never skip or make "best effort" the Postgres write on a verdict, since everything downstream depends on it being complete.
- **Three-tier read fallback (memory → Redis → Postgres)** protects against server restarts and Redis flushes without ever losing scoreboard correctness.
- **Scoreboard delivery is event-driven via WebSocket push, not client polling** — updates broadcast immediately on every verdict, synchronized for all connected clients rather than delivered on a fixed interval.
- **In-memory server-side caching only works on persistent-process hosts** (Azure VM, Railway) — not on serverless platforms like Vercel, where such state can't be relied upon across requests.
- **Local Docker setup for Judge0 is identical to the Azure deployment** — migration is a config change (URL), not a rewrite.
- **`submitted_at` is always server-assigned, never client-supplied** — this single timestamp is the sole basis for the end-time cutoff, penalty calculation, and first-blood determination; accepting a client value for it would let submissions be spoofed past deadlines or falsely credited as earliest.
- **Frontend disabled-submit-button state is cosmetic only** — the real submission cutoff is a server-side `now > end_time` check on every request, immune to devtools tampering or direct API calls.
- **`contest_final_results` is a frozen snapshot, not truly permanent** — it's recomputed and overwritten (not appended) if a ban occurs after finalization, since bans affect first-blood eligibility and rank; raw `submissions` rows are never altered, only the derived snapshot.
- **Contest visibility (`public`/`private`/`restricted`) and user bans are independent mechanisms** — visibility controls who can see/enter a contest at all; bans control what a specific user can do once let in. Restricting a contest is blocked during its live window specifically to avoid it being used (likely by mistake) as a blunt substitute for banning a specific cheater.
- **Device/session monitoring is a heuristic signal for manual review, not proof.** Every input (device ID, IP, User-Agent) is spoofable by a motivated user; it exists to surface suspicious patterns to an admin, not to auto-detect or auto-ban.
- **Problem visibility follows the same ownership-or-admin pattern as contest visibility** — an author's private problem is invisible to and unusable by every other author, including when linking problems into a contest by ID; only admins have blanket access across all problems, mirroring the contest ownership rule exactly.
- **MLE is a derived verdict, not a raw Judge0 status** — Judge0 CE has no dedicated Memory Limit Exceeded status; a memory-killed process reports as a generic Runtime Error variant (status IDs 7–12). The worker infers MLE by checking whether peak memory (Judge0's `memory` field) was at/near the configured limit; this is an approximation used by real judges generally, not a guaranteed-precise signal.
- **The non-contest submission throttle is a manual, scope-limited admin switch** — it only affects practice submissions (no `contest_id`), never in-contest ones, and must be explicitly toggled on/off by an admin rather than inferred automatically from contest activity.
- **The landing page adapts content by role but never over-assumes** — a logged-out visitor always sees the participant-level explanation, never a glimpse of author/admin capabilities they don't have.
- **Penalty (`penalty_minutes_per_wrong`) is a per-contest configurable value, not a hardcoded constant** — defaults to 20 (ICPC convention) but is editable by the contest's creator/admin and displayed explicitly on the contest overview page, so participants never have to assume a fixed rule.
- **Problem statement caching uses a cheap metadata check for invalidation, not a blind infinite cache** — comparing cached vs. current `updated_at` avoids showing stale content after an author edits a problem mid-session, at the cost of one small request per visit rather than the full statement payload every time.
