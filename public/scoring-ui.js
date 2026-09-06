// Phase 2 UI — Dealer Scoring / Prioritization (SOP-002). Loaded after app.js.
(function () {
  const SUBS = [['sales', 'ยอดขาย', 25], ['market', 'ศักยภาพ', 20], ['growth', 'โอกาส', 15], ['stock', 'Stock', 15], ['execution', 'Execution', 15], ['credit', 'เครดิต/บริการ', 10]];
  const TIER_C = { A: '#2E9E1E', B: '#1565c0', C: '#b8860b', D: '#78909c', Hold: '#c62828', 'Missing Data': '#c62828' };
  const role = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || '';
  const canScore = () => ['tmm', 'admin'].includes(role());
  const canApprove = () => ['approver', 'admin'].includes(role());
  const tb = t => `<span class="tierb" style="background:${TIER_C[t] || '#78909c'};width:auto;padding:0 8px">${esc(t || '-')}</span>`;
  let curPeriod = '';

  window.renderScoring = async function () {
    const el = $('#scoring');
    let periods = [];
    try { periods = await api('/api/scoring/periods'); } catch (_) {}
    if (!curPeriod && periods.length) curPeriod = periods[0].period;
    const p = periods.find(x => x.period === curPeriod);
    let scores = [];
    if (curPeriod) { try { scores = await api('/api/scoring/' + encodeURIComponent(curPeriod) + '/scores'); } catch (_) {} }
    el.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <h2 style="margin:0">📊 จัดลำดับร้าน (Dealer Priority)</h2>
        <select id="scPeriod">${periods.length ? periods.map(x => `<option value="${esc(x.period)}"${x.period === curPeriod ? ' selected' : ''}>${esc(x.period)} · ${esc(x.status)}</option>`).join('') : '<option value="">— ยังไม่มีรอบ —</option>'}</select>
        <span class="muted">${p ? (p.status === 'Approved' ? '🔒 อนุมัติแล้ว' : 'เปิดให้คะแนน') : ''}</span>
        <span class="spacer"></span>
        ${canScore() ? '<button class="btn ghost" id="scNewPeriod">➕ รอบใหม่</button>' : ''}
        ${canScore() && p && p.status !== 'Approved' ? '<button class="btn ghost" id="scAdd">➕ ให้คะแนนร้าน</button>' : ''}
        ${canApprove() && p && p.status !== 'Approved' ? '<button class="btn" id="scApprove">✅ อนุมัติรอบ</button>' : ''}
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:8px">น้ำหนัก: ยอดขาย 25 · ศักยภาพ 20 · โอกาส 15 · Stock 15 · Execution 15 · เครดิต 10 = 100 · A≥80 B≥65 C≥50 D&lt;50 · Hold ชนะคะแนน · ขาดคะแนน = Missing Data</div>
      <div class="scroll"><table id="scTable">
        <tr><th>ร้าน</th><th>ภูมิภาค</th>${SUBS.map(s => `<th class="num" title="${s[1]} (${s[2]})">${s[1]}</th>`).join('')}<th class="num">รวม</th><th>Gate</th><th>แนะนำ</th><th>Final</th><th>สถานะ</th></tr>
        ${scores.length ? scores.map(s => `<tr data-code="${esc(s.dealer_code)}" style="cursor:${p && p.status !== 'Approved' && canScore() ? 'pointer' : 'default'}">
          <td>${esc(s.dealer_name || s.dealer_code)}<small class="sub">${esc(s.dealer_code)}</small></td>
          <td>${esc(s.region) || '-'}</td>
          ${SUBS.map(k => `<td class="num">${s[k[0]] == null ? '<span style="color:#c62828">–</span>' : s[k[0]]}</td>`).join('')}
          <td class="num"><b>${s.total == null ? '<span style="color:#c62828">Missing</span>' : s.total}</b></td>
          <td>${s.critical_gate === 'Hold' ? '<span style="color:#c62828">Hold</span>' : 'Pass'}</td>
          <td>${tb(s.suggested_tier)}</td><td>${tb(s.final_tier)}</td>
          <td>${esc(s.approval_status)}</td></tr>`).join('')
        : `<tr><td colspan="${SUBS.length + 6}" class="muted">${curPeriod ? 'ยังไม่มีคะแนนในรอบนี้' : 'สร้างรอบประเมินก่อน'}</td></tr>`}
      </table></div>
    </div>`;
    $('#scPeriod')?.addEventListener('change', e => { curPeriod = e.target.value; renderScoring(); });
    $('#scNewPeriod')?.addEventListener('click', newPeriod);
    $('#scAdd')?.addEventListener('click', () => scoreForm(null));
    $('#scApprove')?.addEventListener('click', approvePeriod);
    if (p && p.status !== 'Approved' && canScore())
      el.querySelectorAll('#scTable tr[data-code]').forEach(tr =>
        tr.addEventListener('click', () => scoreForm(scores.find(x => x.dealer_code === tr.dataset.code))));
  };

  function newPeriod() {
    const per = prompt('รอบประเมินใหม่ (เช่น 2026-Q4):'); if (!per) return;
    fetch('/api/scoring/periods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period: per }) })
      .then(r => r.json()).then(d => { if (d.error) return toast(d.error); curPeriod = per; toast('สร้างรอบ ' + per); renderScoring(); });
  }

  function approvePeriod() {
    if (!confirm('อนุมัติรอบ ' + curPeriod + ' ? จะล็อกคะแนนและ sync Tier เข้าทะเบียนร้าน')) return;
    fetch('/api/scoring/' + encodeURIComponent(curPeriod) + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json()).then(d => { if (d.error) return toast(d.error); toast('อนุมัติแล้ว · sync tier ' + d.tier_synced + ' ร้าน'); renderScoring(); });
  }

  function scoreForm(existing) {
    const e = existing || {};
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h3>${existing ? 'แก้คะแนน ' + esc(e.dealer_code) : '➕ ให้คะแนนร้าน'}</h3>
      ${existing ? '' : '<label>รหัสร้าน (dealer code)</label><input id="sf-code" placeholder="เช่น V00016">'}
      ${SUBS.map(s => `<label>${s[1]} (เต็ม ${s[2]})</label><input id="sf-${s[0]}" type="number" min="0" max="${s[2]}" value="${e[s[0]] == null ? '' : e[s[0]]}">`).join('')}
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="sf-hold" ${e.critical_gate === 'Hold' ? 'checked' : ''}> Critical Gate = Hold (หยุด/จำกัด แม้คะแนนสูง)</label>
      <label>เหตุผล/หมายเหตุ</label><input id="sf-reason" value="${esc(e.reason || '')}">
      <div class="modal-act"><button class="btn ghost" id="sf-cancel">ยกเลิก</button><button class="btn" id="sf-ok">บันทึก</button></div></div>`;
    document.body.appendChild(bg);
    const q = s => bg.querySelector(s);
    bg.addEventListener('click', ev => { if (ev.target === bg) bg.remove(); });
    q('#sf-cancel').addEventListener('click', () => bg.remove());
    q('#sf-ok').addEventListener('click', async () => {
      const body = { dealer_code: existing ? e.dealer_code : (q('#sf-code').value || '').trim(), critical_gate: q('#sf-hold').checked ? 'Hold' : 'Pass', reason: q('#sf-reason').value };
      SUBS.forEach(s => { const v = q('#sf-' + s[0]).value; body[s[0]] = v === '' ? '' : +v; });
      if (!body.dealer_code) return toast('ต้องมีรหัสร้าน');
      const r = await fetch('/api/scoring/' + encodeURIComponent(curPeriod) + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) return toast(d.error || 'บันทึกไม่สำเร็จ');
      toast('บันทึกคะแนน ' + body.dealer_code + (d.total == null ? ' (Missing Data)' : ' → ' + d.final_tier)); bg.remove(); renderScoring();
    });
  }
})();
