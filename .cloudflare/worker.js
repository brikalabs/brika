const NPM_PACKAGE = '@brika/schema';
const SCHEMAS_PATH = '/dist';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    
    // Handle /latest redirect to main branch (for backward compatibility)
    if (path.startsWith('/latest/')) {
      path = path.replace('/latest/', '/');
    } else if (path === '/latest') {
      return Response.redirect(`${url.origin}/`, 302);
    }
    
    // Parse version from path (e.g., /0.1.0/plugin.schema.json)
    const versionMatch = path.match(/^\/(\d+\.\d+\.\d+)\//);
    let version, filePath;
    
    if (versionMatch) {
      // Versioned request: /0.1.0/plugin.schema.json
      version = `@${versionMatch[1]}`;
      filePath = path.replace(/^\/\d+\.\d+\.\d+/, '');
    } else {
      // No version specified: /plugin.schema.json -> use latest
      version = ''; // unpkg/jsdelivr serve latest by default
      filePath = path;
    }
    
    // Build unpkg URL (serves from npm)
    // Alternative: cdn.jsdelivr.net/npm/@brika/schema@version/dist/plugin.schema.json
    const npmUrl = `https://unpkg.com/${NPM_PACKAGE}${version}${SCHEMAS_PATH}${filePath}`;
    
    // Fetch from unpkg (npm CDN)
    const response = await fetch(npmUrl);
    
    // Return 404 if not found
    if (!response.ok) {
      return new Response('Schema not found', { status: 404 });
    }
    
    // Clone response to add custom headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Cache-Control', 'public, max-age=3600');
    newResponse.headers.set('X-Served-By', 'Cloudflare + unpkg (npm)');
    
    return newResponse;
  }
}

