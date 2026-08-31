/* iPhone Culture — backend estático + API (solo Node built-ins: http, fs, crypto, path) */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---------- CLI args ---------- */
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith('--' + name + '='));
  if (eq) return eq.split('=')[1];
  return fallback;
}

const host = arg('host', process.env.HOST || '0.0.0.0');
const port = parseInt(arg('port', process.env.PORT || '7100'), 10);
const root = __dirname;
const DATA_DIR = path.join(root, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');

/* Admin token: nunca un default estático. Si IC_ADMIN_TOKEN falta o es débil,
   se genera uno aleatorio por sesión y se loguea UNA vez. */
let ADMIN_TOKEN = process.env.IC_ADMIN_TOKEN || '';
if (ADMIN_TOKEN.length < 16) {
  ADMIN_TOKEN = crypto.randomBytes(24).toString('hex');
  console.log('[SEGURIDAD] Token admin de esta sesión: ' + ADMIN_TOKEN);
}

/* Asegurar data/ */
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const keep = path.join(DATA_DIR, '.gitkeep');
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
} catch (e) {
  console.error('[ERROR] No se pudo crear data/:', e.message);
}

/* ---------- Seguridad: headers en TODAS las respuestas ---------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.google.com",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function securityHeaders(extra) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP
  }, extra || {});
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }));
  res.end(body);
}

/* ---------- Rate limiting por IP ---------- */
/* buckets: key -> { arr: number[], windowMs }. Limpieza a 2× ventana; techo duro
   de 50.000 claves (fail-closed: 429 a claves nuevas cuando está lleno). */
const buckets = new Map();
const BUCKET_HARD_CAP = 50000;
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= BUCKET_HARD_CAP) return false;
    b = { arr: [], windowMs: windowMs };
    buckets.set(key, b);
  }
  b.windowMs = Math.max(b.windowMs, windowMs);
  const arr = b.arr;
  while (arr.length && arr[0] <= now - windowMs) arr.shift();
  if (arr.length >= limit) return false;
  arr.push(now);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    const purge = 2 * b.windowMs;
    const arr = b.arr;
    while (arr.length && arr[0] <= now - purge) arr.shift();
    if (!arr.length) buckets.delete(k);
  }
}, 60000).unref();

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function logAdmin401(ip) {
  console.log('[SEGURIDAD] 401 admin desde ' + ip + ' a las ' + new Date().toISOString());
}

/* ---------- Body parsing con límite y timeout ---------- */
const MAX_BODY = 16 * 1024; // 16 KB
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; reject(Object.assign(new Error('timeout'), { code: 408 })); req.destroy(); }
    }, 10000);
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) {
        if (!done) { done = true; clearTimeout(timer); reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', err => { if (!done) { done = true; clearTimeout(timer); reject(err); } });
  });
}

/* ---------- Validación ---------- */
const TRACK_TYPES = new Set([
  'visita', 'salida', 'cta_whatsapp', 'form_canje', 'form_turno',
  'form_lead', 'form_resena', 'form_pregunta', 'quiz', 'calculadora'
]);

/* Whitelist de claves permitidas en data por tipo de evento */
const TRACK_DATA_KEYS = {
  visita: new Set(['page', 'referrer', 'ua', 'lang', 'screen']),
  salida: new Set(['page', 'segundos']),
  cta_whatsapp: new Set(['seccion']),
  form_canje: new Set(['equipo', 'bateria']),
  form_turno: new Set(['dia', 'horario', 'motivo']),
  form_lead: new Set(['interes']),
  form_resena: new Set(['estrellas']),
  form_pregunta: new Set(['tema']),
  quiz: new Set(['accion', 'modelo', 'alternativa', 'respuestas']),
  calculadora: new Set(['modelo', 'capacidad_gb', 'canje', 'precio_lista', 'descuento_canje', 'precio_final', 'cuota', 'cuotas'])
};
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeTrackData(type, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const allowed = TRACK_DATA_KEYS[type];
  const out = Object.create(null);
  for (const k of Object.keys(data)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (allowed && !allowed.has(k)) continue;
    let v = data[k];
    if (typeof v === 'string') v = v.slice(0, 300);
    else if (typeof v === 'number') { if (!isFinite(v)) continue; }
    else if (typeof v === 'boolean') { /* ok */ }
    else if (v && typeof v === 'object') {
      /* profundidad máx 3: aplanamos a JSON acotado si es simple */
      const s = JSON.stringify(v);
      if (!s || s.length > 512 || /"(__proto__|constructor|prototype)"/.test(s)) continue;
      out[k] = v;
      continue;
    } else continue;
    out[k] = v;
  }
  return out;
}

function stripControl(s) {
  return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

function validateLead(body) {
  const errors = [];
  /* Validación estricta de tipos: todo campo presente debe ser string */
  const strFields = ['name', 'phone', 'message', 'source', 'model', 'website'];
  for (const f of strFields) {
    if (body[f] !== undefined && body[f] !== null && typeof body[f] !== 'string') {
      errors.push(f + ' debe ser string');
    }
  }
  if (body.t0 !== undefined && (typeof body.t0 !== 'number' || !isFinite(body.t0))) {
    errors.push('t0 debe ser numérico');
  }
  if (errors.length) return { errors };

  const name = stripControl(body.name || '');
  const phone = stripControl(body.phone || '');
  const message = stripControl(body.message || '');
  const source = stripControl(body.source || 'web').slice(0, 40) || 'web';
  const model = body.model ? stripControl(body.model).slice(0, 80) : undefined;
  if (name.length < 2 || name.length > 80) errors.push('name debe tener entre 2 y 80 caracteres');
  if (phone && (!PHONE_RE.test(phone) || phone.replace(/\D/g, '').length < 8)) errors.push('phone inválido');
  if (!message) errors.push('message requerido');
  if (message.length > 2000) errors.push('message excede 2000 caracteres');
  if (errors.length) return { errors };
  const lead = { name, phone, message, source };
  if (model) lead.model = model;
  return { lead };
}

/* ---------- JSONL helpers ---------- */
const JSONL_MAX = 50 * 1024 * 1024;      // 50 MB
const JSONL_KEEP = 25 * 1024 * 1024;     // conservar ~25 MB al rotar

async function rotateIfNeeded(file) {
  try {
    const st = await fs.promises.stat(file);
    if (st.size <= JSONL_MAX) return;
    const fh = await fs.promises.open(file, 'r');
    try {
      const size = st.size;
      const offset = Math.max(0, size - JSONL_KEEP);
      const buf = Buffer.alloc(size - offset);
      await fh.read(buf, 0, buf.length, offset);
      let text = buf.toString('utf8');
      if (offset > 0) {
        const nl = text.indexOf('\n');
        text = nl === -1 ? '' : text.slice(nl + 1); // descartar línea parcial
      }
      await fs.promises.writeFile(file, text);
      console.log('[INFO] Rotado ' + path.basename(file) + ' (' + size + ' -> ' + text.length + ' bytes)');
    } finally {
      await fh.close();
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[ERROR] rotación ' + file + ':', e.message);
  }
}

async function appendJsonl(file, obj) {
  obj.ts = new Date().toISOString();
  await rotateIfNeeded(file);
  await fs.promises.appendFile(file, JSON.stringify(obj) + '\n');
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/* ---------- Auth admin (timing-safe sobre hashes SHA-256) ---------- */
const ADMIN_TOKEN_HASH = crypto.createHash('sha256').update(ADMIN_TOKEN).digest();
function checkAdmin(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1]).digest();
  return crypto.timingSafeEqual(a, ADMIN_TOKEN_HASH);
}

/* ---------- Stats ---------- */
function buildStats() {
  const events = readJsonl(EVENTS_FILE);
  const leads = readJsonl(LEADS_FILE);
  const visitas = events.filter(e => e.type === 'visita');
  const now = new Date();
  const dayKey = d => d.toISOString().slice(0, 10);

  const byDay = Object.create(null);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    byDay[dayKey(d)] = 0;
  }
  visitas.forEach(e => {
    const k = (e.ts || '').slice(0, 10);
    if (Object.hasOwn(byDay, k)) byDay[k]++;
  });

  const refCounts = Object.create(null);
  visitas.forEach(e => {
    let r = (e.data && e.data.referrer) || e.referrer || '(directo)';
    r = stripControl(r).slice(0, 200) || '(directo)';
    if (r !== '(directo)') { try { r = new URL(r).hostname; } catch { /* noop */ } }
    refCounts[r] = (refCounts[r] || 0) + 1;
  });
  const topReferrers = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([referrer, count]) => ({ referrer, count }));

  const convTypes = ['cta_whatsapp', 'form_canje', 'form_turno', 'form_lead', 'form_resena', 'form_pregunta', 'quiz', 'calculadora'];
  const conversions = Object.create(null);
  convTypes.forEach(t => { conversions[t] = events.filter(e => e.type === t).length; });
  const totalConversions = Object.values(conversions).reduce((a, b) => a + b, 0);

  const hoy = dayKey(now);
  const hace7 = new Date(now); hace7.setDate(hace7.getDate() - 7);

  return {
    visits: {
      total: visitas.length,
      today: visitas.filter(e => (e.ts || '').slice(0, 10) === hoy).length,
      last7d: visitas.filter(e => new Date(e.ts) >= hace7).length,
      byDay
    },
    topReferrers,
    conversions: { total: totalConversions, byType: conversions },
    leads: { total: leads.length },
    events: { total: events.length },
    generatedAt: now.toISOString()
  };
}

/* ---------- CSV (con protección contra formula injection) ---------- */
const CSV_FORMULA_RE = /^[=+\-@\t\r]/;
function toCsv(rows, headers) {
  const esc = v => {
    let s = String(v == null ? '' : v);
    if (CSV_FORMULA_RE.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return [headers.map(esc).join(',')]
    .concat(rows.map(r => headers.map(h => esc(typeof r[h] === 'object' ? JSON.stringify(r[h]) : r[h])).join(',')))
    .join('\n');
}

/* ---------- Static (allowlist estricta) ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const STATIC_HTML = new Set(['/index.html', '/admin.html', '/privacidad.html']);

function serveStatic(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { sendJson(res, 400, { error: 'URL inválida' }); return; }
  if (decoded.indexOf('\0') !== -1) { sendJson(res, 400, { error: 'URL inválida' }); return; }
  /* Normalizar separadores y colapsar ./ ../ */
  const rel = decoded.replace(/\\/g, '/');
  /* Allowlist: HTML conocidos o assets/ sin traversal */
  const isAssets = rel.startsWith('/assets/') && !rel.includes('..');
  const isHtml = STATIC_HTML.has(rel);
  if (!isAssets && !isHtml) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { sendJson(res, 404, { error: 'Not found' }); return; }
    res.writeHead(200, securityHeaders({
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    }));
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- Router ---------- */
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    sendJson(res, 400, { error: 'URL inválida' });
    return;
  }
  const urlPath = url.pathname;
  const ip = clientIp(req);

  /* Rate limit global: 100 req/min por IP */
  if (!rateLimit('g:' + ip, 100, 60000)) {
    sendJson(res, 429, { error: 'Demasiadas solicitudes. Probá en un minuto.' });
    return;
  }

  try {
    /* ----- API ----- */
    if (urlPath.startsWith('/api/')) {
      /* Admin: rate limit específico 10 req/min por IP (además del global) */
      if (urlPath.startsWith('/api/admin/')) {
        if (!rateLimit('admin:' + ip, 10, 60000)) {
          sendJson(res, 429, { error: 'Demasiadas solicitudes de administración.' });
          return;
        }
      }

      /* Mismo origen: no CORS headers; Origin externo se rechaza en mutaciones */
      const origin = req.headers['origin'];
      if (origin && req.method !== 'GET') {
        try {
          const oh = new URL(origin).host;
          if (oh !== req.headers['host']) { sendJson(res, 403, { error: 'Origen no permitido' }); return; }
        } catch { sendJson(res, 403, { error: 'Origen no permitido' }); return; }
      }

      if (urlPath === '/api/track' && req.method === 'POST') {
        if (!rateLimit('track:' + ip, 30, 60000)) {
          sendJson(res, 429, { error: 'Demasiados eventos.' });
          return;
        }
        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw); } catch { sendJson(res, 400, { error: 'JSON inválido' }); return; }
        if (!body || typeof body !== 'object' || Array.isArray(body) || !TRACK_TYPES.has(body.type)) {
          sendJson(res, 400, { error: 'type inválido' });
          return;
        }
        if (body.data !== undefined) {
          if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
            sendJson(res, 400, { error: 'data inválido' });
            return;
          }
          const keys = Object.keys(body.data);
          if (keys.some(k => FORBIDDEN_KEYS.has(k))) {
            sendJson(res, 400, { error: 'data contiene claves no permitidas' });
            return;
          }
          const ds = JSON.stringify(body.data);
          if (ds.length > 1024) {
            sendJson(res, 400, { error: 'data demasiado grande' });
            return;
          }
        }
        const cleanData = sanitizeTrackData(body.type, body.data);
        await appendJsonl(EVENTS_FILE, {
          type: body.type,
          page: typeof body.page === 'string' ? stripControl(body.page).slice(0, 200) : undefined,
          referrer: typeof body.referrer === 'string' ? stripControl(body.referrer).slice(0, 500) : undefined,
          data: cleanData
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (urlPath === '/api/lead' && req.method === 'POST') {
        if (!rateLimit('lead:' + ip, 5, 60000)) {
          sendJson(res, 429, { error: 'Demasiados leads desde esta IP. Probá en un minuto.' });
          return;
        }
        /* Origin obligatorio y con host propio */
        if (!origin) { sendJson(res, 403, { error: 'Origin requerido' }); return; }
        try {
          const oh = new URL(origin).host;
          if (oh !== req.headers['host']) { sendJson(res, 403, { error: 'Origen no permitido' }); return; }
        } catch { sendJson(res, 403, { error: 'Origen no permitido' }); return; }

        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw); } catch { sendJson(res, 400, { error: 'JSON inválido' }); return; }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          sendJson(res, 400, { error: 'JSON inválido' });
          return;
        }

        /* Honeypot: si el campo oculto "website" tiene contenido, es un bot.
           Responder 200 falso sin guardar. */
        if (typeof body.website === 'string' && body.website.trim() !== '') {
          sendJson(res, 200, { ok: true });
          return;
        }

        /* Temporalidad: el front envía t0 (timestamp de carga de página).
           Rechazar envíos demasiado rápidos (<3s) o vencidos (>1h). */
        if (typeof body.t0 !== 'number' || !isFinite(body.t0)) {
          sendJson(res, 400, { error: 't0 requerido' });
          return;
        }
        const elapsed = Date.now() - body.t0;
        if (elapsed < 3000 || elapsed > 3600000) {
          sendJson(res, 400, { error: 'Envío inválido (temporalidad)' });
          return;
        }

        const { lead, errors } = validateLead(body);
        if (errors) { sendJson(res, 400, { error: 'Validación falló', detalles: errors }); return; }
        lead.ua = String(req.headers['user-agent'] || '').slice(0, 200);
        await appendJsonl(LEADS_FILE, lead);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (urlPath === '/api/admin/stats' && req.method === 'GET') {
        if (!checkAdmin(req)) { logAdmin401(ip); sendJson(res, 401, { error: 'No autorizado' }); return; }
        sendJson(res, 200, buildStats());
        return;
      }

      if (urlPath === '/api/admin/leads' && req.method === 'GET') {
        if (!checkAdmin(req)) { logAdmin401(ip); sendJson(res, 401, { error: 'No autorizado' }); return; }
        const leads = readJsonl(LEADS_FILE);
        sendJson(res, 200, { total: leads.length, leads: leads.slice(-200).reverse() });
        return;
      }

      if (urlPath === '/api/admin/export' && req.method === 'GET') {
        if (!checkAdmin(req)) { logAdmin401(ip); sendJson(res, 401, { error: 'No autorizado' }); return; }
        const format = url.searchParams.get('format') || 'json';
        const events = readJsonl(EVENTS_FILE);
        const leads = readJsonl(LEADS_FILE);
        if (format === 'csv') {
          const csv = '# events\n' + toCsv(events, ['type', 'ts', 'page', 'referrer', 'data']) +
            '\n# leads\n' + toCsv(leads, ['name', 'phone', 'message', 'source', 'model', 'ts']);
          res.writeHead(200, securityHeaders({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="iphoneculture-export.csv"'
          }));
          res.end(csv);
        } else if (format === 'json') {
          res.writeHead(200, securityHeaders({
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="iphoneculture-export.json"'
          }));
          res.end(JSON.stringify({ events, leads, exportedAt: new Date().toISOString() }, null, 2));
        } else {
          sendJson(res, 400, { error: 'format debe ser csv|json' });
        }
        return;
      }

      sendJson(res, 404, { error: 'Ruta API desconocida' });
      return;
    }

    /* ----- Static ----- */
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Método no permitido' });
      return;
    }
    serveStatic(req, res, urlPath);
  } catch (err) {
    if (err && err.code === 413) { sendJson(res, 413, { error: 'Body demasiado grande' }); return; }
    if (err && err.code === 408) { sendJson(res, 408, { error: 'Timeout' }); return; }
    sendJson(res, 500, { error: 'Error interno' });
  }
});

/* ---------- Timeouts de socket ---------- */
server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;

server.listen(port, host, () => {
  console.log(`iPhone Culture server en http://${host}:${port}/ (API + estático, data/ protegido)`);
});
