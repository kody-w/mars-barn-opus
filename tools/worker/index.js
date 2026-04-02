/**
 * vOS CORS Proxy — Cloudflare Worker
 * 
 * Deploy: cd tools/worker && npx wrangler deploy
 * Or: paste index.js into Cloudflare Dashboard → Workers → Create
 * 
 * Usage: https://your-worker.workers.dev/?url=https://google.com
 * 
 * Free tier: 100,000 requests/day. No credit card needed.
 * Runs on Cloudflare's edge (300+ cities worldwide).
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!target) {
      return new Response('vOS CORS Proxy. Usage: ?url=https://example.com', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    try {
      const response = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; vOS Browser/1.0)',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'follow',
      });

      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': response.headers.get('Content-Type') || 'text/html',
        }
      });
    } catch (e) {
      return new Response('Proxy error: ' + e.message, {
        status: 502, headers: corsHeaders
      });
    }
  }
};
