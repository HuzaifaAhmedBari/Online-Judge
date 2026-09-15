const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');

const prisma = require('../utils/prisma');
const { authenticate, optionalAuthenticate, requireNotBanned } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

const CHECKER_TYPES = new Set(['token', 'float', 'custom']);
const VISIBILITIES = new Set(['public', 'private']);
const EDITABLE_PROBLEM_FIELDS = [
  'title',
  'statement_md',
  'input_format_md',
  'output_format_md',
  'constraints_md',
  'explanation_md',
  'time_limit_ms',
  'memory_limit_kb',
  'checker_type',
  'checker_source',
  'visibility',
];

const testcaseRoot = path.resolve(__dirname, '..', '..', 'storage', 'testcases');

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateProblemPayload(body, { partial = false } = {}) {
  const data = {};

  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return { error: 'title must be a non-empty string.' };
    }
    data.title = body.title.trim();
  }

  if (!partial || body.statement_md !== undefined) {
    if (typeof body.statement_md !== 'string' || body.statement_md.trim() === '') {
      return { error: 'statement_md must be a non-empty string.' };
    }
    data.statement_md = body.statement_md;
  }

  for (const field of ['input_format_md', 'output_format_md', 'constraints_md', 'explanation_md']) {
    if (!partial || body[field] !== undefined) {
      if (typeof body[field] !== 'string') {
        return { error: `${field} must be a string.` };
      }
      data[field] = body[field];
    }
  }

  if (!partial || body.time_limit_ms !== undefined) {
    if (!isPositiveInteger(body.time_limit_ms)) {
      return { error: 'time_limit_ms must be a positive integer.' };
    }
    data.time_limit_ms = body.time_limit_ms;
  }

  if (!partial || body.memory_limit_kb !== undefined) {
    if (!isPositiveInteger(body.memory_limit_kb)) {
      return { error: 'memory_limit_kb must be a positive integer.' };
    }
    data.memory_limit_kb = body.memory_limit_kb;
  }

  if (body.checker_type !== undefined) {
    if (typeof body.checker_type !== 'string' || !CHECKER_TYPES.has(body.checker_type)) {
      return { error: 'checker_type must be one of: token, float, custom.' };
    }
    data.checker_type = body.checker_type;
  } else if (!partial) {
    data.checker_type = 'token';
  }

  if (body.checker_source !== undefined) {
    if (body.checker_source !== null && typeof body.checker_source !== 'string') {
      return { error: 'checker_source must be a string or null.' };
    }
    data.checker_source = body.checker_source;
  }

  if (body.visibility !== undefined) {
    if (typeof body.visibility !== 'string' || !VISIBILITIES.has(body.visibility)) {
      return { error: 'visibility must be one of: public, private.' };
    }
    data.visibility = body.visibility;
  } else if (!partial) {
    data.visibility = 'public';
  }

  if (partial && Object.keys(data).length === 0) {
    return { error: `At least one editable field is required: ${EDITABLE_PROBLEM_FIELDS.join(', ')}.` };
  }

  return { data };
}

function validateTestcasePayload(testcase, index = 0, { partial = false } = {}) {
  const data = {};
  const label = `testcases[${index}]`;

  if (!partial || testcase.input !== undefined) {
    if (typeof testcase.input !== 'string') {
      return { error: `${label}.input must be a string.` };
    }
    data.input = testcase.input;
  }

  if (!partial || testcase.output !== undefined) {
    if (typeof testcase.output !== 'string') {
      return { error: `${label}.output must be a string.` };
    }
    data.output = testcase.output;
  }

  if (testcase.is_sample !== undefined) {
    if (typeof testcase.is_sample !== 'boolean') {
      return { error: `${label}.is_sample must be a boolean.` };
    }
    data.is_sample = testcase.is_sample;
  } else if (!partial) {
    data.is_sample = false;
  }

  if (testcase.ordinal !== undefined) {
    if (!isPositiveInteger(testcase.ordinal)) {
      return { error: `${label}.ordinal must be a positive integer.` };
    }
    data.ordinal = testcase.ordinal;
  } else if (!partial) {
    data.ordinal = index + 1;
  }

  if (partial && Object.keys(data).length === 0) {
    return { error: 'At least one testcase field is required: input, output, is_sample, ordinal.' };
  }

  return { data };
}

function validateTestcaseArray(testcases) {
  for (let index = 0; index < testcases.length; index += 1) {
    const { error } = validateTestcasePayload(testcases[index], index);
    if (error) return error;
  }
  return null;
}
function canViewProblem(problem, user) {
  if (problem.visibility === 'public') return true;
  if (!user || user.is_banned) return false;
  return user.role === 'admin' || problem.created_by === user.id;
}

function canEditProblem(problem, user) {
  return user && (user.role === 'admin' || problem.created_by === user.id);
}

function problemListWhere(user) {
  if (user?.is_banned) return { visibility: 'public' };
  if (user?.role === 'admin') return {};
  if (user) {
    return {
      OR: [
        { visibility: 'public' },
        { visibility: 'private', created_by: user.id },
      ],
    };
  }
  return { visibility: 'public' };
}

function serializeProblem(problem, { includeStatement = true, includeTestcases = false, includeCreator = true } = {}) {
  const data = {
    id: problem.id,
    title: problem.title,
    time_limit_ms: problem.time_limit_ms,
    memory_limit_kb: problem.memory_limit_kb,
    checker_type: problem.checker_type,
    checker_source: problem.checker_source,
    visibility: problem.visibility,
    created_by: problem.created_by,
    created_at: problem.created_at,
    updated_at: problem.updated_at,
  };

  if (includeStatement) {
    data.statement_md = problem.statement_md;
    data.input_format_md = problem.input_format_md;
    data.output_format_md = problem.output_format_md;
    data.constraints_md = problem.constraints_md;
    data.explanation_md = problem.explanation_md;
  }

  if (includeCreator && problem.creator) {
    data.creator = {
      id: problem.creator.id,
      username: problem.creator.username,
    };
  }

  if (includeTestcases && problem.testcases) {
    data.testcases = problem.testcases.map((testcase) => ({
      id: testcase.id,
      is_sample: testcase.is_sample,
      ordinal: testcase.ordinal,
    }));
  }

  return data;
}

function applyProblemStatuses(problems, submissions) {
  const statusByProblemId = new Map();

  for (const submission of submissions) {
    const previous = statusByProblemId.get(submission.problem_id);
    if (previous === 'solved') continue;

    if (submission.verdict === 'AC') {
      statusByProblemId.set(submission.problem_id, 'solved');
    } else if (submission.status === 'done' || submission.verdict) {
      statusByProblemId.set(submission.problem_id, 'tried');
    }
  }

  return problems.map((problem) => ({
    ...problem,
    user_status: statusByProblemId.get(problem.id) || 'none',
  }));
}

async function writeTestcaseFiles(problemId, testcaseId, input, output) {
  const directory = path.join(testcaseRoot, problemId);
  await fs.mkdir(directory, { recursive: true });

  const inputPath = path.join(directory, `${testcaseId}.in`);
  const outputPath = path.join(directory, `${testcaseId}.out`);

  await fs.writeFile(inputPath, input, 'utf8');
  await fs.writeFile(outputPath, output, 'utf8');

  return { inputPath, outputPath };
}

async function removeTestcaseFiles(testcase) {
  await Promise.all([
    fs.rm(testcase.input_path, { force: true }),
    fs.rm(testcase.output_path, { force: true }),
  ]);
}

async function readTestcaseContent(testcase) {
  const [input, output] = await Promise.all([
    fs.readFile(testcase.input_path, 'utf8'),
    fs.readFile(testcase.output_path, 'utf8'),
  ]);

  return {
    id: testcase.id,
    input,
    output,
    is_sample: testcase.is_sample,
    ordinal: testcase.ordinal,
  };
}

async function createTestcases(problemId, testcases) {
  if (!testcases || testcases.length === 0) return [];

  const prepared = [];
  try {
    for (let index = 0; index < testcases.length; index += 1) {
      const { data, error } = validateTestcasePayload(testcases[index], index);
      if (error) {
        const err = new Error(error);
        err.status = 400;
        throw err;
      }

      const testcaseId = randomUUID();
      const { inputPath, outputPath } = await writeTestcaseFiles(problemId, testcaseId, data.input, data.output);
      prepared.push({
        id: testcaseId,
        problem_id: problemId,
        input_path: inputPath,
        output_path: outputPath,
        is_sample: data.is_sample,
        ordinal: data.ordinal,
      });
    }

    await prisma.testcase.createMany({ data: prepared });
  } catch (err) {
    await Promise.all(prepared.flatMap((testcase) => [
      fs.rm(testcase.input_path, { force: true }),
      fs.rm(testcase.output_path, { force: true }),
    ]));
    throw err;
  }

  return prepared.map(({ input_path, output_path, ...testcase }) => testcase);
}
async function findProblemOr404(problemId) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
  });

  if (!problem) {
    const err = new Error('Problem not found.');
    err.status = 404;
    throw err;
  }

  return problem;
}

router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    const problems = await prisma.problem.findMany({
      where: problemListWhere(req.user),
      orderBy: { created_at: 'desc' },
      include: {
        creator: {
          select: { id: true, username: true },
        },
      },
    });

    const serializedProblems = problems.map((problem) => serializeProblem(problem, { includeStatement: false }));
    // Compute latest updated timestamp across problems
    const latestProblemUpdated = serializedProblems.reduce((m, p) => {
      const d = new Date(p.updated_at);
      return d > m ? d : m;
    }, new Date(0));

    // If unauthenticated or banned or no problems, allow conditional GET based on problems only
    if (!req.user || req.user.is_banned || serializedProblems.length === 0) {
      res.setHeader('Last-Modified', latestProblemUpdated.toUTCString());
      const ifModifiedSince = req.get('If-Modified-Since');
      if (ifModifiedSince && new Date(ifModifiedSince) >= latestProblemUpdated) {
        return res.status(304).end();
      }

      return res.json({ problems: serializedProblems.map((problem) => ({ ...problem, user_status: 'none' })) });
    }

    // Authenticated user: fetch recent submissions for status and include them in Last-Modified
    const submissions = await prisma.submission.findMany({
      where: {
        user_id: req.user.id,
        problem_id: { in: serializedProblems.map((problem) => problem.id) },
      },
      select: {
        problem_id: true,
        status: true,
        verdict: true,
        submitted_at: true,
      },
      orderBy: { submitted_at: 'desc' },
    });

    const latestSubmission = submissions.reduce((m, s) => {
      const d = s.submitted_at ? new Date(s.submitted_at) : new Date(0);
      return d > m ? d : m;
    }, new Date(0));

    const overallLatest = latestProblemUpdated > latestSubmission ? latestProblemUpdated : latestSubmission;
    res.setHeader('Last-Modified', overallLatest.toUTCString());
    const ifModifiedSince = req.get('If-Modified-Since');
    if (ifModifiedSince && new Date(ifModifiedSince) >= overallLatest) {
      return res.status(304).end();
    }

    return res.json({ problems: applyProblemStatuses(serializedProblems, submissions) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  async (req, res, next) => {
    try {
      const { testcases, ...problemBody } = req.body;
      const { data, error } = validateProblemPayload(problemBody);
      if (error) return res.status(400).json({ error });

      if (testcases !== undefined && !Array.isArray(testcases)) {
        return res.status(400).json({ error: 'testcases must be an array when provided.' });
      }
      const testcaseError = validateTestcaseArray(testcases || []);
      if (testcaseError) return res.status(400).json({ error: testcaseError });

      const problemId = randomUUID();
      const problem = await prisma.problem.create({
        data: {
          id: problemId,
          ...data,
          created_by: req.user.id,
        },
      });

      const createdTestcases = await createTestcases(problem.id, testcases || []);

      res.status(201).json({
        problem: {
          ...serializeProblem(problem, { includeCreator: false }),
          testcases: createdTestcases,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: req.params.id },
      include: {
        creator: {
          select: { id: true, username: true },
        },
      },
    });

    if (!problem || !canViewProblem(problem, req.user)) {
      return res.status(404).json({ error: 'Problem not found.' });
    }

    // Set Last-Modified for conditional GETs and honor If-Modified-Since
    const updatedAt = problem.updated_at
    res.setHeader('Last-Modified', new Date(updatedAt).toUTCString())

    const ifModifiedSince = req.get('If-Modified-Since')
    if (ifModifiedSince) {
      const ifSecs = Math.floor(new Date(ifModifiedSince).getTime() / 1000)
      const updatedSecs = Math.floor(new Date(updatedAt).getTime() / 1000)
      // Debug log to help diagnose client/server time comparisons
      console.debug('[conditional-get] If-Modified-Since:', ifModifiedSince, '=>', ifSecs, 'updated_at:', updatedAt, '=>', updatedSecs)
      if (!Number.isNaN(ifSecs) && ifSecs >= updatedSecs) {
        return res.status(304).end()
      }
    }

    res.json({ problem: serializeProblem(problem) })
  } catch (err) {
    next(err);
  }
});

router.get('/:id/samples', optionalAuthenticate, async (req, res, next) => {
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: req.params.id },
      include: {
        testcases: {
          where: { is_sample: true },
          orderBy: { ordinal: 'asc' },
        },
      },
    });

    if (!problem || !canViewProblem(problem, req.user)) {
      return res.status(404).json({ error: 'Problem not found.' });
    }

    const samples = await Promise.all(problem.testcases.map(readTestcaseContent));
    return res.json({ samples });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/meta', optionalAuthenticate, async (req, res, next) => {
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        visibility: true,
        created_by: true,
        updated_at: true,
      },
    });

    if (!problem || !canViewProblem(problem, req.user)) {
      return res.status(404).json({ error: 'Problem not found.' });
    }

    res.json({ id: problem.id, updated_at: problem.updated_at });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  async (req, res, next) => {
    try {
      const problem = await findProblemOr404(req.params.id);
      if (!canEditProblem(problem, req.user)) {
        return res.status(403).json({ error: 'Only the creator or an admin can edit this problem.' });
      }

      const { data, error } = validateProblemPayload(req.body, { partial: true });
      if (error) return res.status(400).json({ error });

      const updated = await prisma.problem.update({
        where: { id: problem.id },
        data,
      });

      res.json({ problem: serializeProblem(updated, { includeCreator: false }) });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/testcases',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  async (req, res, next) => {
    try {
      const problem = await findProblemOr404(req.params.id);
      if (!canEditProblem(problem, req.user)) {
        return res.status(403).json({ error: 'Only the creator or an admin can view this problem\'s test cases.' });
      }

      const testcases = await prisma.testcase.findMany({
        where: { problem_id: problem.id },
        orderBy: { ordinal: 'asc' },
      });

      res.json({ testcases: await Promise.all(testcases.map(readTestcaseContent)) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/testcases',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  async (req, res, next) => {
    try {
      const problem = await findProblemOr404(req.params.id);
      if (!canEditProblem(problem, req.user)) {
        return res.status(403).json({ error: 'Only the creator or an admin can add test cases.' });
      }

      if (!Array.isArray(req.body.testcases) || req.body.testcases.length === 0) {
        return res.status(400).json({ error: 'testcases must be a non-empty array.' });
      }

      const testcases = await createTestcases(problem.id, req.body.testcases);
      await prisma.problem.update({ where: { id: problem.id }, data: { updated_at: new Date() } });

      res.status(201).json({ testcases });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/testcases/:testcaseId',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  async (req, res, next) => {
    try {
      const problem = await findProblemOr404(req.params.id);
      if (!canEditProblem(problem, req.user)) {
        return res.status(403).json({ error: 'Only the creator or an admin can update test cases.' });
      }

      const testcase = await prisma.testcase.findFirst({
        where: { id: req.params.testcaseId, problem_id: problem.id },
      });

      if (!testcase) {
        return res.status(404).json({ error: 'Test case not found.' });
      }

      const { data, error } = validateTestcasePayload(req.body, 0, { partial: true });
      if (error) return res.status(400).json({ error });

      if (data.input !== undefined) {
        await fs.writeFile(testcase.input_path, data.input, 'utf8');
      }
      if (data.output !== undefined) {
        await fs.writeFile(testcase.output_path, data.output, 'utf8');
      }

      const updated = await prisma.testcase.update({
        where: { id: testcase.id },
        data: {
          ...(data.is_sample !== undefined ? { is_sample: data.is_sample } : {}),
          ...(data.ordinal !== undefined ? { ordinal: data.ordinal } : {}),
        },
      });

      await prisma.problem.update({ where: { id: problem.id }, data: { updated_at: new Date() } });

      res.json({ testcase: await readTestcaseContent(updated) });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id/testcases/:testcaseId',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  async (req, res, next) => {
    try {
      const problem = await findProblemOr404(req.params.id);
      if (!canEditProblem(problem, req.user)) {
        return res.status(403).json({ error: 'Only the creator or an admin can delete test cases.' });
      }

      const testcase = await prisma.testcase.findFirst({
        where: { id: req.params.testcaseId, problem_id: problem.id },
      });

      if (!testcase) {
        return res.status(404).json({ error: 'Test case not found.' });
      }

      await prisma.testcase.delete({ where: { id: testcase.id } });
      await removeTestcaseFiles(testcase);
      await prisma.problem.update({ where: { id: problem.id }, data: { updated_at: new Date() } });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
