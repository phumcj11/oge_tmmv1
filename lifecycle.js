// Phase 1 (Foundation) API — Campaign lifecycle, approval, version lock, audit, region/area scoping.
// Registered from server.js:  require('./lifecycle')(app, db)   (after auth/role gates)
module.exports = function (app, db) {
  const now = () => new Date().toISOString();

  // ---------- audit ----------
  const auditStmt = db.prepare(`INSERT INTO audit_logs
    (entity,entity_id,action,field,old_value,new_value,reason,actor,approver,evidence_ref,at)
    VALUES (@entity,@entity_id,@action,@field,@old_value,@new_value,@reason,@actor,@approver,@evidence_ref,@at)`);
  function logAudit(o) {
    auditStmt.run({ field: '', old_value: '', new_value: '', reason: '', approver: '', evidence_ref: '', ...o, at: now() });
  }

  // ---------- role / capability ----------
  const SEES_ALL = ['admin', 'tmm', 'approver', 'accounting'];
  function requireRole(...roles) {
    return (req, res, next) => {
      if (req.user && (req.user.role === 'admin' || roles.includes(req.user.role))) return next();
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ (ต้องเป็น ' + roles.join(' / ') + ')' });
    };
  }
  // region scoping: scoped users see only campaigns/dealers in their regions; SEES_ALL see everything.
  function regionScopes(username) {
    return db.prepare("SELECT scope_value FROM user_scopes WHERE username=? AND scope_type='region'").all(username).map(r => r.scope_value);
  }
  // returns array of allowed regions, or null = ทั้งหมด
  function allowedRegions(user) {
    if (!user || SEES_ALL.includes(user.role)) return null;
    const s = regionScopes(user.username);
    return s.length ? s : null; // ยังไม่ได้ตั้ง scope = เห็นทั้งหมด (Phase 1 lenient)
  }

  // ---------- campaign state machine ----------
  const TRANSITIONS = {
    'Draft': ['Pending Readiness', 'Pending Approval', 'Cancelled'],
    'Pending Readiness': ['Pending Approval', 'Draft', 'On Hold', 'Cancelled'],
    'Pending Approval': ['Draft'], // Approved/Rejected ผ่าน /approve เท่านั้น
    'Approved': ['Locked', 'Change Requested'],
    'Approved with Conditions': ['Locked', 'Change Requested'],
    'Locked': ['Ready to Launch', 'Change Requested', 'On Hold'],
    'Ready to Launch': ['In Progress', 'On Hold'],
    'In Progress': ['Completed', 'On Hold'],
    'Completed': ['Under Review'],
    'Under Review': ['Closed', 'Change Requested'],
    'On Hold': ['Draft', 'Ready to Launch', 'In Progress', 'Cancelled'],
    'Change Requested': ['Draft'],
    'Rejected': ['Draft'],
    'Closed': [], 'Cancelled': [],
  };
  const EDITABLE = ['Draft', 'Pending Readiness', 'Change Requested'];

  const getCampaign = db.prepare('SELECT * FROM campaigns WHERE id=?');
  const getCur = db.prepare('SELECT * FROM campaign_versions WHERE campaign_id=? AND version=?');

  function nextCode() {
    const y = new Date().getFullYear();
    const n = db.prepare("SELECT COUNT(*) c FROM campaigns WHERE code LIKE ?").get('CMP-' + y + '-%').c + 1;
    return 'CMP-' + y + '-' + String(n).padStart(3, '0');
  }

  // ---------- list / get ----------
  app.get('/api/campaigns', (req, res) => {
    const regs = allowedRegions(req.user);
    let rows;
    if (regs) {
      const ph = regs.map(() => '?').join(',');
      rows = db.prepare(`SELECT * FROM campaigns WHERE region IN (${ph}) OR region='' ORDER BY id DESC`).all(...regs);
    } else {
      rows = db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all();
    }
    res.json(rows);
  });

  app.get('/api/campaigns/:id', (req, res) => {
    const c = getCampaign.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const versions = db.prepare('SELECT * FROM campaign_versions WHERE campaign_id=? ORDER BY version').all(c.id);
    const approvals = db.prepare('SELECT * FROM campaign_approvals WHERE campaign_id=? ORDER BY id').all(c.id);
    res.json({ ...c, versions, approvals });
  });

  // ---------- create (tmm) ----------
  const BRIEF = ['business', 'commercial', 'dealer_scope', 'readiness', 'financial', 'measurement'];
  const asJson = v => JSON.stringify(v && typeof v === 'object' ? v : {});
  app.post('/api/campaigns', requireRole('tmm'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'ต้องมีชื่อแคมเปญ (name)' });
    const code = b.code || nextCode();
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO campaigns
      (code,name,objective,campaign_type,product_scope,region,tier_scope,start_date,end_date,owner,plan_budget,current_version,work_status,approval_status,kpi,created_at,updated_at,created_by,updated_by)
      VALUES (@code,@name,@objective,@campaign_type,@product_scope,@region,@tier_scope,@start_date,@end_date,@owner,@plan_budget,1,'Draft','Pending',@kpi,@at,@at,@by,@by)`)
      .run({
        code, name: b.name, objective: b.objective || '', campaign_type: b.campaign_type || '',
        product_scope: b.product_scope || '', region: b.region || '', tier_scope: b.tier_scope || '',
        start_date: b.start_date || '', end_date: b.end_date || '', owner: b.owner || req.user.name || by,
        plan_budget: +b.plan_budget || 0, kpi: b.kpi || '', at: now(), by,
      });
    const cid = r.lastInsertRowid;
    db.prepare(`INSERT INTO campaign_versions
      (campaign_id,version,business,commercial,dealer_scope,readiness,financial,measurement,brief_status,created_at,updated_at,created_by,updated_by)
      VALUES (@cid,1,@business,@commercial,@dealer_scope,@readiness,@financial,@measurement,'Draft',@at,@at,@by,@by)`)
      .run({ cid, at: now(), by, ...Object.fromEntries(BRIEF.map(k => [k, asJson(b[k])])) });
    logAudit({ entity: 'campaign', entity_id: code, action: 'create', new_value: b.name, actor: by });
    res.json(getCampaign.get(cid));
  });

  // ---------- edit brief/campaign (tmm) — only when not locked ----------
  app.put('/api/campaigns/:id', requireRole('tmm'), (req, res) => {
    const c = getCampaign.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (!EDITABLE.includes(c.work_status))
      return res.status(409).json({ error: 'แคมเปญนี้ล็อก/อนุมัติแล้ว แก้ได้ต้องสร้าง Change Request (เวอร์ชันใหม่)' });
    const cur = getCur.get(c.id, c.current_version);
    if (cur && cur.locked)
      return res.status(409).json({ error: 'เวอร์ชันปัจจุบันถูกล็อก' });
    const b = req.body || {};
    const by = req.user.username;
    const fields = ['name', 'objective', 'campaign_type', 'product_scope', 'region', 'tier_scope', 'start_date', 'end_date', 'owner', 'kpi'];
    const set = [], vals = { id: c.id, at: now(), by };
    fields.forEach(f => { if (b[f] !== undefined) { set.push(f + '=@' + f); vals[f] = b[f]; } });
    if (b.plan_budget !== undefined) { set.push('plan_budget=@plan_budget'); vals.plan_budget = +b.plan_budget || 0; }
    if (set.length) db.prepare('UPDATE campaigns SET ' + set.join(',') + ', updated_at=@at, updated_by=@by WHERE id=@id').run(vals);
    // brief sections
    const bset = [], bvals = { cid: c.id, v: c.current_version, at: now(), by };
    BRIEF.forEach(k => { if (b[k] !== undefined) { bset.push(k + '=@' + k); bvals[k] = asJson(b[k]); } });
    if (b.brief_status !== undefined) { bset.push('brief_status=@brief_status'); bvals.brief_status = b.brief_status; }
    if (bset.length) db.prepare('UPDATE campaign_versions SET ' + bset.join(',') + ', updated_at=@at, updated_by=@by WHERE campaign_id=@cid AND version=@v').run(bvals);
    logAudit({ entity: 'campaign', entity_id: c.code, action: 'update', actor: by });
    res.json(getCampaign.get(c.id));
  });

  // ---------- generic transition (tmm; area_manager allowed for launch/progress) ----------
  app.post('/api/campaigns/:id/transition', (req, res) => {
    const c = getCampaign.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const to = (req.body || {}).to, reason = (req.body || {}).reason || '';
    const allowed = TRANSITIONS[c.work_status] || [];
    if (!allowed.includes(to)) return res.status(409).json({ error: `เปลี่ยนจาก "${c.work_status}" → "${to}" ไม่ได้ (อนุญาต: ${allowed.join(', ') || '—'})` });
    const role = req.user.role;
    const launchStates = ['Ready to Launch', 'In Progress'];
    const ok = role === 'admin' || role === 'tmm' || (launchStates.includes(to) && role === 'area_manager');
    if (!ok) return res.status(403).json({ error: 'ไม่มีสิทธิ์เปลี่ยนสถานะนี้' });
    db.prepare('UPDATE campaigns SET work_status=?, updated_at=?, updated_by=? WHERE id=?').run(to, now(), req.user.username, c.id);
    logAudit({ entity: 'campaign', entity_id: c.code, action: 'transition', field: 'work_status', old_value: c.work_status, new_value: to, reason, actor: req.user.username });
    res.json(getCampaign.get(c.id));
  });

  // ---------- approve / reject (approver) ----------
  app.post('/api/campaigns/:id/approve', requireRole('approver'), (req, res) => {
    const c = getCampaign.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (c.work_status !== 'Pending Approval')
      return res.status(409).json({ error: 'ต้องอยู่สถานะ Pending Approval ก่อนอนุมัติ' });
    const b = req.body || {};
    const decision = b.decision || 'Approved'; // Approved | Approved with Conditions | Rejected
    const by = req.user.username;
    const newStatus = decision === 'Rejected' ? 'Rejected' : (decision === 'Approved with Conditions' ? 'Approved with Conditions' : 'Approved');
    db.prepare(`INSERT INTO campaign_approvals (campaign_id,version,type,decision,conditions,approver,decided_at,doc_ref,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(c.id, c.current_version, b.type || 'campaign', decision, b.conditions || '', by, now(), b.doc_ref || '', now(), by);
    db.prepare('UPDATE campaigns SET work_status=?, approval_status=?, updated_at=?, updated_by=? WHERE id=?')
      .run(newStatus, decision, now(), by, c.id);
    logAudit({ entity: 'campaign', entity_id: c.code, action: 'approval', field: 'approval_status', old_value: c.approval_status, new_value: decision, reason: b.conditions || '', actor: by, approver: by });
    res.json(getCampaign.get(c.id));
  });

  // ---------- lock version (tmm) ----------
  app.post('/api/campaigns/:id/lock', requireRole('tmm'), (req, res) => {
    const c = getCampaign.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (!['Approved', 'Approved with Conditions'].includes(c.work_status))
      return res.status(409).json({ error: 'ต้องอนุมัติก่อนจึงล็อก Version ได้' });
    const by = req.user.username;
    db.prepare('UPDATE campaign_versions SET locked=1, locked_at=?, locked_by=?, updated_at=?, updated_by=? WHERE campaign_id=? AND version=?')
      .run(now(), by, now(), by, c.id, c.current_version);
    db.prepare('UPDATE campaigns SET work_status=? , updated_at=?, updated_by=? WHERE id=?').run('Locked', now(), by, c.id);
    logAudit({ entity: 'campaign', entity_id: c.code, action: 'lock', field: 'version', new_value: 'v' + c.current_version, actor: by });
    res.json(getCampaign.get(c.id));
  });

  // ---------- change request → new version (tmm) ----------
  app.post('/api/campaigns/:id/versions', requireRole('tmm'), (req, res) => {
    const c = getCampaign.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    if (!b.reason) return res.status(400).json({ error: 'ต้องระบุเหตุผลการเปลี่ยนแปลง (reason)' });
    const cur = getCur.get(c.id, c.current_version) || {};
    const nv = c.current_version + 1;
    const by = req.user.username;
    db.prepare(`INSERT INTO campaign_versions
      (campaign_id,version,business,commercial,dealer_scope,readiness,financial,measurement,brief_status,created_at,updated_at,created_by,updated_by)
      VALUES (@cid,@v,@business,@commercial,@dealer_scope,@readiness,@financial,@measurement,'Draft',@at,@at,@by,@by)`)
      .run({ cid: c.id, v: nv, at: now(), by,
        business: cur.business || '{}', commercial: cur.commercial || '{}', dealer_scope: cur.dealer_scope || '{}',
        readiness: cur.readiness || '{}', financial: cur.financial || '{}', measurement: cur.measurement || '{}' });
    db.prepare('UPDATE campaigns SET current_version=?, work_status=?, approval_status=?, updated_at=?, updated_by=? WHERE id=?')
      .run(nv, 'Draft', 'Pending', now(), by, c.id);
    logAudit({ entity: 'campaign', entity_id: c.code, action: 'change_request', field: 'version', old_value: 'v' + c.current_version, new_value: 'v' + nv, reason: b.reason, actor: by });
    res.json(getCampaign.get(c.id));
  });

  // ---------- audit log view (tmm/approver) ----------
  app.get('/api/audit-logs', requireRole('tmm', 'approver'), (req, res) => {
    const { entity, entity_id } = req.query;
    let sql = 'SELECT * FROM audit_logs', args = [], w = [];
    if (entity) { w.push('entity=?'); args.push(entity); }
    if (entity_id) { w.push('entity_id=?'); args.push(entity_id); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY id DESC LIMIT 500';
    res.json(db.prepare(sql).all(...args));
  });

  // ---------- regions / areas / user-scopes ----------
  app.get('/api/regions', (req, res) => res.json(db.prepare('SELECT * FROM regions ORDER BY code').all()));
  app.get('/api/areas', (req, res) => res.json(db.prepare('SELECT * FROM areas ORDER BY code').all()));
  app.post('/api/areas', requireRole('tmm'), (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.name) return res.status(400).json({ error: 'ต้องมี code และ name' });
    const by = req.user.username;
    db.prepare(`INSERT INTO areas (code,name,region,area_owner,created_at,updated_at,created_by,updated_by)
      VALUES (@code,@name,@region,@area_owner,@at,@at,@by,@by)
      ON CONFLICT(code) DO UPDATE SET name=@name, region=@region, area_owner=@area_owner, updated_at=@at, updated_by=@by`)
      .run({ code: b.code, name: b.name, region: b.region || '', area_owner: b.area_owner || '', at: now(), by });
    logAudit({ entity: 'area', entity_id: b.code, action: 'upsert', actor: by });
    res.json(db.prepare('SELECT * FROM areas WHERE code=?').get(b.code));
  });

  app.get('/api/user-scopes/:username', requireRole('tmm'), (req, res) =>
    res.json(db.prepare('SELECT * FROM user_scopes WHERE username=? ORDER BY id').all(req.params.username)));
  app.post('/api/user-scopes', requireRole('tmm'), (req, res) => {
    const b = req.body || {};
    if (!b.username || !b.scope_type || !b.scope_value) return res.status(400).json({ error: 'ต้องมี username, scope_type, scope_value' });
    if (!['region', 'area'].includes(b.scope_type)) return res.status(400).json({ error: 'scope_type ต้องเป็น region หรือ area' });
    db.prepare('INSERT OR IGNORE INTO user_scopes (username,scope_type,scope_value) VALUES (?,?,?)').run(b.username, b.scope_type, b.scope_value);
    logAudit({ entity: 'user_scope', entity_id: b.username, action: 'add', new_value: b.scope_type + ':' + b.scope_value, actor: req.user.username });
    res.json(db.prepare('SELECT * FROM user_scopes WHERE username=? ORDER BY id').all(b.username));
  });
  app.delete('/api/user-scopes/:id', requireRole('tmm'), (req, res) => {
    db.prepare('DELETE FROM user_scopes WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
};
