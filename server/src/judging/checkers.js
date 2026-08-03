function tokenize(output) {
  const trimmed = String(output ?? '').trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
}

function tokenDiff(userOutput, expectedOutput) {
  const userTokens = tokenize(userOutput);
  const expectedTokens = tokenize(expectedOutput);

  if (userTokens.length !== expectedTokens.length) return false;
  return expectedTokens.every((expectedToken, index) => userTokens[index] === expectedToken);
}

function getFloatEpsilon() {
  const raw = process.env.FLOAT_EPSILON;
  if (!raw) {
    throw new Error('FLOAT_EPSILON is required for float checker problems.');
  }

  const epsilon = Number(raw);
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    throw new Error('FLOAT_EPSILON must be a non-negative number.');
  }

  return epsilon;
}

function floatDiff(userOutput, expectedOutput) {
  const epsilon = getFloatEpsilon();
  const userTokens = tokenize(userOutput);
  const expectedTokens = tokenize(expectedOutput);

  if (userTokens.length !== expectedTokens.length) return false;

  return expectedTokens.every((expectedToken, index) => {
    const expectedNumber = Number(expectedToken);
    const userNumber = Number(userTokens[index]);

    if (!Number.isFinite(expectedNumber) || !Number.isFinite(userNumber)) {
      return userTokens[index] === expectedToken;
    }

    return Math.abs(userNumber - expectedNumber) <= epsilon;
  });
}

function runChecker(checkerType, userOutput, expectedOutput) {
  if (checkerType === 'token') return tokenDiff(userOutput, expectedOutput);
  if (checkerType === 'float') return floatDiff(userOutput, expectedOutput);
  if (checkerType === 'custom') {
    throw new Error('Custom checkers are deferred until milestone 8.');
  }
  throw new Error(`Unsupported checker type: ${checkerType}`);
}

module.exports = {
  runChecker,
  tokenDiff,
  floatDiff,
};
