const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redisConnection');
const { JUDGE_QUEUE_NAME } = require('./constants');

const DEFAULT_COMPLETED_AGE_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_FAILED_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_LIMIT = 1000;

async function cleanOnce() {
  const q = new Queue(JUDGE_QUEUE_NAME, { connection: createRedisConnection() });
  try {
    const completedAge = Number(process.env.CLEAN_COMPLETED_AGE_MS || DEFAULT_COMPLETED_AGE_MS);
    const failedAge = Number(process.env.CLEAN_FAILED_AGE_MS || DEFAULT_FAILED_AGE_MS);
    const limit = Number(process.env.CLEAN_BATCH_LIMIT || DEFAULT_LIMIT);

    console.log('[cleanup] starting', { completedAge, failedAge, limit });

    const removedCompleted = await q.clean(completedAge, limit, 'completed');
    console.log('[cleanup] removed completed jobs:', removedCompleted.length);

    const removedFailed = await q.clean(failedAge, limit, 'failed');
    console.log('[cleanup] removed failed jobs:', removedFailed.length);

    await q.close();
  } catch (err) {
    console.error('[cleanup] error during cleanup:', err.message || err);
    try { await q.close(); } catch (e) {}
    process.exitCode = 1;
  }
}

if (require.main === module) {
  cleanOnce()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { cleanOnce };
