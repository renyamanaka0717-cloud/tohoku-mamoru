export const runtime = 'edge';

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return Response.json({error:'missing url'},{status:400});

  let fetchUrl = url.replace(/^webcal:\/\//i, 'https://');
  try { new URL(fetchUrl); } catch { return Response.json({error:'invalid url'},{status:400}); }

  // Block private IP ranges (SSRF protection)
  const hostname = new URL(fetchUrl).hostname;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$|::1$)/.test(hostname)) {
    return Response.json({error:'url not allowed'},{status:403});
  }

  try {
    const res = await fetch(fetchUrl, {
      headers: {'User-Agent':'Mozilla/5.0 (compatible; tohoku-mamoru-calendar/1.0)'},
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return Response.json({error:`upstream ${res.status}`},{status:502});
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) return Response.json({error:'not an ics file'},{status:422});
    return new Response(text, {headers:{'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'no-store'}});
  } catch (e) {
    return Response.json({error:'fetch failed'},{status:502});
  }
}
