// Phase 3 UI — Execution & Monitoring (SOP-004). Loaded after app.js.
(function () {
  const role = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || '';
  const canExec = () => ['tmm', 'area_manager', 'area_sales', 'admin'].includes(role());
  const canAcct = () => ['accounting', 'admin'].includes(role());
  const LVL_C = { Critical: '#c62828', High: '#ef6c00', Medium: '#b8860b', Low: '#78909c' };
  const OKC = { Go: '#2e7d32', Ready: '#2e7d32', Complete: '#2e7d32', 'On Pace': '#2e7d32', Hold: '#c62828', 'Not Ready': '#c62828', 'Below Pace': '#c62828', Pending: '#b8860b', Closed: '#2e7d32', Open: '#b8860b' };
  const col = (v, m) => `<span style="color:${(m || OKC)[v] || '#475467'};font-weight:600">${esc(v || '-')}</span>`;
  let curCid = '';

  window.renderExecution = async function () {
    const el = $('#execution');
    let camps = [];
    try { camps = await api('/api/campaigns'); } catch (_) {}
    if (!curCid && camps.length) curCid = String(camps[0].id);
    const c = camps.find(x => String(x.id) === String(curCid));
    el.innerHTML = `<div class="card"><div class="toolbar">
        <h2 style="margin:0">⚙️ Execution & Monitoring</h2>
        <select id="exCamp">${camps.length ? camps.map(x => `<option value="${x.id}"${String(x.id) === String(curCid) ? ' selected' : ''}>${esc(x.code)} · ${esc(x.name)} (${esc(x.work_status)})</option>`).join('') : '<option value="">— ยังไม่มีแคมเปญ —</option>'}</select>
      </div>${c ? '<div class="muted" style="font-size:12px">ภูมิภาค ' + esc(c.region || '-') + ' · สถานะ ' + esc(c.work_status) + '</div>' : '<div class="muted">สร้าง/เลือกแคมเปญก่อน (แท็บ Campaign)</div>'}</div>
      <div id="exBody"></div>`;
    $('#exCamp')?.addEventListener('change', e => { curCid = e.target.value; renderExecution(); });
    if (c) loadBody(c);
  };

  async function loadBody(c) {
    const cid = c.id;
    const [opening, kpi, inc, exp, close] = await Promise.all([
      api('/api/execution/opening?campaign_id=' + cid).catch(() => []),
      api('/api/execution/live-kpi?campaign_id=' + cid).catch(() => []),
      api('/api/execution/incidents?campaign_id=' + cid).catch(() => []),
      api('/api/execution/expenses?campaign_id=' + cid).catch(() => []),
      api('/api/execution/daily-close?campaign_id=' + cid).catch(() => []),
    ]);
    const addBtn = (id, label) => canExec() ? `<button class="btn ghost sm" id="${id}">➕ ${label}</button>` : '';
    const card = (title, btn, body) => `<div class="card"><div class="toolbar"><h2 style="margin:0;font-size:16px">${title}</h2><span class="spacer"></span>${btn}</div><div class="scroll">${body}</div></div>`;
    $('#exBody').innerHTML = `<div class="grid2">
      ${card('🚦 Opening Readiness', addBtn('exOpen', 'ตรวจเปิดร้าน'),
        `<table class="mini"><tr><th>วันที่</th><th>ร้าน</th><th>Overall</th><th>Decision</th></tr>${opening.length ? opening.map(o => `<tr><td>${esc(o.activity_date)}</td><td>${esc(o.dealer_code)}</td><td>${col(o.overall_status)}</td><td>${col(o.decision)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">—</td></tr>'}</table>`)}
      ${card('📈 Live KPI', addBtn('exKpi', 'บันทึก KPI'),
        `<table class="mini"><tr><th>KPI</th><th class="num">เป้า</th><th class="num">จริง</th><th class="num">%</th><th>Pace</th></tr>${kpi.length ? kpi.map(k => `<tr><td>${esc(k.kpi)}</td><td class="num">${k.target_pace ?? '-'}</td><td class="num">${k.actual ?? '-'}</td><td class="num">${k.achievement != null ? (k.achievement * 100).toFixed(0) + '%' : '-'}</td><td>${col(k.pace_status)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">—</td></tr>'}</table>`)}
    </div>
    ${card('🚨 Incidents', addBtn('exInc', 'แจ้งเหตุ'),
      `<table class="mini"><tr><th>Level</th><th>หมวด</th><th>รายละเอียด</th><th>SLA</th><th>สถานะ</th><th></th></tr>${inc.length ? inc.map(i => `<tr data-inc="${i.id}"><td>${col(i.level, LVL_C)}</td><td>${esc(i.category)}</td><td>${esc(i.description)}</td><td>${i.sla_status ? col(i.sla_status, { 'Within SLA': '#2e7d32', 'SLA Breached': '#c62828' }) : '≤' + i.sla_target_min + ' นาที'}</td><td>${col(i.status)}</td><td>${canExec() && i.status !== 'Closed' ? '<button class="btn sm ghost i-upd">จัดการ</button>' : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">—</td></tr>'}</table>`)}
    ${card('💰 Expenses', addBtn('exExp', 'ค่าใช้จ่าย'),
      `<table class="mini"><tr><th>หมวด</th><th>Vendor</th><th class="num">อนุมัติ</th><th class="num">จ่ายจริง</th><th class="num">Variance</th><th>บัญชี</th><th></th></tr>${exp.length ? exp.map(e => `<tr><td>${esc(e.category)}</td><td>${esc(e.vendor) || '-'}</td><td class="num">${(e.approved_budget || 0).toLocaleString()}</td><td class="num">${e.actual == null ? '-' : e.actual.toLocaleString()}</td><td class="num" style="color:${(e.variance || 0) > 0 ? '#c62828' : '#475467'}">${e.variance == null ? '-' : e.variance.toLocaleString()}</td><td>${col(e.accounting_status, { Validated: '#2e7d32', Pending: '#b8860b' })}</td><td>${canAcct() && e.accounting_status !== 'Validated' ? '<button class="btn sm ghost e-ok" data-id="' + e.id + '">ยืนยัน</button>' : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">—</td></tr>'}</table>`)}
    ${card('📋 Daily Close', addBtn('exClose', 'ปิดวัน'),
      `<table class="mini"><tr><th>วันที่</th><th>ร้าน</th><th class="num">Issue</th><th>Overall</th></tr>${close.length ? close.map(d => `<tr><td>${esc(d.activity_date)}</td><td>${esc(d.dealer_code)}</td><td class="num">${d.open_issue_count}</td><td>${col(d.overall_status)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">—</td></tr>'}</table>`)}`;

    $('#exOpen')?.addEventListener('click', () => formOpening(cid));
    $('#exKpi')?.addEventListener('click', () => formKpi(cid));
    $('#exInc')?.addEventListener('click', () => formIncident(cid));
    $('#exExp')?.addEventListener('click', () => formExpense(cid));
    $('#exClose')?.addEventListener('click', () => formClose(cid));
    $('#exBody').querySelectorAll('tr[data-inc] .i-upd').forEach(b => b.addEventListener('click', () => updIncident(inc.find(x => String(x.id) === b.closest('tr').dataset.inc))));
    $('#exBody').querySelectorAll('.e-ok').forEach(b => b.addEventListener('click', async () => {
      const r = await fetch('/api/execution/expenses/' + b.dataset.id + '/accounting', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"accounting_status":"Validated"}' });
      if (r.ok) { toast('ยืนยันบัญชีแล้ว'); renderExecution(); } else toast('ไม่สำเร็จ');
    }));
  }

  // ---- generic modal ----
  function modal(html) { const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = '<div class="modal">' + html + '</div>'; document.body.appendChild(bg); bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); }); return bg; }
  async function post(url, body, ok) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) { toast(d.error || 'ไม่สำเร็จ'); return false; } toast(ok); renderExecution(); return true; }

  function formIncident(cid) {
    const bg = modal(`<h3>🚨 แจ้งเหตุ (Incident)</h3>
      <label>ระดับ</label><select id="i-lvl"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option></select>
      <label>หมวด</label><input id="i-cat" placeholder="Safety / POSM / KPI ...">
      <label>รายละเอียด *</label><input id="i-desc">
      <label>ร้าน (dealer code)</label><input id="i-dealer">
      <label>การควบคุมทันที</label><input id="i-ctrl">
      <div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (!q('#i-desc').value) return toast('ต้องมีรายละเอียด'); if (await post('/api/execution/incidents', { campaign_id: +cid, level: q('#i-lvl').value, category: q('#i-cat').value, description: q('#i-desc').value, dealer_code: q('#i-dealer').value, immediate_control: q('#i-ctrl').value }, 'บันทึกเหตุแล้ว')) bg.remove(); };
  }
  function updIncident(i) {
    const bg = modal(`<h3>จัดการเหตุ #${i.id} (${esc(i.level)})</h3><div class="muted" style="font-size:12px">${esc(i.description)} · แจ้ง: ${esc(i.notified_to)}</div>
      <label>ผลการตัดสินใจ</label><input id="u-dec" value="${esc(i.decision || '')}">
      <label>ผู้รับผิดชอบ</label><input id="u-owner" value="${esc(i.owner || '')}">
      <label>กำหนดเสร็จ</label><input id="u-due" type="date" value="${esc(i.due_date || '')}">
      <label>สถานะ</label><select id="u-st"><option${i.status === 'Open' ? ' selected' : ''}>Open</option><option${i.status === 'In Progress' ? ' selected' : ''}>In Progress</option><option${i.status === 'Closed' ? ' selected' : ''}>Closed</option></select>
      <div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { const r = await fetch('/api/execution/incidents/' + i.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: q('#u-dec').value, owner: q('#u-owner').value, due_date: q('#u-due').value, status: q('#u-st').value }) }); const d = await r.json(); if (!r.ok) return toast(d.error); toast('อัปเดตแล้ว' + (d.sla_status ? ' · ' + d.sla_status : '')); bg.remove(); renderExecution(); };
  }
  function formExpense(cid) {
    const bg = modal(`<h3>💰 ค่าใช้จ่าย</h3>
      <label>หมวด *</label><input id="e-cat" placeholder="POSM / Activation ...">
      <label>Vendor</label><input id="e-vendor">
      <label>Approval ID (ต้องมีถ้ามีจ่ายจริง)</label><input id="e-apr">
      <label>งบอนุมัติ</label><input id="e-app" type="number" value="0">
      <label>ผูกพัน (committed)</label><input id="e-com" type="number" value="0">
      <label>จ่ายจริง (actual)</label><input id="e-act" type="number">
      <div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (!q('#e-cat').value) return toast('ต้องมีหมวด'); if (await post('/api/execution/expenses', { campaign_id: +cid, category: q('#e-cat').value, vendor: q('#e-vendor').value, approval_ref: q('#e-apr').value, approved_budget: q('#e-app').value, committed: q('#e-com').value, actual: q('#e-act').value }, 'บันทึกค่าใช้จ่าย')) bg.remove(); };
  }
  function formKpi(cid) {
    const bg = modal(`<h3>📈 บันทึก Live KPI</h3>
      <label>KPI *</label><input id="k-kpi" placeholder="Qualified leads / Test ride ...">
      <label>ช่วงเวลา</label><input id="k-slot" placeholder="10:00-13:00">
      <label>เป้า (target pace)</label><input id="k-tgt" type="number">
      <label>จริง (actual)</label><input id="k-act" type="number">
      <div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (!q('#k-kpi').value) return toast('ต้องมี KPI'); if (await post('/api/execution/live-kpi', { campaign_id: +cid, kpi: q('#k-kpi').value, time_slot: q('#k-slot').value, target_pace: q('#k-tgt').value, actual: q('#k-act').value }, 'บันทึก KPI')) bg.remove(); };
  }
  function formOpening(cid) {
    const G = [['staff', 'พนักงาน'], ['stock', 'สินค้า/Demo'], ['posm', 'POSM'], ['price', 'ราคา/Mechanic'], ['testride', 'Test Ride Safety'], ['data_capture', 'ระบบเก็บข้อมูล']];
    const bg = modal(`<h3>🚦 ตรวจความพร้อมก่อนเปิด</h3>
      <label>ร้าน (dealer code)</label><input id="o-dealer">
      ${G.map(g => `<label>${g[1]}</label><select id="o-${g[0]}"><option>Ready</option><option selected>Pending</option><option>Not Ready</option></select>`).join('')}
      <div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { const body = { campaign_id: +cid, dealer_code: q('#o-dealer').value }; G.forEach(g => body[g[0]] = q('#o-' + g[0]).value); if (await post('/api/execution/opening', body, 'บันทึกการตรวจ')) bg.remove(); };
  }
  function formClose(cid) {
    const F = [['kpi_reconciled', 'KPI'], ['lead_validated', 'Lead/Test'], ['stock_reconciled', 'Stock'], ['expense_updated', 'Expense'], ['evidence_complete', 'Evidence']];
    const bg = modal(`<h3>📋 ปิดยอดประจำวัน</h3>
      <label>ร้าน (dealer code) *</label><input id="d-dealer">
      <label>วันที่ *</label><input id="d-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
      ${F.map(f => `<label>${f[1]}</label><select id="d-${f[0]}"><option>Yes</option><option selected>No</option><option>Not Applicable</option></select>`).join('')}
      <label>Open Issues</label><input id="d-iss" type="number" value="0">
      <div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (!q('#d-dealer').value) return toast('ต้องมีร้าน'); const body = { campaign_id: +cid, dealer_code: q('#d-dealer').value, activity_date: q('#d-date').value, open_issue_count: +q('#d-iss').value || 0 }; F.forEach(f => body[f[0]] = q('#d-' + f[0]).value); if (await post('/api/execution/daily-close', body, 'ปิดวันแล้ว')) bg.remove(); };
  }
})();
