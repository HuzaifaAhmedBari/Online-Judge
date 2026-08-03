const express = require('express');

const prisma = require('../utils/prisma');
const { authenticate, requireNotBanned } = require('../middleware/auth');
const { enqueueSubmission } = require('../queue/judgeQueue');
const { SUPPORTED_LANGUAGES } = require('../config/languages');

const router = express.Router();

const SUPPORTED_LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES);
const MAX_SOURCE_BYTES = 1024 * 1024;

function canViewProblem(problem, user) {
  if (problem.visibility === 'public') return true;
  return user && (user.role === 'admin' || problem.created_by === user.id);
}

function serializeSubmission(submission, { includeSource = false } = {}) {
  const data = {
    id: submission.id,
    user_id: submission.user_id,
    problem_id: submission.problem_id,
    contest_id: submission.contest_id,
    language: submission.language,
    status: submission.status,
    verdict: submission.verdict,
    time_used_ms: submission.time_used_ms,
    memory_used_kb: submission.memory_used_kb,
    submitted_at: submission.submitted_at,
  };

  if (includeSource) {
    data.source_code = submission.source_code;
  }

  if (submission.problem) {
    data.problem = {
      id: submission.problem.id,
      title: submission.problem.title,
      checker_type: submission.problem.checker_type,
    };
  }

  return data;
}

function validateSubmissionPayload(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body is required.';
  }

  if (typeof body.problem_id !== 'string' || body.problem_id.trim() === '') {
    return 'problem_id must be a non-empty string.';
  }

  if (typeof body.language !== 'string' || !SUPPORTED_LANGUAGE_SET.has(body.language)) {
    return `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}.`;
  }

  if (typeof body.source_code !== 'string' || body.source_code.trim() === '') {
    return 'source_code must be a non-empty string.';
  }

  if (Buffer.byteLength(body.source_code, 'utf8') > MAX_SOURCE_BYTES) {
    return 'source_code must be 1MB or smaller.';
  }

  if (body.contest_id !== undefined && body.contest_id !== null) {
    return 'contest_id submissions are deferred until milestone 6.';
  }

  return null;
}

router.post('/', authenticate, requireNotBanned, async (req, res, next) => {
  let createdSubmission = null;

  try {
    const validationError = validateSubmissionPayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const problem = await prisma.problem.findUnique({
      where: { id: req.body.problem_id },
      include: {
        testcases: {
          select: { id: true },
        },
      },
    });

    if (!problem || !canViewProblem(problem, req.user)) {
      return res.status(404).json({ error: 'Problem not found.' });
    }

    if (problem.checker_type === 'custom') {
      return res.status(400).json({
        error: 'Custom checker submissions are deferred until milestone 8.',
      });
    }

    if (problem.testcases.length === 0) {
      return res.status(400).json({ error: 'Problem must have at least one testcase before judging.' });
    }

    createdSubmission = await prisma.submission.create({
      data: {
        user_id: req.user.id,
        problem_id: problem.id,
        language: req.body.language,
        source_code: req.body.source_code,
        status: 'queued',
      },
    });

    await enqueueSubmission(createdSubmission.id);

    return res.status(201).json({
      submission: serializeSubmission(createdSubmission),
    });
  } catch (err) {
    if (createdSubmission) {
      await prisma.submission.delete({ where: { id: createdSubmission.id } }).catch(() => {});
    }
    return next(err);
  }
});

router.get('/:id', authenticate, requireNotBanned, async (req, res, next) => {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            checker_type: true,
          },
        },
      },
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    const isOwner = submission.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    return res.json({ submission: serializeSubmission(submission) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
