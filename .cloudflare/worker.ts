/**
 * Schema CDN Proxy Worker
 * Proxies schema.brika.dev → npm CDN (unpkg/jsdelivr)
 */

interface Env {
  NPM_PACKAGE: string;
  SCHEMAS_PATH: string;
  CDN_PROVIDER: 'unpkg' | 'jsdelivr';
  CACHE_MAX_AGE: number;
}

const CDN_URLS = {
  unpkg: (pkg: string, version: string, path: string) => 
    `https://unpkg.com/${pkg}${version}${path}`,
  jsdelivr: (pkg: string, version: string, path: string) => 
    `https://cdn.jsdelivr.net/npm/${pkg}${version}${path}`,
} as const;

function parseVersion(pathname: string) {
  // Remove /latest/ prefix for backward compatibility
  const path = pathname.replace(/^\/latest\//, '/');
  
  // Match version pattern: /0.1.0/file.json
  const match = path.match(/^\/(\d+\.\d+\.\d+[^/]*)\//);
  
  return match 
    ? { version: `@${match[1]}`, path: path.replace(/^\/[^/]+/, '') }
    : { version: '', path };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
      });
    }
    
    // Only GET allowed
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }
    
    // Redirect /latest to root
    if (url.pathname === '/latest') {
      return Response.redirect(`${url.origin}/`, 302);
    }
    
    // Parse version and path
    const { version, path } = parseVersion(url.pathname);
    
    // Build CDN URL
    const buildUrl = CDN_URLS[env.CDN_PROVIDER];
    if (!buildUrl) {
      return jsonResponse({ 
        error: 'Invalid CDN_PROVIDER',
        valid: Object.keys(CDN_URLS),
      }, 500);
    }
    
    const cdnUrl = buildUrl(env.NPM_PACKAGE, version, env.SCHEMAS_PATH + path);
    
    try {
      const response = await fetch(cdnUrl);
      
      if (!response.ok) {
        return jsonResponse({
          error: 'Schema not found',
          package: env.NPM_PACKAGE,
          version: version || 'latest',
          path,
        }, 404);
      }
      
      // Add CORS and caching
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', `public, max-age=${env.CACHE_MAX_AGE}`);
      headers.set('X-Served-By', `Cloudflare + ${env.CDN_PROVIDER}`);
      
      return new Response(response.body, { headers });
      
    } catch (error) {
      return jsonResponse({
        error: 'CDN fetch failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 502);
    }
  },
};
