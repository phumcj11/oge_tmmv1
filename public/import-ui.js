// Excel import UI (admin-only). Loaded after app.js; uses globals esc, toast, renderSellout, renderDealers.
// Buttons carry data-import="<type>"; a delegated click opens the modal.
(function () {
  const TYPES = { dealers: 'Dealers / ร้านค้า', sellout: 'Sell-out รายเดือน', products: 'Products / รุ่นสินค้า' };
  const E = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));

  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-import]');
    if (b) { e.preventDefault(); openImportModal(b.getAttribute('data-import')); }
  });

  window.openImportModal = function (defaultType) {
    let type = TYPES[defaultType] ? defaultType : 'dealers';
    let file = null;
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML =
      '<div class="modal wide">' +
      '<h3>⬆ นำเข้าข้อมูลจาก Excel</h3>' +
      '<label>ชนิดข้อมูล</label>' +
      '<select id="imType">' + Object.keys(TYPES).map(function (k) {
        return '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + TYPES[k] + '</option>';
      }).join('') + '</select>' +
      '<div style="margin:12px 0"><a href="#" id="imTpl" style="color:#2E9E1E;cursor:pointer;font-size:13px;text-decoration:underline">⬇ ดาวน์โหลด template (.xlsx)</a></div>' +
      '<label class="btn ghost" style="display:inline-block;cursor:pointer">📄 เลือกไฟล์ Excel/CSV' +
      '<input type="file" id="imFile" accept=".xlsx,.xls,.csv" style="display:none"></label>' +
      '<span class="muted" id="imName" style="margin-left:8px;font-size:12px"></span>' +
      '<div id="imResult" style="margin-top:14px"></div>' +
      '<div class="modal-act">' +
      '<button class="btn ghost" id="imCancel">ปิด</button>' +
      '<button class="btn" id="imConfirm" style="display:none">✅ ยืนยันนำเข้า</button>' +
      '</div></div>';
    document.body.appendChild(bg);
    const q = s => bg.querySelector(s);
    const close = () => bg.remove();
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    q('#imCancel').addEventListener('click', close);

    q('#imTpl').addEventListener('click', e => { e.preventDefault(); window.location.href = '/api/import/' + type + '/template'; });

    q('#imType').addEventListener('change', e => {
      type = e.target.value; file = null;
      q('#imFile').value = ''; q('#imName').textContent = '';
      q('#imResult').innerHTML = ''; q('#imConfirm').style.display = 'none';
    });

    q('#imFile').addEventListener('change', async e => {
      file = e.target.files[0]; if (!file) return;
      q('#imName').textContent = file.name;
      q('#imConfirm').style.display = 'none';
      q('#imResult').innerHTML = '<div class="muted">กำลังตรวจไฟล์...</div>';
      const s = await send(type, file, false);
      if (!s) { q('#imResult').innerHTML = '<div class="err-box">อ่านไฟล์ไม่สำเร็จ</div>'; return; }
      if (s.error) { q('#imResult').innerHTML = '<div class="err-box">' + E(s.error) + '</div>'; return; }
      showSummary(q, s, false);
      if ((s.willInsert + s.willUpdate) > 0) q('#imConfirm').style.display = '';
    });

    q('#imConfirm').addEventListener('click', async () => {
      if (!file) return;
      const btn = q('#imConfirm'); btn.disabled = true;
      q('#imResult').innerHTML = '<div class="muted">กำลังนำเข้า...</div>';
      const r = await send(type, file, true);
      btn.disabled = false;
      if (!r || r.error) { q('#imResult').innerHTML = '<div class="err-box">' + E((r && r.error) || 'นำเข้าไม่สำเร็จ') + '</div>'; return; }
      if (typeof toast === 'function') toast('นำเข้าแล้ว · เพิ่ม ' + r.inserted + ' · อัปเดต ' + r.updated);
      btn.style.display = 'none';
      showSummary(q, r, true);
      setTimeout(() => {
        try {
          if (type === 'sellout' && typeof renderSellout === 'function') renderSellout();
          else if (type === 'dealers' && typeof renderDealers === 'function') renderDealers();
        } catch (_) {}
      }, 120);
    });
  };

  function showSummary(q, s, done) {
    const ins = done ? s.inserted : s.willInsert;
    const upd = done ? s.updated : s.willUpdate;
    const errs = (s.errors || []).map(x => '<div>แถว ' + x.row + ': ' + E(x.msg) + '</div>').join('');
    const more = (s.errorCount || 0) > (s.errors || []).length
      ? '<div class="muted">… และอีก ' + (s.errorCount - s.errors.length) + ' รายการ</div>' : '';
    let html =
      '<div class="im-stat">' +
      '<span style="color:#2e7d32">➕ เพิ่ม ' + ins + '</span>' +
      '<span style="color:#1565c0">✏️ อัปเดต ' + upd + '</span>' +
      '<span style="color:' + (s.errorCount ? '#c62828' : '#667085') + '">⚠️ ผิดพลาด ' + (s.errorCount || 0) + '</span>' +
      (s.total != null ? '<span class="muted">รวม ' + s.total + ' แถว</span>' : '') +
      '</div>';
    if (errs) html += '<div class="im-errs">' + errs + more + '</div>';
    if (!done && s.sample && s.sample.length) {
      html += '<div class="muted" style="margin:8px 0 4px">ตัวอย่าง ' + s.sample.length + ' แถวแรก:</div>' + sampleTable(s.sample);
    }
    if (done) html += '<div style="color:#2e7d32;margin-top:8px">✅ นำเข้าเสร็จแล้ว</div>';
    q('#imResult').innerHTML = html;
  }

  function sampleTable(rows) {
    const cols = Object.keys(rows[0]);
    return '<div class="scroll" style="max-height:180px"><table class="mini"><tr>' +
      cols.map(c => '<th>' + E(c) + '</th>').join('') + '</tr>' +
      rows.map(r => '<tr>' + cols.map(c => '<td>' + E(r[c]) + '</td>').join('') + '</tr>').join('') +
      '</table></div>';
  }

  async function send(type, file, commit) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/import/' + type + (commit ? '?commit=1' : ''), { method: 'POST', body: fd });
      return await r.json();
    } catch (_) { return null; }
  }
})();
