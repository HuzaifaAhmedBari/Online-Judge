const IORedis = require('ioredis');

function createRedisConnection() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required for the judge queue.');
  }

  return new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

module.exports = { createRedisConnection };
