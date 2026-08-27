// Ofero TMM system — Express API server
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());

// ================= AUTH =================
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function verifyPw(pw, salt, hash) {
  const h = hashPw(pw, salt);
  return h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';')
    .map(c => c.trim().split('=')).filter(p => p[0]).map(p => [p[0], decodeURIComponent(p.slice(1).join('='))]));
}
// attach req.user from session cookie (non-blocking)
app.use((req, res, next) => {
  const token = parseCookies(req).sid;
  if (token) {
    const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
    if (s && s.expires > Date.now()) req.user = db.prepare('SELECT username,name,role FROM users WHERE username=?').get(s.username);
    else if (s) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  }
  next();
});
// public auth endpoints
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get((username || '').trim());
  if (!u || !verifyPw(password || '', u.salt, u.hash))
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token,username,expires) VALUES (?,?,?)').run(token, u.username, Date.now() + SESSION_TTL);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL });
  res.json({ username: u.username, name: u.name, role: u.role });
});
app.get('/api/me', (req, res) => req.user ? res.json(req.user) : res.status(401).json({ error: 'unauthorized' }));
app.post('/api/logout', (req, res) => {
  const token = parseCookies(req).sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.clearCookie('sid'); res.json({ ok: true });
});
// gate: block everything below unless authenticated (login page + assets stay public)
const PUBLIC_PATHS = new Set(['/login.html', '/login.js', '/styles.css', '/favicon.ico']);
app.use((req, res, next) => {
  if (req.user || PUBLIC_PATHS.has(req.path)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login.html');
});
// write-permission gate: viewer is read-only
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.user.role === 'viewer')
    return res.status(403).json({ error: 'บัญชีนี้เป็นแบบดูอย่างเดียว (viewer) แก้ไขไม่ได้' });
  next();
});
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ (admin)' });
  next();
}
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Overview / Dashboard ----------
app.get('/api/overview', (req, res) => {
  const tot = db.prepare(`SELECT
      SUM(sellin) sellin, SUM(retail) retail, SUM(profit) profit,
      SUM(units) units, SUM(outstanding) outstanding, SUM(po) po,
      SUM(CASE WHEN po>0 THEN 1 ELSE 0 END) active_dealers,
      COUNT(*) dealers FROM dealers`).get();
  const products = db.prepare('SELECT * FROM products ORDER BY sellin DESC').all();
  const topDealers = db.prepare('SELECT code,name,province,sellin,profit,po,outstanding FROM dealers WHERE po>0 ORDER BY sellin DESC LIMIT 10').all();
  const debtors = db.prepare('SELECT code,name,province,outstanding,sellin FROM dealers WHERE outstanding>0 ORDER BY outstanding DESC LIMIT 10').all();
  const region = JSON.parse((db.prepare("SELECT value FROM meta WHERE key='region_sellin'").get() || {}).value || '{}');
  const month = JSON.parse((db.prepare("SELECT value FROM meta WHERE key='month_sellin'").get() || {}).value || '{}');
  res.json({ tot, products, topDealers, debtors, region, month });
});

// ---------- Dealers ----------
app.get('/api/dealers', (req, res) => {
  res.json(db.prepare('SELECT * FROM dealers ORDER BY sellin DESC').all());
});
app.put('/api/dealers/:code', (req, res) => {
  const { phone, line, tier } = req.body;
  db.prepare('UPDATE dealers SET phone=?, line=?, tier=? WHERE code=?')
    .run(phone ?? '', line ?? '', tier ?? '', req.params.code);
  res.json(db.prepare('SELECT * FROM dealers WHERE code=?').get(req.params.code));
});
app.post('/api/dealers', (req, res) => {
  const b = req.body;
  if (!b.code || !b.name) return res.status(400).json({ error: 'code and name required' });
  if (db.prepare('SELECT 1 FROM dealers WHERE code=?').get(b.code))
    return res.status(409).json({ error: 'code exists' });
  db.prepare(`INSERT INTO dealers (code,name,tax,province,address,lat,lon,phone,line,tier,sellin,retail,profit,units,po,outstanding)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,0,0,0)`).run(b.code, b.name, b.tax||'', b.province||'', b.address||'',
    b.lat||null, b.lon||null, b.phone||'', b.line||'', b.tier||'');
  res.json(db.prepare('SELECT * FROM dealers WHERE code=?').get(b.code));
});
app.delete('/api/dealers/:code', (req, res) => {
  db.prepare('DELETE FROM dealers WHERE code=?').run(req.params.code);
  res.json({ ok: true });
});

// ---------- Products ----------
app.get('/api/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY sellin DESC').all());
});

// ---------- Events ----------
app.get('/api/events', (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY week, id').all());
});
app.put('/api/events/:id', (req, res) => {
  const { status, leads, sales_units, event_date } = req.body;
  const cur = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE events SET status=?, leads=?, sales_units=?, event_date=? WHERE id=?')
    .run(status ?? cur.status, leads ?? cur.leads, sales_units ?? cur.sales_units,
         event_date ?? cur.event_date, req.params.id);
  res.json(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id));
});
app.post('/api/events', (req, res) => {
  const b = req.body;
  const nextId = (db.prepare('SELECT MAX(id) m FROM events').get().m || 0) + 1;
  db.prepare(`INSERT INTO events (id,dealer_code,dealer_name,province,week,event_date,phase,status,budget,leads,sales_units)
    VALUES (?,?,?,?,?,?,?,?,?,0,0)`).run(nextId, b.dealer_code||'', b.dealer_name||'', b.province||'',
    b.week||0, b.event_date||'', b.phase||'ขยายผล', b.status||'planned', b.budget||20000);
  res.json(db.prepare('SELECT * FROM events WHERE id=?').get(nextId));
});
app.delete('/api/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- POSM ----------
const today = () => new Date().toISOString().slice(0, 10);
function posmRow(code) {
  const p = db.prepare('SELECT * FROM posm WHERE code=?').get(code);
  if (!p) return null;
  const open = db.prepare(`SELECT m.*, e.dealer_name FROM posm_moves m
    LEFT JOIN events e ON e.id=m.event_id
    WHERE m.posm_code=? AND m.date_back IS NULL ORDER BY m.id DESC LIMIT 1`).get(code);
  p.low = (p.min_stock > 0 && p.qty <= p.min_stock) ? 1 : 0;
  p.overdue = (open && open.due_date && open.due_date < today()) ? 1 : 0;
  p.open_move = open || null;
  return p;
}
app.get('/api/posm', (req, res) => {
  const rows = db.prepare('SELECT code FROM posm ORDER BY type DESC, code').all();
  res.json(rows.map(r => posmRow(r.code)));
});
app.get('/api/posm/alerts', (req, res) => {
  const low = db.prepare('SELECT code,name,qty,min_stock FROM posm WHERE min_stock>0 AND qty<=min_stock').all();
  const overdue = db.prepare(`SELECT m.posm_code, p.name, m.due_date, m.dest, e.dealer_name
    FROM posm_moves m JOIN posm p ON p.code=m.posm_code LEFT JOIN events e ON e.id=m.event_id
    WHERE m.date_back IS NULL AND m.due_date < ?`).all(today());
  res.json({ low, overdue });
});
app.get('/api/posm/:code/moves', (req, res) => {
  res.json(db.prepare(`SELECT m.*, e.dealer_name FROM posm_moves m
    LEFT JOIN events e ON e.id=m.event_id WHERE m.posm_code=? ORDER BY m.id DESC`).all(req.params.code));
});
app.post('/api/posm/:code/checkout', (req, res) => {
  const p = db.prepare('SELECT * FROM posm WHERE code=?').get(req.params.code);
  if (!p) return res.status(404).json({ error: 'not found' });
  const b = req.body;
  const ev = b.event_id ? db.prepare('SELECT * FROM events WHERE id=?').get(b.event_id) : null;
  const dest = b.dest || (ev ? `${ev.dealer_name} (${ev.province})` : '');
  db.prepare(`INSERT INTO posm_moves (posm_code,event_id,dest,qty,date_out,due_date,person,note)
    VALUES (?,?,?,?,?,?,?,?)`).run(p.code, b.event_id||null, dest, b.qty||1,
    today(), b.due_date||'', b.person||'', b.note||'');
  db.prepare('UPDATE posm SET status=?, location=? WHERE code=?').run('out', dest, p.code);
  res.json(posmRow(p.code));
});
app.post('/api/posm/:code/checkin', (req, res) => {
  const open = db.prepare('SELECT * FROM posm_moves WHERE posm_code=? AND date_back IS NULL ORDER BY id DESC LIMIT 1').get(req.params.code);
  if (open) db.prepare('UPDATE posm_moves SET date_back=?, note=COALESCE(NULLIF(?,\'\'),note) WHERE id=?')
    .run(today(), req.body.note||'', open.id);
  db.prepare('UPDATE posm SET status=?, location=? WHERE code=?').run('available', 'คลังกลาง', req.params.code);
  res.json(posmRow(req.params.code));
});
app.put('/api/posm/:code', (req, res) => {
  const { qty, condition, location, status, min_stock, unit_value } = req.body;
  const cur = db.prepare('SELECT * FROM posm WHERE code=?').get(req.params.code);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE posm SET qty=?, condition=?, location=?, status=?, min_stock=?, unit_value=? WHERE code=?')
    .run(qty ?? cur.qty, condition ?? cur.condition, location ?? cur.location, status ?? cur.status,
         min_stock ?? cur.min_stock, unit_value ?? cur.unit_value, req.params.code);
  res.json(posmRow(req.params.code));
});
app.post('/api/posm', (req, res) => {
  const b = req.body;
  db.prepare(`INSERT OR REPLACE INTO posm (code,name,type,qty,condition,location,status,min_stock,unit_value)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(b.code, b.name||'', b.type||'ใช้ซ้ำ', b.qty||0,
    b.condition||'ดี', b.location||'คลังกลาง', b.status||'available', b.min_stock||0, b.unit_value||0);
  res.json(posmRow(b.code));
});
app.delete('/api/posm/:code', (req, res) => {
  db.prepare('DELETE FROM posm WHERE code=?').run(req.params.code);
  db.prepare('DELETE FROM posm_moves WHERE posm_code=?').run(req.params.code);
  res.json({ ok: true });
});

// ---------- Users (admin only) ----------
app.get('/api/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT username,name,role,created_at FROM users ORDER BY created_at').all());
});
app.post('/api/users', requireAdmin, (req, res) => {
  const b = req.body || {};
  const username = (b.username || '').trim();
  if (!username || !b.password) return res.status(400).json({ error: 'ต้องมี username และรหัสผ่าน' });
  if (!['admin', 'editor', 'viewer'].includes(b.role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(409).json({ error: 'username นี้มีอยู่แล้ว' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (username,name,salt,hash,role,created_at) VALUES (?,?,?,?,?,?)')
    .run(username, b.name || username, salt, hashPw(b.password, salt), b.role, new Date().toISOString());
  res.json({ username, name: b.name || username, role: b.role });
});
app.put('/api/users/:username', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const b = req.body || {};
  const role = ['admin', 'editor', 'viewer'].includes(b.role) ? b.role : u.role;
  // don't allow removing the last admin
  if (u.role === 'admin' && role !== 'admin' &&
      db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c <= 1)
    return res.status(400).json({ error: 'ต้องมี admin อย่างน้อย 1 คน' });
  let salt = u.salt, hash = u.hash;
  if (b.password) { salt = crypto.randomBytes(16).toString('hex'); hash = hashPw(b.password, salt); }
  db.prepare('UPDATE users SET name=?, role=?, salt=?, hash=? WHERE username=?')
    .run(b.name ?? u.name, role, salt, hash, u.username);
  res.json({ username: u.username, name: b.name ?? u.name, role });
});
app.delete('/api/users/:username', requireAdmin, (req, res) => {
  if (req.params.username === req.user.username) return res.status(400).json({ error: 'ลบบัญชีตัวเองไม่ได้' });
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username);
  if (u && u.role === 'admin' && db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c <= 1)
    return res.status(400).json({ error: 'ต้องมี admin อย่างน้อย 1 คน' });
  db.prepare('DELETE FROM users WHERE username=?').run(req.params.username);
  db.prepare('DELETE FROM sessions WHERE username=?').run(req.params.username);
  res.json({ ok: true });
});
// change own password (any logged-in user)
app.post('/api/password', (req, res) => {
  const { current, next: newPw } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.user.username);
  if (!verifyPw(current || '', u.salt, u.hash)) return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  if (!newPw || newPw.length < 6) return res.status(400).json({ error: 'รหัสใหม่ต้องยาวอย่างน้อย 6 ตัว' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET salt=?, hash=? WHERE username=?').run(salt, hashPw(newPw, salt), u.username);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => console.log(`Ofero TMM system running at http://localhost:${PORT}`));
