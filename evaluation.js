// Phase 4 API — Post Campaign Evaluation, ROI & Learning (SOP-005).
// Registered from server.js:  require('./evaluation')(app, db)
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
  const tmm = requireRole('tmm');
  const num = v => (v === '' || v == null) ? null : (isNaN(+v) ? null : +v);
  const rnd = (n, d = 4) => n == null ? null : Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

  // ================= ROI (incremental + Accounting gate + Not Calculated/Directional) =================
  function computeRoi(r, accountingValidated) {
    const b = num(r.baseline_units), a = num(r.actual_units), cpu = num(r.contribution_per_unit);
    const approved = num(r.approved_budget), spend = num(r.actual_spend);
    const inc_units = (b != null && a != null) ? a - b : null;
    const inc_contrib = (inc_units != null && cpu != null) ? inc_units * cpu : null;
    const budget_variance = (spend != null && approved != null) ? spend - approved : null;
    const net = (inc_contrib != null && spend != null) ? inc_contrib - spend : null;
    const computable = (net != null && spend != null && spend > 0);
    const roi = computable ? rnd(net / spend) : null;
    let roi_status = 'Not Calculated';
    if (computable) roi_status = accountingValidated ? 'Calculated' : 'Directional';
    return { inc_units, inc_contrib, budget_variance, net, roi, roi_status };
  }
  app.get('/api/evaluation/roi', (req, res) =>
    res.json(db.prepare('SELECT * FROM roi_calculations WHERE campaign_id=? ORDER BY id').all(req.query.campaign_id)));
  app.post('/api/evaluation/roi', tmm, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id) return res.status(400).json({ error: 'ต้องมี campaign_id' });
    const c = computeRoi(b, false);
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO roi_calculations
      (campaign_id,dealer_code,baseline_units,actual_units,incremental_units,contribution_per_unit,incremental_contribution,approved_budget,actual_spend,budget_variance,net_contribution,roi,accounting_status,roi_status,assumption,created_at,updated_at,created_by,updated_by)
      VALUES (@campaign_id,@dealer_code,@baseline,@actual,@inc_units,@cpu,@inc_contrib,@approved,@spend,@bvar,@net,@roi,'Pending',@roi_status,@assumption,@at,@at,@by,@by)`)
      .run({ campaign_id: b.campaign_id, dealer_code: b.dealer_code || '', baseline: num(b.baseline_units), actual: num(b.actual_units),
        inc_units: c.inc_units, cpu: num(b.contribution_per_unit), inc_contrib: c.inc_contrib, approved: num(b.approved_budget),
        spend: num(b.actual_spend), bvar: c.budget_variance, net: c.net, roi: c.roi, roi_status: c.roi_status,
        assumption: b.assumption || '', at: now(), by });
    logAudit({ entity: 'roi', entity_id: String(r.lastInsertRowid), action: 'create', new_value: c.roi_status, actor: by });
    res.json(db.prepare('SELECT * FROM roi_calculations WHERE id=?').get(r.lastInsertRowid));
  });
  app.put('/api/evaluation/roi/:id/accounting', requireRole('accounting'), (req, res) => {
    const r = db.prepare('SELECT * FROM roi_calculations WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    const st = (req.body || {}).accounting_status || 'Validated';
    const c = computeRoi(r, st === 'Validated');
    db.prepare('UPDATE roi_calculations SET accounting_status=?, roi_status=?, updated_at=?, updated_by=? WHERE id=?')
      .run(st, c.roi_status, now(), req.user.username, r.id);
    logAudit({ entity: 'roi', entity_id: String(r.id), action: 'accounting', field: 'accounting_status', old_value: r.accounting_status, new_value: st + ' / ' + c.roi_status, actor: req.user.username, approver: req.user.username });
    res.json(db.prepare('SELECT * FROM roi_calculations WHERE id=?').get(r.id));
  });

  // ================= Funnel (Missing != 0) =================
  app.get('/api/evaluation/funnel', (req, res) =>
    res.json(db.prepare('SELECT * FROM funnel_results WHERE campaign_id=? ORDER BY id').all(req.query.campaign_id)));
  app.post('/api/evaluation/funnel', tmm, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id) return res.status(400).json({ error: 'ต้องมี campaign_id' });
    const ff = num(b.footfall), ql = num(b.qualified_lead), tr = num(b.test_ride), sa = num(b.sale);
    const rate = (n, d) => (n != null && d != null && d > 0) ? rnd(n / d) : null;
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO funnel_results (campaign_id,dealer_code,footfall,qualified_lead,test_ride,sale,f2l,l2t,t2s,data_status,created_at,created_by)
      VALUES (@cid,@dc,@ff,@ql,@tr,@sa,@f2l,@l2t,@t2s,@ds,@at,@by)`)
      .run({ cid: b.campaign_id, dc: b.dealer_code || '', ff, ql, tr, sa, f2l: rate(ql, ff), l2t: rate(tr, ql), t2s: rate(sa, tr),
        ds: [ff, ql, tr, sa].some(x => x == null) ? 'Incomplete' : 'Validated', at: now(), by });
    res.json(db.prepare('SELECT * FROM funnel_results WHERE id=?').get(r.lastInsertRowid));
  });

  // ================= Dealer Comparison (multi-dim; Insufficient Data) =================
  app.get('/api/evaluation/comparison', (req, res) =>
    res.json(db.prepare('SELECT * FROM dealer_comparisons WHERE campaign_id=? ORDER BY (composite IS NULL), composite DESC').all(req.query.campaign_id)));
  app.post('/api/evaluation/comparison', tmm, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id || !b.dealer_code) return res.status(400).json({ error: 'ต้องมี campaign_id, dealer_code' });
    const m = ['kpi_achievement', 'funnel_score', 'evidence_complete', 'compliance_score'].map(k => num(b[k]));
    const complete = m.every(x => x != null);
    const composite = complete ? rnd(m.reduce((a, x) => a + x, 0) / m.length) : null;
    const rank = !complete ? 'Insufficient Data' : (composite >= 0.75 ? 'High' : composite >= 0.5 ? 'Medium' : 'Low');
    const by = req.user.username;
    db.prepare(`INSERT INTO dealer_comparisons (campaign_id,dealer_code,region,final_tier,kpi_achievement,funnel_score,evidence_complete,compliance_score,composite,rank_group,decision,created_at,created_by)
      VALUES (@cid,@dc,@region,@tier,@k,@f,@e,@c,@comp,@rank,@dec,@at,@by)
      ON CONFLICT(campaign_id,dealer_code) DO UPDATE SET region=@region,final_tier=@tier,kpi_achievement=@k,funnel_score=@f,evidence_complete=@e,compliance_score=@c,composite=@comp,rank_group=@rank,decision=@dec`)
      .run({ cid: b.campaign_id, dc: b.dealer_code, region: b.region || '', tier: b.final_tier || '',
        k: m[0], f: m[1], e: m[2], c: m[3], comp: composite, rank, dec: b.decision || '', at: now(), by });
    res.json(db.prepare('SELECT * FROM dealer_comparisons WHERE campaign_id=? AND dealer_code=?').get(b.campaign_id, b.dealer_code));
  });

  // ================= Review Minutes (decision) + approve =================
  const DECISIONS = ['Repeat', 'Revise', 'Stop', 'Test Further', 'Hold'];
  app.get('/api/evaluation/review', (req, res) =>
    res.json(db.prepare('SELECT * FROM review_minutes WHERE campaign_id=? ORDER BY id DESC').all(req.query.campaign_id)));
  app.post('/api/evaluation/review', tmm, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id || !DECISIONS.includes(b.decision)) return res.status(400).json({ error: 'ต้องมี campaign_id และ decision (' + DECISIONS.join('/') + ')' });
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO review_minutes (campaign_id,review_date,participants,kpi_conclusion,financial_conclusion,dealer_conclusion,key_risk,decision,approval_status,conditions,created_at,updated_at,created_by,updated_by)
      VALUES (@cid,@date,@part,@kc,@fc,@dc,@risk,@dec,'Pending',@cond,@at,@at,@by,@by)`)
      .run({ cid: b.campaign_id, date: b.review_date || now().slice(0, 10), part: b.participants || '', kc: b.kpi_conclusion || '',
        fc: b.financial_conclusion || '', dc: b.dealer_conclusion || '', risk: b.key_risk || '', dec: b.decision, cond: b.conditions || '', at: now(), by });
    logAudit({ entity: 'review', entity_id: String(r.lastInsertRowid), action: 'create', new_value: b.decision, actor: by });
    res.json(db.prepare('SELECT * FROM review_minutes WHERE id=?').get(r.lastInsertRowid));
  });
  app.put('/api/evaluation/review/:id/approve', requireRole('approver'), (req, res) => {
    const rv = db.prepare('SELECT * FROM review_minutes WHERE id=?').get(req.params.id);
    if (!rv) return res.status(404).json({ error: 'not found' });
    const st = (req.body || {}).approval_status || 'Approved';
    db.prepare('UPDATE review_minutes SET approval_status=?, approver=?, conditions=?, updated_at=?, updated_by=? WHERE id=?')
      .run(st, req.user.username, (req.body || {}).conditions || rv.conditions, now(), req.user.username, rv.id);
    logAudit({ entity: 'review', entity_id: String(rv.id), action: 'approve', field: 'decision', new_value: rv.decision + ' (' + st + ')', actor: req.user.username, approver: req.user.username });
    res.json(db.prepare('SELECT * FROM review_minutes WHERE id=?').get(rv.id));
  });

  // ================= Learning / Corrective Actions =================
  app.get('/api/evaluation/learning', (req, res) =>
    res.json(db.prepare('SELECT * FROM learning_actions WHERE campaign_id=? ORDER BY id DESC').all(req.query.campaign_id)));
  app.post('/api/evaluation/learning', tmm, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id || !b.action || !b.owner) return res.status(400).json({ error: 'ต้องมี campaign_id, action, owner' });
    const by = req.user.username;
    const r = db.prepare(`INSERT INTO learning_actions (campaign_id,finding,cause_status,recommendation,action,owner,due_date,status,success_measure,evidence_ref,escalation,created_at,updated_at,created_by,updated_by)
      VALUES (@cid,@find,@cause,@rec,@act,@owner,@due,'Open',@sm,@ev,@esc,@at,@at,@by,@by)`)
      .run({ cid: b.campaign_id, find: b.finding || '', cause: b.cause_status || 'Pending', rec: b.recommendation || '', act: b.action,
        owner: b.owner, due: b.due_date || '', sm: b.success_measure || '', ev: b.evidence_ref || '', esc: b.escalation || '', at: now(), by });
    res.json(db.prepare('SELECT * FROM learning_actions WHERE id=?').get(r.lastInsertRowid));
  });
  app.put('/api/evaluation/learning/:id', tmm, (req, res) => {
    const a = db.prepare('SELECT * FROM learning_actions WHERE id=?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const b = req.body || {}, by = req.user.username;
    const status = ['Open', 'In Progress', 'Blocked', 'Closed'].includes(b.status) ? b.status : a.status;
    db.prepare('UPDATE learning_actions SET status=?, owner=?, due_date=?, success_measure=?, evidence_ref=?, close_date=?, updated_at=?, updated_by=? WHERE id=?')
      .run(status, b.owner ?? a.owner, b.due_date ?? a.due_date, b.success_measure ?? a.success_measure, b.evidence_ref ?? a.evidence_ref,
        status === 'Closed' ? now().slice(0, 10) : a.close_date, now(), by, a.id);
    if (status !== a.status) logAudit({ entity: 'learning', entity_id: String(a.id), action: 'status', field: 'status', old_value: a.status, new_value: status, actor: by });
    res.json(db.prepare('SELECT * FROM learning_actions WHERE id=?').get(a.id));
  });

  // ================= Closure (gates -> Closed; sync campaign) =================
  const CGATES = ['data_validated', 'financial_validated', 'report_approved', 'actions_assigned', 'archive_complete', 'learning_shared'];
  app.get('/api/evaluation/closure', (req, res) => {
    const cid = req.query.campaign_id;
    let r = db.prepare('SELECT * FROM campaign_closures WHERE campaign_id=?').get(cid);
    if (!r) { db.prepare('INSERT INTO campaign_closures (campaign_id,created_at) VALUES (?,?)').run(cid, now()); r = db.prepare('SELECT * FROM campaign_closures WHERE campaign_id=?').get(cid); }
    res.json(r);
  });
  app.put('/api/evaluation/closure', tmm, (req, res) => {
    const b = req.body || {};
    if (!b.campaign_id) return res.status(400).json({ error: 'ต้องมี campaign_id' });
    let r = db.prepare('SELECT * FROM campaign_closures WHERE campaign_id=?').get(b.campaign_id);
    if (!r) { db.prepare('INSERT INTO campaign_closures (campaign_id,created_at) VALUES (?,?)').run(b.campaign_id, now()); r = db.prepare('SELECT * FROM campaign_closures WHERE campaign_id=?').get(b.campaign_id); }
    const by = req.user.username;
    const set = [], vals = { cid: b.campaign_id, at: now(), by };
    CGATES.forEach(g => { if (b[g] !== undefined) { set.push(g + '=@' + g); vals[g] = ['Yes', 'No'].includes(b[g]) ? b[g] : 'No'; } });
    if (set.length) db.prepare('UPDATE campaign_closures SET ' + set.join(',') + ', updated_at=@at, updated_by=@by WHERE campaign_id=@cid').run(vals);
    r = db.prepare('SELECT * FROM campaign_closures WHERE campaign_id=?').get(b.campaign_id);
    const closed = CGATES.every(g => r[g] === 'Yes');
    const overall = closed ? 'Closed' : 'Pending';
    db.prepare('UPDATE campaign_closures SET overall_status=?, closed_by=?, close_date=?, updated_at=? WHERE campaign_id=?')
      .run(overall, closed ? by : '', closed ? now().slice(0, 10) : '', now(), b.campaign_id);
    if (closed) {
      const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(b.campaign_id);
      if (c && c.work_status !== 'Closed') {
        db.prepare("UPDATE campaigns SET work_status='Closed', updated_at=?, updated_by=? WHERE id=?").run(now(), by, c.id);
        logAudit({ entity: 'campaign', entity_id: c.code, action: 'closure', field: 'work_status', old_value: c.work_status, new_value: 'Closed', actor: by });
      }
    }
    res.json({ ...r, overall_status: overall });
  });
};
