const test = require('node:test');
const assert = require('node:assert/strict');

const gateway = require('../../minko-netlify-proxy/netlify/functions/desktop-release');

function event(ip) {
  return {
    httpMethod: 'GET',
    headers: {
      host: 're-minko-anime.com',
      'x-forwarded-proto': 'https',
      'x-nf-client-connection-ip': ip,
      'x-forwarded-for': '198.51.100.9'
    },
    queryStringParameters: { action: 'access' }
  };
}

test('desktop gate trusts Netlify connection IP and denies by default', async () => {
  const previous = process.env.REMINKO_ALLOWED_IPS;
  delete process.env.REMINKO_ALLOWED_IPS;
  try {
    assert.deepEqual(gateway._test.accessFor(event('46.124.132.38')), {
      allowed: false,
      currentIp: '46.124.132.38'
    });
    assert.deepEqual(gateway._test.accessFor(event('203.0.113.77')), {
      allowed: true,
      currentIp: '203.0.113.77'
    });
  } finally {
    if (previous === undefined) delete process.env.REMINKO_ALLOWED_IPS;
    else process.env.REMINKO_ALLOWED_IPS = previous;
  }
});

test('desktop gate parses environment allowlist', () => {
  const previous = process.env.REMINKO_ALLOWED_IPS;
  process.env.REMINKO_ALLOWED_IPS = '46.124.132.38, 192.0.2.10';
  try {
    assert.equal(gateway._test.accessFor(event('46.124.132.38')).allowed, true);
    assert.equal(gateway._test.accessFor(event('203.0.113.77')).allowed, false);
  } finally {
    if (previous === undefined) delete process.env.REMINKO_ALLOWED_IPS;
    else process.env.REMINKO_ALLOWED_IPS = previous;
  }
});

test('desktop gate rejects malformed connection IP', () => {
  const previous = process.env.REMINKO_ALLOWED_IPS;
  process.env.REMINKO_ALLOWED_IPS = 'not-an-ip';
  try {
    assert.equal(gateway._test.accessFor(event('not-an-ip')).allowed, false);
  } finally {
    if (previous === undefined) delete process.env.REMINKO_ALLOWED_IPS;
    else process.env.REMINKO_ALLOWED_IPS = previous;
  }
});

test('release metadata exposes only approved desktop assets', () => {
  const result = gateway._test.publicRelease({
    tag_name: 'v1.0.65',
    published_at: '2026-09-15T00:00:00Z',
    assets: [
      { name: 'app.7z' },
      { name: 'update.zip' },
      { name: 'update.zip.sha256' },
      { name: 'Re-Minko-Installer-1.0.66.exe' },
      { name: 'Re-Minko-Installer-1.0.66.exe.sha256' },
      { name: 'source.zip' },
      { name: 'secret.txt' }
    ]
  }, event('203.0.113.77'));

  assert.equal(result.version, '1.0.65');
  assert.deepEqual(Object.keys(result.assets).sort(), [
    'Re-Minko-Installer-1.0.66.exe',
    'app.7z',
    'update.zip',
    'update.zip.sha256'
  ]);
});
