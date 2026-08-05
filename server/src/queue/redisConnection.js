const IORedis = require('ioredis');

let redisClient = null;

function createRedisConnection() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required for the judge queue.');
  }

  if (!redisClient) {
    redisClient = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    // Optional debugging: log every Redis command when REDIS_LOG_COMMANDS=1
    if (process.env.REDIS_LOG_COMMANDS === '1') {
      try {
        const origSend = redisClient.sendCommand.bind(redisClient);
        redisClient.sendCommand = function (command) {
          try {
            const name = command && (command.name || command.name?.toString()) || 'unknown';
            const args = command && (command.args || command.arguments) || [];
            // Keep logs compact
            console.log('[ioredis]', name, args.length ? JSON.stringify(args) : '[]');
          } catch (err) {
            // ignore logging errors
          }
          return origSend(command);
        };
      } catch (e) {
        // best-effort logging; ignore failures
      }
    }
  }

  return redisClient;
}

module.exports = { createRedisConnection };
