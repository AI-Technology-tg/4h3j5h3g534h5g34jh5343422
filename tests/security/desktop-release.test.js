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

test('desktop gate never grants access by IP', () => {
  const previous = process.env.REMINKO_ALLOWED_IPS;
  process.env.REMINKO_ALLOWED_IPS = '46.124.132.38,203.0.113.77';
  try {
    assert.deepEqual(gateway._test.accessFor(event('46.124.132.38')), {
      allowed: false,
      currentIp: '46.124.132.38'
    });
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

test('device headers are parsed without trusting forwarded IP', () => {
  const evt = {
    headers: {
      authorization: 'Bearer abc.def',
      'x-re-minko-device': 'A'.repeat(64).toLowerCase(),
      'x-forwarded-for': '198.51.100.9'
    }
  };
  assert.equal(gateway._test.bearerToken(evt), 'abc.def');
  assert.equal(gateway._test.deviceIdFrom(evt), 'a'.repeat(64));
  assert.equal(gateway._test.DEVICE_ID.test(gateway._test.deviceIdFrom(evt)), true);
});

test('staff roles map creator to full permissions and ignore unknown values', () => {
  assert.equal(gateway._test.parseRole('creator'), 'creator');
  assert.equal(gateway._test.parseRole('HEAD_ADMIN'), 'head_admin');
  assert.equal(gateway._test.parseRole('nope'), 'tester_pr');
  assert.deepEqual(gateway._test.permissionsFor('creator'), [
    'creator_panel',
    'manage_staff',
    'manage_content',
    'moderate',
    'promote',
    'full_access'
  ]);
  assert.ok(!gateway._test.permissionsFor('admin').includes('creator_panel'));
});
