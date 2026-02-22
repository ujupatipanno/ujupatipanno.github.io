/* ============================================================
   PERSIST.JS — 저장/불러오기/내보내기 + 앱 초기화
   ============================================================ */

// ── 자동저장 ──────────────────────────────────────────────────
let _autoSaveTimer   = null;
let _lastSaveTime    = null;
let _saveStatusTimer = null;

function autoSave() {
  const data = JSON.stringify({
    nodes:  state.nodes,
    edges:  state.edges,
    groups: state.groups,
    nSeq, eSeq, gSeq,
  });
  try {
    localStorage.setItem('ts_autosave', data);
    _lastSaveTime = Date.now();
    _updateSaveStatus();
  } catch (e) {
    showToast('Auto-save failed');
  }
}

function _updateSaveStatus() {
  const el = document.getElementById('save-status');
  if (!el) return;
  if (!_lastSaveTime) { el.textContent = '—'; return; }
  const sec = Math.floor((Date.now() - _lastSaveTime) / 1000);
  if (sec < 10)       el.textContent = 'Saved';
  else if (sec < 60)  el.textContent = sec + 's ago';
  else if (sec < 120) el.textContent = '1m ago';
  else                el.textContent = Math.floor(sec / 60) + 'm ago';
}

function _startAutoSave() {
  clearInterval(_autoSaveTimer);
  _autoSaveTimer = setInterval(() => {
    autoSave();
  }, 3 * 60 * 1000); // 3분마다

  clearInterval(_saveStatusTimer);
  _saveStatusTimer = setInterval(_updateSaveStatus, 30 * 1000); // 30초마다 표시 갱신
}

// ── JSON 저장 ─────────────────────────────────────────────────
function saveJSON() {
  document.getElementById('modal-save-name').value = 'my-canvas';
  openModal('modal-save');
}

function _doSaveJson(filename) {
  const data = {
    nodes:  state.nodes,
    edges:  state.edges,
    groups: state.groups,
    nSeq, eSeq, gSeq,
  };
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename.replace(/\.json$/i, '') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Saved!');
}

// ── JSON 불러오기 ─────────────────────────────────────────────
function loadJSON() {
  document.getElementById('file-input').click();
}

function _onFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      _pendingJsonData = JSON.parse(ev.target.result);
      openModal('modal-load');
    } catch {
      showToast('Invalid JSON file');
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // 같은 파일 다시 선택 가능하도록 초기화
}

// ── PNG 내보내기 ───────────────────────────────────────────────
function exportPNG() {
  if (state.nodes.length === 0) { showToast('No nodes to export'); return; }

  const pad  = 48;
  const xs   = state.nodes.flatMap(n => [n.x - SIZES[n.size], n.x + SIZES[n.size]]);
  const ys   = state.nodes.flatMap(n => [n.y - SIZES[n.size], n.y + SIZES[n.size]]);
  const vx   = Math.min(...xs) - pad;
  const vy   = Math.min(...ys) - pad;
  const vw   = Math.max(...xs) + pad - vx;
  const vh   = Math.max(...ys) + pad - vy;

  const scale = 2; // 2배 해상도
  const W = Math.ceil(vw * scale);
  const H = Math.ceil(vh * scale);

  // SVG 복제 후 viewBox로 잘라내기
  const original = document.getElementById('canvas');
  const clone    = original.cloneNode(true);
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  clone.setAttribute('width',   W);
  clone.setAttribute('height',  H);
  // 카메라 transform 제거 (viewBox가 대신 담당)
  const worldEl = clone.querySelector('#world');
  if (worldEl) worldEl.removeAttribute('transform');
  // 선택 사각형 / hint 제거
  const selRect = clone.querySelector('#sel-rect');
  if (selRect) selRect.setAttribute('display', 'none');

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url    = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const cvs = document.createElement('canvas');
    cvs.width  = W;
    cvs.height = H;
    const ctx  = cvs.getContext('2d');
    ctx.fillStyle = '#070b0e';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    cvs.toBlob(pngBlob => {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a      = document.createElement('a');
      a.href       = pngUrl;
      a.download   = 'thought-space.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(pngUrl);
      showToast('PNG saved!');
    });
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showToast('PNG export failed');
  };
  img.src = url;
}

// ── SVG 내보내기 ───────────────────────────────────────────────
function exportSVG() {
  if (state.nodes.length === 0) { showToast('No nodes to export'); return; }

  const pad  = 48;
  const xs   = state.nodes.flatMap(n => [n.x - SIZES[n.size], n.x + SIZES[n.size]]);
  const ys   = state.nodes.flatMap(n => [n.y - SIZES[n.size], n.y + SIZES[n.size]]);
  const vx   = Math.min(...xs) - pad;
  const vy   = Math.min(...ys) - pad;
  const vw   = Math.max(...xs) + pad - vx;
  const vh   = Math.max(...ys) + pad - vy;

  const original = document.getElementById('canvas');
  const clone    = original.cloneNode(true);
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  clone.setAttribute('width',   vw);
  clone.setAttribute('height',  vh);
  const worldEl = clone.querySelector('#world');
  if (worldEl) worldEl.removeAttribute('transform');
  const selRect = clone.querySelector('#sel-rect');
  if (selRect) selRect.setAttribute('display', 'none');

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = 'thought-space.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('SVG saved!');
}

// ── URL 상태 복원 ─────────────────────────────────────────────
function _loadFromURL() {
  try {
    const params = new URLSearchParams(location.search);
    const d = params.get('d');
    if (!d) return false;
    const json = LZString.decompressFromEncodedURIComponent(d);
    if (!json) return false;
    const data = JSON.parse(json);
    dispatch('RESTORE', { data });
    // URL 파라미터 제거 (뒤로가기 시 재로드 방지)
    window.history.replaceState(null, '', location.pathname);
    showToast('Canvas loaded from link');
    return true;
  } catch (e) {
    return false;
  }
}

// ── 자동저장 복원 ─────────────────────────────────────────────
function _loadFromAutoSave() {
  try {
    const raw = localStorage.getItem('ts_autosave');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.nodes || data.nodes.length === 0) return false;
    dispatch('RESTORE', { data });
    return true;
  } catch (e) {
    return false;
  }
}

// ── persist 관련 버튼 이벤트 연결 ────────────────────────────
function _initPersistButtons() {
  // Save JSON 모달 OK
  document.getElementById('modal-save-ok').addEventListener('click', () => {
    const name = document.getElementById('modal-save-name').value.trim() || 'my-canvas';
    closeModal();
    _doSaveJson(name);
  });
  // Save JSON 모달 Cancel
  document.getElementById('modal-save-cancel').addEventListener('click', closeModal);

  // Save / Load 버튼
  document.getElementById('btn-save-json').addEventListener('click', saveJSON);
  document.getElementById('btn-load-json').addEventListener('click', loadJSON);
  document.getElementById('file-input').addEventListener('change', _onFileSelected);

  // Export 버튼
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  document.getElementById('btn-export-svg').addEventListener('click', exportSVG);
}

// ── 앱 진입점 ─────────────────────────────────────────────────
function init() {
  // 저장된 핀 불러오기
  loadPins();

  // UI / 이벤트 초기화
  initUI();
  initEvents();

  // persist 버튼 이벤트 연결
  _initPersistButtons();

  // URL → 자동저장 순으로 상태 복원 시도
  if (!_loadFromURL()) {
    _loadFromAutoSave();
  }

  // 초기 렌더
  render();
  applyCam();
  renderGrid();

  // 자동저장 루프 시작
  _startAutoSave();

  // 저장 상태 초기 표시
  _updateSaveStatus();
}
