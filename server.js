// Ofero TMM system — Express API server
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

// ---------- file uploads ----------
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname).slice(0, 12)),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

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
  if (req.user || PUBLIC_PATHS.has(req.path) || req.path.startsWith('/img/')) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login.html');
});
// write-permission gate: viewer is read-only
app.use((req, res, next) => {
  if (req.user && ['POST', 'PUT', 'DELETE'].includes(req.method) && req.user.role === 'viewer')
    return res.status(403).json({ error: 'บัญชีนี้เป็นแบบดูอย่างเดียว (viewer) แก้ไขไม่ได้' });
  next();
});
// staff gate: field staff can only touch their own submission routes
const STAFF_WRITE_OK = [
  /^\/api\/logout$/, /^\/api\/password$/,
  /^\/api\/my\/events\/\d+\/submit$/,
  /^\/api\/events\/\d+\/attachments$/,   // upload — assignment verified in handler
  /^\/api\/attachments\/\d+$/,           // delete own — verified in handler
];
app.use((req, res, next) => {
  if (req.user && req.user.role === 'staff' && ['POST', 'PUT', 'DELETE'].includes(req.method)
      && !STAFF_WRITE_OK.some(rx => rx.test(req.path)))
    return res.status(403).json({ error: 'พนักงานหน้างานทำได้เฉพาะการส่งงานของตนเอง' });
  next();
});
// helpers for assignment checks
function eventAssignees(id) {
  const r = db.prepare('SELECT assignees FROM events WHERE id=?').get(id);
  return (r && r.assignees ? r.assignees : '').split(',').map(s => s.trim()).filter(Boolean);
}
function isAssigned(username, id) { return eventAssignees(id).includes(username); }
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ (admin)' });
  next();
}
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));  // protected (behind auth gate above)

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
  const cur = db.prepare('SELECT * FROM dealers WHERE code=?').get(req.params.code);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const lat = b.lat !== undefined ? (b.lat === null ? null : +b.lat) : cur.lat;
  const lon = b.lon !== undefined ? (b.lon === null ? null : +b.lon) : cur.lon;
  db.prepare('UPDATE dealers SET phone=?, line=?, tier=?, sales_rep=?, credit=?, lat=?, lon=? WHERE code=?')
    .run(b.phone ?? cur.phone, b.line ?? cur.line, b.tier ?? cur.tier,
         b.sales_rep ?? cur.sales_rep, b.credit ?? cur.credit, lat, lon, req.params.code);
  res.json(db.prepare('SELECT * FROM dealers WHERE code=?').get(req.params.code));
});
// Dealer 360° — aggregate everything about one dealer
app.get('/api/dealers/:code/360', (req, res) => {
  const code = req.params.code;
  const dealer = db.prepare('SELECT * FROM dealers WHERE code=?').get(code);
  if (!dealer) return res.status(404).json({ error: 'not found' });
  const soRows = db.prepare('SELECT * FROM sellout WHERE dealer_code=? ORDER BY ym DESC, model').all(code);
  const sellout = {
    sold: soRows.reduce((s, r) => s + (r.sold || 0), 0),
    stock: soRows.reduce((s, r) => s + (r.stock || 0), 0),
    byModel: Object.values(soRows.reduce((a, r) => {
      (a[r.model] = a[r.model] || { model: r.model, sold: 0, stock: 0 });
      a[r.model].sold += r.sold || 0; a[r.model].stock += r.stock || 0; return a;
    }, {})).sort((x, y) => y.sold - x.sold),
    recent: soRows.slice(0, 6),
  };
  const evRows = db.prepare('SELECT * FROM events WHERE dealer_code=? ORDER BY start_date DESC, id DESC').all(code)
    .map(r => { try { r.budget_lines = JSON.parse(r.budget_lines || '[]'); } catch (_) {} return r; });
  const today = new Date().toISOString().slice(0, 10);
  const events = {
    total: evRows.length,
    upcoming: evRows.filter(e => e.start_date && e.start_date >= today).length,
    list: evRows.slice(0, 8),
    tgt: { sellout: 0, lead: 0, test: 0, train: 0 }, act: { sellout: 0, lead: 0, test: 0, train: 0 },
  };
  evRows.forEach(e => {
    events.tgt.sellout += e.target_sellout || 0; events.tgt.lead += e.target_lead || 0;
    events.tgt.test += e.target_testride || 0; events.tgt.train += e.target_training || 0;
    events.act.sellout += e.sales_units || 0; events.act.lead += e.leads || 0;
    events.act.test += e.test_ride || 0; events.act.train += e.act_training || 0;
  });
  const auditRows = db.prepare('SELECT * FROM store_audit WHERE dealer_code=? ORDER BY ym DESC').all(code);
  let audit = null;
  if (auditRows.length) {
    const a = auditRows[0]; let cl = {}; try { cl = JSON.parse(a.checklist || '{}'); } catch (_) {}
    const passed = ['display','signage','clean','testride','staff','online','followup'].filter(k => cl[k]).length;
    audit = { ym: a.ym, readiness: Math.round(100 * passed / 7),
      conversion: a.lead > 0 ? Math.round(100 * a.sold / a.lead) : 0,
      lead: a.lead, test_ride: a.test_ride, quote: a.quote, sold: a.sold };
  }
  const collected = dealer.sellin || 0;
  const orderVal = collected + (dealer.outstanding || 0);
  res.json({ dealer, sellout, events, audit,
    finance: { sellin: collected, outstanding: dealer.outstanding || 0,
      collectPct: orderVal ? Math.round(100 * collected / orderVal) : 0 } });
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
const EVENT_FIELDS = ['dealer_code','dealer_name','province','week','event_date','phase','status','budget',
  'leads','sales_units','type','tier','test_ride','dept','activity_name','company','branch','customer_name',
  'customer_phone','start_date','end_date','duration_days','goal','owner','support_team','bank','bank_account',
  'budget_lines','stock_prep','action_plan','manpower','target_sellout','target_lead','target_testride','target_training','act_training',
  'assignees','prep','project_id'];
const EVENT_JSON = ['budget_lines', 'stock_prep', 'action_plan', 'manpower', 'prep'];
function eventRow(r) {
  if (!r) return r;
  EVENT_JSON.forEach(k => { try { r[k] = JSON.parse(r[k] || '[]'); } catch (_) { r[k] = []; } });
  return r;
}
function normEventBody(b, base = {}) {
  const out = {};
  for (const f of EVENT_FIELDS) {
    let v = (b[f] !== undefined) ? b[f] : base[f];
    if (f === 'project_id') { out[f] = (v === '' || v == null) ? null : (+v || null); continue; }
    if (EVENT_JSON.includes(f)) v = JSON.stringify(Array.isArray(v) ? v : (typeof v === 'string' ? (JSON.parse(v || '[]')) : []));
    out[f] = v ?? (EVENT_JSON.includes(f) ? '[]' : '');
  }
  // budget total from lines if provided
  const lines = JSON.parse(out.budget_lines || '[]');
  if (lines.length) out.budget = lines.reduce((s, l) => s + (+l.amount || 0), 0);
  return out;
}
// ---------- Projects (โครงการ/แคมเปญ ครอบ Event) ----------
const PROJECT_FIELDS = ['name', 'description', 'goal', 'owner', 'dealer_code', 'start_date', 'end_date', 'status', 'budget', 'color'];
function projectRollup(p, evs) {
  const es = evs.filter(e => e.project_id === p.id);
  const sum = k => es.reduce((s, e) => s + (+e[k] || 0), 0);
  return { ...p, events: es.length, done: es.filter(e => e.status === 'done').length,
    budget_used: sum('budget'),
    t_sellout: sum('target_sellout'), a_sellout: sum('sales_units'),
    t_lead: sum('target_lead'), a_lead: sum('leads'),
    t_test: sum('target_testride'), a_test: sum('test_ride'),
    t_train: sum('target_training'), a_train: sum('act_training') };
}
app.get('/api/projects', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY COALESCE(start_date,\'9999\'), id').all();
  const evs = db.prepare('SELECT * FROM events').all();
  res.json(projects.map(p => projectRollup(p, evs)));
});
app.get('/api/projects/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const evs = db.prepare('SELECT * FROM events').all();
  res.json({ ...projectRollup(p, evs), events_list: evs.filter(e => e.project_id === p.id).map(eventRow) });
});
app.post('/api/projects', (req, res) => {
  const b = req.body || {};
  const row = {}; PROJECT_FIELDS.forEach(f => row[f] = b[f] ?? (f === 'budget' ? 0 : f === 'status' ? 'active' : f === 'color' ? '#2E9E1E' : ''));
  const cols = PROJECT_FIELDS.join(','), vals = PROJECT_FIELDS.map(f => '@' + f).join(',');
  const r = db.prepare(`INSERT INTO projects (${cols},created_at) VALUES (${vals},@created_at)`).run({ ...row, created_at: new Date().toISOString() });
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/projects/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const row = {}; PROJECT_FIELDS.forEach(f => row[f] = b[f] !== undefined ? b[f] : cur[f]);
  db.prepare(`UPDATE projects SET ${PROJECT_FIELDS.map(f => `${f}=@${f}`).join(', ')} WHERE id=@id`).run({ ...row, id: cur.id });
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(cur.id));
});
app.delete('/api/projects/:id', (req, res) => {
  db.prepare('UPDATE events SET project_id=NULL WHERE project_id=?').run(req.params.id); // keep events, unlink
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
// bulk-assign events to a project (or unassign when project_id is null)
app.post('/api/projects/:id/events', (req, res) => {
  const pid = req.params.id === 'none' ? null : +req.params.id;
  if (pid !== null && !db.prepare('SELECT 1 FROM projects WHERE id=?').get(pid)) return res.status(404).json({ error: 'not found' });
  const ids = Array.isArray(req.body.event_ids) ? req.body.event_ids : [];
  const upd = db.prepare('UPDATE events SET project_id=? WHERE id=?');
  const tx = db.transaction(list => list.forEach(id => upd.run(pid, id)));
  tx(ids);
  res.json({ ok: true, updated: ids.length });
});
app.get('/api/events', (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY start_date DESC, week, id').all().map(eventRow));
});
// list of staff accounts, for TMM to assign work (admin/editor only)
app.get('/api/staff', (req, res) => {
  if (!['admin', 'editor'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  res.json(db.prepare("SELECT username,name FROM users WHERE role='staff' ORDER BY name").all());
});
// staff: only events assigned to me
app.get('/api/my/events', (req, res) => {
  const me = req.user.username;
  const rows = db.prepare('SELECT * FROM events ORDER BY start_date, week, id').all()
    .filter(e => (e.assignees || '').split(',').map(s => s.trim()).includes(me))
    .map(eventRow);
  res.json(rows);
});
// staff: submit progress on an assigned event (prep / status / actual results / note)
app.post('/api/my/events/:id/submit', (req, res) => {
  const id = req.params.id;
  const cur = db.prepare('SELECT * FROM events WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  if (req.user.role === 'staff' && !isAssigned(req.user.username, id))
    return res.status(403).json({ error: 'ไม่ได้รับมอบหมายงานนี้' });
  const b = req.body || {};
  const num = v => (v === undefined || v === null || v === '') ? undefined : (+v || 0);
  const fields = { status: b.status, prep: Array.isArray(b.prep) ? JSON.stringify(b.prep) : undefined,
    sales_units: num(b.sales_units), leads: num(b.leads), test_ride: num(b.test_ride),
    act_training: num(b.act_training) };
  const sets = [], vals = { id };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) { sets.push(`${k}=@${k}`); vals[k] = v; }
  if (sets.length) db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id=@id`).run(vals);
  res.json(eventRow(db.prepare('SELECT * FROM events WHERE id=?').get(id)));
});
app.get('/api/events/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(eventRow(r));
});
app.put('/api/events/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const row = normEventBody(req.body, cur);
  const sets = EVENT_FIELDS.map(f => `${f}=@${f}`).join(', ');
  db.prepare(`UPDATE events SET ${sets} WHERE id=@id`).run({ ...row, id: cur.id });
  res.json(eventRow(db.prepare('SELECT * FROM events WHERE id=?').get(cur.id)));
});
app.post('/api/events', (req, res) => {
  const nextId = (db.prepare('SELECT MAX(id) m FROM events').get().m || 0) + 1;
  const b = req.body || {};
  if (b.phase === undefined) b.phase = 'ขยายผล';
  if (b.status === undefined) b.status = 'planned';
  if (b.type === undefined) b.type = 'activation';
  if (b.duration_days === undefined) b.duration_days = 1;
  const row = normEventBody(b);
  const cols = EVENT_FIELDS.join(','), vals = EVENT_FIELDS.map(f => '@' + f).join(',');
  db.prepare(`INSERT INTO events (id,${cols}) VALUES (@id,${vals})`).run({ ...row, id: nextId });
  res.json(eventRow(db.prepare('SELECT * FROM events WHERE id=?').get(nextId)));
});
app.delete('/api/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  db.prepare('SELECT filename FROM attachments WHERE event_id=?').all(req.params.id)
    .forEach(a => { try { fs.unlinkSync(path.join(uploadsDir, a.filename)); } catch (_) {} });
  db.prepare('DELETE FROM attachments WHERE event_id=?').run(req.params.id);
  res.json({ ok: true });
});
// ---------- attachments (photos/files per event) ----------
app.get('/api/events/:id/attachments', (req, res) => {
  res.json(db.prepare('SELECT * FROM attachments WHERE event_id=? ORDER BY id DESC').all(req.params.id));
});
// photo/file counts + latest upload per event, for the team tracker
app.get('/api/attachments/counts', (req, res) => {
  res.json(db.prepare('SELECT event_id, COUNT(*) n, MAX(created_at) last, MAX(uploaded_by) who FROM attachments GROUP BY event_id').all());
});
app.post('/api/events/:id/attachments', upload.array('files', 9), (req, res) => {
  if (req.user.role === 'staff' && !isAssigned(req.user.username, req.params.id))
    return res.status(403).json({ error: 'ไม่ได้รับมอบหมายงานนี้' });
  const ins = db.prepare(`INSERT INTO attachments (event_id,filename,original,mime,size,uploaded_by,note,created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  (req.files || []).forEach(f => ins.run(req.params.id, f.filename, f.originalname, f.mimetype, f.size,
    req.user.name || req.user.username, req.body.note || '', now));
  res.json(db.prepare('SELECT * FROM attachments WHERE event_id=? ORDER BY id DESC').all(req.params.id));
});
app.delete('/api/attachments/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);
  if (a && req.user.role === 'staff'
      && !(isAssigned(req.user.username, a.event_id) && a.uploaded_by === (req.user.name || req.user.username)))
    return res.status(403).json({ error: 'ลบได้เฉพาะไฟล์ที่ตนอัปโหลดในงานที่ได้รับมอบหมาย' });
  if (a) { try { fs.unlinkSync(path.join(uploadsDir, a.filename)); } catch (_) {} db.prepare('DELETE FROM attachments WHERE id=?').run(req.params.id); }
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
  const { qty, condition, location, status, min_stock, unit_value, std_a, std_b } = req.body;
  const cur = db.prepare('SELECT * FROM posm WHERE code=?').get(req.params.code);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE posm SET qty=?, condition=?, location=?, status=?, min_stock=?, unit_value=?, std_a=?, std_b=? WHERE code=?')
    .run(qty ?? cur.qty, condition ?? cur.condition, location ?? cur.location, status ?? cur.status,
         min_stock ?? cur.min_stock, unit_value ?? cur.unit_value, std_a ?? cur.std_a, std_b ?? cur.std_b, req.params.code);
  res.json(posmRow(req.params.code));
});
app.post('/api/posm', (req, res) => {
  const b = req.body;
  db.prepare(`INSERT OR REPLACE INTO posm (code,name,type,qty,condition,location,status,min_stock,unit_value,std_a,std_b)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(b.code, b.name||'', b.type||'ใช้ซ้ำ', b.qty||0,
    b.condition||'ดี', b.location||'คลังกลาง', b.status||'available', b.min_stock||0, b.unit_value||0, b.std_a||0, b.std_b||0);
  res.json(posmRow(b.code));
});
// load the retail-plan standard POSM kit (Table 15 of the plan)
app.post('/api/posm/load-standard', requireAdmin, (req, res) => {
  const KIT = [
    ['ST-01','ป้ายหน้าร้าน / Logo','ใช้ซ้ำ',1,0], ['ST-02','ธงหน้าร้าน','ใช้ซ้ำ',4,2],
    ['ST-03','ป้ายโปรโมชั่นภายนอก','ใช้ซ้ำ',2,1], ['ST-04','ป้ายจุดทดลองขับ','ใช้ซ้ำ',1,0],
    ['ST-05','เต็นท์กิจกรรม','ใช้ซ้ำ',2,0], ['ST-06','โปสเตอร์ภาพรวมสินค้า 8 รุ่น','สิ้นเปลือง',2,1],
    ['ST-07','แผ่นพับสินค้า (ต่อรุ่น)','สิ้นเปลือง',30,15], ['ST-08','ฉากถ่ายภาพส่งมอบรถ','ใช้ซ้ำ',1,0],
  ];
  const up = db.prepare(`INSERT INTO posm (code,name,type,qty,condition,location,status,min_stock,unit_value,std_a,std_b)
    VALUES (?,?,?,0,'ดี','คลังกลาง','available',0,0,?,?)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name, std_a=excluded.std_a, std_b=excluded.std_b`);
  KIT.forEach(([code,name,type,a,b]) => up.run(code,name,type,a,b));
  res.json({ ok: true, added: KIT.length });
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
  if (!['admin', 'editor', 'viewer', 'staff'].includes(b.role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
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
  const role = ['admin', 'editor', 'viewer', 'staff'].includes(b.role) ? b.role : u.role;
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

// ---------- Sell-out & Stock ----------
app.get('/api/sellout', (req, res) => {
  const { month, dealer } = req.query;
  let sql = 'SELECT * FROM sellout WHERE 1=1', args = [];
  if (month) { sql += ' AND ym=?'; args.push(month); }
  if (dealer) { sql += ' AND dealer_code=?'; args.push(dealer); }
  sql += ' ORDER BY ym DESC, dealer_name, model';
  res.json(db.prepare(sql).all(...args));
});
app.get('/api/sellout/summary', (req, res) => {
  const month = req.query.month;
  const where = month ? 'WHERE ym=?' : '';
  const args = month ? [month] : [];
  const tot = db.prepare(`SELECT SUM(sold) sold, SUM(stock) stock, COUNT(DISTINCT dealer_code) dealers FROM sellout ${where}`).get(...args);
  const byModel = db.prepare(`SELECT model, SUM(sold) sold, SUM(stock) stock FROM sellout ${where} GROUP BY model ORDER BY sold DESC`).all(...args);
  const months = db.prepare('SELECT DISTINCT ym FROM sellout ORDER BY ym DESC').all().map(r => r.ym);
  const byMonth = db.prepare('SELECT ym, SUM(sold) sold FROM sellout GROUP BY ym ORDER BY ym').all();
  res.json({ tot, byModel, months, byMonth });
});
app.post('/api/sellout', (req, res) => {
  const b = req.body || {};
  if (!b.dealer_code || !b.ym || !b.model) return res.status(400).json({ error: 'ต้องมี dealer, เดือน, รุ่น' });
  const d = db.prepare('SELECT name FROM dealers WHERE code=?').get(b.dealer_code);
  db.prepare(`INSERT INTO sellout (dealer_code,dealer_name,ym,model,sold,stock,note,updated_at)
    VALUES (@dealer_code,@dealer_name,@ym,@model,@sold,@stock,@note,@updated_at)
    ON CONFLICT(dealer_code,ym,model) DO UPDATE SET sold=@sold, stock=@stock, note=@note, updated_at=@updated_at`)
    .run({ dealer_code: b.dealer_code, dealer_name: (d && d.name) || b.dealer_code, ym: b.ym, model: b.model,
      sold: +b.sold || 0, stock: +b.stock || 0, note: b.note || '', updated_at: new Date().toISOString() });
  res.json(db.prepare('SELECT * FROM sellout WHERE dealer_code=? AND ym=? AND model=?').get(b.dealer_code, b.ym, b.model));
});
app.delete('/api/sellout/:id', (req, res) => {
  db.prepare('DELETE FROM sellout WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Store Audit (มาตรฐานร้าน + funnel) ----------
// checklist keys aligned with the retail plan KPIs (Table 19)
const AUDIT_ITEMS = [
  { k: 'display', label: 'รถจัดแสดงตรงมาตรฐาน' },
  { k: 'signage', label: 'ป้ายข้อมูลครบถ้วน' },
  { k: 'clean', label: 'รถสะอาด พร้อมใช้งาน' },
  { k: 'testride', label: 'อนุญาตนั่ง/ทดลองขับ' },
  { k: 'staff', label: 'ผู้รับผิดชอบผ่านอบรม' },
  { k: 'online', label: 'ทำเนื้อหาออนไลน์ตามแผน' },
  { k: 'followup', label: 'ติดตามลูกค้าตรงเวลา' },
];
function auditRow(r) {
  if (!r) return r;
  let cl = {}; try { cl = JSON.parse(r.checklist || '{}'); } catch (_) {}
  const passed = AUDIT_ITEMS.filter(i => cl[i.k]).length;
  r.checklist = cl;
  r.readiness = Math.round(100 * passed / AUDIT_ITEMS.length);
  r.conversion = r.lead > 0 ? Math.round(100 * r.sold / r.lead) : 0;
  return r;
}
app.get('/api/audit/items', (req, res) => res.json(AUDIT_ITEMS));
app.get('/api/audit', (req, res) => {
  const { month } = req.query;
  const rows = (month
    ? db.prepare('SELECT * FROM store_audit WHERE ym=? ORDER BY tier, dealer_name').all(month)
    : db.prepare('SELECT * FROM store_audit ORDER BY ym DESC, tier, dealer_name').all());
  res.json(rows.map(auditRow));
});
app.get('/api/audit/summary', (req, res) => {
  const month = req.query.month;
  const where = month ? 'WHERE ym=?' : '';
  const args = month ? [month] : [];
  const rows = db.prepare(`SELECT * FROM store_audit ${where}`).all(...args).map(auditRow);
  const n = rows.length || 1;
  const avgReadiness = Math.round(rows.reduce((s, r) => s + r.readiness, 0) / n);
  const lead = rows.reduce((s, r) => s + (r.lead || 0), 0);
  const testRide = rows.reduce((s, r) => s + (r.test_ride || 0), 0);
  const quote = rows.reduce((s, r) => s + (r.quote || 0), 0);
  const sold = rows.reduce((s, r) => s + (r.sold || 0), 0);
  const byTier = ['A', 'B'].map(t => {
    const g = rows.filter(r => r.tier === t);
    return { tier: t, count: g.length, avgReadiness: g.length ? Math.round(g.reduce((s, r) => s + r.readiness, 0) / g.length) : 0 };
  });
  const months = db.prepare('SELECT DISTINCT ym FROM store_audit ORDER BY ym DESC').all().map(r => r.ym);
  res.json({ count: rows.length, avgReadiness, funnel: { lead, testRide, quote, sold },
    conversion: lead ? Math.round(100 * sold / lead) : 0, byTier, months });
});
app.post('/api/audit', (req, res) => {
  const b = req.body || {};
  if (!b.dealer_code || !b.ym) return res.status(400).json({ error: 'ต้องมี dealer และเดือน' });
  const d = db.prepare('SELECT name FROM dealers WHERE code=?').get(b.dealer_code);
  db.prepare(`INSERT INTO store_audit (dealer_code,dealer_name,ym,tier,checklist,lead,test_ride,quote,sold,note,updated_at)
    VALUES (@dealer_code,@dealer_name,@ym,@tier,@checklist,@lead,@test_ride,@quote,@sold,@note,@updated_at)
    ON CONFLICT(dealer_code,ym) DO UPDATE SET tier=@tier,checklist=@checklist,lead=@lead,test_ride=@test_ride,
      quote=@quote,sold=@sold,note=@note,updated_at=@updated_at`)
    .run({ dealer_code: b.dealer_code, dealer_name: (d && d.name) || b.dealer_code, ym: b.ym, tier: b.tier || 'B',
      checklist: JSON.stringify(b.checklist || {}), lead: +b.lead || 0, test_ride: +b.test_ride || 0,
      quote: +b.quote || 0, sold: +b.sold || 0, note: b.note || '', updated_at: new Date().toISOString() });
  // keep the dealer master tier in sync
  if (b.tier) db.prepare('UPDATE dealers SET tier=? WHERE code=?').run(b.tier, b.dealer_code);
  res.json(auditRow(db.prepare('SELECT * FROM store_audit WHERE dealer_code=? AND ym=?').get(b.dealer_code, b.ym)));
});
app.delete('/api/audit/:id', (req, res) => {
  db.prepare('DELETE FROM store_audit WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4173;
require('./import')(app, db);
app.listen(PORT, () => console.log(`Ofero TMM system running at http://localhost:${PORT}`));
