/* ============================================================
   RENDER.JS — 화면에 그리기 (SVG 노드/엣지/그룹/그리드)
   ============================================================ */

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표 변환 ─────────────────────────────────────────────────
// 세계 좌표 → 화면 좌표
function w2s(x, y) {
  return {
    x: x * state.camera.sc + state.camera.tx,
    y: y * state.camera.sc + state.camera.ty,
  };
}
// 화면 좌표 → 세계 좌표
function s2w(x, y) {
  return {
    x: (x - state.camera.tx) / state.camera.sc,
    y: (y - state.camera.ty) / state.camera.sc,
  };
}

// ── 카메라 적용 ───────────────────────────────────────────────
function applyCam() {
  const { tx, ty, sc } = state.camera;
  document.getElementById('world').setAttribute(
    'transform', `translate(${tx},${ty}) scale(${sc})`
  );
  // 줌 표시 갱신
  document.getElementById('zoom-ind').textContent = Math.round(sc * 100) + '%';
  // 미니맵 표시 조건
  const mm = document.getElementById('minimap');
  const showMM = sc < 0.7 || sc > 1.3;
  mm.classList.toggle('visible', showMM);
  if (showMM) drawMinimap();
}

// ── 메인 render ───────────────────────────────────────────────
function render() {
  renderGroups();
  renderEdges();
  renderNodes();
  renderMinimap();
}

// ── 그리드 ────────────────────────────────────────────────────
function renderGrid() {
  const bg = document.getElementById('bg-rect');
  bg.setAttribute('fill', state.ui.gridStyle === 'lines'
    ? 'url(#pat-lines)'
    : 'url(#pat-dots)');
  // 토글 버튼 동기화
  document.getElementById('tog-dots') .classList.toggle('active', state.ui.gridStyle === 'dots');
  document.getElementById('tog-lines').classList.toggle('active', state.ui.gridStyle === 'lines');
}

// ── 노드 ──────────────────────────────────────────────────────
function renderNodes() {
  const layer = document.getElementById('nodes-layer');
  const existingMap = {};
  layer.querySelectorAll('[data-nid]').forEach(el => {
    existingMap[el.dataset.nid] = el;
  });

  const ids = new Set(state.nodes.map(n => String(n.id)));

  // 삭제된 노드 제거
  Object.keys(existingMap).forEach(nid => {
    if (!ids.has(nid)) existingMap[nid].remove();
  });

  // 집중 모드 계산 — 연결된 노드 ID 목록
  let focusNeighbors = new Set();
  if (state.ui.focusNodeId != null) {
    focusNeighbors.add(state.ui.focusNodeId);
    state.edges.forEach(e => {
      if (e.from === state.ui.focusNodeId) focusNeighbors.add(e.to);
      if (e.to   === state.ui.focusNodeId) focusNeighbors.add(e.from);
    });
  }

  state.nodes.forEach(n => {
    let g = existingMap[String(n.id)];
    if (!g) {
      g = _createNodeEl(n);
      layer.appendChild(g);
    } else {
      _updateNodeEl(g, n);
    }

    // 상태 클래스
    const sel     = state.ui.selectedIds.includes(n.id);
    const dimmed  = state.ui.focusNodeId != null && !focusNeighbors.has(n.id);
    const present = state.ui.presentMode && !state.ui.presentList.includes(n.id);
    g.classList.toggle('sel',    sel);
    g.classList.toggle('dimmed', dimmed || present);
    g.classList.toggle('locked', n.locked);
  });
}

function _createNodeEl(n) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'node-g');
  g.dataset.nid = n.id;
  _updateNodeEl(g, n);
  return g;
}

function _updateNodeEl(g, n) {
  g.innerHTML = '';
  const r = SIZES[n.size];

  // blur filter
  const filterAttr = n.border === 'blur' ? 'url(#node-blur)' : 'none';

  // 모양별 shape element
  let shape;
  if (n.shape === 'circle') {
    shape = document.createElementNS(SVG_NS, 'circle');
    shape.setAttribute('cx', n.x);
    shape.setAttribute('cy', n.y);
    shape.setAttribute('r',  r);
  } else if (n.shape === 'square') {
    shape = document.createElementNS(SVG_NS, 'rect');
    shape.setAttribute('x',      n.x - r);
    shape.setAttribute('y',      n.y - r);
    shape.setAttribute('width',  r * 2);
    shape.setAttribute('height', r * 2);
    shape.setAttribute('rx', 4);
  } else { // triangle
    const pts = [
      `${n.x},${n.y - r}`,
      `${n.x + r * 0.866},${n.y + r * 0.5}`,
      `${n.x - r * 0.866},${n.y + r * 0.5}`,
    ].join(' ');
    shape = document.createElementNS(SVG_NS, 'polygon');
    shape.setAttribute('points', pts);
  }
  shape.setAttribute('fill',         n.color);
  shape.setAttribute('fill-opacity', '0.18');
  shape.setAttribute('stroke',       n.color);
  shape.setAttribute('stroke-width', '1.8');
  shape.setAttribute('filter',       filterAttr);
  shape.setAttribute('class',        'node-shape');
  g.appendChild(shape);

  // 라벨 (선택된 노드만 표시)
  if (n.label && state.ui.selectedIds.includes(n.id)) {
    const LBG_W = n.label.length * 7 + 16;
    const LBG_H = 18;
    const lbg = document.createElementNS(SVG_NS, 'rect');
    lbg.setAttribute('x',    n.x - LBG_W / 2);
    lbg.setAttribute('y',    n.y + r + 5);
    lbg.setAttribute('width',  LBG_W);
    lbg.setAttribute('height', LBG_H);
    lbg.setAttribute('rx', 3);
    lbg.setAttribute('fill', 'rgba(7,11,14,0.75)');
    lbg.setAttribute('class', 'node-label-bg');
    g.appendChild(lbg);

    const lt = document.createElementNS(SVG_NS, 'text');
    lt.setAttribute('x', n.x);
    lt.setAttribute('y', n.y + r + 5 + LBG_H / 2);
    lt.setAttribute('class', 'node-label-text');
    lt.textContent = n.label;
    g.appendChild(lt);
  }

  // 잠금 아이콘
  if (n.locked) {
    const lock = document.createElementNS(SVG_NS, 'text');
    lock.setAttribute('x', n.x + r * 0.6);
    lock.setAttribute('y', n.y - r * 0.6);
    lock.setAttribute('text-anchor', 'middle');
    lock.setAttribute('dominant-baseline', 'central');
    lock.setAttribute('font-size', '10');
    lock.setAttribute('fill', '#c8dde8');
    lock.setAttribute('class', 'node-lock-icon');
    lock.textContent = '🔒';
    g.appendChild(lock);
  }

  // 연결 핸들 4개 (선택 시 표시)
  const hPositions = [
    { cx: n.x,     cy: n.y - r - 8, dir: 'n' },
    { cx: n.x,     cy: n.y + r + 8, dir: 's' },
    { cx: n.x - r - 8, cy: n.y,     dir: 'w' },
    { cx: n.x + r + 8, cy: n.y,     dir: 'e' },
  ];
  hPositions.forEach(hp => {
    const h = document.createElementNS(SVG_NS, 'circle');
    h.setAttribute('cx', hp.cx);
    h.setAttribute('cy', hp.cy);
    h.setAttribute('r',  5);
    h.setAttribute('class', 'handle');
    h.dataset.dir = hp.dir;
    h.dataset.nid = n.id;
    g.appendChild(h);
  });

  // 투명 클릭 영역 (모양보다 넓게)
  let hitEl;
  if (n.shape === 'circle') {
    hitEl = document.createElementNS(SVG_NS, 'circle');
    hitEl.setAttribute('cx', n.x);
    hitEl.setAttribute('cy', n.y);
    hitEl.setAttribute('r',  r + 6);
  } else if (n.shape === 'square') {
    hitEl = document.createElementNS(SVG_NS, 'rect');
    hitEl.setAttribute('x',      n.x - r - 6);
    hitEl.setAttribute('y',      n.y - r - 6);
    hitEl.setAttribute('width',  (r + 6) * 2);
    hitEl.setAttribute('height', (r + 6) * 2);
    hitEl.setAttribute('rx', 6);
  } else {
    hitEl = document.createElementNS(SVG_NS, 'polygon');
    const pad = 8;
    const pts = [
      `${n.x},${n.y - r - pad}`,
      `${n.x + (r + pad) * 0.866},${n.y + (r + pad) * 0.5}`,
      `${n.x - (r + pad) * 0.866},${n.y + (r + pad) * 0.5}`,
    ].join(' ');
    hitEl.setAttribute('points', pts);
  }
  hitEl.setAttribute('fill',   'transparent');
  hitEl.setAttribute('stroke', 'none');
  hitEl.setAttribute('class',  'node-hit');
  hitEl.dataset.nid = n.id;
  g.appendChild(hitEl);
}

// ── 엣지 ──────────────────────────────────────────────────────
function renderEdges() {
  const layer = document.getElementById('edges-layer');
  const existing = {};
  layer.querySelectorAll('[data-eid]').forEach(el => {
    existing[el.dataset.eid] = el;
  });

  const ids = new Set(state.edges.map(e => String(e.id)));

  // 삭제된 엣지 제거
  Object.keys(existing).forEach(eid => {
    if (!ids.has(eid)) existing[eid].remove();
  });

  // 집중 모드 필터
  const focusId = state.ui.focusNodeId;
  const focusNeighborSet = new Set();
  if (focusId != null) {
    state.edges.forEach(e => {
      if (e.from === focusId || e.to === focusId) {
        focusNeighborSet.add(e.id);
      }
    });
  }

  state.edges.forEach(e => {
    const from = getNode(e.from);
    const to   = getNode(e.to);
    if (!from || !to) return;

    let g = existing[String(e.id)];
    if (!g) {
      g = document.createElementNS(SVG_NS, 'g');
      g.dataset.eid = e.id;
      layer.appendChild(g);
    }

    const dimmed = focusId != null && !focusNeighborSet.has(e.id);
    g.innerHTML = '';

    if (e.from === e.to) {
      _renderSelfLoop(g, from, e, dimmed);
    } else {
      _renderCurveEdge(g, from, to, e, dimmed);
    }
  });
}

function _renderCurveEdge(g, from, to, e, dimmed) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // 커브 오프셋 (수직 방향으로 휨)
  const off = len * 0.18;
  const mx  = (from.x + to.x) / 2 - (dy / len) * off;
  const my  = (from.y + to.y) / 2 + (dx / len) * off;

  const d = `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`;

  // 넓은 히트 영역
  const hit = document.createElementNS(SVG_NS, 'path');
  hit.setAttribute('d',     d);
  hit.setAttribute('class', 'edge-hit');
  hit.dataset.eid = e.id;
  g.appendChild(hit);

  // 실제 선
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', d);
  line.setAttribute('class', 'edge-line' + (dimmed ? ' dimmed' : ''));
  // 화살표 마커
  if (e.mode === 'fwd') line.setAttribute('marker-end',   'url(#arr-fwd)');
  if (e.mode === 'bwd') line.setAttribute('marker-start', 'url(#arr-bwd)');
  g.appendChild(line);
}

function _renderSelfLoop(g, node, e, dimmed) {
  const r  = SIZES[node.size];
  const x  = node.x;
  const y  = node.y - r;
  const d  = `M${x - r * 0.5},${y} C${x - r * 1.5},${y - r * 2} ${x + r * 1.5},${y - r * 2} ${x + r * 0.5},${y}`;

  const hit = document.createElementNS(SVG_NS, 'path');
  hit.setAttribute('d',     d);
  hit.setAttribute('class', 'edge-hit');
  hit.dataset.eid = e.id;
  g.appendChild(hit);

  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', d);
  line.setAttribute('class', 'edge-line' + (dimmed ? ' dimmed' : ''));
  if (e.mode === 'fwd') line.setAttribute('marker-end', 'url(#arr-fwd)');
  g.appendChild(line);
}

// ── 그룹 ──────────────────────────────────────────────────────
function renderGroups() {
  const layer = document.getElementById('groups-layer');
  const existing = {};
  layer.querySelectorAll('[data-gid]').forEach(el => {
    existing[el.dataset.gid] = el;
  });

  const ids = new Set(state.groups.map(g => String(g.id)));

  Object.keys(existing).forEach(gid => {
    if (!ids.has(gid)) existing[gid].remove();
  });

  state.groups.forEach(grp => {
    let g = existing[String(grp.id)];
    if (!g) {
      g = document.createElementNS(SVG_NS, 'g');
      g.dataset.gid = grp.id;
      layer.appendChild(g);
    }
    _updateGroupEl(g, grp);
  });
}

function _updateGroupEl(g, grp) {
  g.innerHTML = '';

  // 그룹 bounds 계산
  let bounds;
  if (grp.nodeIds.length > 0) {
    // 노드들의 위치로 자동 계산
    const ns = grp.nodeIds.map(id => getNode(id)).filter(Boolean);
    if (ns.length === 0) return;
    const xs = ns.flatMap(n => [n.x - SIZES[n.size], n.x + SIZES[n.size]]);
    const ys = ns.flatMap(n => [n.y - SIZES[n.size], n.y + SIZES[n.size]]);
    const minX = Math.min(...xs) - GROUP_PAD;
    const minY = Math.min(...ys) - GROUP_PAD;
    const maxX = Math.max(...xs) + GROUP_PAD;
    const maxY = Math.max(...ys) + GROUP_PAD;
    bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    // 명시적 bounds가 더 크면 합침
    if (grp.bounds) {
      bounds.x = Math.min(bounds.x, grp.bounds.x);
      bounds.y = Math.min(bounds.y, grp.bounds.y);
      const bx2 = Math.max(bounds.x + bounds.w, grp.bounds.x + grp.bounds.w);
      const by2 = Math.max(bounds.y + bounds.h, grp.bounds.y + grp.bounds.h);
      bounds.w = bx2 - bounds.x;
      bounds.h = by2 - bounds.y;
    }
  } else if (grp.bounds) {
    bounds = { ...grp.bounds };
  } else {
    return; // 노드도 bounds도 없으면 그리지 않음
  }

  const isEmpty = grp.nodeIds.length === 0;
  const c = grp.color;

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x',      bounds.x);
  rect.setAttribute('y',      bounds.y);
  rect.setAttribute('width',  bounds.w);
  rect.setAttribute('height', bounds.h);
  rect.setAttribute('fill',   c);
  rect.setAttribute('fill-opacity', '0.06');
  rect.setAttribute('stroke', c);
  rect.setAttribute('stroke-opacity', '0.5');
  rect.setAttribute('class',  'group-area' + (isEmpty ? ' empty' : ''));
  rect.dataset.gid = grp.id;
  g.appendChild(rect);

  // 그룹 이름 라벨
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', bounds.x + 10);
  label.setAttribute('y', bounds.y + 14);
  label.setAttribute('fill', c);
  label.setAttribute('class', 'group-label');
  label.textContent = grp.name;
  g.appendChild(label);
}

// ── 드래그 중 미리보기 ────────────────────────────────────────
let ghostEdgeEl  = null;
let ghostNodeEl  = null;

function showGhostEdge(fromNode, toX, toY) {
  const drag = document.getElementById('drag-layer');
  if (!ghostEdgeEl) {
    ghostEdgeEl = document.createElementNS(SVG_NS, 'path');
    ghostEdgeEl.setAttribute('class', 'ghost-edge');
    drag.appendChild(ghostEdgeEl);
  }
  const d = `M${fromNode.x},${fromNode.y} L${toX},${toY}`;
  ghostEdgeEl.setAttribute('d', d);
}

function showGhostNode(n, x, y) {
  const drag = document.getElementById('drag-layer');
  if (!ghostNodeEl) {
    ghostNodeEl = document.createElementNS(SVG_NS, 'circle');
    ghostNodeEl.setAttribute('class', 'ghost-node');
    drag.appendChild(ghostNodeEl);
  }
  ghostNodeEl.setAttribute('cx',   x);
  ghostNodeEl.setAttribute('cy',   y);
  ghostNodeEl.setAttribute('r',    SIZES[n.size]);
  ghostNodeEl.setAttribute('fill', n.color);
}

function hideGhostEdge() {
  if (ghostEdgeEl) { ghostEdgeEl.remove(); ghostEdgeEl = null; }
}
function hideGhostNode() {
  if (ghostNodeEl) { ghostNodeEl.remove(); ghostNodeEl = null; }
}

// ── 미니맵 ────────────────────────────────────────────────────
function renderMinimap() {
  if (!document.getElementById('minimap').classList.contains('visible')) return;
  drawMinimap();
}

function drawMinimap() {
  const canvas = document.getElementById('minimap');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (state.nodes.length === 0) return;

  // 전체 노드 bounding box
  const xs = state.nodes.flatMap(n => [n.x - SIZES[n.size], n.x + SIZES[n.size]]);
  const ys = state.nodes.flatMap(n => [n.y - SIZES[n.size], n.y + SIZES[n.size]]);
  const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40;
  const maxX = Math.max(...xs) + 40, maxY = Math.max(...ys) + 40;
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const scale = Math.min(W / spanX, H / spanY) * 0.9;
  const offX  = (W - spanX * scale) / 2 - minX * scale;
  const offY  = (H - spanY * scale) / 2 - minY * scale;

  // 엣지
  ctx.strokeStyle = '#2a4060';
  ctx.lineWidth   = 0.8;
  state.edges.forEach(e => {
    const f = getNode(e.from), t = getNode(e.to);
    if (!f || !t) return;
    ctx.beginPath();
    ctx.moveTo(f.x * scale + offX, f.y * scale + offY);
    ctx.lineTo(t.x * scale + offX, t.y * scale + offY);
    ctx.stroke();
  });

  // 노드
  state.nodes.forEach(n => {
    const nx = n.x * scale + offX;
    const ny = n.y * scale + offY;
    const nr = Math.max(2, SIZES[n.size] * scale);
    ctx.beginPath();
    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // 현재 뷰포트 rect
  const svgEl  = document.getElementById('canvas');
  const vw     = svgEl.clientWidth  / state.camera.sc;
  const vh     = svgEl.clientHeight / state.camera.sc;
  const vpx    = (-state.camera.tx / state.camera.sc) * scale + offX;
  const vpy    = (-state.camera.ty / state.camera.sc) * scale + offY;
  const vpw    = vw * scale;
  const vph    = vh * scale;

  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(vpx, vpy, vpw, vph);
  ctx.globalAlpha = 1;
}

// ── 발표 모드 카메라 이동 ─────────────────────────────────────
function flyToNode(nodeId, cb) {
  const n = getNode(nodeId);
  if (!n) { if (cb) cb(); return; }

  const svgEl   = document.getElementById('canvas');
  const targetSc = 1.4;
  const targetTx = svgEl.clientWidth  / 2 - n.x * targetSc;
  const targetTy = svgEl.clientHeight / 2 - n.y * targetSc;

  const startSc = state.camera.sc;
  const startTx = state.camera.tx;
  const startTy = state.camera.ty;
  const dur = 700;
  const t0  = performance.now();

  function step(t) {
    const p = Math.min((t - t0) / dur, 1);
    // easeInOut
    const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    state.camera.sc = startSc + (targetSc - startSc) * e;
    state.camera.tx = startTx + (targetTx - startTx) * e;
    state.camera.ty = startTy + (targetTy - startTy) * e;
    applyCam();
    if (p < 1) requestAnimationFrame(step);
    else if (cb) cb();
  }
  requestAnimationFrame(step);
}
