const crypto = require('crypto');

/**
 * Constant-time string comparison for secrets.
 * @param {unknown} provided - value received from the request
 * @param {string} expected - configured secret
 * @returns {boolean}
 */
function secureCompare(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }

  // Hash both sides so lengths match and length is not leaked
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();

  return crypto.timingSafeEqual(providedHash, expectedHash);
}

module.exports = {
  secureCompare,
};
