import { github } from '@/lib/config';

const SCRIPT_URL = `${github.rawUrl}/scripts/install.sh`;

export async function GET() {
  const res = await fetch(SCRIPT_URL);

  if (!res.ok) {
    return new Response('Script not found', { status: 502 });
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}
