require('dotenv').config();

const fs = require('fs/promises');
const { Worker } = require('bullmq');

const prisma = require('./utils/prisma');
const { createRedisConnection } = require('./queue/redisConnection');
const { JUDGE_QUEUE_NAME } = require('./queue/constants');
const { runJudge0Submission } = require('./judge0/client');
const { runChecker } = require('./judging/checkers');

function mapJudge0StatusToVerdict(judge0Status, memoryUsedKb, memoryLimitKb) {
  const id = judge0Status?.id;
  if (id === 3) return 'AC_CANDIDATE';
  if (id === 4) return 'WA';
  if (id === 5) return 'TLE';
  if (id === 6) return 'CE';
  if (id >= 7 && id <= 12) {
    if (memoryUsedKb && memoryUsedKb >= memoryLimitKb * 0.9) return 'MLE';
    return 'RE';
  }
  return 'RE';
}

function maxMetric(current, next) {
  if (next === null || next === undefined) return current;
  if (current === null || current === undefined) return next;
  return Math.max(current, next);
}

async function readTestcaseFiles(testcase) {
  const [input, expectedOutput] = await Promise.all([
    fs.readFile(testcase.input_path, 'utf8'),
    fs.readFile(testcase.output_path, 'utf8'),
  ]);

  return { input, expectedOutput };
}

async function loadSubmission(submissionId) {
  return prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      problem: {
        include: {
          testcases: {
            orderBy: { ordinal: 'asc' },
          },
        },
      },
    },
  });
}

async function judgeSubmission(submissionId) {
  const submission = await loadSubmission(submissionId);

  if (!submission) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  if (submission.status === 'done') {
    return submission;
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: 'judging' },
  });

  let finalVerdict = 'AC';
  let maxTimeUsedMs = null;
  let maxMemoryUsedKb = null;

  try {
    if (submission.problem.checker_type === 'custom') {
      throw new Error('Custom checkers are deferred until milestone 8.');
    }

    if (submission.problem.testcases.length === 0) {
      throw new Error('Problem has no testcases to judge.');
    }

    for (const testcase of submission.problem.testcases) {
      const { input, expectedOutput } = await readTestcaseFiles(testcase);
      const judge0Result = await runJudge0Submission({
        language: submission.language,
        sourceCode: submission.source_code,
        stdin: input,
        timeLimitMs: submission.problem.time_limit_ms,
        memoryLimitKb: submission.problem.memory_limit_kb,
      });

      maxTimeUsedMs = maxMetric(maxTimeUsedMs, judge0Result.time_used_ms);
      maxMemoryUsedKb = maxMetric(maxMemoryUsedKb, judge0Result.memory_used_kb);

      const mappedVerdict = mapJudge0StatusToVerdict(
        judge0Result.status,
        judge0Result.memory_used_kb,
        submission.problem.memory_limit_kb
      );

      if (mappedVerdict !== 'AC_CANDIDATE') {
        finalVerdict = mappedVerdict;
        break;
      }

      const acceptedByChecker = runChecker(
        submission.problem.checker_type,
        judge0Result.stdout,
        expectedOutput
      );

      if (!acceptedByChecker) {
        finalVerdict = 'WA';
        break;
      }
    }
  } catch (err) {
    console.error(`[Worker] Failed to judge submission ${submission.id}:`, err.message);
    finalVerdict = 'RE';
  }

  return prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: 'done',
      verdict: finalVerdict,
      time_used_ms: maxTimeUsedMs,
      memory_used_kb: maxMemoryUsedKb,
    },
  });
}

const worker = new Worker(
  JUDGE_QUEUE_NAME,
  async (job) => {
    if (!job.data?.submissionId) {
      throw new Error('Judge job is missing submissionId.');
    }

    return judgeSubmission(job.data.submissionId);
  },
  {
    connection: createRedisConnection(),
    concurrency: Number(process.env.JUDGE_WORKER_CONCURRENCY || 1),
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Completed ${job.id} for submission ${job.data.submissionId}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Failed ${job?.id || 'unknown'}:`, err.message);
});

process.on('SIGINT', async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log(`[Worker] Listening on BullMQ queue "${JUDGE_QUEUE_NAME}"`);

module.exports = {
  judgeSubmission,
  mapJudge0StatusToVerdict,
};
