/* ============================================================
   EVENTS.JS — 터치/마우스/핀치 이벤트 처리
   ============================================================ */

// ── 드래그 상태 ───────────────────────────────────────────────
const drag = {
  active:    false,
  type:      null,   // 'node' | 'handle' | 'pan' | 'select' | 'group-draw'
  nodeId:    null,
  startX:    0, startY:    0,  // 세계 좌표 시작점
  curX:      0, curY:      0,
  screenStartX: 0, screenStartY: 0,
  moved:     false,
  multiStart: [],  // 멀티선택 이동 시 각 노드 초기 위치
};

// 핀치 상태
const pinch = {
  active: false,
  dist:   0,
  midX:   0, midY: 0,
  onNode: false,  // 노드 위 핀치 여부
  nodeId: null,
};

// 탭 구분 (더블 탭 감지)
let lastTapTime  = 0;
let lastTapNodeId = null;
const DBL_TAP_MS = 300;

// 엣지 호버 (PC 마우스)
let hoveredEdgeId = null;

// 그룹 드래그 그리기
const gDraw = { x0: 0, y0: 0 };

// ── 이벤트 초기화 ─────────────────────────────────────────────
function initEvents() {
  const canvas = document.getElementById('canvas');

  // ── 터치 이벤트 ──
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
  canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
  canvas.addEventListener('touchcancel',onTouchEnd,   { passive: false });

  // ── 마우스 이벤트 (PC) ──
  canvas.addEventListener('mousedown',  onMouseDown);
  canvas.addEventListener('mousemove',  onMouseMove);
  canvas.addEventListener('mouseup',    onMouseUp);
  canvas.addEventListener('wheel',      onWheel,       { passive: false });

  // 엣지 호버 (PC)
  canvas.addEventListener('mouseover', e => {
    const hit = e.target.closest('[data-eid]');
    if (hit) {
      hoveredEdgeId = Number(hit.dataset.eid);
      _highlightEdge(hoveredEdgeId, true);
    }
  });
  canvas.addEventListener('mouseout', e => {
    const hit = e.target.closest('[data-eid]');
    if (hit && hoveredEdgeId != null) {
      _highlightEdge(hoveredEdgeId, false);
      hoveredEdgeId = null;
    }
  });

  // 미니맵 클릭 이동
  document.getElementById('minimap').addEventListener('click', onMinimapClick);

  // 발표 버튼
  document.getElementById('present-prev').addEventListener('click', () => {
    dispatch('NAV_PRESENT', { idx: state.ui.presentIdx - 1 });
  });
  document.getElementById('present-next').addEventListener('click', () => {
    dispatch('NAV_PRESENT', { idx: state.ui.presentIdx + 1 });
  });
  document.getElementById('present-exit').addEventListener('click', () => {
    dispatch('END_PRESENT');
  });

  // 초기화 버튼
  document.getElementById('btn-reset').addEventListener('click', () => {
    openModal('modal-reset');
  });

  // 되돌리기 / 다시하기
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
}

// ── 유틸 ──────────────────────────────────────────────────────
function getClientXY(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function getTouchDist(t0, t1) {
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _highlightEdge(eid, on) {
  const el = document.querySelector(`[data-eid="${eid}"] .edge-line`);
  if (el) el.classList.toggle('hovered', on);
}

// ── 핀치 위치가 선택된 노드 위인지 확인 ──────────────────────
function _pinchOnSelectedNode(midX, midY) {
  const ids = state.ui.selectedIds;
  if (ids.length === 0) return null;
  const w = s2w(midX, midY);
  for (const id of ids) {
    const n = getNode(id);
    if (!n) continue;
    const r = SIZES[n.size] * 1.5; // 1.5배 넓은 감지 영역
    const dx = w.x - n.x, dy = w.y - n.y;
    if (dx * dx + dy * dy <= r * r) return id;
  }
  return null;
}

// ── 터치 이벤트 ───────────────────────────────────────────────
function onTouchStart(e) {
  e.preventDefault();

  if (e.touches.length === 2) {
    // 핀치 시작
    const t0 = e.touches[0], t1 = e.touches[1];
    const mx = (t0.clientX + t1.clientX) / 2;
    const my = (t0.clientY + t1.clientY) / 2;
    const nid = _pinchOnSelectedNode(mx, my);
    pinch.active = true;
    pinch.dist   = getTouchDist(t0, t1);
    pinch.midX   = mx;
    pinch.midY   = my;
    pinch.onNode = nid != null;
    pinch.nodeId = nid;
    // 드래그 취소
    _cancelDrag();
    return;
  }

  if (pinch.active) return;

  const { x, y } = getClientXY(e);
  _onPointerDown(x, y, e.target);
}

function onTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 2 && pinch.active) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const newDist = getTouchDist(t0, t1);
    const mx = (t0.clientX + t1.clientX) / 2;
    const my = (t0.clientY + t1.clientY) / 2;

    if (pinch.onNode && pinch.nodeId != null) {
      // 노드 크기 조절
      const ratio = newDist / (pinch.dist || 1);
      const n = getNode(pinch.nodeId);
      if (n) {
        const sizes = ['S', 'M', 'L'];
        const cur   = sizes.indexOf(n.size);
        if (ratio > 1.3 && cur < 2) {
          dispatch('UPDATE_NODE', { id: n.id, props: { size: sizes[cur + 1] } });
          pinch.dist = newDist;
        } else if (ratio < 0.75 && cur > 0) {
          dispatch('UPDATE_NODE', { id: n.id, props: { size: sizes[cur - 1] } });
          pinch.dist = newDist;
        }
      }
    } else {
      // 화면 확대/축소
      const sc0 = state.camera.sc;
      let   sc1 = sc0 * (newDist / pinch.dist);
      sc1 = Math.max(0.1, Math.min(4, sc1));

      // 핀치 중심점 기준 줌
      const w = s2w(pinch.midX, pinch.midY);
      state.camera.sc = sc1;
      state.camera.tx = pinch.midX - w.x * sc1;
      state.camera.ty = pinch.midY - w.y * sc1;
      applyCam();
    }
    pinch.dist = newDist;
    pinch.midX = mx; pinch.midY = my;
    return;
  }

  if (pinch.active) return;
  if (!drag.active) return;

  const { x, y } = getClientXY(e);
  _onPointerMove(x, y);
}

function onTouchEnd(e) {
  e.preventDefault();

  if (pinch.active && e.touches.length < 2) {
    pinch.active = false;
    return;
  }

  if (drag.active) {
    const { x, y } = getClientXY(e);
    _onPointerUp(x, y, e);
  }
}

// ── 마우스 이벤트 ─────────────────────────────────────────────
function onMouseDown(e) {
  if (e.button !== 0) return;
  _onPointerDown(e.clientX, e.clientY, e.target);
}
function onMouseMove(e) {
  if (!drag.active) return;
  _onPointerMove(e.clientX, e.clientY);
}
function onMouseUp(e) {
  if (!drag.active) return;
  _onPointerUp(e.clientX, e.clientY, e);
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.91;
  const w  = s2w(e.clientX, e.clientY);
  let sc = Math.max(0.1, Math.min(4, state.camera.sc * factor));
  state.camera.sc = sc;
  state.camera.tx = e.clientX - w.x * sc;
  state.camera.ty = e.clientY - w.y * sc;
  applyCam();
}

// ── 포인터 통합 핸들러 ────────────────────────────────────────
function _onPointerDown(cx, cy, target) {
  drag.screenStartX = cx;
  drag.screenStartY = cy;
  drag.moved = false;

  const w = s2w(cx, cy);
  drag.startX = w.x;
  drag.startY = w.y;
  drag.curX   = w.x;
  drag.curY   = w.y;

  // 1. 발표 모드면 무시
  if (state.ui.presentMode) return;

  // 2. 핸들 탭?
  const handleEl = target.closest('.handle');
  if (handleEl) {
    drag.active = true;
    drag.type   = 'handle';
    drag.nodeId = Number(handleEl.dataset.nid);
    return;
  }

  // 3. 노드 탭?
  const nodeHit = target.closest('[data-nid]');
  if (nodeHit) {
    const nid = Number(nodeHit.dataset.nid);

    // 그룹 그리기 모드면 무시
    if (state.ui.groupDrawMode) return;

    if (state.ui.selectMode) {
      // 멀티선택 모드: 탭으로 토글
      const ids = [...state.ui.selectedIds];
      const idx = ids.indexOf(nid);
      if (idx >= 0) ids.splice(idx, 1);
      else          ids.push(nid);
      dispatch('SELECT', { ids });
      return;
    }

    drag.active = true;
    drag.type   = 'node';
    drag.nodeId = nid;

    // 이미 선택된 노드인지
    if (!state.ui.selectedIds.includes(nid)) {
      dispatch('SELECT', { ids: [nid] });
    }
    return;
  }

  // 4. 엣지 탭?
  const edgeHit = target.closest('[data-eid]');
  if (edgeHit) {
    // 클릭 판정은 pointerUp에서 처리
    drag.active = false;
    drag.type   = 'edge-pending';
    drag._edgeId = Number(edgeHit.dataset.eid);
    return;
  }

  // 5. 그룹 영역 탭?
  const groupHit = target.closest('[data-gid]');
  if (groupHit && !target.closest('[data-nid]')) {
    const gid = Number(groupHit.dataset.gid);
    showGroupInBottomBar(gid);
    if (state.ui.groupDrawMode) return;
    // 선택 해제
    dispatch('DESELECT');
    return;
  }

  // 6. 빈 캔버스
  // 그룹 그리기 모드
  if (state.ui.groupDrawMode) {
    drag.active = true;
    drag.type   = 'group-draw';
    gDraw.x0 = w.x;
    gDraw.y0 = w.y;
    _showSelRect(cx, cy, 0, 0); // 화면 좌표로 초기 표시
    return;
  }

  // 멀티선택 드래그
  if (state.ui.selectMode) {
    drag.active = true;
    drag.type   = 'select';
    _showSelRect(cx, cy, 0, 0);
    return;
  }

  // 선택 해제 + 팬
  dispatch('DESELECT');
  drag.active = true;
  drag.type   = 'pan';
}

function _onPointerMove(cx, cy) {
  const dx = cx - drag.screenStartX;
  const dy = cy - drag.screenStartY;
  if (!drag.moved && Math.sqrt(dx * dx + dy * dy) > 4) drag.moved = true;
  if (!drag.moved) return;

  const w = s2w(cx, cy);
  drag.curX = w.x;
  drag.curY = w.y;

  if (drag.type === 'pan') {
    state.camera.tx += cx - (drag.screenStartX + (cx - drag.screenStartX - dx));
    // 매 프레임 이동 계산: 이전 cx 저장 없이 delta 누적
    state.camera.tx = cx - drag.startX * state.camera.sc;
    state.camera.ty = cy - drag.startY * state.camera.sc;
    applyCam();
    return;
  }

  if (drag.type === 'node') {
    const n = getNode(drag.nodeId);
    if (!n) return;
    // 멀티선택 전체 이동
    if (state.ui.selectedIds.length > 1 && state.ui.selectedIds.includes(drag.nodeId)) {
      const ddx = w.x - drag.curX + (w.x - drag.curX); // re-calc
      // 단순하게: 처음 위치 대비 delta
      if (!drag.multiStart.length) {
        drag.multiStart = state.ui.selectedIds.map(id => {
          const nd = getNode(id);
          return { id, x: nd.x, y: nd.y };
        });
      }
      const ddX = w.x - drag.startX;
      const ddY = w.y - drag.startY;
      const moves = drag.multiStart.map(s => ({ id: s.id, x: s.x + ddX, y: s.y + ddY }));
      dispatch('MOVE_NODES', { moves });
    } else {
      dispatch('MOVE_NODE', { id: drag.nodeId, x: w.x, y: w.y });
    }
    return;
  }

  if (drag.type === 'handle') {
    const n = getNode(drag.nodeId);
    if (!n) return;
    showGhostEdge(n, w.x, w.y);

    // 다른 노드 위인지 확인
    const over = _nodeAtWorld(w.x, w.y, drag.nodeId);
    if (over) {
      hideGhostNode();
    } else {
      showGhostNode(n, w.x, w.y);
    }
    return;
  }

  if (drag.type === 'select') {
    // sel-rect은 #world 밖(SVG 루트)에 있으므로 화면 좌표를 그대로 사용
    const x0 = drag.screenStartX, y0 = drag.screenStartY;
    const rx = Math.min(x0, cx), ry = Math.min(y0, cy);
    const rw = Math.abs(cx - x0), rh = Math.abs(cy - y0);
    _showSelRect(rx, ry, rw, rh);
    return;
  }

  if (drag.type === 'group-draw') {
    // 월드 좌표로 영역 계산 후 w2s()로 화면 좌표로 변환해서 sel-rect에 적용
    const w2  = s2w(cx, cy);
    const wx0 = Math.min(gDraw.x0, w2.x);
    const wy0 = Math.min(gDraw.y0, w2.y);
    const wx1 = Math.max(gDraw.x0, w2.x);
    const wy1 = Math.max(gDraw.y0, w2.y);
    const sTL = w2s(wx0, wy0);
    const sBR = w2s(wx1, wy1);
    _showSelRect(sTL.x, sTL.y, sBR.x - sTL.x, sBR.y - sTL.y);
    return;
  }
}

function _onPointerUp(cx, cy, e) {
  const w = s2w(cx, cy);

  // 엣지 클릭 (탭이었을 때)
  if (drag.type === 'edge-pending') {
    dispatch('CYCLE_EDGE', { id: drag._edgeId });
    _endDrag();
    return;
  }

  if (!drag.active) { _endDrag(); return; }

  if (drag.type === 'handle' && !drag.moved) {
    // 탭만 했을 때 → 아무것도 안 함
    hideGhostEdge(); hideGhostNode();
    _endDrag(); return;
  }

  if (drag.type === 'handle' && drag.moved) {
    hideGhostEdge(); hideGhostNode();
    const fromNode = getNode(drag.nodeId);
    if (!fromNode) { _endDrag(); return; }

    // 자기 자신으로 돌아오면 셀프 루프
    const r = SIZES[fromNode.size] * 1.5;
    const dx = w.x - fromNode.x, dy = w.y - fromNode.y;
    if (dx * dx + dy * dy <= r * r) {
      dispatch('CREATE_EDGE', { from: drag.nodeId, to: drag.nodeId });
      _endDrag(); return;
    }

    // 다른 노드 위
    const targetId = _nodeAtWorld(w.x, w.y, drag.nodeId);
    if (targetId != null) {
      dispatch('CREATE_EDGE', { from: drag.nodeId, to: targetId });
    } else {
      // 빈 공간 → 새 노드 생성 + 연결
      const newNode = dispatch('CREATE_NODE', {
        x: w.x, y: w.y,
        shape:  fromNode.shape,
        color:  fromNode.color,
        size:   fromNode.size,
        border: fromNode.border,
      });
      if (newNode) dispatch('CREATE_EDGE', { from: drag.nodeId, to: newNode.id });
    }
    _endDrag(); return;
  }

  if (drag.type === 'node') {
    if (drag.moved) {
      if (state.ui.selectedIds.length > 1) dispatch('MOVE_NODES_END');
      else dispatch('MOVE_NODE_END', { id: drag.nodeId });
      drag.multiStart = [];
    } else {
      // 탭: 더블탭 감지
      const now = Date.now();
      if (now - lastTapTime < DBL_TAP_MS && lastTapNodeId === drag.nodeId) {
        // 더블탭 → 편집 버튼 바 토글
        if (state.ui.editBarNodeId === drag.nodeId) {
          dispatch('HIDE_EDIT_BAR');
        } else {
          dispatch('SHOW_EDIT_BAR', { id: drag.nodeId });
        }
        lastTapTime = 0; lastTapNodeId = null;
      } else {
        // 첫 탭 → 선택 or 집중 모드 토글
        if (state.ui.selectedIds.includes(drag.nodeId)) {
          // 이미 선택 → 집중 모드
          dispatch('TOGGLE_FOCUS', { id: drag.nodeId });
        } else {
          dispatch('SELECT', { ids: [drag.nodeId] });
        }
        lastTapTime   = now;
        lastTapNodeId = drag.nodeId;
      }
    }
    _endDrag(); return;
  }

  if (drag.type === 'pan') {
    if (!drag.moved) {
      // 빈 캔버스 탭 → 새 노드 생성
      dispatch('CREATE_NODE', { x: w.x, y: w.y });
      hideHint();
    }
    _endDrag(); return;
  }

  if (drag.type === 'select' && drag.moved) {
    _hideSelRect();
    // 선택 사각형 안의 노드 선택
    const x0 = Math.min(drag.startX, w.x), y0 = Math.min(drag.startY, w.y);
    const x1 = Math.max(drag.startX, w.x), y1 = Math.max(drag.startY, w.y);
    const ids = state.nodes
      .filter(n => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1)
      .map(n => n.id);
    dispatch('SELECT', { ids });
    _endDrag(); return;
  }

  if (drag.type === 'group-draw') {
    _hideSelRect();
    if (!drag.moved) {
      // 탭만 했을 때 → 그룹 드로우 모드 취소
      dispatch('SET_GROUP_DRAW_MODE', { on: false });
      _endDrag(); return;
    }
    const x0 = Math.min(gDraw.x0, w.x), y0 = Math.min(gDraw.y0, w.y);
    const x1 = Math.max(gDraw.x0, w.x), y1 = Math.max(gDraw.y0, w.y);
    const bounds = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    // 범위 안의 노드
    const pad = GROUP_PAD;
    const nodeIds = state.nodes
      .filter(n => n.x >= x0 - pad && n.x <= x1 + pad &&
                   n.y >= y0 - pad && n.y <= y1 + pad)
      .map(n => n.id);
    dispatch('CREATE_GROUP', { nodeIds, bounds });
    dispatch('SET_GROUP_DRAW_MODE', { on: false });
    _endDrag(); return;
  }

  _endDrag();
}

function _cancelDrag() {
  hideGhostEdge();
  hideGhostNode();
  _hideSelRect();
  drag.active = false;
  drag.type   = null;
  drag.nodeId = null;
  drag.moved  = false;
  drag.multiStart = [];
}

function _endDrag() {
  _cancelDrag();
}

// ── 세계 좌표에서 노드 찾기 ──────────────────────────────────
function _nodeAtWorld(wx, wy, excludeId) {
  for (const n of state.nodes) {
    if (n.id === excludeId) continue;
    const r = SIZES[n.size] * 1.5;
    const dx = wx - n.x, dy = wy - n.y;
    if (dx * dx + dy * dy <= r * r) return n.id;
  }
  return null;
}

// ── 선택 사각형 ───────────────────────────────────────────────
function _showSelRect(x, y, w, h) {
  const r = document.getElementById('sel-rect');
  r.setAttribute('x', x);
  r.setAttribute('y', y);
  r.setAttribute('width',  Math.abs(w));
  r.setAttribute('height', Math.abs(h));
  r.setAttribute('display', '');
}
function _hideSelRect() {
  document.getElementById('sel-rect').setAttribute('display', 'none');
}

// ── 미니맵 클릭 ───────────────────────────────────────────────
function onMinimapClick(e) {
  if (state.nodes.length === 0) return;
  const mm   = document.getElementById('minimap');
  const rect = mm.getBoundingClientRect();
  const px   = (e.clientX - rect.left)  / mm.width;
  const py   = (e.clientY - rect.top)   / mm.height;

  const xs = state.nodes.flatMap(n => [n.x - SIZES[n.size], n.x + SIZES[n.size]]);
  const ys = state.nodes.flatMap(n => [n.y - SIZES[n.size], n.y + SIZES[n.size]]);
  const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40;
  const maxX = Math.max(...xs) + 40, maxY = Math.max(...ys) + 40;

  const wx = minX + (maxX - minX) * px;
  const wy = minY + (maxY - minY) * py;

  const svgEl = document.getElementById('canvas');
  state.camera.tx = svgEl.clientWidth  / 2 - wx * state.camera.sc;
  state.camera.ty = svgEl.clientHeight / 2 - wy * state.camera.sc;
  applyCam();
}

// ── 팬 보정 (pan type 재계산) ─────────────────────────────────
// onPointerMove의 pan 로직은 항상 startX/Y 기준 재계산 방식 사용
// (drag.startX = 세계 좌표상 처음 눌린 지점)
// camera.tx = currentScreenX - startWorldX * sc
