const axios = require('axios');
const { getLanguageId } = require('../config/languages');

const PENDING_STATUS_IDS = new Set([1, 2]);

function getJudge0BaseUrl() {
  if (!process.env.JUDGE0_URL) {
    throw new Error('JUDGE0_URL is required for the judge worker.');
  }
  return process.env.JUDGE0_URL.replace(/\/+$/, '');
}

function getPollIntervalMs() {
  return Number(process.env.JUDGE0_POLL_INTERVAL_MS || 1000);
}

function getPollTimeoutMs() {
  return Number(process.env.JUDGE0_POLL_TIMEOUT_MS || 30000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSeconds(milliseconds) {
  return Math.max(milliseconds / 1000, 0.001);
}

function toMilliseconds(secondsValue) {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds)) return null;
  return Math.round(seconds * 1000);
}

function normalizeJudge0Result(result) {
  return {
    token: result.token,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    compile_output: result.compile_output || '',
    message: result.message || '',
    status: result.status,
    time_used_ms: toMilliseconds(result.time),
    memory_used_kb: Number.isFinite(Number(result.memory)) ? Number(result.memory) : null,
  };
}

async function createJudge0Submission({ language, sourceCode, stdin, timeLimitMs, memoryLimitKb }) {
  const languageId = getLanguageId(language);
  if (!languageId) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const res = await axios.post(
    `${getJudge0BaseUrl()}/submissions`,
    {
      language_id: languageId,
      source_code: sourceCode,
      stdin,
      cpu_time_limit: toSeconds(timeLimitMs),
      wall_time_limit: Math.max(toSeconds(timeLimitMs) * 2, 1),
      memory_limit: memoryLimitKb,
    },
    {
      params: {
        base64_encoded: 'false',
        wait: 'false',
      },
      timeout: 10000,
    }
  );

  if (!res.data?.token) {
    throw new Error('Judge0 did not return a submission token.');
  }

  return res.data.token;
}

async function fetchJudge0Submission(token) {
  const res = await axios.get(`${getJudge0BaseUrl()}/submissions/${token}`, {
    params: {
      base64_encoded: 'false',
      fields: 'token,stdout,stderr,compile_output,message,status,time,memory',
    },
    timeout: 10000,
  });

  return normalizeJudge0Result(res.data);
}

async function runJudge0Submission(options) {
  const token = await createJudge0Submission(options);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= getPollTimeoutMs()) {
    const result = await fetchJudge0Submission(token);
    if (!PENDING_STATUS_IDS.has(result.status?.id)) {
      return result;
    }
    await sleep(getPollIntervalMs());
  }

  throw new Error(`Judge0 submission ${token} did not finish before poll timeout.`);
}

module.exports = { runJudge0Submission };
