#!/usr/bin/env node
/**
 * Loopback-only CORS proxy for the local vOS browser.
 *
 * Only approved local origins may request public HTTPS destinations. DNS
 * results are pinned per request and every redirect is revalidated.
 */
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

const HOST = '127.0.0.1';
const PORT = Number(process.env.VOS_PROXY_PORT || 8789);
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_ORIGINS = new Set(
  (process.env.VOS_PROXY_ORIGINS ||
    'http://localhost:8787,http://127.0.0.1:8787')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

function isPrivateAddress(address) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice(7));
  }

  if (net.isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (net.isIP(normalized) === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized)
    );
  }

  return true;
}

async function validateTarget(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new Error('Invalid target URL');
  }
  if (target.protocol !== 'https:') {
    throw new Error('Only public HTTPS targets are allowed');
  }
  if (target.username || target.password) {
    throw new Error('Target credentials are not allowed');
  }

  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('Private or local target addresses are forbidden');
  }
  return { target, addresses, hostname };
}

async function fetchTarget(rawTarget, redirects = 0) {
  if (redirects > MAX_REDIRECTS) {
    throw new Error('Too many redirects');
  }
  const { target, addresses, hostname } = await validateTarget(rawTarget);
  const firstAddress = addresses[0];

  return new Promise((resolve, reject) => {
    const options = {
      protocol: 'https:',
      hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      headers: {
        Host: target.host,
        'User-Agent': 'Mozilla/5.0 (vOS Browser)',
      },
      lookup(hostname, lookupOptions, callback) {
        if (lookupOptions?.all) {
          callback(null, addresses);
        } else {
          callback(null, firstAddress.address, firstAddress.family);
        }
      },
    };
    if (!net.isIP(hostname)) options.servername = hostname;

    const request = https.get(options, response => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        const redirect = new URL(response.headers.location, target).href;
        fetchTarget(redirect, redirects + 1).then(resolve, reject);
        return;
      }

      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          request.destroy(new Error('Response exceeds 2 MB limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode || 502,
        contentType: response.headers['content-type'] || 'text/plain',
        body: Buffer.concat(chunks),
      }));
    });
    request.setTimeout(10000, () => request.destroy(new Error('Upstream timeout')));
    request.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Origin not allowed');
    return;
  }

  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET',
      Vary: 'Origin',
    });
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  const target = requestUrl.searchParams.get('url');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url query parameter');
    return;
  }

  try {
    const response = await fetchTarget(target);
    res.writeHead(response.statusCode, {
      'Access-Control-Allow-Origin': origin,
      'Content-Type': response.contentType,
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(response.body);
  } catch (error) {
    res.writeHead(403, {
      'Access-Control-Allow-Origin': origin,
      'Content-Type': 'text/plain',
      Vary: 'Origin',
    });
    res.end(error.message);
  }
}

function createProxyServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Proxy failure');
    });
  });
}

if (require.main === module) {
  createProxyServer().listen(PORT, HOST, () => {
    console.log(`vOS CORS Proxy running on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  createProxyServer,
  fetchTarget,
  isPrivateAddress,
  validateTarget,
};
