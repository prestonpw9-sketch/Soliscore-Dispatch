/**
 * Local checks for Twilio secret cleaning / truncated-token detection.
 * Does not call Twilio or page crew.
 */
import assert from 'node:assert/strict';

function cleanTwilioSecret(raw) {
  if (!raw) return '';
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
}

function tokenLooksTruncated(authToken) {
  return authToken.length > 0 && authToken.length < 20;
}

assert.equal(cleanTwilioSecret('  abc\n'), 'abc');
assert.equal(cleanTwilioSecret('"quoted-token"'), 'quoted-token');
assert.equal(cleanTwilioSecret("\uFEFF'wrapped'\r\n"), 'wrapped');
assert.equal(tokenLooksTruncated('abcdefghij'), true); // 10 chars — production secret length
assert.equal(tokenLooksTruncated('a'.repeat(32)), false);

console.log('twilio-auth-checks: ok');
