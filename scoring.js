// Phase 2 API — Dealer Scoring/Tier (SOP-002) + Campaign Readiness Gate (SOP-003).
// Registered from server.js:  require('./scoring')(app, db)
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
  const SUBS = ['sales', 'market', 'growth', 'stock', 'execution', 'credit'];
  const activeRule = () => db.prepare("SELECT * FROM scoring_rules WHERE status='Active' ORDER BY id DESC LIMIT 1").get();

  function compute(s, rule) {
    const cut = (() => { try { return JSON.parse(rule.cutoffs); } catch (_) { return { A: 80, B: 65, C: 50 }; } })();
    const present = SUBS.filter(k => s[k] !== null && s[k] !== undefined && s[k] !== '');
    let total = null, suggested;
    if (s.critical_gate === 'Hold') suggested = 'Hold';
    else if (present.length < 6) suggested = 'Missing Data';
    else {
      total = SUBS.reduce((a, k) => a + (+s[k] || 0), 0);
      suggested = total >= cut.A ? 'A' : total >= cut.B ? 'B' : total >= cut.C ? 'C' : 'D';
    }
    const final = (s.override_tier && s.override_tier !== '') ? s.override_tier : suggested;
    return { total, suggested, final };
  }
  const numOrNull = v => (v === '' || v === null || v === undefined) ? null : (+v || 0);

  // ---------- scoring rules ----------
  app.get('/api/scoring/rules', (req, res) => res.json(db.prepare('SELECT * FROM scoring_rules ORDER BY id DESC').all()));

  // ---------- periods ----------
  app.get('/api/scoring/periods', (req, res) =>
    res.json(db.prepare('SELECT * FROM dealer_score_periods ORDER BY period DESC').all()));
  app.post('/api/scoring/periods', requireRole('tmm'), (req, res) => {
    const b = req.body || {};
    if (!b.period) return res.status(400).json({ error: 'ต้องระบุรอบ (period) เช่น 2026-Q4' });
    const rule = activeRule();
    try {
      db.prepare('INSERT INTO dealer_score_periods (period,rule_version,status,created_at,created_by) VALUES (?,?,?,?,?)')
        .run(b.period, rule ? rule.rule_version : 'v1', 'Open', now(), req.user.username);
    } catch (e) { return res.status(409).json({ error: 'รอบนี้มีอยู่แล้ว' }); }
    logAudit({ entity: 'score_period', entity_id: b.period, action: 'create', actor: req.user.username });
    res.json(db.prepare('SELECT * FROM dealer_score_periods WHERE period=?').get(b.period));
  });

  // ---------- scores in a period (join dealer) ----------
  app.get('/api/scoring/:period/scores', (req, res) => {
    const rows = db.prepare(`SELECT s.*, d.name AS dealer_name_master, d.province, d.region, d.tier AS current_tier
      FROM dealer_scores s LEFT JOIN dealers d ON d.code=s.dealer_code WHERE s.period=? ORDER BY (s.total IS NULL), s.total DESC`).all(req.params.period);
    res.json(rows);
  });

  // ---------- upsert a dealer score (tmm) — blocked if period Approved ----------
  app.post('/api/scoring/:period/scores', requireRole('tmm'), (req, res) => {
    const period = req.params.period;
    const p = db.prepare('SELECT * FROM dealer_score_periods WHERE period=?').get(period);
    if (!p) return res.status(404).json({ error: 'ไม่พบรอบประเมิน' });
    if (p.status === 'Approved') return res.status(409).json({ error: 'รอบนี้อนุมัติแล้ว (ล็อก) — สร้างรอบใหม่เพื่อประเมินใหม่' });
    const b = req.body || {};
    const code = String(b.dealer_code || '').trim();
    if (!code) return res.status(400).json({ error: 'ต้องมี dealer_code' });
    const d = db.prepare('SELECT name FROM dealers WHERE code=?').get(code);
    if (!d) return res.status(400).json({ error: 'ไม่พบ dealer: ' + code });
    const s = {};
    SUBS.forEach(k => { s[k] = numOrNull(b[k]); });
    s.critical_gate = b.critical_gate === 'Hold' ? 'Hold' : 'Pass';
    s.override_tier = b.override_tier || '';
    const rule = activeRule() || { cutoffs: '{"A":80,"B":65,"C":50}' };
    const { total, suggested, final } = compute(s, rule);
    const by = req.user.username;
    db.prepare(`INSERT INTO dealer_scores
      (period,dealer_code,dealer_name,sales,market,growth,stock,execution,credit,total,critical_gate,suggested_tier,override_tier,final_tier,approval_status,reason,created_at,updated_at,created_by,updated_by)
      VALUES (@period,@dealer_code,@dealer_name,@sales,@market,@growth,@stock,@execution,@credit,@total,@critical_gate,@suggested_tier,@override_tier,@final_tier,'Draft',@reason,@at,@at,@by,@by)
      ON CONFLICT(period,dealer_code) DO UPDATE SET
        sales=@sales,market=@market,growth=@growth,stock=@stock,execution=@execution,credit=@credit,
        total=@total,critical_gate=@critical_gate,suggested_tier=@suggested_tier,override_tier=@override_tier,final_tier=@final_tier,reason=@reason,updated_at=@at,updated_by=@by`)
      .run({ period, dealer_code: code, dealer_name: d.name, ...s, total, suggested_tier: suggested, final_tier: final,
        reason: b.reason || '', at: now(), by });
    res.json(db.prepare('SELECT * FROM dealer_scores WHERE period=? AND dealer_code=?').get(period, code));
  });

  // ---------- approve period (approver) — lock + sync final_tier -> dealers.tier + audit ----------
  app.post('/api/scoring/:period/approve', requireRole('approver'), (req, res) => {
    const period = req.params.period;
    const p = db.prepare('SELECT * FROM dealer_score_periods WHERE period=?').get(period);
    if (!p) return res.status(404).json({ error: 'ไม่พบรอบประเมิน' });
    if (p.status === 'Approved') return res.status(409).json({ error: 'รอบนี้อนุมัติแล้ว' });
    const by = req.user.username;
    const scores = db.prepare('SELECT * FROM dealer_scores WHERE period=?').all(period);
    let synced = 0;
    const tx = db.transaction(() => {
      for (const sc of scores) {
        db.prepare("UPDATE dealer_scores SET approval_status='Approved', updated_at=?, updated_by=? WHERE id=?").run(now(), by, sc.id);
        if (['A', 'B', 'C', 'D'].includes(sc.final_tier)) {
          const cur = db.prepare('SELECT tier FROM dealers WHERE code=?').get(sc.dealer_code);
          if (cur && cur.tier !== sc.final_tier) {
            db.prepare('UPDATE dealers SET tier=?, updated_by=? WHERE code=?').run(sc.final_tier, by, sc.dealer_code);
            logAudit({ entity: 'dealer', entity_id: sc.dealer_code, action: 'tier_change', field: 'tier', old_value: cur.tier || '', new_value: sc.final_tier, reason: 'scoring ' + period, actor: by, approver: by });
            synced++;
          }
        }
      }
      db.prepare("UPDATE dealer_score_periods SET status='Approved', approved_at=?, approved_by=? WHERE period=?").run(now(), by, period);
    });
    tx();
    logAudit({ entity: 'score_period', entity_id: period, action: 'approve', new_value: scores.length + ' scores', actor: by, approver: by });
    res.json({ ok: true, period, approved: scores.length, tier_synced: synced });
  });

  // ---------- tier override (approver) ----------
  app.post('/api/scoring/:period/override', requireRole('approver'), (req, res) => {
    const period = req.params.period;
    const b = req.body || {};
    const code = String(b.dealer_code || '').trim();
    if (!code || !b.new_tier || !b.reason) return res.status(400).json({ error: 'ต้องมี dealer_code, new_tier, reason' });
    const sc = db.prepare('SELECT * FROM dealer_scores WHERE period=? AND dealer_code=?').get(period, code);
    if (!sc) return res.status(404).json({ error: 'ยังไม่มีคะแนนของ dealer นี้ในรอบ' });
    const by = req.user.username;
    db.prepare(`INSERT INTO tier_overrides (dealer_code,period,old_tier,new_tier,reason,kpi_proof,approver,expiry,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(code, period, sc.final_tier || '', b.new_tier, b.reason, b.kpi_proof || '', by, b.expiry || '', now(), by);
    db.prepare('UPDATE dealer_scores SET override_tier=?, final_tier=?, updated_at=?, updated_by=? WHERE id=?').run(b.new_tier, b.new_tier, now(), by, sc.id);
    logAudit({ entity: 'dealer', entity_id: code, action: 'tier_override', field: 'tier', old_value: sc.final_tier || '', new_value: b.new_tier, reason: b.reason, actor: by, approver: by });
    res.json(db.prepare('SELECT * FROM dealer_scores WHERE id=?').get(sc.id));
  });

  // ================= Readiness Gate (SOP-003) =================
  const GATES = ['brief', 'dealer', 'budget', 'stock', 'posm', 'execution', 'risk'];
  function overall(r) {
    const v = GATES.map(g => r[g]);
    if (v.includes('Not Ready')) return 'Not Ready';
    if (v.includes('Pending')) return 'Pending';
    return 'Ready';
  }
  function ensureReadiness(cid, ver) {
    let r = db.prepare('SELECT * FROM readiness_checks WHERE campaign_id=? AND version=?').get(cid, ver);
    if (!r) {
      db.prepare('INSERT INTO readiness_checks (campaign_id,version,updated_at) VALUES (?,?,?)').run(cid, ver, now());
      r = db.prepare('SELECT * FROM readiness_checks WHERE campaign_id=? AND version=?').get(cid, ver);
    }
    return r;
  }
  app.get('/api/campaigns/:id/readiness', (req, res) => {
    const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json(ensureReadiness(c.id, c.current_version));
  });
  app.put('/api/campaigns/:id/readiness', requireRole('tmm'), (req, res) => {
    const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    ensureReadiness(c.id, c.current_version);
    const b = req.body || {};
    const set = [], vals = { cid: c.id, v: c.current_version, at: now(), by: req.user.username };
    GATES.forEach(g => { if (b[g] !== undefined) { set.push(g + '=@' + g); vals[g] = ['Ready', 'Pending', 'Not Ready'].includes(b[g]) ? b[g] : 'Pending'; } });
    if (b.exception_ref !== undefined) { set.push('exception_ref=@exception_ref'); vals.exception_ref = b.exception_ref; }
    if (set.length) db.prepare('UPDATE readiness_checks SET ' + set.join(',') + ', updated_at=@at, updated_by=@by WHERE campaign_id=@cid AND version=@v').run(vals);
    const r = ensureReadiness(c.id, c.current_version);
    const ov = overall(r);
    db.prepare('UPDATE readiness_checks SET overall_status=?, updated_at=? WHERE campaign_id=? AND version=?').run(ov, now(), c.id, c.current_version);
    logAudit({ entity: 'campaign', entity_id: c.code, action: 'readiness', field: 'overall', new_value: ov, actor: req.user.username });
    res.json({ ...r, overall_status: ov });
  });
};
