'use strict';
/**
 * 링크나무 — 내 모든 링크를 한 페이지에 모아 하나의 URL로 공유하는 서비스
 * 외부 패키지 없이 Node.js 기본 모듈만 사용합니다. (Node 18+)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일
const MAX_LINKS = 50;
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;
const USERNAME_RE = /^[a-z0-9][a-z0-9_]{2,19}$/;
const RESERVED = new Set(['admin', 'api', 'login', 'signup', 'logout', 'static', 'uploads', 'go', 'www', 'help']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* 저장소: data/db.json 하나에 사용자·세션을 보관                       */
/* ------------------------------------------------------------------ */
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { users: {}, sessions: {} };
    throw e;
  }
}
const db = loadDb();

let saveTimer = null;
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 200);
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const getUser = (username) => (has(db.users, username) ? db.users[username] : null);

/* ------------------------------------------------------------------ */
/* HTTP 도우미                                                         */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}
function redirect(res, location) {
  send(res, 302, '', { Location: location, 'Cache-Control': 'no-store' });
}
function notFound(res) {
  send(res, 404, renderMessagePage('페이지를 찾을 수 없어요', '주소를 다시 확인해 주세요.'), HTML);
}
function serveFile(res, baseDir, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return notFound(res); }
  const filePath = path.resolve(baseDir, decoded.replace(/^[/\\]+/, ''));
  if (!filePath.startsWith(baseDir + path.sep)) return notFound(res);
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  });
}

function readJson(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) {
      return reject(httpError(415, 'JSON 형식으로 보내 주세요.'));
    }
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(httpError(413, '요청 크기가 너무 큽니다.'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(httpError(400, '잘못된 요청 형식입니다.'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/* 인증                                                                */
/* ------------------------------------------------------------------ */
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function verifyPassword(pw, user) {
  const computed = crypto.scryptSync(pw, user.salt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return stored.length === computed.length && crypto.timingSafeEqual(computed, stored);
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid || !has(db.sessions, sid)) return null;
  const s = db.sessions[sid];
  if (s.expiresAt < Date.now()) {
    delete db.sessions[sid];
    save();
    return null;
  }
  return getUser(s.username);
}
function createSession(res, username) {
  const sid = crypto.randomBytes(32).toString('hex');
  db.sessions[sid] = { username, expiresAt: Date.now() + SESSION_TTL_MS };
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
}

/* ------------------------------------------------------------------ */
/* 입력 검증                                                           */
/* ------------------------------------------------------------------ */
const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);

function normalizeUrl(raw) {
  let s = cleanText(raw, 2000);
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null; // javascript: 등 차단
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

function serializeMe(u) {
  return {
    username: u.username,
    name: u.name,
    bio: u.bio,
    avatarUrl: u.avatar ? `/uploads/${u.avatar}` : null,
    links: u.links,
    totalClicks: u.links.reduce((sum, l) => sum + (l.clicks || 0), 0),
  };
}

/* ------------------------------------------------------------------ */
/* 공개 프로필 페이지 (서버 렌더링 → SNS 미리보기·검색 노출에 유리)     */
/* ------------------------------------------------------------------ */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PLATFORMS = [
  { match: /(^|\.)instagram\.com$/, label: 'Instagram', color: '#E1306C' },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/, label: 'YouTube', color: '#FF0000' },
  { match: /(^|\.)github\.com$/, label: 'GitHub', color: '#24292F' },
  { match: /(^|\.)(x\.com|twitter\.com)$/, label: 'X', color: '#000000' },
  { match: /(^|\.)blog\.naver\.com$/, label: 'Naver Blog', color: '#03C75A' },
  { match: /(^|\.)tistory\.com$/, label: 'Tistory', color: '#EB531F' },
  { match: /(^|\.)velog\.io$/, label: 'velog', color: '#20C997' },
  { match: /(^|\.)medium\.com$/, label: 'Medium', color: '#000000' },
  { match: /(^|\.)linkedin\.com$/, label: 'LinkedIn', color: '#0A66C2' },
  { match: /(^|\.)facebook\.com$/, label: 'Facebook', color: '#1877F2' },
  { match: /(^|\.)tiktok\.com$/, label: 'TikTok', color: '#111111' },
  { match: /(^|\.)threads\.net$/, label: 'Threads', color: '#000000' },
  { match: /(^|\.)notion\.(so|site)$/, label: 'Notion', color: '#37352F' },
  { match: /(^|\.)brunch\.co\.kr$/, label: 'Brunch', color: '#00C3BD' },
];
function platformOf(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const p = PLATFORMS.find((p) => p.match.test(host));
  return { host, label: p ? p.label : host, color: p ? p.color : '#2F7D4F' };
}

function pageShell({ title, description = '', image = '', body }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
${body}
</body>
</html>`;
}

function renderProfile(u) {
  const initial = esc((u.name || u.username).trim().charAt(0).toUpperCase());
  const avatar = u.avatar
    ? `<img class="avatar" src="/uploads/${esc(u.avatar)}" alt="${esc(u.name)} 프로필 사진">`
    : `<div class="avatar avatar-fallback" aria-hidden="true">${initial}</div>`;

  const links = u.links.length
    ? u.links
        .map((l) => {
          const p = platformOf(l.url);
          return `<li><a class="link-card" href="/go/${esc(u.username)}/${esc(l.id)}" rel="noopener">
  <span class="link-icon" style="background:${p.color}">${esc(p.label.charAt(0).toUpperCase())}</span>
  <span class="link-text"><span class="link-title">${esc(l.title)}</span><span class="link-host">${esc(p.label)}</span></span>
  <span class="link-arrow" aria-hidden="true">›</span>
</a></li>`;
        })
        .join('\n')
    : `<li class="empty">아직 등록된 링크가 없어요.</li>`;

  return pageShell({
    title: `${u.name} | 링크나무`,
    description: u.bio || `${u.name}님의 링크 모음`,
    image: u.avatar ? `/uploads/${u.avatar}` : '',
    body: `<main class="profile">
  <header class="profile-head">
    ${avatar}
    <h1 class="profile-name">${esc(u.name)}</h1>
    ${u.bio ? `<p class="profile-bio">${esc(u.bio)}</p>` : ''}
  </header>
  <ul class="link-list">
${links}
  </ul>
  <footer class="brand-foot"><a href="/">🌳 링크나무로 나만의 페이지 만들기</a></footer>
</main>`,
  });
}

function renderMessagePage(title, message) {
  return pageShell({
    title: `${title} | 링크나무`,
    body: `<main class="center-page"><div class="panel"><h1>${esc(title)}</h1><p class="muted">${esc(message)}</p><p><a class="btn" href="/">홈으로</a></p></div></main>`,
  });
}

/* ------------------------------------------------------------------ */
/* 라우팅                                                              */
/* ------------------------------------------------------------------ */
async function route(req, res) {
  const { pathname: p } = new URL(req.url, 'http://localhost');
  const m = req.method;
  let mm;

  if (m === 'GET') {
    if (p === '/') return serveFile(res, PUBLIC_DIR, 'index.html');
    if (p === '/login' || p === '/signup') return serveFile(res, PUBLIC_DIR, 'auth.html');
    if (p === '/admin') return serveFile(res, PUBLIC_DIR, 'admin.html');
    if (p.startsWith('/static/')) return serveFile(res, PUBLIC_DIR, p.slice('/static/'.length));
    if (p.startsWith('/uploads/')) return serveFile(res, UPLOAD_DIR, p.slice('/uploads/'.length));

    // 공개 프로필: /@아이디
    if ((mm = p.match(/^\/@([a-z0-9_]+)\/?$/))) {
      const u = getUser(mm[1]);
      if (!u) return send(res, 404, renderMessagePage('존재하지 않는 페이지예요', `@${mm[1]} 사용자를 찾을 수 없어요.`), HTML);
      return send(res, 200, renderProfile(u), { ...HTML, 'Cache-Control': 'no-store' });
    }

    // 링크 클릭: 클릭 수를 1 올리고 실제 주소로 이동
    if ((mm = p.match(/^\/go\/([a-z0-9_]+)\/([a-f0-9]+)$/))) {
      const u = getUser(mm[1]);
      const link = u && u.links.find((l) => l.id === mm[2]);
      if (!link) return notFound(res);
      link.clicks = (link.clicks || 0) + 1;
      link.lastClickedAt = new Date().toISOString();
      save();
      return redirect(res, link.url);
    }
  }

  if (p.startsWith('/api/')) return api(req, res, m, p);
  return notFound(res);
}

async function api(req, res, m, p) {
  /* --- 회원가입 / 로그인 / 로그아웃 --- */
  if (m === 'POST' && p === '/api/signup') {
    const b = await readJson(req);
    const username = cleanText(b.username, 20).toLowerCase();
    const password = String(b.password || '');
    if (!USERNAME_RE.test(username)) throw httpError(400, '아이디는 영문 소문자·숫자·_ 조합 3~20자로 입력해 주세요. (첫 글자는 영문/숫자)');
    if (RESERVED.has(username)) throw httpError(400, '사용할 수 없는 아이디입니다.');
    if (getUser(username)) throw httpError(409, '이미 사용 중인 아이디입니다.');
    if (password.length < 8) throw httpError(400, '비밀번호는 8자 이상이어야 합니다.');
    const { salt, hash } = hashPassword(password);
    db.users[username] = {
      username, salt, passwordHash: hash,
      name: username, bio: '', avatar: null, links: [],
      createdAt: new Date().toISOString(),
    };
    createSession(res, username);
    save();
    return json(res, 201, { ok: true });
  }

  if (m === 'POST' && p === '/api/login') {
    const b = await readJson(req);
    const user = getUser(cleanText(b.username, 20).toLowerCase());
    if (!user || !verifyPassword(String(b.password || ''), user)) {
      throw httpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    createSession(res, user.username);
    save();
    return json(res, 200, { ok: true });
  }

  if (m === 'POST' && p === '/api/logout') {
    const sid = parseCookies(req).sid;
    if (sid && has(db.sessions, sid)) { delete db.sessions[sid]; save(); }
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  /* --- 이하 로그인 필요 --- */
  const user = currentUser(req);
  if (!user) throw httpError(401, '로그인이 필요합니다.');

  if (m === 'GET' && p === '/api/me') return json(res, 200, serializeMe(user));

  if (m === 'PUT' && p === '/api/me/profile') {
    const b = await readJson(req);
    user.name = cleanText(b.name, 40) || user.username;
    user.bio = cleanText(b.bio, 100);
    save();
    return json(res, 200, serializeMe(user));
  }

  if (m === 'POST' && p === '/api/me/avatar') {
    const b = await readJson(req, 3 * 1024 * 1024);
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
    if (!match) throw httpError(400, 'PNG, JPG, WEBP 이미지만 올릴 수 있어요.');
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > MAX_AVATAR_BYTES) throw httpError(413, '이미지 용량이 너무 큽니다. (최대 1.5MB)');
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filename = `${user.username}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
    removeAvatarFile(user);
    user.avatar = filename;
    save();
    return json(res, 200, serializeMe(user));
  }

  if (m === 'DELETE' && p === '/api/me/avatar') {
    removeAvatarFile(user);
    user.avatar = null;
    save();
    return json(res, 200, serializeMe(user));
  }

  if (m === 'POST' && p === '/api/me/links') {
    const b = await readJson(req);
    const { title, url } = validateLink(b);
    if (user.links.length >= MAX_LINKS) throw httpError(400, `링크는 최대 ${MAX_LINKS}개까지 등록할 수 있어요.`);
    user.links.push({ id: crypto.randomBytes(6).toString('hex'), title, url, clicks: 0, createdAt: new Date().toISOString() });
    save();
    return json(res, 201, serializeMe(user));
  }

  if (m === 'PUT' && p === '/api/me/links/order') {
    const b = await readJson(req);
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    const byId = new Map(user.links.map((l) => [l.id, l]));
    if (ids.length !== user.links.length || new Set(ids).size !== ids.length || !ids.every((id) => byId.has(id))) {
      throw httpError(400, '링크 순서 정보가 올바르지 않습니다.');
    }
    user.links = ids.map((id) => byId.get(id));
    save();
    return json(res, 200, serializeMe(user));
  }

  let mm;
  if ((mm = p.match(/^\/api\/me\/links\/([a-f0-9]+)$/))) {
    const idx = user.links.findIndex((l) => l.id === mm[1]);
    if (idx < 0) throw httpError(404, '링크를 찾을 수 없습니다.');
    if (m === 'PUT') {
      const b = await readJson(req);
      const { title, url } = validateLink(b);
      const link = user.links[idx]; // 주소가 바뀌어도 누적 클릭 수는 유지
      link.title = title;
      link.url = url;
      save();
      return json(res, 200, serializeMe(user));
    }
    if (m === 'DELETE') {
      user.links.splice(idx, 1);
      save();
      return json(res, 200, serializeMe(user));
    }
  }

  throw httpError(404, '지원하지 않는 요청입니다.');
}

function validateLink(b) {
  const title = cleanText(b.title, 60);
  const url = normalizeUrl(b.url);
  if (!title) throw httpError(400, '링크 이름을 입력해 주세요.');
  if (!url) throw httpError(400, '올바른 링크 주소(http/https)를 입력해 주세요.');
  return { title, url };
}

function removeAvatarFile(user) {
  if (!user.avatar) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(user.avatar)), () => {});
}

/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (e) {
    if (e.status) return json(res, e.status, { error: e.message });
    console.error(e);
    json(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
});

server.listen(PORT, () => {
  console.log(`🌳 링크나무 실행 중: http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}
