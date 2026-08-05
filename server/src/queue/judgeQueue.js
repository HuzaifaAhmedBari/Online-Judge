const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redisConnection');
const { JUDGE_QUEUE_NAME } = require('./constants');

let judgeQueue;

function getJudgeQueue() {
  if (!judgeQueue) {
    judgeQueue = new Queue(JUDGE_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        // Disable immediate per-job deletion to reduce DEL command churn.
        // Run periodic batch cleanup with queue.clean() instead.
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  return judgeQueue;
}

async function enqueueSubmission(submissionId) {
  return getJudgeQueue().add('judge-submission', { submissionId });
}

async function closeJudgeQueue() {
  if (judgeQueue) {
    await judgeQueue.close();
    judgeQueue = null;
  }
}

module.exports = {
  JUDGE_QUEUE_NAME,
  getJudgeQueue,
  enqueueSubmission,
  closeJudgeQueue,
};
