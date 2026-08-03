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
        removeOnComplete: {
          age: 60 * 60,
          count: 1000,
        },
        removeOnFail: {
          age: 24 * 60 * 60,
          count: 1000,
        },
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
