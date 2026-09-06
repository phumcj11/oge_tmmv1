// Phase 4 UI — Post-Campaign Evaluation, ROI & Learning (SOP-005). Loaded after app.js.
(function () {
  const role = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || '';
  const canEval = () => ['tmm', 'admin'].includes(role());
  const canAcct = () => ['accounting', 'admin'].includes(role());
  const canApr = () => ['approver', 'admin'].includes(role());
  const C = { Calculated: '#2e7d32', Directional: '#b8860b', 'Not Calculated': '#c62828', Validated: '#2e7d32', Pending: '#b8860b', High: '#2e7d32', Medium: '#b8860b', Low: '#78909c', 'Insufficient Data': '#c62828', Closed: '#2e7d32', Approved: '#2e7d32', Incomplete: '#c62828' };
  const col = v => `<span style="color:${C[v] || '#475467'};font-weight:600">${esc(v || '-')}</span>`;
  const n = (v, d) => v == null ? '-' : (d ? (+v).toLocaleString() : v);
  let cid = '';

  window.renderEvaluation = async function () {
    const el = $('#evaluation');
    let camps = []; try { camps = await api('/api/campaigns'); } catch (_) {}
    if (!cid && camps.length) cid = String(camps[0].id);
    const c = camps.find(x => String(x.id) === String(cid));
    el.innerHTML = `<div class="card"><div class="toolbar"><h2 style="margin:0">📈 Post-Campaign Evaluation</h2>
      <select id="evCamp">${camps.length ? camps.map(x => `<option value="${x.id}"${String(x.id) === String(cid) ? ' selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`).join('') : '<option value="">— ยังไม่มีแคมเปญ —</option>'}</select>
      </div>${c ? '' : '<div class="muted">สร้าง/เลือกแคมเปญก่อน</div>'}</div><div id="evBody"></div>`;
    $('#evCamp')?.addEventListener('change', e => { cid = e.target.value; renderEvaluation(); });
    if (c) body(c.id);
  };

  async function body(id) {
    const [roi, funnel, cmp, review, learn, closure] = await Promise.all([
      api('/api/evaluation/roi?campaign_id=' + id).catch(() => []),
      api('/api/evaluation/funnel?campaign_id=' + id).catch(() => []),
      api('/api/evaluation/comparison?campaign_id=' + id).catch(() => []),
      api('/api/evaluation/review?campaign_id=' + id).catch(() => []),
      api('/api/evaluation/learning?campaign_id=' + id).catch(() => []),
      api('/api/evaluation/closure?campaign_id=' + id).catch(() => ({})),
    ]);
    const add = (i, l) => canEval() ? `<button class="btn ghost sm" id="${i}">➕ ${l}</button>` : '';
    const card = (t, b, body) => `<div class="card"><div class="toolbar"><h2 style="margin:0;font-size:16px">${t}</h2><span class="spacer"></span>${b}</div><div class="scroll">${body}</div></div>`;
    $('#evBody').innerHTML =
      card('💵 ROI', add('evRoi', 'คำนวณ ROI'),
        `<table class="mini"><tr><th>ร้าน</th><th class="num">Inc.Units</th><th class="num">Net</th><th class="num">ROI</th><th>สถานะ</th><th>บัญชี</th><th></th></tr>${roi.length ? roi.map(r => `<tr><td>${esc(r.dealer_code) || 'รวม'}</td><td class="num">${n(r.incremental_units)}</td><td class="num">${n(r.net_contribution, 1)}</td><td class="num">${r.roi == null ? '-' : (r.roi * 100).toFixed(1) + '%'}</td><td>${col(r.roi_status)}</td><td>${col(r.accounting_status)}</td><td>${canAcct() && r.accounting_status !== 'Validated' ? '<button class="btn sm ghost r-ok" data-id="' + r.id + '">ยืนยัน</button>' : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">—</td></tr>'}</table>`) +
      `<div class="grid2">` +
      card('🔻 Funnel', add('evFun', 'Funnel'),
        `<table class="mini"><tr><th class="num">Footfall</th><th class="num">Lead</th><th class="num">Test</th><th class="num">Sale</th><th>สถานะ</th></tr>${funnel.length ? funnel.map(f => `<tr><td class="num">${n(f.footfall)}</td><td class="num">${n(f.qualified_lead)}</td><td class="num">${n(f.test_ride)}</td><td class="num">${n(f.sale)}</td><td>${col(f.data_status)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">—</td></tr>'}</table>`) +
      card('⚖️ Dealer Comparison', add('evCmp', 'เทียบร้าน'),
        `<table class="mini"><tr><th>ร้าน</th><th class="num">Composite</th><th>กลุ่ม</th></tr>${cmp.length ? cmp.map(x => `<tr><td>${esc(x.dealer_code)}</td><td class="num">${x.composite == null ? '-' : (x.composite * 100).toFixed(0) + '%'}</td><td>${col(x.rank_group)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">—</td></tr>'}</table>`) +
      `</div>` +
      card('📝 Review & Decision', add('evRev', 'บันทึกรีวิว'),
        `<table class="mini"><tr><th>วันที่</th><th>Decision</th><th>อนุมัติ</th><th></th></tr>${review.length ? review.map(r => `<tr><td>${esc(r.review_date)}</td><td>${col(r.decision)}</td><td>${col(r.approval_status)}</td><td>${canApr() && r.approval_status !== 'Approved' ? '<button class="btn sm ghost rv-ok" data-id="' + r.id + '">อนุมัติ</button>' : ''}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">—</td></tr>'}</table>`) +
      card('🛠️ Corrective Actions', add('evLrn', 'เพิ่ม Action'),
        `<table class="mini"><tr><th>Action</th><th>Owner</th><th>กำหนด</th><th>สถานะ</th><th></th></tr>${learn.length ? learn.map(a => `<tr><td>${esc(a.action)}</td><td>${esc(a.owner)}</td><td>${esc(a.due_date) || '-'}</td><td>${col(a.status)}</td><td>${canEval() && a.status !== 'Closed' ? '<button class="btn sm ghost l-upd" data-id="' + a.id + '">จัดการ</button>' : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">—</td></tr>'}</table>`) +
      closureCard(id, closure);
    $('#evRoi')?.addEventListener('click', () => formRoi(id));
    $('#evFun')?.addEventListener('click', () => formFunnel(id));
    $('#evCmp')?.addEventListener('click', () => formCmp(id));
    $('#evRev')?.addEventListener('click', () => formReview(id));
    $('#evLrn')?.addEventListener('click', () => formLearn(id));
    $('#evBody').querySelectorAll('.r-ok').forEach(b => b.addEventListener('click', () => confirmPut('/api/evaluation/roi/' + b.dataset.id + '/accounting', '{"accounting_status":"Validated"}', 'ยืนยันบัญชี ROI แล้ว')));
    $('#evBody').querySelectorAll('.rv-ok').forEach(b => b.addEventListener('click', () => confirmPut('/api/evaluation/review/' + b.dataset.id + '/approve', '{"approval_status":"Approved"}', 'อนุมัติรีวิวแล้ว')));
    $('#evBody').querySelectorAll('.l-upd').forEach(b => b.addEventListener('click', () => updLearn(learn.find(x => String(x.id) === b.dataset.id))));
    wireClosure(id);
  }

  function closureCard(id, cl) {
    const G = [['data_validated', 'Data'], ['financial_validated', 'Financial'], ['report_approved', 'Report'], ['actions_assigned', 'Actions'], ['archive_complete', 'Archive'], ['learning_shared', 'Learning']];
    return `<div class="card"><div class="toolbar"><h2 style="margin:0;font-size:16px">🏁 Campaign Closure</h2><span class="spacer"></span><b id="cl-ov" style="color:${C[cl.overall_status] || '#b8860b'}">${esc(cl.overall_status || 'Pending')}</b></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px">${G.map(g => `<label class="chk"><input type="checkbox" data-gate="${g[0]}" ${cl[g[0]] === 'Yes' ? 'checked' : ''} ${canEval() ? '' : 'disabled'}> ${g[1]}</label>`).join('')}</div></div>`;
  }
  function wireClosure(id) {
    $('#evBody').querySelectorAll('input[data-gate]').forEach(ch => ch.addEventListener('change', async () => {
      const body = { campaign_id: +id }; body[ch.dataset.gate] = ch.checked ? 'Yes' : 'No';
      const r = await fetch('/api/evaluation/closure', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) return toast(d.error || 'error');
      const ov = $('#cl-ov'); if (ov) { ov.textContent = d.overall_status; ov.style.color = C[d.overall_status] || '#b8860b'; }
      toast('Closure: ' + d.overall_status); if (d.overall_status === 'Closed') setTimeout(renderEvaluation, 400);
    }));
  }

  async function confirmPut(url, body, ok) { const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }); if (r.ok) { toast(ok); renderEvaluation(); } else toast('ไม่สำเร็จ'); }
  function modal(h) { const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = '<div class="modal">' + h + '</div>'; document.body.appendChild(bg); bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); }); return bg; }
  async function post(url, b, ok) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const d = await r.json(); if (!r.ok) { toast(d.error || 'ไม่สำเร็จ'); return false; } toast(ok); renderEvaluation(); return true; }

  function fld(id, label, type) { return `<label>${label}</label><input id="${id}" ${type ? 'type="' + type + '"' : ''}>`; }
  function formRoi(id) {
    const bg = modal(`<h3>💵 คำนวณ ROI</h3>${fld('ro-dc', 'ร้าน (เว้นว่าง=รวม)')}${fld('ro-bl', 'Baseline units', 'number')}${fld('ro-au', 'Actual units', 'number')}${fld('ro-cpu', 'Contribution/unit', 'number')}${fld('ro-ab', 'Approved budget', 'number')}${fld('ro-sp', 'Actual spend', 'number')}${fld('ro-as', 'Assumption/ข้อจำกัด')}<div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">คำนวณ</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (await post('/api/evaluation/roi', { campaign_id: +id, dealer_code: q('#ro-dc').value, baseline_units: q('#ro-bl').value, actual_units: q('#ro-au').value, contribution_per_unit: q('#ro-cpu').value, approved_budget: q('#ro-ab').value, actual_spend: q('#ro-sp').value, assumption: q('#ro-as').value }, 'คำนวณ ROI แล้ว')) bg.remove(); };
  }
  function formFunnel(id) {
    const bg = modal(`<h3>🔻 Funnel</h3>${fld('fn-dc', 'ร้าน')}${fld('fn-ff', 'Footfall', 'number')}${fld('fn-ql', 'Qualified Lead', 'number')}${fld('fn-tr', 'Test Ride', 'number')}${fld('fn-sa', 'Sale', 'number')}<div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (await post('/api/evaluation/funnel', { campaign_id: +id, dealer_code: q('#fn-dc').value, footfall: q('#fn-ff').value, qualified_lead: q('#fn-ql').value, test_ride: q('#fn-tr').value, sale: q('#fn-sa').value }, 'บันทึก Funnel')) bg.remove(); };
  }
  function formCmp(id) {
    const bg = modal(`<h3>⚖️ เทียบร้าน (หลายมิติ)</h3>${fld('cp-dc', 'ร้าน *')}${fld('cp-k', 'KPI Achievement 0-1', 'number')}${fld('cp-f', 'Funnel score 0-1', 'number')}${fld('cp-e', 'Evidence complete 0-1', 'number')}${fld('cp-c', 'Compliance 0-1', 'number')}<div class="muted" style="font-size:12px;margin-top:6px">ขาดมิติใด = Insufficient Data (ไม่จัดอันดับ)</div><div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (!q('#cp-dc').value) return toast('ต้องมีร้าน'); if (await post('/api/evaluation/comparison', { campaign_id: +id, dealer_code: q('#cp-dc').value, kpi_achievement: q('#cp-k').value, funnel_score: q('#cp-f').value, evidence_complete: q('#cp-e').value, compliance_score: q('#cp-c').value }, 'บันทึกการเทียบ')) bg.remove(); };
  }
  function formReview(id) {
    const bg = modal(`<h3>📝 บันทึกรีวิว</h3><label>Decision</label><select id="rv-dec"><option>Repeat</option><option>Revise</option><option>Stop</option><option>Test Further</option><option>Hold</option></select>${fld('rv-part', 'ผู้เข้าร่วม')}${fld('rv-kc', 'สรุป KPI')}${fld('rv-fc', 'สรุปการเงิน')}${fld('rv-risk', 'ความเสี่ยงหลัก')}<div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (await post('/api/evaluation/review', { campaign_id: +id, decision: q('#rv-dec').value, participants: q('#rv-part').value, kpi_conclusion: q('#rv-kc').value, financial_conclusion: q('#rv-fc').value, key_risk: q('#rv-risk').value }, 'บันทึกรีวิว')) bg.remove(); };
  }
  function formLearn(id) {
    const bg = modal(`<h3>🛠️ Corrective Action</h3>${fld('l-find', 'Finding')}${fld('l-act', 'Action *')}${fld('l-owner', 'Owner *')}${fld('l-due', 'กำหนดเสร็จ', 'date')}${fld('l-sm', 'Success measure')}<div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { if (!q('#l-act').value || !q('#l-owner').value) return toast('ต้องมี Action + Owner'); if (await post('/api/evaluation/learning', { campaign_id: +id, finding: q('#l-find').value, action: q('#l-act').value, owner: q('#l-owner').value, due_date: q('#l-due').value, success_measure: q('#l-sm').value }, 'เพิ่ม Action')) bg.remove(); };
  }
  function updLearn(a) {
    const bg = modal(`<h3>จัดการ Action</h3><div class="muted" style="font-size:12px">${esc(a.action)}</div><label>สถานะ</label><select id="u-st">${['Open', 'In Progress', 'Blocked', 'Closed'].map(o => `<option${a.status === o ? ' selected' : ''}>${o}</option>`).join('')}</select>${fld('u-sm', 'Success measure')}${fld('u-ev', 'Evidence ref')}<div class="modal-act"><button class="btn ghost" id="x">ยกเลิก</button><button class="btn" id="ok">บันทึก</button></div>`);
    const q = s => bg.querySelector(s); q('#u-sm').value = a.success_measure || ''; q('#x').onclick = () => bg.remove();
    q('#ok').onclick = async () => { const r = await fetch('/api/evaluation/learning/' + a.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: q('#u-st').value, success_measure: q('#u-sm').value, evidence_ref: q('#u-ev').value }) }); if (r.ok) { toast('อัปเดตแล้ว'); bg.remove(); renderEvaluation(); } else toast('ไม่สำเร็จ'); };
  }
})();
