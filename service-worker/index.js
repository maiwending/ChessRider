/**
 * KnightAuraChess — Service Status & Deploy Worker
 * Deployed to: service.knightaurachess.com
 *
 * Routes:
 *   GET  /                    → HTML dashboard (Status + Deploy tabs)
 *   GET  /api/status          → JSON service health
 *   GET  /api/deploy/history  → JSON list of CF Pages deployments
 *   POST /api/deploy/start    → Upload dist/ folder → deploy to CF Pages
 *   POST /api/deploy/rollback → Roll back to a previous deployment
 *   POST /api/deploy/trigger  → Fire a Pages deploy hook
 *   OPTIONS *                 → CORS preflight
 *
 * All /api/* routes require a valid Firebase ID token for "Mega_penguin123".
 *
 * Required secrets (wrangler secret put):
 *   FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY
 *   FIREBASE_AUTH_DOMAIN, FIREBASE_APP_ID
 *   FIREBASE_MESSAGING_SENDER_ID, FIREBASE_STORAGE_BUCKET
 *   FIREBASE_SERVICE_ACCOUNT_EMAIL, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
 *   CF_API_TOKEN        (Cloudflare API token — Pages:Edit + Account:Read)
 *   CF_ACCOUNT_ID       (Cloudflare account ID)
 *   CF_PAGES_PROJECT    (Pages project name, default "knightaurachess")
 *   CF_DEPLOY_HOOK      (optional — Pages deploy hook URL for git-triggered deploys)
 */

const ADMIN_USERNAME = 'Mega_penguin123';
const MAIN_SITE = 'https://knightaurachess.com';
const CF_API = 'https://api.cloudflare.com/client/v4';
const OAUTH_SAFETY_WINDOW_MS = 60_000;
const AUTH_CACHE_MAX_MS = 15 * 60_000;
const TOKEN_CLOCK_SKEW_SEC = 30;

const oauthTokenCache = { accessToken: null, expiresAt: 0, inFlight: null };
const idTokenCache = new Map();

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ({
    html: 'text/html', css: 'text/css', js: 'application/javascript',
    mjs: 'application/javascript', cjs: 'application/javascript',
    json: 'application/json', map: 'application/json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
    webp: 'image/webp', avif: 'image/avif',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
    txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json',
  })[ext] || 'application/octet-stream';
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function sha256Hex(buf) {
  const hashBytes = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Firebase ID token verification
// ---------------------------------------------------------------------------

function decodeJwtPayload(token) {
  const [, payload] = token.split('.');
  if (!payload) return null;
  const norm = payload.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return JSON.parse(atob(norm + '==='.slice((norm.length + 3) % 4)));
  } catch {
    return null;
  }
}

async function verifyFirebaseIdToken(idToken, env) {
  const claims = decodeJwtPayload(idToken);
  const nowSec = Math.floor(Date.now() / 1000);
  if (claims?.exp && nowSec > Number(claims.exp) + TOKEN_CLOCK_SKEW_SEC) {
    throw Object.assign(new Error('Token expired'), { code: 'TOKEN_EXPIRED' });
  }
  const cached = idTokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) return cached.uid;

  const apiKey = env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY not configured');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) },
  );
  const data = await res.json();
  if (!res.ok || !data?.users?.[0]?.localId) {
    throw Object.assign(new Error('Invalid token'), { code: 'INVALID_TOKEN' });
  }
  const uid = data.users[0].localId;
  const jwtExpMs = claims?.exp ? Number(claims.exp) * 1000 : Date.now() + AUTH_CACHE_MAX_MS;
  idTokenCache.set(idToken, { uid, expiresAt: Math.min(jwtExpMs, Date.now() + AUTH_CACHE_MAX_MS) });
  return uid;
}

// ---------------------------------------------------------------------------
// Google service-account OAuth2 (for Firestore reads)
// ---------------------------------------------------------------------------

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwtRS256(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function getGoogleAccessToken(env) {
  const now = Date.now();
  if (oauthTokenCache.accessToken && oauthTokenCache.expiresAt - OAUTH_SAFETY_WINDOW_MS > now) {
    return oauthTokenCache.accessToken;
  }
  if (oauthTokenCache.inFlight) return oauthTokenCache.inFlight;
  oauthTokenCache.inFlight = (async () => {
    const { FIREBASE_SERVICE_ACCOUNT_EMAIL: email, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: rawKey } = env;
    if (!email || !rawKey) throw new Error('Service account credentials not configured');
    const nowSec = Math.floor(Date.now() / 1000);
    const assertion = await signJwtRS256(
      { iss: email, sub: email, aud: 'https://oauth2.googleapis.com/token', iat: nowSec, exp: nowSec + 3600, scope: 'https://www.googleapis.com/auth/datastore' },
      rawKey.replace(/\\n/g, '\n'),
    );
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error('Failed to obtain Google access token');
    oauthTokenCache.accessToken = data.access_token;
    oauthTokenCache.expiresAt = now + (Number.isFinite(data.expires_in) ? data.expires_in : 3600) * 1000;
    return oauthTokenCache.accessToken;
  })();
  try { return await oauthTokenCache.inFlight; } finally { oauthTokenCache.inFlight = null; }
}

async function getFirestoreDisplayName(uid, env) {
  const accessToken = await getGoogleAccessToken(env);
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const doc = await res.json();
  return doc?.fields?.displayName?.stringValue || null;
}

// ---------------------------------------------------------------------------
// Auth guard — call at the top of every protected handler
// ---------------------------------------------------------------------------

async function requireAdmin(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!idToken) throw Object.assign(new Error('Missing bearer token'), { status: 401 });

  let uid;
  try {
    uid = await verifyFirebaseIdToken(idToken, env);
  } catch (e) {
    throw Object.assign(e, { status: 401 });
  }

  const displayName = await getFirestoreDisplayName(uid, env);
  if (displayName !== ADMIN_USERNAME) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  return uid;
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

async function probe(label, url, method = 'HEAD') {
  const t = Date.now();
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(6000) });
    const latencyMs = Date.now() - t;
    if (res.status >= 500) return { label, status: 'down', httpStatus: res.status, latencyMs };
    if (res.status >= 400) return { label, status: 'degraded', httpStatus: res.status, latencyMs };
    return { label, status: 'ok', httpStatus: res.status, latencyMs };
  } catch (e) {
    return { label, status: 'down', latencyMs: Date.now() - t, error: String(e.message).slice(0, 120) };
  }
}

async function runChecks() {
  return Promise.all([
    probe('Main Site', MAIN_SITE),
    probe('Move API', `${MAIN_SITE}/api/move`, 'OPTIONS'),
    probe('Text AI API', `${MAIN_SITE}/api/text-ai`, 'OPTIONS'),
    probe('Firebase Auth', 'https://identitytoolkit.googleapis.com/'),
    probe('Firestore', 'https://firestore.googleapis.com/'),
  ]);
}

// ---------------------------------------------------------------------------
// Cloudflare Pages API helpers
// ---------------------------------------------------------------------------

function cfHeaders(env) {
  return { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' };
}

function pagesProject(env) {
  return env.CF_PAGES_PROJECT || 'knightaurachess';
}

async function cfRequest(method, path, env, body = undefined) {
  const res = await fetch(`${CF_API}${path}`, {
    method,
    headers: cfHeaders(env),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { res, data: await res.json() };
}

async function getDeploymentHistory(env) {
  const { res, data } = await cfRequest(
    'GET',
    `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${pagesProject(env)}/deployments?per_page=20`,
    env,
  );
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || 'Failed to fetch deployment history');
  return (data.result || []).map((d) => ({
    id: d.id,
    shortId: d.id?.slice(0, 8) || '?',
    createdOn: d.created_on,
    source: d.deployment_trigger?.type || 'unknown',
    commitMessage: d.deployment_trigger?.metadata?.commit_message || null,
    commitHash: d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) || null,
    stage: d.latest_stage?.name || 'unknown',
    status: d.latest_stage?.status || 'unknown',
    url: d.url || null,
    aliases: d.aliases || [],
  }));
}

async function rollbackDeployment(deploymentId, env) {
  const { res, data } = await cfRequest(
    'POST',
    `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${pagesProject(env)}/deployments/${deploymentId}/rollback`,
    env,
    {},
  );
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || 'Rollback failed');
  return data.result;
}

async function triggerDeployHook(env) {
  const hook = env.CF_DEPLOY_HOOK;
  if (!hook) throw new Error('CF_DEPLOY_HOOK is not configured');
  const res = await fetch(hook, { method: 'POST' });
  if (!res.ok) throw new Error(`Deploy hook returned ${res.status}`);
  return { triggered: true };
}

// Deploy a set of files to Cloudflare Pages via the Direct Upload API.
// `files` is an array of { path: '/index.html', buf: ArrayBuffer, mime: string }.
async function deployToPages(files, env) {
  const project = pagesProject(env);
  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_API_TOKEN;
  if (!accountId || !apiToken) throw new Error('CF_ACCOUNT_ID or CF_API_TOKEN not configured');

  // 1. Get upload JWT
  const tokenRes = await fetch(`${CF_API}/accounts/${accountId}/pages/projects/${project}/upload-token`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}` },
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.result?.jwt) {
    throw new Error(tokenData?.errors?.[0]?.message || 'Failed to get Pages upload token');
  }
  const uploadJwt = tokenData.result.jwt;

  // 2. Compute SHA-256 hashes and build manifest
  const manifest = {};
  const fileMap = new Map(); // hash → { buf, mime }
  for (const { path, buf, mime } of files) {
    const hash = await sha256Hex(buf);
    manifest[path] = hash;
    fileMap.set(hash, { buf, mime });
  }

  // 3. Check which hashes need uploading
  const checkRes = await fetch(`${CF_API}/pages/assets/check-missing`, {
    method: 'POST',
    headers: { authorization: `Bearer ${uploadJwt}`, 'content-type': 'application/json' },
    body: JSON.stringify({ hashes: [...new Set(Object.values(manifest))] }),
  });
  const checkData = await checkRes.json();
  if (!checkRes.ok) throw new Error(checkData?.errors?.[0]?.message || 'check-missing failed');
  const missingHashes = new Set(checkData.result || []);

  // 4. Upload missing files in batches of 50
  const toUpload = [...fileMap.entries()].filter(([hash]) => missingHashes.has(hash));
  for (let i = 0; i < toUpload.length; i += 50) {
    const batch = toUpload.slice(i, i + 50).map(([key, { buf, mime }]) => ({
      key,
      value: arrayBufferToBase64(buf),
      metadata: { contentType: mime },
      base64: true,
    }));
    const upRes = await fetch(`${CF_API}/pages/assets/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uploadJwt}`, 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!upRes.ok) {
      const upData = await upRes.json().catch(() => ({}));
      throw new Error(upData?.errors?.[0]?.message || `Upload batch failed (HTTP ${upRes.status})`);
    }
  }

  // 5. Create deployment
  const deployRes = await fetch(
    `${CF_API}/accounts/${accountId}/pages/projects/${project}/deployments`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ manifest }),
    },
  );
  const deployData = await deployRes.json();
  if (!deployRes.ok) throw new Error(deployData?.errors?.[0]?.message || 'Deployment creation failed');

  const d = deployData.result;
  return {
    id: d.id,
    url: d.url,
    createdOn: d.created_on,
    filesUploaded: toUpload.length,
    filesTotal: files.length,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleStatus(request, env) {
  try { await requireAdmin(request, env); } catch (e) {
    return jsonResponse({ ok: false, code: e.code || 'FORBIDDEN', message: e.message }, e.status || 403);
  }
  const services = await runChecks();
  const overall = services.every((s) => s.status === 'ok') ? 'ok'
    : services.some((s) => s.status === 'down') ? 'down' : 'degraded';
  return jsonResponse({ ok: true, checkedAt: new Date().toISOString(), overall, services });
}

async function handleDeployHistory(request, env) {
  try { await requireAdmin(request, env); } catch (e) {
    return jsonResponse({ ok: false, code: e.code || 'FORBIDDEN', message: e.message }, e.status || 403);
  }
  try {
    const deployments = await getDeploymentHistory(env);
    return jsonResponse({ ok: true, deployments });
  } catch (e) {
    return jsonResponse({ ok: false, message: e.message }, 502);
  }
}

async function handleDeployStart(request, env) {
  try { await requireAdmin(request, env); } catch (e) {
    return jsonResponse({ ok: false, code: e.code || 'FORBIDDEN', message: e.message }, e.status || 403);
  }
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ ok: false, message: 'Invalid multipart form data' }, 400);
  }

  const fileBlobs = formData.getAll('files');
  let paths;
  try {
    paths = JSON.parse(formData.get('paths') || '[]');
  } catch {
    return jsonResponse({ ok: false, message: 'Invalid paths JSON' }, 400);
  }

  if (!fileBlobs.length) return jsonResponse({ ok: false, message: 'No files received' }, 400);
  if (fileBlobs.length !== paths.length) {
    return jsonResponse({ ok: false, message: 'files / paths length mismatch' }, 400);
  }

  // Strip common leading folder (e.g. "dist/") and normalise to absolute paths
  const prefix = paths[0]?.split('/').length > 1 ? paths[0].split('/')[0] + '/' : '';
  const files = [];
  for (let i = 0; i < fileBlobs.length; i++) {
    const rawPath = paths[i];
    const normalized = '/' + (prefix && rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath);
    const buf = await fileBlobs[i].arrayBuffer();
    const mime = fileBlobs[i].type || getMimeType(rawPath);
    files.push({ path: normalized, buf, mime });
  }

  try {
    const result = await deployToPages(files, env);
    return jsonResponse({ ok: true, ...result });
  } catch (e) {
    return jsonResponse({ ok: false, message: e.message }, 502);
  }
}

async function handleRollback(request, env) {
  try { await requireAdmin(request, env); } catch (e) {
    return jsonResponse({ ok: false, code: e.code || 'FORBIDDEN', message: e.message }, e.status || 403);
  }
  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ ok: false, message: 'Invalid JSON' }, 400);
  }
  if (!body?.deploymentId) return jsonResponse({ ok: false, message: 'deploymentId required' }, 400);
  try {
    const result = await rollbackDeployment(body.deploymentId, env);
    return jsonResponse({ ok: true, result });
  } catch (e) {
    return jsonResponse({ ok: false, message: e.message }, 502);
  }
}

async function handleTrigger(request, env) {
  try { await requireAdmin(request, env); } catch (e) {
    return jsonResponse({ ok: false, code: e.code || 'FORBIDDEN', message: e.message }, e.status || 403);
  }
  try {
    const result = await triggerDeployHook(env);
    return jsonResponse({ ok: true, ...result });
  } catch (e) {
    return jsonResponse({ ok: false, message: e.message }, e.message.includes('not configured') ? 501 : 502);
  }
}

// ---------------------------------------------------------------------------
// HTML dashboard
// ---------------------------------------------------------------------------

function buildHtml(env) {
  const firebaseConfig = JSON.stringify({
    apiKey: env.FIREBASE_WEB_API_KEY || '',
    authDomain: env.FIREBASE_AUTH_DOMAIN || `${env.FIREBASE_PROJECT_ID || ''}.firebaseapp.com`,
    projectId: env.FIREBASE_PROJECT_ID || '',
    storageBucket: env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.FIREBASE_APP_ID || '',
  });
  const hasDeployHook = Boolean(env.CF_DEPLOY_HOOK);

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KnightAuraChess — Operations</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d1117; --surface: #161b22; --surface2: #1c2128; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --ok: #3fb950; --degraded: #d29922;
    --down: #f85149; --accent: #58a6ff; --radius: 8px;
  }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; flex-direction: column; }

  /* ── Header ── */
  header { border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 12px; }
  .logo { font-size: 1.05rem; font-weight: 700; }
  .logo span { color: var(--accent); }
  .badge { font-size: 0.68rem; font-weight: 600; padding: 2px 8px; border-radius: 20px; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); text-transform: uppercase; letter-spacing: 0.06em; }

  /* ── Layout ── */
  main { flex: 1; max-width: 820px; width: 100%; margin: 0 auto; padding: 28px 20px; }

  /* ── Loading / sign-in / denied ── */
  #loading-panel { text-align: center; padding: 60px 0; color: var(--muted); }
  .spinner { width: 30px; height: 30px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 14px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  #signin-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 40px; text-align: center; }
  #signin-panel h2 { font-size: 1.1rem; margin-bottom: 8px; }
  #signin-panel p { color: var(--muted); font-size: .875rem; margin-bottom: 26px; }

  #denied-panel { background: var(--surface); border: 1px solid color-mix(in srgb, var(--down) 40%, var(--border)); border-radius: var(--radius); padding: 40px; text-align: center; }
  .denied-icon { font-size: 2.8rem; margin-bottom: 14px; }
  #denied-panel h2 { font-size: 1.1rem; color: var(--down); margin-bottom: 8px; }
  #denied-panel p { color: var(--muted); font-size: .875rem; margin-bottom: 22px; }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: var(--radius); font-size: .875rem; font-weight: 500; cursor: pointer; border: none; transition: opacity .15s; }
  .btn:hover:not(:disabled) { opacity: .82; }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #0d1117; }
  .btn-danger { background: var(--down); color: #fff; }
  .btn-ghost { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .btn-google { background: #fff; color: #111; justify-content: center; width: 100%; margin-bottom: 10px; }
  .btn-full { width: 100%; justify-content: center; }
  .btn-link { background: none; border: none; color: var(--muted); cursor: pointer; font-size: .8rem; text-decoration: underline; padding: 0; }
  .btn-link:hover { color: var(--text); }
  .btn-sm { padding: 5px 12px; font-size: .78rem; }

  /* ── Form bits ── */
  .divider { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: .75rem; margin: 14px 0; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .email-form { display: none; text-align: left; }
  .email-form.visible { display: block; }
  .field { margin-bottom: 10px; }
  .field label { display: block; font-size: .78rem; color: var(--muted); margin-bottom: 4px; }
  .field input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; color: var(--text); font-size: .875rem; outline: none; }
  .field input:focus { border-color: var(--accent); }
  .err { color: var(--down); font-size: .78rem; margin-top: 8px; min-height: 1.1em; }

  /* ── Tabs ── */
  #app { display: none; }
  #app.visible { display: block; }
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
  .tab { padding: 10px 20px; background: none; border: none; color: var(--muted); font-size: .875rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab:hover:not(.active) { color: var(--text); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* ── Status tab ── */
  .dashboard-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
  .overall-pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 24px; font-weight: 600; font-size: .88rem; }
  .pill-ok { background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent); }
  .pill-degraded { background: color-mix(in srgb, var(--degraded) 15%, transparent); color: var(--degraded); border: 1px solid color-mix(in srgb, var(--degraded) 35%, transparent); }
  .pill-down { background: color-mix(in srgb, var(--down) 15%, transparent); color: var(--down); border: 1px solid color-mix(in srgb, var(--down) 35%, transparent); }
  .refresh-info { color: var(--muted); font-size: .78rem; text-align: right; }
  .refresh-info strong { color: var(--text); }
  .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .service-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .service-card.ok { border-left: 3px solid var(--ok); }
  .service-card.degraded { border-left: 3px solid var(--degraded); }
  .service-card.down { border-left: 3px solid var(--down); }
  .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .card-label { font-weight: 600; font-size: .88rem; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .dot-ok { background: var(--ok); box-shadow: 0 0 5px var(--ok); }
  .dot-degraded { background: var(--degraded); box-shadow: 0 0 5px var(--degraded); }
  .dot-down { background: var(--down); box-shadow: 0 0 5px var(--down); }
  .card-meta { font-size: .76rem; color: var(--muted); }
  .status-ok { color: var(--ok); font-weight: 500; }
  .status-degraded { color: var(--degraded); font-weight: 500; }
  .status-down { color: var(--down); font-weight: 500; }

  /* ── Deploy tab ── */
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; margin-bottom: 18px; }
  .section-title { font-size: .82rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 16px; }

  /* Upload zone */
  .drop-zone { border: 2px dashed var(--border); border-radius: var(--radius); padding: 36px 20px; text-align: center; color: var(--muted); cursor: pointer; transition: border-color .15s, background .15s; }
  .drop-zone:hover, .drop-zone.drag-over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .drop-zone input { display: none; }
  .drop-icon { font-size: 2rem; margin-bottom: 8px; }
  .drop-zone p { font-size: .875rem; margin-bottom: 4px; }
  .drop-zone small { font-size: .78rem; }

  .file-preview { margin-top: 14px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); max-height: 200px; overflow-y: auto; }
  .file-preview-header { padding: 8px 14px; font-size: .78rem; color: var(--muted); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; }
  .file-list { list-style: none; }
  .file-list li { padding: 5px 14px; font-size: .78rem; font-family: monospace; color: var(--text); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 8px; }
  .file-list li:last-child { border-bottom: none; }
  .file-size { color: var(--muted); flex-shrink: 0; }

  .deploy-actions { display: flex; gap: 10px; margin-top: 14px; align-items: center; flex-wrap: wrap; }
  .deploy-progress { flex: 1; min-width: 140px; }
  .progress-bar-wrap { background: var(--border); border-radius: 4px; height: 6px; overflow: hidden; margin-top: 4px; }
  .progress-bar { height: 100%; background: var(--accent); transition: width .3s; border-radius: 4px; }
  .progress-label { font-size: .75rem; color: var(--muted); }
  .deploy-result { margin-top: 12px; padding: 10px 14px; border-radius: var(--radius); font-size: .82rem; }
  .deploy-result.ok { background: color-mix(in srgb, var(--ok) 12%, transparent); border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent); color: var(--ok); }
  .deploy-result.err { background: color-mix(in srgb, var(--down) 12%, transparent); border: 1px solid color-mix(in srgb, var(--down) 30%, transparent); color: var(--down); }

  /* Deployment history table */
  .deploy-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  .deploy-table th { text-align: left; padding: 6px 10px; color: var(--muted); font-weight: 500; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--border); }
  .deploy-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .deploy-table tr:last-child td { border-bottom: none; }
  .deploy-table tr:hover td { background: var(--surface2); }
  .mono { font-family: monospace; font-size: .8rem; color: var(--accent); }
  .tag { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: .72rem; font-weight: 600; }
  .tag-active { background: color-mix(in srgb, var(--ok) 20%, transparent); color: var(--ok); }
  .tag-success { background: color-mix(in srgb, var(--ok) 10%, transparent); color: var(--muted); }
  .tag-failure { background: color-mix(in srgb, var(--down) 15%, transparent); color: var(--down); }
  .tag-queued, .tag-running { background: color-mix(in srgb, var(--degraded) 15%, transparent); color: var(--degraded); }
  .commit-msg { color: var(--muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .history-loading { text-align: center; padding: 20px; color: var(--muted); font-size: .82rem; }

  /* Quick actions */
  .quick-actions { display: flex; gap: 10px; flex-wrap: wrap; }

  /* User row */
  .user-row { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
  .user-name { font-size: .8rem; color: var(--muted); }

  footer { border-top: 1px solid var(--border); padding: 14px 24px; text-align: center; font-size: .73rem; color: var(--muted); }
</style>
</head>
<body>
<header>
  <div class="logo">♞ Knight<span>Aura</span>Chess</div>
  <span class="badge">Operations</span>
</header>

<main>
  <!-- Loading -->
  <div id="loading-panel">
    <div class="spinner"></div>
    <p>Checking authentication…</p>
  </div>

  <!-- Sign in -->
  <div id="signin-panel" style="display:none">
    <h2>Restricted Access</h2>
    <p>Sign in to access the operations dashboard.</p>
    <button class="btn btn-google" id="btn-google">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.3 30.3 0 24 0 14.6 0 6.6 5.5 2.7 13.5l7.9 6.1C12.4 13.3 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17.4z"/><path fill="#FBBC05" d="M10.6 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.4 13.4A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l8.1-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.2-8.4 2.2-6.2 0-11.5-3.8-13.4-9.2l-8 6.2C6.5 42.4 14.6 48 24 48z"/></svg>
      Sign in with Google
    </button>
    <div class="divider">or</div>
    <button class="btn btn-primary btn-full" id="btn-show-email">Sign in with email</button>
    <div class="email-form" id="email-form">
      <br>
      <div class="field"><label>Email</label><input type="email" id="inp-email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input type="password" id="inp-pass" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-full" id="btn-email-submit" style="margin-top:4px">Sign in</button>
    </div>
    <p class="err" id="signin-err"></p>
  </div>

  <!-- Access denied -->
  <div id="denied-panel" style="display:none">
    <div class="denied-icon">🚫</div>
    <h2>Access Denied</h2>
    <p>Your account is not authorised to access this dashboard.</p>
    <button class="btn btn-danger" id="btn-denied-signout">Sign out</button>
  </div>

  <!-- Main app -->
  <div id="app">
    <div class="user-row" style="margin-bottom:16px">
      <div></div>
      <button class="btn-link" id="btn-app-signout">Sign out</button>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="status">Status</button>
      <button class="tab" data-tab="deploy">Deploy</button>
    </div>

    <!-- ── Status tab ── -->
    <div class="tab-panel active" id="tab-status">
      <div class="dashboard-header">
        <div id="overall-pill" class="overall-pill pill-ok">
          <span id="overall-dot" class="dot dot-ok"></span>
          <span id="overall-label">Loading…</span>
        </div>
        <div class="refresh-info">
          Updated <strong id="last-updated">—</strong><br>
          Next refresh in <strong id="countdown">30</strong>s
        </div>
      </div>
      <div class="services-grid" id="services-grid"></div>
    </div>

    <!-- ── Deploy tab ── -->
    <div class="tab-panel" id="tab-deploy">

      <!-- Upload new version -->
      <div class="section">
        <div class="section-title">Upload New Version</div>
        <div class="drop-zone" id="drop-zone">
          <input type="file" id="file-input" webkitdirectory multiple>
          <div class="drop-icon">📦</div>
          <p>Click to select your <code>dist/</code> folder</p>
          <small>or drag &amp; drop it here</small>
        </div>
        <div id="file-preview" class="file-preview" style="display:none">
          <div class="file-preview-header">
            <span id="file-count">0 files</span>
            <span id="file-total-size">0 B</span>
          </div>
          <ul class="file-list" id="file-list"></ul>
        </div>
        <div class="deploy-actions">
          <button class="btn btn-primary" id="btn-deploy" disabled>Deploy to Production</button>
          <div class="deploy-progress" id="deploy-progress" style="display:none">
            <div class="progress-label" id="progress-label">Uploading…</div>
            <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar" style="width:0%"></div></div>
          </div>
        </div>
        <div id="deploy-result" style="display:none"></div>
      </div>

      <!-- Quick actions -->
      <div class="section">
        <div class="section-title">Quick Actions</div>
        <div class="quick-actions">
          <button class="btn btn-ghost" id="btn-refresh-history">↻ Refresh History</button>
          ${hasDeployHook ? `<button class="btn btn-ghost" id="btn-trigger-hook">⚡ Trigger Git Deploy</button>` : ''}
        </div>
      </div>

      <!-- Deployment history -->
      <div class="section">
        <div class="section-title">Deployment History</div>
        <div id="history-wrap">
          <div class="history-loading">Loading deployments…</div>
        </div>
      </div>
    </div><!-- /tab-deploy -->
  </div><!-- /app -->
</main>

<footer>KnightAuraChess &mdash; Internal Operations</footer>

<script type="module">
import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup,
         GoogleAuthProvider, signInWithEmailAndPassword, signOut }
                                                  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const app  = initializeApp(${firebaseConfig});
const auth = getAuth(app);
const gp   = new GoogleAuthProvider();

// ── DOM refs ──────────────────────────────────────────────────────────────
const $id = (id) => document.getElementById(id);
const panels = {
  loading: $id('loading-panel'),
  signin:  $id('signin-panel'),
  denied:  $id('denied-panel'),
  app:     $id('app'),
};

function showPanel(name) {
  Object.values(panels).forEach(p => { p.style.display = 'none'; p.classList.remove('visible'); });
  panels[name].style.display = 'block';
  panels[name].classList.add('visible');
}

// ── Tab navigation ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $id('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'deploy') loadHistory();
  });
});

// ── Auth state ────────────────────────────────────────────────────────────
let currentUser = null;
let statusTimer = null, countdownTimer = null, secondsLeft = 30;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) { stopRefresh(); showPanel('signin'); return; }
  showPanel('loading');
  const ok = await loadStatus(user);
  if (ok) { showPanel('app'); startRefresh(user); loadHistory(); }
});

async function getToken() {
  return currentUser?.getIdToken() || null;
}

async function apiFetch(path, opts = {}) {
  const token = await getToken();
  return fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), authorization: \`Bearer \${token}\` },
  });
}

// ── Status tab ────────────────────────────────────────────────────────────
async function loadStatus(user) {
  try {
    const res  = await apiFetch('/api/status');
    if (res.status === 403) { showPanel('denied'); return false; }
    if (res.status === 401) { showPanel('signin'); return false; }
    renderStatus(await res.json());
    return true;
  } catch { showPanel('signin'); return false; }
}

function renderStatus(data) {
  const pill  = $id('overall-pill');
  const dot   = $id('overall-dot');
  const label = $id('overall-label');
  pill.className  = 'overall-pill pill-' + data.overall;
  dot.className   = 'dot dot-' + data.overall;
  label.textContent =
    data.overall === 'ok'       ? 'All systems operational' :
    data.overall === 'degraded' ? 'Partial degradation detected' :
                                  'Major outage detected';
  $id('last-updated').textContent = new Date(data.checkedAt).toLocaleTimeString();
  const grid = $id('services-grid');
  grid.innerHTML = '';
  for (const s of data.services) {
    const st  = s.status === 'ok' ? 'Operational' : s.status === 'degraded' ? 'Degraded' : 'Down';
    const lat = typeof s.latencyMs === 'number' ? \`\${s.latencyMs} ms\` : '—';
    const http = s.httpStatus ? \`HTTP \${s.httpStatus}\` : (s.error || '—');
    grid.insertAdjacentHTML('beforeend', \`
      <div class="service-card \${s.status}">
        <div class="card-top">
          <span class="card-label">\${esc(s.label)}</span>
          <span class="dot dot-\${s.status}"></span>
        </div>
        <div class="card-meta">
          <span class="status-\${s.status}">\${st}</span>
          &nbsp;·&nbsp;\${esc(http)}&nbsp;·&nbsp;\${esc(lat)}
        </div>
      </div>\`);
  }
}

function startRefresh(user) {
  stopRefresh();
  secondsLeft = 30;
  $id('countdown').textContent = secondsLeft;
  countdownTimer = setInterval(() => { $id('countdown').textContent = --secondsLeft < 0 ? (secondsLeft = 30) : secondsLeft; }, 1000);
  statusTimer = setInterval(() => { secondsLeft = 30; loadStatus(user); }, 30_000);
}

function stopRefresh() { clearInterval(statusTimer); clearInterval(countdownTimer); }

// ── Deploy tab — file picker ──────────────────────────────────────────────
let selectedFiles = [];

const dropZone  = $id('drop-zone');
const fileInput = $id('file-input');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  handleFileEntry(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => handleFileEntry(fileInput.files));

function handleFileEntry(fileList) {
  selectedFiles = [...fileList].filter(f => f.size > 0);
  if (!selectedFiles.length) return;
  renderFilePreview();
  $id('btn-deploy').disabled = false;
  $id('deploy-result').style.display = 'none';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function renderFilePreview() {
  const preview = $id('file-preview');
  const list    = $id('file-list');
  const total   = selectedFiles.reduce((a, f) => a + f.size, 0);
  $id('file-count').textContent = selectedFiles.length + ' files';
  $id('file-total-size').textContent = fmtSize(total);
  list.innerHTML = '';
  for (const f of selectedFiles) {
    const path = f.webkitRelativePath || f.name;
    list.insertAdjacentHTML('beforeend',
      \`<li><span>\${esc(path)}</span><span class="file-size">\${fmtSize(f.size)}</span></li>\`);
  }
  preview.style.display = 'block';
}

// ── Deploy tab — upload ───────────────────────────────────────────────────
$id('btn-deploy').addEventListener('click', async () => {
  if (!selectedFiles.length) return;
  const btn = $id('btn-deploy');
  btn.disabled = true;
  const progress  = $id('deploy-progress');
  const bar       = $id('progress-bar');
  const barLabel  = $id('progress-label');
  const resultDiv = $id('deploy-result');
  resultDiv.style.display = 'none';
  progress.style.display = 'block';

  function setProgress(pct, label) {
    bar.style.width = pct + '%';
    barLabel.textContent = label;
  }

  try {
    setProgress(10, 'Preparing files…');
    const formData = new FormData();
    const paths = [];
    for (const f of selectedFiles) {
      formData.append('files', f);
      paths.push(f.webkitRelativePath || f.name);
    }
    formData.append('paths', JSON.stringify(paths));

    setProgress(30, 'Uploading to Cloudflare Pages…');
    const res  = await apiFetch('/api/deploy/start', { method: 'POST', body: formData });
    const data = await res.json();

    setProgress(100, 'Done');
    if (data.ok) {
      resultDiv.className = 'deploy-result ok';
      resultDiv.innerHTML = \`
        ✓ Deployed successfully &mdash;
        \${data.filesUploaded} new file\${data.filesUploaded !== 1 ? 's' : ''} uploaded
        (\${data.filesTotal} total).<br>
        \${data.url ? \`<a href="\${esc(data.url)}" target="_blank" style="color:inherit">\${esc(data.url)}</a>\` : ''}
      \`;
      loadHistory();
    } else {
      resultDiv.className = 'deploy-result err';
      resultDiv.textContent = '✗ ' + (data.message || 'Deploy failed');
    }
  } catch (e) {
    resultDiv.className = 'deploy-result err';
    resultDiv.textContent = '✗ ' + e.message;
  } finally {
    resultDiv.style.display = 'block';
    progress.style.display  = 'none';
    btn.disabled = false;
  }
});

// ── Deploy tab — history ──────────────────────────────────────────────────
async function loadHistory() {
  const wrap = $id('history-wrap');
  wrap.innerHTML = '<div class="history-loading">Loading…</div>';
  try {
    const res  = await apiFetch('/api/deploy/history');
    const data = await res.json();
    if (!data.ok || !data.deployments?.length) {
      wrap.innerHTML = '<div class="history-loading">No deployments found.</div>';
      return;
    }
    renderHistory(data.deployments);
  } catch {
    wrap.innerHTML = '<div class="history-loading" style="color:var(--down)">Failed to load history.</div>';
  }
}

function renderHistory(deployments) {
  const wrap = $id('history-wrap');
  let rows = '';
  for (const d of deployments) {
    const date    = new Date(d.createdOn).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const isActive = d.stage === 'deploy' && d.status === 'success';
    const tagClass = isActive ? 'tag-active'
      : d.status === 'success' ? 'tag-success'
      : d.status === 'failure' ? 'tag-failure'
      : 'tag-queued';
    const tagLabel = isActive ? 'Active' : d.status || d.stage;
    const src = d.source === 'ad_hoc' ? 'upload' : d.source;
    const commit = d.commitHash
      ? \`<span class="mono">\${esc(d.commitHash)}</span> \${d.commitMessage ? \`<span class="commit-msg" title="\${esc(d.commitMessage)}">\${esc(d.commitMessage)}</span>\` : ''}\`
      : \`<span class="mono">\${esc(d.shortId)}</span>\`;

    rows += \`<tr>
      <td>\${commit}</td>
      <td style="color:var(--muted);white-space:nowrap;font-size:.76rem">\${esc(date)}</td>
      <td style="color:var(--muted);font-size:.76rem">\${esc(src)}</td>
      <td><span class="tag \${tagClass}">\${esc(tagLabel)}</span></td>
      <td>\${isActive ? '' : \`<button class="btn btn-ghost btn-sm" data-rollback="\${esc(d.id)}">Rollback</button>\`}</td>
    </tr>\`;
  }
  wrap.innerHTML = \`
    <div style="overflow-x:auto">
      <table class="deploy-table">
        <thead><tr>
          <th>Commit / ID</th><th>Date</th><th>Source</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>\${rows}</tbody>
      </table>
    </div>
  \`;

  wrap.querySelectorAll('[data-rollback]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Roll back to this deployment?')) return;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const res  = await apiFetch('/api/deploy/rollback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deploymentId: btn.dataset.rollback }),
        });
        const data = await res.json();
        if (data.ok) { await loadHistory(); }
        else { alert('Rollback failed: ' + (data.message || 'unknown error')); btn.disabled = false; btn.textContent = 'Rollback'; }
      } catch (e) { alert('Rollback error: ' + e.message); btn.disabled = false; btn.textContent = 'Rollback'; }
    });
  });
}

$id('btn-refresh-history')?.addEventListener('click', loadHistory);

${hasDeployHook ? `
$id('btn-trigger-hook')?.addEventListener('click', async () => {
  const btn = $id('btn-trigger-hook');
  btn.disabled = true;
  try {
    const res  = await apiFetch('/api/deploy/trigger', { method: 'POST' });
    const data = await res.json();
    if (data.ok) { setTimeout(loadHistory, 3000); }
    else { alert('Trigger failed: ' + (data.message || 'unknown error')); }
  } catch (e) { alert('Trigger error: ' + e.message); }
  finally { btn.disabled = false; }
});` : ''}

// ── Sign-in handlers ──────────────────────────────────────────────────────
$id('btn-google').addEventListener('click', async () => {
  $id('signin-err').textContent = '';
  try { await signInWithPopup(auth, gp); } catch (e) { $id('signin-err').textContent = e.message; }
});
$id('btn-show-email').addEventListener('click', () => {
  const f = $id('email-form');
  f.classList.toggle('visible');
  $id('btn-show-email').style.display = f.classList.contains('visible') ? 'none' : 'flex';
});
$id('btn-email-submit').addEventListener('click', async () => {
  $id('signin-err').textContent = '';
  const email = $id('inp-email').value.trim();
  const pass  = $id('inp-pass').value;
  if (!email || !pass) { $id('signin-err').textContent = 'Email and password required.'; return; }
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { $id('signin-err').textContent = e.message; }
});
$id('inp-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $id('btn-email-submit').click(); });

// ── Sign-out ──────────────────────────────────────────────────────────────
async function handleSignOut() { stopRefresh(); await signOut(auth); }
$id('btn-denied-signout').addEventListener('click', handleSignOut);
$id('btn-app-signout').addEventListener('click', handleSignOut);

// ── Util ──────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      return handleStatus(request, env);
    }
    if (url.pathname === '/api/deploy/history' && request.method === 'GET') {
      return handleDeployHistory(request, env);
    }
    if (url.pathname === '/api/deploy/start' && request.method === 'POST') {
      return handleDeployStart(request, env);
    }
    if (url.pathname === '/api/deploy/rollback' && request.method === 'POST') {
      return handleRollback(request, env);
    }
    if (url.pathname === '/api/deploy/trigger' && request.method === 'POST') {
      return handleTrigger(request, env);
    }

    return new Response(buildHtml(env), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};
