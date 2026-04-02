#!/usr/bin/env node
/**
 * CORS Proxy — Fetches any URL and returns the HTML.
 * The vOS headless browser engine uses this to bypass X-Frame-Options and CORS.
 * 
 * Usage: node tools/cors-proxy.js
 * Runs on port 8789. Fetch any URL: http://localhost:8789/?url=https://google.com
 */
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8789;

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const target = parsed.query.url;

  if (!target) {
    res.writeHead(200, {'Content-Type':'text/plain','Access-Control-Allow-Origin':'*'});
    res.end('vOS CORS Proxy. Usage: ?url=https://example.com');
    return;
  }

  // Allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const lib = target.startsWith('https') ? https : http;
  lib.get(target, {headers: {'User-Agent': 'Mozilla/5.0 (vOS Browser)'}}, (proxyRes) => {
    // Follow redirects
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      const redirect = proxyRes.headers.location.startsWith('http') 
        ? proxyRes.headers.location 
        : new URL(proxyRes.headers.location, target).href;
      lib.get(redirect, {headers: {'User-Agent': 'Mozilla/5.0 (vOS Browser)'}}, (rRes) => {
        let body = '';
        rRes.on('data', c => body += c);
        rRes.on('end', () => {
          res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
          res.end(body);
        });
      }).on('error', e => { res.writeHead(500); res.end(e.message); });
      return;
    }
    let body = '';
    proxyRes.on('data', c => body += c);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, {'Content-Type': proxyRes.headers['content-type'] || 'text/html', 'Access-Control-Allow-Origin': '*'});
      res.end(body);
    });
  }).on('error', e => {
    res.writeHead(500, {'Access-Control-Allow-Origin': '*'});
    res.end('Proxy error: ' + e.message);
  });
}).listen(PORT, () => console.log(`🌐 vOS CORS Proxy running on http://localhost:${PORT}`));
