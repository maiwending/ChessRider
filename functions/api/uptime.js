const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

async function probe(label, url, method = 'HEAD') {
  const t = Date.now();
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(6000) });
    const latencyMs = Date.now() - t;
    if (res.status >= 500) return { label, status: 'down', httpStatus: res.status, latencyMs };
    if (res.status >= 400) return { label, status: 'degraded', httpStatus: res.status, latencyMs };
    return { label, status: 'ok', httpStatus: res.status, latencyMs };
  } catch (e) {
    return { label, status: 'down', latencyMs: Date.now() - t, error: String(e.message).slice(0, 100) };
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  const services = await Promise.all([
    probe('Main Site',    origin),
    probe('Move API',     `${origin}/api/move`,     'OPTIONS'),
    probe('Text AI API',  `${origin}/api/text-ai`,  'OPTIONS'),
    probe('Firebase Auth','https://identitytoolkit.googleapis.com/'),
    probe('Firestore',    'https://firestore.googleapis.com/'),
  ]);

  const overall =
    services.every((s) => s.status === 'ok')   ? 'ok' :
    services.some((s)  => s.status === 'down')  ? 'down' : 'degraded';

  return new Response(
    JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), overall, services }),
    { status: 200, headers: HEADERS },
  );
}
