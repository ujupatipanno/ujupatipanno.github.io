/* ============================================================
   UI.JS — 인터페이스 요소 조작
   (편집 바, 하단 바, 사이드바, 모달, 토스트, 발표 UI)
   ============================================================ */

// ── 토스트 ────────────────────────────────────────────────────
let _toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
}

// ── 힌트 숨기기 ───────────────────────────────────────────────
function hideHint() {
  const el = document.getElementById('hint');
  if (el) el.classList.add('hidden');
}

// ── 편집 바 ───────────────────────────────────────────────────
let _openSubmenu = null;

function showEditBar(nodeId) {
  const n = getNode(nodeId);
  if (!n) return;

  const bar = document.getElementById('edit-bar');
  const s   = w2s(n.x, n.y);
  const r   = SIZES[n.size] * state.camera.sc;

  const BAR_W = 268;
  const BAR_H = 44;

  let left = s.x - BAR_W / 2;
  let top  = s.y - r - BAR_H - 14;

  // 위로 안 들어가면 아래쪽에 표시
  if (top < 8) top = s.y + r + 14;
  // 좌우 클램핑
  left = Math.max(8, Math.min(window.innerWidth - BAR_W - 8, left));

  bar.style.left = left + 'px';
  bar.style.top  = top  + 'px';
  bar.classList.add('visible');

  syncEditBarLock(n);
  _hideAllSubmenus();
}

function hideEditBar() {
  document.getElementById('edit-bar').classList.remove('visible');
  _hideAllSubmenus();
}

function syncEditBarLock(n) {
  const btn  = document.getElementById('eb-lock');
  const icon = btn.querySelector('i');
  const locked = n ? n.locked : false;
  icon.setAttribute('data-lucide', locked ? 'lock' : 'lock-open');
  btn.classList.toggle('active', locked);
  lucide.createIcons();
}

// 모든 서브메뉴 닫기
function _hideAllSubmenus() {
  document.querySelectorAll('.submenu').forEach(s => s.classList.remove('visible'));
  _openSubmenu = null;
}

// 서브메뉴 토글 + 위치 계산
function _toggleSubmenu(subId, btnEl) {
  const sub    = document.getElementById(subId);
  const isOpen = sub.classList.contains('visible');
  _hideAllSubmenus();
  if (isOpen) return;

  sub.classList.add('visible');
  requestAnimationFrame(() => {
    const bRect = btnEl.getBoundingClientRect();
    const sW    = sub.offsetWidth  || 200;
    const sH    = sub.offsetHeight || 44;
    let left = bRect.left;
    let top  = bRect.top - sH - 6;
    left = Math.max(8, Math.min(window.innerWidth - sW - 8, left));
    if (top < 8) top = bRect.bottom + 6;
    sub.style.left = left + 'px';
    sub.style.top  = top  + 'px';
  });
  _openSubmenu = subId;
}

// 편집 바 버튼 이벤트 등록
function _initEditBarButtons() {
  // 색상
  document.getElementById('eb-color').addEventListener('click', function () {
    _toggleSubmenu('sub-color', this);
  });
  document.querySelectorAll('#sub-color .sw').forEach(btn => {
    btn.addEventListener('click', () => {
      const nid = state.ui.editBarNodeId;
      if (nid == null) return;
      dispatch('UPDATE_NODE', { id: nid, props: { color: btn.dataset.color } });
      _hideAllSubmenus();
    });
  });

  // 모양
  document.getElementById('eb-shape').addEventListener('click', function () {
    _toggleSubmenu('sub-shape', this);
  });
  document.querySelectorAll('#sub-shape .sb-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const nid = state.ui.editBarNodeId;
      if (nid == null) return;
      dispatch('UPDATE_NODE', { id: nid, props: { shape: btn.dataset.shape } });
      _hideAllSubmenus();
    });
  });

  // 크기
  document.getElementById('eb-size').addEventListener('click', function () {
    _toggleSubmenu('sub-size', this);
  });
  document.querySelectorAll('#sub-size .sb-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const nid = state.ui.editBarNodeId;
      if (nid == null) return;
      dispatch('UPDATE_NODE', { id: nid, props: { size: btn.dataset.size } });
      _hideAllSubmenus();
    });
  });

  // 테두리
  document.getElementById('eb-border').addEventListener('click', function () {
    _toggleSubmenu('sub-border', this);
  });
  document.querySelectorAll('#sub-border .sb-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const nid = state.ui.editBarNodeId;
      if (nid == null) return;
      dispatch('UPDATE_NODE', { id: nid, props: { border: btn.dataset.border } });
      _hideAllSubmenus();
    });
  });

  // 복제
  document.getElementById('eb-dupe').addEventListener('click', () => {
    const nid = state.ui.editBarNodeId;
    if (nid == null) return;
    const n = getNode(nid);
    if (!n) return;
    dispatch('CREATE_NODE', {
      x: n.x + 50, y: n.y + 50,
      shape: n.shape, color: n.color, size: n.size, border: n.border,
      label: n.label, note: n.note,
    });
    showToast('Duplicated');
  });

  // 잠금 토글
  document.getElementById('eb-lock').addEventListener('click', () => {
    const nid = state.ui.editBarNodeId;
    if (nid == null) return;
    dispatch('TOGGLE_LOCK', { id: nid });
  });

  // 삭제
  document.getElementById('eb-del').addEventListener('click', () => {
    const nid = state.ui.editBarNodeId;
    if (nid == null) return;
    dispatch('HIDE_EDIT_BAR');
    dispatch('DELETE_NODE', { id: nid });
  });
}

// ── 하단 정보 바 ──────────────────────────────────────────────
function updateBottomBar() {
  const ids = state.ui.selectedIds;
  if (ids.length === 0) { hideBottomBar(); return; }

  const bar = document.getElementById('bottom-bar');

  if (ids.length > 1) {
    // 멀티선택
    document.getElementById('bb-dot').style.background   = '#00d4ff';
    const titleEl = document.getElementById('bb-title');
    titleEl.textContent     = `${ids.length} nodes selected`;
    titleEl.contentEditable = 'false';
    document.getElementById('bb-sub').textContent        = '';
    document.getElementById('bb-note').textContent       = '';
    document.getElementById('bb-edit-btn').style.display = 'none';
  } else {
    const n = getNode(ids[0]);
    if (!n) { hideBottomBar(); return; }

    document.getElementById('bb-dot').style.background = n.color;

    const titleEl = document.getElementById('bb-title');
    titleEl.textContent     = n.label || '';
    titleEl.contentEditable = 'true';
    titleEl.dataset.nid     = n.id;

    document.getElementById('bb-sub').textContent  =
      `${n.shape} · ${n.size}${n.locked ? ' · 🔒' : ''}`;
    document.getElementById('bb-note').textContent =
      n.note ? n.note : '';
    document.getElementById('bb-edit-btn').style.display = '';
  }

  bar.classList.add('visible');
  bar.classList.toggle('present', state.ui.presentMode);
}

function hideBottomBar() {
  document.getElementById('bottom-bar').classList.remove('visible');
  closeNoteEditor();
}

// 그룹 영역 탭 시 하단 바에 그룹 정보 표시
function showGroupInBottomBar(gid) {
  const g = getGroup(gid);
  if (!g) return;

  const titleEl = document.getElementById('bb-title');
  titleEl.textContent     = g.name;
  titleEl.contentEditable = 'false';

  document.getElementById('bb-dot').style.background   = g.color;
  document.getElementById('bb-sub').textContent        = `${g.nodeIds.length} nodes`;
  document.getElementById('bb-note').textContent       = '';
  document.getElementById('bb-edit-btn').style.display = 'none';
  document.getElementById('bottom-bar').classList.add('visible');
}

// 라벨 인라인 편집 초기화
function _initBottomBar() {
  const titleEl = document.getElementById('bb-title');

  titleEl.addEventListener('blur', function () {
    if (this.contentEditable !== 'true') return;
    const nid = state.ui.selectedIds[0];
    if (nid == null) return;
    const newLabel = this.textContent.trim();
    dispatch('UPDATE_NODE', { id: nid, props: { label: newLabel } });
  });

  // Enter = 확인
  titleEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
  });
}

// ── 메모 에디터 ───────────────────────────────────────────────
let _noteNodeId = null;

function openNoteEditor(nodeId) {
  _noteNodeId = nodeId;
  const n  = getNode(nodeId);
  const ta = document.getElementById('note-textarea');
  ta.value = n ? (n.note || '') : '';
  document.getElementById('note-editor').classList.add('visible');
  setTimeout(() => ta.focus(), 50);
}

function closeNoteEditor() {
  document.getElementById('note-editor').classList.remove('visible');
  _noteNodeId = null;
}

function _initNoteEditor() {
  document.getElementById('bb-edit-btn').addEventListener('click', () => {
    const nid = state.ui.selectedIds[0];
    if (nid != null) openNoteEditor(nid);
  });

  document.getElementById('note-cancel').addEventListener('click', closeNoteEditor);

  document.getElementById('note-save').addEventListener('click', () => {
    if (_noteNodeId == null) return;
    const val = document.getElementById('note-textarea').value.trim();
    dispatch('UPDATE_NODE', { id: _noteNodeId, props: { note: val } });
    closeNoteEditor();
    showToast('Note saved');
  });
}

// ── 사이드바 ──────────────────────────────────────────────────
function updateSidebarPanel() {
  const panels = document.querySelectorAll('.s-panel');
  const tabs   = document.querySelectorAll('.stab[data-panel]');

  panels.forEach(p => p.classList.toggle('active', p.id === state.ui.activePanel));
  tabs.forEach(t   => t.classList.toggle('active', t.dataset.panel === state.ui.activePanel));

  document.getElementById('sidebar-panel')
    .classList.toggle('open', state.ui.activePanel != null);

  // 해당 패널 콘텐츠 렌더
  if (state.ui.activePanel === 'panel-pin')     renderPinsPanel();
  if (state.ui.activePanel === 'panel-groups')  renderGroupsPanel();
  if (state.ui.activePanel === 'panel-present') _renderPresentPanel();
}

function saveSidebarStatus() {
  try {
    localStorage.setItem('ts_panel', state.ui.activePanel || '');
  } catch (e) {}
}

function _initSidebarTabs() {
  document.querySelectorAll('.stab[data-panel]').forEach(tab => {
    tab.addEventListener('click', () => {
      const pid = tab.dataset.panel;
      dispatch('SET_PANEL', { id: state.ui.activePanel === pid ? null : pid });
    });
  });
}

// ── 핀 패널 ───────────────────────────────────────────────────
function renderPinsPanel() {
  const list = document.getElementById('pin-list');
  list.innerHTML = '';

  if (pins.length === 0) {
    list.innerHTML = '<p class="p-empty">No pins yet.<br>Select a node and tap + Pin.</p>';
    return;
  }

  pins.forEach((pin, idx) => {
    const row = document.createElement('div');
    row.className = 'pin-row';

    // 미리보기 SVG
    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '28'); svg.setAttribute('height', '28');
    svg.setAttribute('viewBox', '0 0 28 28');
    const pr = SIZES[pin.size] * 0.55;
    let sh;
    if (pin.shape === 'circle') {
      sh = document.createElementNS(NS, 'circle');
      sh.setAttribute('cx', 14); sh.setAttribute('cy', 14); sh.setAttribute('r', pr);
    } else if (pin.shape === 'square') {
      sh = document.createElementNS(NS, 'rect');
      sh.setAttribute('x', 14 - pr); sh.setAttribute('y', 14 - pr);
      sh.setAttribute('width', pr * 2); sh.setAttribute('height', pr * 2);
      sh.setAttribute('rx', 2);
    } else {
      sh = document.createElementNS(NS, 'polygon');
      sh.setAttribute('points',
        `14,${14 - pr} ${14 + pr * 0.866},${14 + pr * 0.5} ${14 - pr * 0.866},${14 + pr * 0.5}`);
    }
    sh.setAttribute('fill', pin.color); sh.setAttribute('fill-opacity', '0.2');
    sh.setAttribute('stroke', pin.color); sh.setAttribute('stroke-width', '1.5');
    svg.appendChild(sh);
    row.appendChild(svg);

    // 스타일 정보
    const info = document.createElement('span');
    info.className   = 'pin-info';
    info.textContent = `${pin.shape} · ${pin.size}`;
    info.style.color = pin.color;
    row.appendChild(info);

    // 적용 버튼
    const applyBtn = document.createElement('button');
    applyBtn.className   = 'p-action-btn';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      const nid = state.ui.editBarNodeId ?? state.ui.selectedIds[0];
      if (nid == null) { showToast('Select a node first'); return; }
      dispatch('UPDATE_NODE', {
        id: nid,
        props: { shape: pin.shape, color: pin.color, size: pin.size, border: pin.border },
      });
      showToast('Style applied');
    });
    row.appendChild(applyBtn);

    // 삭제 버튼
    const delBtn = document.createElement('button');
    delBtn.className   = 'pin-del';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => dispatch('DELETE_PIN', { idx }));
    row.appendChild(delBtn);

    list.appendChild(row);
  });
}

// ── 그룹 패널 ─────────────────────────────────────────────────
function renderGroupsPanel() {
  const list = document.getElementById('group-list');
  list.innerHTML = '';

  if (state.groups.length === 0) {
    list.innerHTML = '<p class="p-empty">No groups yet.<br>Tap New to draw a group area.</p>';
    return;
  }

  state.groups.forEach(grp => {
    const row = document.createElement('div');
    row.className = 'group-row';

    const dot = document.createElement('span');
    dot.className        = 'group-dot';
    dot.style.background = grp.color;
    row.appendChild(dot);

    const nameEl = document.createElement('span');
    nameEl.className       = 'group-name';
    nameEl.textContent     = grp.name;
    nameEl.contentEditable = 'true';
    nameEl.addEventListener('blur', () => {
      const newName = nameEl.textContent.trim() || 'Group';
      if (newName !== grp.name)
        dispatch('UPDATE_GROUP', { id: grp.id, props: { name: newName } });
    });
    nameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });
    row.appendChild(nameEl);

    const cnt = document.createElement('span');
    cnt.className   = 'group-cnt';
    cnt.textContent = `${grp.nodeIds.length}`;
    row.appendChild(cnt);

    const delBtn = document.createElement('button');
    delBtn.className   = 'group-del';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => dispatch('DELETE_GROUP', { id: grp.id }));
    row.appendChild(delBtn);

    list.appendChild(row);
  });
}

// ── 발표 패널 (그룹 목록 동적 생성) ──────────────────────────
function _renderPresentPanel() {
  const gl = document.getElementById('present-group-list');
  gl.innerHTML = '';

  state.groups
    .filter(g => g.nodeIds.length > 0)
    .forEach(grp => {
      const btn = document.createElement('button');
      btn.className   = 'p-action-btn';
      btn.textContent = grp.name;
      btn.style.borderLeft = `3px solid ${grp.color}`;
      btn.addEventListener('click', () => {
        const list = grp.nodeIds.slice().sort((a, b) =>
          (grp.order[a] ?? 0) - (grp.order[b] ?? 0)
        );
        dispatch('START_PRESENT', { list });
        dispatch('SET_PANEL', { id: null });
      });
      gl.appendChild(btn);
    });
}

// ── 설정 패널 ─────────────────────────────────────────────────
function _initSettingsPanel() {
  document.getElementById('tog-dots').addEventListener('click', () =>
    dispatch('SET_GRID', { style: 'dots' })
  );
  document.getElementById('tog-lines').addEventListener('click', () =>
    dispatch('SET_GRID', { style: 'lines' })
  );
  document.getElementById('btn-select-mode').addEventListener('click', () =>
    dispatch('SET_SELECT_MODE', { on: !state.ui.selectMode })
  );
}

// ── 공유 패널 ─────────────────────────────────────────────────
function _initSharePanel() {
  document.getElementById('btn-share-url').addEventListener('click', _copyShareUrl);
}

function _copyShareUrl() {
  const data = JSON.stringify({
    nodes: state.nodes, edges: state.edges, groups: state.groups,
    nSeq, eSeq, gSeq,
  });
  const compressed = LZString.compressToEncodedURIComponent(data);
  const url = location.origin + location.pathname + '?d=' + compressed;

  if (url.length > 20000) {
    document.getElementById('share-warn').style.display = '';
    showToast('Canvas too large for a link');
    return;
  }
  document.getElementById('share-warn').style.display = 'none';

  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Link copied!');
  }
}

// ── 그룹 패널 "New" 버튼 ─────────────────────────────────────
function _initGroupsPanel() {
  document.getElementById('btn-new-group').addEventListener('click', () => {
    dispatch('SET_PANEL', { id: null });
    dispatch('SET_GROUP_DRAW_MODE', { on: true });
  });
}

// ── 발표 패널 "All nodes" 버튼 ───────────────────────────────
function _initPresentPanel() {
  document.getElementById('btn-present-all').addEventListener('click', () => {
    if (state.nodes.length === 0) { showToast('No nodes to present'); return; }
    dispatch('START_PRESENT', { list: state.nodes.map(n => n.id) });
    dispatch('SET_PANEL', { id: null });
  });
}

// ── 모달 ──────────────────────────────────────────────────────
function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
  document.getElementById('modal-overlay').classList.add('visible');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function _initModals() {
  // Overlay 바깥 클릭 시 닫기
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  // Reset 확인
  document.getElementById('modal-reset-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-reset-ok').addEventListener('click', () => {
    closeModal();
    dispatch('RESET');
  });

  // JSON 불러오기
  document.getElementById('modal-load-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-load-replace').addEventListener('click', () => {
    closeModal();
    _doLoadJson(false);
  });
  document.getElementById('modal-load-merge').addEventListener('click', () => {
    closeModal();
    _doLoadJson(true);
  });
}

// ── 발표 UI ───────────────────────────────────────────────────
function showPresentUI() {
  document.getElementById('present-ui').classList.add('visible');
  document.getElementById('bottom-bar').classList.add('present');
  updatePresentCounter();
}

function hidePresentUI() {
  document.getElementById('present-ui').classList.remove('visible');
  document.getElementById('bottom-bar').classList.remove('present');
}

function updatePresentCounter() {
  const total = state.ui.presentList.length;
  const cur   = state.ui.presentIdx + 1;
  document.getElementById('present-counter').textContent = `${cur} / ${total}`;
}

// ── 전체 UI 동기화 (undo/redo/restore 후 호출) ───────────────
function updateUI() {
  renderGrid();
  updateSidebarPanel();
  updateBottomBar();
  if (state.nodes.length > 0) hideHint();
}

// ── JSON 불러오기 (persist.js에서 _pendingJsonData 설정 후 사용) ──
let _pendingJsonData = null;

function _doLoadJson(merge) {
  if (!_pendingJsonData) return;

  if (merge) {
    const d     = _pendingJsonData;
    const idMap = {};

    (d.nodes || []).forEach(n => {
      const newId = nSeq++;
      idMap[n.id] = newId;
      state.nodes.push({ ...n, id: newId });
    });
    (d.edges || []).forEach(e => {
      state.edges.push({
        ...e,
        id:   eSeq++,
        from: idMap[e.from] ?? e.from,
        to:   idMap[e.to]   ?? e.to,
      });
    });
    (d.groups || []).forEach(g => {
      const newNodeIds = (g.nodeIds || []).map(nid => idMap[nid] ?? nid);
      const newOrder   = {};
      Object.entries(g.order || {}).forEach(([k, v]) => {
        newOrder[idMap[k] ?? k] = v;
      });
      state.groups.push({ ...g, id: gSeq++, nodeIds: newNodeIds, order: newOrder });
    });

    snapshot();
    render();
    updateUI();
    showToast('Merged');
  } else {
    dispatch('RESTORE', { data: _pendingJsonData });
    showToast('Loaded');
  }

  _pendingJsonData = null;
}

// ── 초기화 ────────────────────────────────────────────────────
function initUI() {
  _initEditBarButtons();
  _initBottomBar();
  _initNoteEditor();
  _initSidebarTabs();
  _initSettingsPanel();
  _initSharePanel();
  _initGroupsPanel();
  _initPresentPanel();
  _initModals();

  // 핀 패널에 "+ Pin" 버튼 동적 추가
  const pinHd = document.querySelector('#panel-pin .panel-hd');
  if (pinHd && !document.getElementById('btn-new-pin')) {
    const btn = document.createElement('button');
    btn.className   = 'p-new-btn';
    btn.id          = 'btn-new-pin';
    btn.innerHTML   = '<i data-lucide="plus"></i> Pin';
    btn.addEventListener('click', () => {
      const nid = state.ui.selectedIds[0] ?? state.ui.editBarNodeId;
      if (nid == null) { showToast('Select a node first'); return; }
      dispatch('ADD_PIN', { id: nid });
    });
    pinHd.appendChild(btn);
    lucide.createIcons();
  }

  // 저장된 패널 상태 복원
  try {
    const saved = localStorage.getItem('ts_panel');
    if (saved) {
      state.ui.activePanel = saved;
      updateSidebarPanel();
    }
  } catch (e) {}
}
