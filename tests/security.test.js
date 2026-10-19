import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { isValidAvatar, saveProfile } = await import('../api/auth.js');
const {
  clientIp,
  mergeVary,
  isAllowedOrigin,
  isInsecureProductionSecret
} = await import('../api/middleware.js');

test('isValidAvatar rechaza HTML y acepta emoji/https', () => {
  assert.equal(isValidAvatar('<img src=x onerror=alert(1)>'), false);
  assert.equal(isValidAvatar('⚽'), true);
  assert.equal(isValidAvatar('https://example.com/a.png'), true);
});

test('isValidAvatar rechaza metacaracteres HTML incluso en URLs https', () => {
  assert.equal(isValidAvatar('https://x/"><img/src=x/onerror=alert(1)>'), false);
});

test('saveProfile rechaza avatares inválidos antes de tocar la BD', async () => {
  const result = await saveProfile('usuario', {
    avatar: 'https://x/"><img/src=x/onerror=alert(1)>'
  });
  assert.deepEqual(result, { ok: false, error: 'Avatar inválido' });
});

test('isValidAvatar rechaza valores no válidos', () => {
  assert.equal(isValidAvatar(null), false);
  assert.equal(isValidAvatar(undefined), false);
  assert.equal(isValidAvatar(123), false);
  assert.equal(isValidAvatar(''), false);
  assert.equal(isValidAvatar('   '), false);
  assert.equal(isValidAvatar('a'.repeat(201)), false);
  assert.equal(isValidAvatar('" onerror="alert(1)'), false);
});

test('clientIp ignora XFF sin TRUST_PROXY', () => {
  const previous = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  try {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.5' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    assert.equal(clientIp(req), '10.0.0.1');
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
});

test('clientIp usa la primera IP de XFF con TRUST_PROXY=1', () => {
  const previous = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  try {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    assert.equal(clientIp(req), '203.0.113.5');
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
});

test('clientIp rechaza XFF no sanitizada y usa el socket', () => {
  const previous = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  try {
    const req = {
      headers: { 'x-forwarded-for': '<script>alert(1)</script>' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    assert.equal(clientIp(req), '10.0.0.1');
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  }
});

test('clientIp devuelve unknown si no hay socket', () => {
  assert.equal(clientIp({ headers: {} }), 'unknown');
});

test('mergeVary conserva Origin y añade Authorization sin duplicar', () => {
  const headers = new Map();
  const res = {
    getHeader: name => headers.get(name),
    setHeader: (name, value) => headers.set(name, value)
  };

  mergeVary(res, 'Origin');
  mergeVary(res, 'Authorization');
  mergeVary(res, 'origin');

  assert.equal(res.getHeader('Vary'), 'Origin, Authorization');
});

test('isAllowedOrigin solo acepta localhost exacto y orígenes explícitos', () => {
  assert.equal(isAllowedOrigin('http://localhost.evil.com'), false);
  assert.equal(isAllowedOrigin('http://localhost:8080'), true);
  assert.equal(isAllowedOrigin('https://porra-spa.vercel.app'), true);
});

test('isInsecureProductionSecret detecta produccion insegura', () => {
  const placeholder = 'porra-ucl-champions-2026-secret-key-change-in-production';

  assert.equal(isInsecureProductionSecret('production', undefined), true);
  assert.equal(isInsecureProductionSecret('production', ''), true);
  assert.equal(isInsecureProductionSecret('production', placeholder), true);
  assert.equal(isInsecureProductionSecret('production', 'secreto-seguro'), false);
  assert.equal(isInsecureProductionSecret('development', undefined), false);
});
