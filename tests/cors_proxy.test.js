const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  createProxyServer,
  isPrivateAddress,
  validateTarget,
} = require('../tools/cors-proxy');

function proxyRequest(server, target, origin) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port: address.port,
      path: `/?url=${encodeURIComponent(target)}`,
      headers: origin ? { Origin: origin } : {},
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        cors: response.headers['access-control-allow-origin'],
        body: Buffer.concat(chunks).toString(),
      }));
    });
    request.on('error', reject);
  });
}

test('rejects private and local address ranges', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});

test('requires HTTPS and rejects literal local targets', async () => {
  await assert.rejects(
    validateTarget('http://example.com/'),
    /Only public HTTPS/,
  );
  await assert.rejects(
    validateTarget('https://127.0.0.1/'),
    /Private or local/,
  );
  await assert.rejects(
    validateTarget('https://[::1]/'),
    /Private or local/,
  );
});

test('denies unapproved origins and private targets without wildcard CORS', async () => {
  const server = createProxyServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const unauthorized = await proxyRequest(
      server,
      'https://example.com/',
      'https://attacker.invalid',
    );
    assert.equal(unauthorized.status, 403);
    assert.equal(unauthorized.cors, undefined);

    const privateTarget = await proxyRequest(
      server,
      'https://127.0.0.1/',
      'http://localhost:8787',
    );
    assert.equal(privateTarget.status, 403);
    assert.equal(privateTarget.cors, 'http://localhost:8787');
    assert.match(privateTarget.body, /Private or local/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
