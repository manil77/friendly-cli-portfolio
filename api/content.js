// Public, cached site content for the CLI and modern pages.
import { json } from '../lib/http.js';
import { getContent, DEFAULT_CONTENT } from '../lib/content.js';

export async function GET() {
  try {
    return json(await getContent(), 200, { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' });
  } catch (e) {
    console.error('content fallback', e.message);
    return json(DEFAULT_CONTENT, 200, { 'cache-control': 'public, max-age=0, s-maxage=10' });
  }
}
