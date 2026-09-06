// Phase 3 API — Dealer Campaign Execution & Monitoring (SOP-004).
// Registered from server.js:  require('./execution')(app, db)
module.exports = function (app, db) {
  const now = () => new Date().toISOString();
  const auditStmt = db.prepare(`INSERT INTO audit_logs
    (entity,entity_id,action,field,old_value,new_value,reason,actor,approver,evidence_ref,at)
    VALUES (@entity,@entity_id,@action,@field,@old_value,@new_value,@reason,@actor,@approver,@evidence_ref,@at)`);
  const logAudit = o => auditStmt.run({ field: '', old_value: '', new_value: '', reason: '', approver: '', evidence_ref: '', ...o, at: now() });
  function requireRole(...roles) {
    return (req, res, next) => (req.user && (req.user.role === 'admin' || roles.includes(req.user.role)))
      ? next() : res.status(403).json({ error: 'ไม่มีสิทธิ์ (ต้องเป็น ' + roles.join(' / ') + ')' });
  }
  const execWrite = requireRole('tmm', 'area_manager', 'area_sales');
  const num = v => (v === '' || v == null) ? null : (+v || 0);

  // ================= Incidents (level / SLA / escalation) =================
  const SLA = { Critical: 15, High: 60, Medium: 240, Low: 1440 };
  const NOTIFY = { Critical: 'TMM, RGM, Aftersales', High: 'TMM, Approver', Medium: 'TMM', Low: 'TMM' };
  const minutesBetween = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 60000 * 10) / 10 : null;

  app.get('/api/execution/incidents', (req, res) => {
    const cid = req.query.campaign_id;
    const rows = cid ? db.prepare('SELECT * FROM incidents WHERE campaign_id=? ORDER BY id DESC').all(cid)
      : db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 500').all();
    res.json(rows);
  });
  app.post('/api/execution/incidents', execWrite, (req, res) => {
    const b = req.body || {};
    const level = ['Critical', 'High', 'Medium', 'Low'].includes(b.level) ? b.level : 'Low';
    if (!b.campaign_id || !b.description) return res.status(400).json({ error: 'ต้องมี campaign_id และรายละเอียด' });
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO incidents
      (campaign_id,dealer_code,reported_at,level,category,description,immediate_control,reporter,notified_to,sla_target_min,status,created_at,updated_at,created_by,updated_by)
      VALUES (@campaign_id,@dealer_code,@reported_at,@level,@category,@description,@immediate_control,@reporter,@notified_to,@sla,'Open',@at,@at,@by,@by)`)
      .run({ campaign_id: b.campaign_id, dealer_code: b.dealer_code || '', reported_at: b.reported_at || now(),
        level, category: b.category || '', description: b.description, immediate_control: b.immediate_control || '',
        reporter: b.reporter || req.user.name || by, notified_to: NOTIFY[level], sla: SLA[level], at: now(), by });
    logAudit({ entity: 'incident', entity_id: String(r.lastInsertRowid), action: 'create', new_value: level + ': ' + b.description, actor: by });
    res.json(db.prepare('SELECT * FROM incidents WHERE id=?').get(r.lastInsertRowid));
  });
  app.put('/api/execution/incidents/:id', execWrite, (req, res) => {
    const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(req.params.id);
    if (!inc) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const by = req.user.username;
    const decision_at = (b.status && b.status !== 'Open' && !inc.decision_at) ? now() : inc.decision_at;
    const response_min = decision_at ? minutesBetween(inc.reported_at, decision_at) : inc.response_min;
    const sla_status = response_min == null ? null : (response_min <= inc.sla_target_min ? 'Within SLA' : 'SLA Breached');
    db.prepare(`UPDATE incidents SET decision=@decision, owner=@owner, due_date=@due_date, status=@status,
      decision_at=@decision_at, response_min=@response_min, sla_status=@sla_status, updated_at=@at, updated_by=@by WHERE id=@id`)
      .run({ id: inc.id, decision: b.decision ?? inc.decision, owner: b.owner ?? inc.owner, due_date: b.due_date ?? inc.due_date,
        status: b.status ?? inc.status, decision_at, response_min, sla_status, at: now(), by });
    if (b.status && b.status !== inc.status)
      logAudit({ entity: 'incident', entity_id: String(inc.id), action: 'status', field: 'status', old_value: inc.status, new_value: b.status, reason: b.decision || '', actor: by });
    res.json(db.prepare('SELECT * FROM incidents WHERE id=?').get(inc.id));
  });

  // ================= Expenses (plan/committed/actual + approval ref + accounting gate) =================
  app.get('/api/execution/expenses', (req, res) => {
    const cid = req.query.campaign_id;
    res.json(cid ? db.prepare('SELECT * FROM expenses WHERE campaign_id=? ORDER BY id').all(cid)
      : db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 500').all());
  });
  app.post('/api/execution/expenses', execWrite, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id || !b.category) return res.status(400).json({ error: 'ต้องมี campaign_id และหมวดค่าใช้จ่าย' });
    const actual = num(b.actual);
    if (actual != null && actual > 0 && !b.approval_ref)
      return res.status(400).json({ error: 'ค่าใช้จ่ายจริงต้องอ้าง Approval ID (approval_ref) ก่อน' });
    const approved = num(b.approved_budget) || 0, committed = num(b.committed) || 0;
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO expenses
      (campaign_id,dealer_code,approval_ref,category,vendor,approved_budget,committed,actual,remaining,variance,doc_ref,accounting_status,owner,created_at,updated_at,created_by,updated_by)
      VALUES (@campaign_id,@dealer_code,@approval_ref,@category,@vendor,@approved_budget,@committed,@actual,@remaining,@variance,@doc_ref,'Pending',@owner,@at,@at,@by,@by)`)
      .run({ campaign_id: b.campaign_id, dealer_code: b.dealer_code || '', approval_ref: b.approval_ref || '',
        category: b.category, vendor: b.vendor || '', approved_budget: approved, committed, actual: actual,
        remaining: approved - committed, variance: actual == null ? null : actual - approved, doc_ref: b.doc_ref || '',
        owner: b.owner || by, at: now(), by });
    logAudit({ entity: 'expense', entity_id: String(r.lastInsertRowid), action: 'create', new_value: b.category, actor: by });
    res.json(db.prepare('SELECT * FROM expenses WHERE id=?').get(r.lastInsertRowid));
  });
  // accounting confirm
  app.put('/api/execution/expenses/:id/accounting', requireRole('accounting'), (req, res) => {
    const e = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
    if (!e) return res.status(404).json({ error: 'not found' });
    const st = (req.body || {}).accounting_status || 'Validated';
    db.prepare('UPDATE expenses SET accounting_status=?, updated_at=?, updated_by=? WHERE id=?').run(st, now(), req.user.username, e.id);
    logAudit({ entity: 'expense', entity_id: String(e.id), action: 'accounting', field: 'accounting_status', old_value: e.accounting_status, new_value: st, actor: req.user.username, approver: req.user.username });
    res.json(db.prepare('SELECT * FROM expenses WHERE id=?').get(e.id));
  });

  // ================= Live KPI =================
  app.get('/api/execution/live-kpi', (req, res) => {
    const cid = req.query.campaign_id;
    res.json(cid ? db.prepare('SELECT * FROM live_kpi WHERE campaign_id=? ORDER BY id DESC').all(cid)
      : db.prepare('SELECT * FROM live_kpi ORDER BY id DESC LIMIT 500').all());
  });
  app.post('/api/execution/live-kpi', execWrite, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id || !b.kpi) return res.status(400).json({ error: 'ต้องมี campaign_id และ KPI' });
    const target = num(b.target_pace), actual = num(b.actual);
    const ach = (target && target > 0 && actual != null) ? Math.round(actual / target * 1000) / 1000 : null;
    const pace = b.pace_status || (ach == null ? null : (ach >= 1 ? 'On Pace' : 'Below Pace'));
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO live_kpi (campaign_id,dealer_code,kpi_date,time_slot,kpi,target_pace,actual,achievement,pace_status,issue,corrective,owner,created_at,created_by)
      VALUES (@campaign_id,@dealer_code,@kpi_date,@time_slot,@kpi,@target_pace,@actual,@achievement,@pace_status,@issue,@corrective,@owner,@at,@by)`)
      .run({ campaign_id: b.campaign_id, dealer_code: b.dealer_code || '', kpi_date: b.kpi_date || now().slice(0, 10),
        time_slot: b.time_slot || '', kpi: b.kpi, target_pace: target, actual, achievement: ach, pace_status: pace,
        issue: b.issue || '', corrective: b.corrective || '', owner: b.owner || by, at: now(), by });
    res.json(db.prepare('SELECT * FROM live_kpi WHERE id=?').get(r.lastInsertRowid));
  });

  // ================= Opening Readiness (Go/Hold) =================
  const OGATES = ['staff', 'stock', 'posm', 'price', 'testride', 'data_capture'];
  app.get('/api/execution/opening', (req, res) =>
    res.json(db.prepare('SELECT * FROM opening_readiness WHERE campaign_id=? ORDER BY id DESC').all(req.query.campaign_id)));
  app.post('/api/execution/opening', execWrite, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id) return res.status(400).json({ error: 'ต้องมี campaign_id' });
    const g = {}; OGATES.forEach(k => { g[k] = ['Ready', 'Pending', 'Not Ready'].includes(b[k]) ? b[k] : 'Pending'; });
    const vals = Object.values(g);
    const overall = vals.includes('Not Ready') ? 'Not Ready' : vals.includes('Pending') ? 'Pending' : 'Ready';
    const decision = b.decision || (overall === 'Ready' ? 'Go' : 'Hold');
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO opening_readiness
      (campaign_id,version,dealer_code,activity_date,staff,stock,posm,price,testride,data_capture,overall_status,decision,exception_ref,checked_by,created_at,updated_at,created_by,updated_by)
      VALUES (@campaign_id,@version,@dealer_code,@activity_date,@staff,@stock,@posm,@price,@testride,@data_capture,@overall,@decision,@exception_ref,@by,@at,@at,@by,@by)`)
      .run({ campaign_id: b.campaign_id, version: b.version || 1, dealer_code: b.dealer_code || '', activity_date: b.activity_date || now().slice(0, 10),
        ...g, overall, decision, exception_ref: b.exception_ref || '', by, at: now() });
    logAudit({ entity: 'opening', entity_id: String(r.lastInsertRowid), action: 'check', new_value: decision, actor: by });
    res.json(db.prepare('SELECT * FROM opening_readiness WHERE id=?').get(r.lastInsertRowid));
  });

  // ================= Daily Close =================
  const CFLAGS = ['kpi_reconciled', 'lead_validated', 'stock_reconciled', 'expense_updated', 'evidence_complete'];
  app.get('/api/execution/daily-close', (req, res) =>
    res.json(db.prepare('SELECT * FROM daily_closes WHERE campaign_id=? ORDER BY activity_date DESC, id DESC').all(req.query.campaign_id)));
  app.post('/api/execution/daily-close', execWrite, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id || !b.dealer_code || !b.activity_date) return res.status(400).json({ error: 'ต้องมี campaign_id, dealer_code, activity_date' });
    const f = {}; CFLAGS.forEach(k => { f[k] = ['Yes', 'No', 'Pending', 'Not Applicable'].includes(b[k]) ? b[k] : 'No'; });
    const openIssues = +b.open_issue_count || 0;
    const overall = (CFLAGS.every(k => f[k] === 'Yes' || f[k] === 'Not Applicable') && openIssues === 0) ? 'Complete' : 'Pending';
    const by = req.user.username;
    db.prepare(`INSERT INTO daily_closes
      (campaign_id,version,dealer_code,activity_date,kpi_reconciled,lead_validated,stock_reconciled,expense_updated,evidence_complete,open_issue_count,overall_status,field_owner,tmm_review,handover_note,created_at,updated_at,created_by,updated_by)
      VALUES (@campaign_id,@version,@dealer_code,@activity_date,@kpi_reconciled,@lead_validated,@stock_reconciled,@expense_updated,@evidence_complete,@open,@overall,@field_owner,@tmm_review,@handover_note,@at,@at,@by,@by)
      ON CONFLICT(campaign_id,dealer_code,activity_date) DO UPDATE SET
        kpi_reconciled=@kpi_reconciled,lead_validated=@lead_validated,stock_reconciled=@stock_reconciled,expense_updated=@expense_updated,evidence_complete=@evidence_complete,
        open_issue_count=@open,overall_status=@overall,tmm_review=@tmm_review,handover_note=@handover_note,updated_at=@at,updated_by=@by`)
      .run({ campaign_id: b.campaign_id, version: b.version || 1, dealer_code: b.dealer_code, activity_date: b.activity_date,
        ...f, open: openIssues, overall, field_owner: b.field_owner || by, tmm_review: b.tmm_review || '', handover_note: b.handover_note || '', at: now(), by });
    res.json(db.prepare('SELECT * FROM daily_closes WHERE campaign_id=? AND dealer_code=? AND activity_date=?').get(b.campaign_id, b.dealer_code, b.activity_date));
  });
};
