/* ============================================================
   STATE.JS — 데이터 구조, dispatch, 되돌리기
   ============================================================ */

// ── 상수 ──────────────────────────────────────────────────────
const COLORS = ['#00d4ff','#ff6b35','#a855f7','#10b981','#f59e0b','#ef4444'];
const SIZES  = { S: 16, M: 26, L: 40 }; // SVG radius (px)
const GROUP_COLORS = ['#00d4ff','#ff6b35','#a855f7','#10b981','#f59e0b','#ef4444'];
const GROUP_PAD = 28; // padding around nodes when drawing group hull (px)

// ── 상태 ──────────────────────────────────────────────────────
const state = {
  nodes:  [],   // { id, x, y, shape, color, size, border, label, note, locked }
  edges:  [],   // { id, from, to, mode }  mode: 'fwd'|'bwd'|'none'
  groups: [],   // { id, name, color, nodeIds[], order{}, bounds{x,y,w,h}|null }
  camera: { tx: 0, ty: 0, sc: 1 },
  ui: {
    selectedIds:   [],     // 선택된 노드 ID 목록
    editBarNodeId: null,   // 편집 버튼 바가 열린 노드 ID
    focusNodeId:   null,   // 집중 모드 노드 ID
    presentMode:   false,
    presentList:   [],     // 순서대로 정렬된 노드 ID 배열
    presentIdx:    0,
    activePanel:   null,   // 현재 열린 사이드바 패널 ID
    gridStyle:     'dots', // 'dots' | 'lines'
    selectMode:    false,  // 멀티 선택 모드
    groupDrawMode: false,  // 그룹 영역 그리기 모드
  },
};

// 핀(즐겨찾기) — localStorage에 별도 저장
let pins = []; // [{ shape, color, size, border }]

// ID 카운터
let nSeq = 1, eSeq = 1, gSeq = 1;

// ── 되돌리기 히스토리 ─────────────────────────────────────────
let history = [];
let histIdx  = -1;

function snapshot() {
  const snap = JSON.stringify({
    nodes:  state.nodes,
    edges:  state.edges,
    groups: state.groups,
    nSeq, eSeq, gSeq,
  });
  // 현재 위치 이후 히스토리 버림 (새 분기)
  history = history.slice(0, histIdx + 1);
  history.push(snap);
  if (history.length > 80) history.shift();
  histIdx = history.length - 1;
  saveSidebarStatus();
}

function undo() {
  if (histIdx <= 0) { showToast('Nothing to undo'); return; }
  histIdx--;
  _restoreSnap(history[histIdx]);
  showToast('Undo');
}

function redo() {
  if (histIdx >= history.length - 1) { showToast('Nothing to redo'); return; }
  histIdx++;
  _restoreSnap(history[histIdx]);
  showToast('Redo');
}

function _restoreSnap(snap) {
  const d = JSON.parse(snap);
  state.nodes  = d.nodes;
  state.edges  = d.edges;
  state.groups = d.groups;
  nSeq = d.nSeq; eSeq = d.eSeq; gSeq = d.gSeq;
  // 선택 해제
  state.ui.selectedIds   = [];
  state.ui.editBarNodeId = null;
  state.ui.focusNodeId   = null;
  render();
  updateUI();
}

// ── 헬퍼 ──────────────────────────────────────────────────────
function getNode(id)  { return state.nodes.find(n => n.id === id);  }
function getEdge(id)  { return state.edges.find(e => e.id === id);  }
function getGroup(id) { return state.groups.find(g => g.id === id); }

// 노드가 속한 그룹 목록
function nodeGroups(nodeId) {
  return state.groups.filter(g => g.nodeIds.includes(nodeId));
}

// 두 노드 사이에 같은 방향의 엣지가 있는지 확인
function edgeExists(from, to) {
  return state.edges.some(e => e.from === from && e.to === to);
}

// ── DISPATCH ──────────────────────────────────────────────────
// 모든 상태 변경은 여기를 통과한다
function dispatch(action, payload = {}) {
  switch (action) {

    // ── 노드 ──
    case 'CREATE_NODE': {
      const n = {
        id:     nSeq++,
        x:      payload.x,
        y:      payload.y,
        shape:  payload.shape  || 'circle',
        color:  payload.color  || COLORS[0],
        size:   payload.size   || 'M',
        border: payload.border || 'sharp',
        label:  payload.label  || '',
        note:   payload.note   || '',
        locked: false,
      };
      state.nodes.push(n);
      // 그룹 지정이 있으면 추가
      if (payload.groupId != null) {
        const g = getGroup(payload.groupId);
        if (g && !g.nodeIds.includes(n.id)) {
          g.nodeIds.push(n.id);
          g.order[n.id] = g.nodeIds.length - 1;
        }
      }
      snapshot();
      render();
      return n;
    }

    case 'DELETE_NODE': {
      const n = getNode(payload.id);
      if (!n || n.locked) return;
      state.nodes = state.nodes.filter(nd => nd.id !== payload.id);
      state.edges = state.edges.filter(e => e.from !== payload.id && e.to !== payload.id);
      state.groups.forEach(g => {
        g.nodeIds = g.nodeIds.filter(nid => nid !== payload.id);
        delete g.order[payload.id];
      });
      // 선택 해제
      state.ui.selectedIds   = state.ui.selectedIds.filter(i => i !== payload.id);
      state.ui.editBarNodeId = state.ui.editBarNodeId === payload.id ? null : state.ui.editBarNodeId;
      state.ui.focusNodeId   = state.ui.focusNodeId   === payload.id ? null : state.ui.focusNodeId;
      snapshot();
      render();
      updateUI();
      break;
    }

    case 'UPDATE_NODE': {
      const n = getNode(payload.id);
      if (!n) return;
      Object.assign(n, payload.props);
      snapshot();
      render();
      updateBottomBar();
      break;
    }

    // 드래그 중 실시간 이동 — 스냅샷 없음
    case 'MOVE_NODE': {
      const n = getNode(payload.id);
      if (!n || n.locked) return;
      n.x = payload.x;
      n.y = payload.y;
      render();
      // 그룹 bounds 업데이트
      _updateGroupBoundsForNode(payload.id);
      break;
    }

    // 드래그 끝 — 스냅샷 저장
    case 'MOVE_NODE_END': {
      snapshot();
      break;
    }

    // 여러 노드 함께 이동 (멀티선택)
    case 'MOVE_NODES': {
      payload.moves.forEach(({ id, x, y }) => {
        const n = getNode(id);
        if (n && !n.locked) { n.x = x; n.y = y; }
      });
      render();
      break;
    }
    case 'MOVE_NODES_END': {
      snapshot();
      break;
    }

    // ── 엣지 ──
    case 'CREATE_EDGE': {
      if (edgeExists(payload.from, payload.to)) return null;
      const e = { id: eSeq++, from: payload.from, to: payload.to, mode: 'fwd' };
      state.edges.push(e);
      snapshot();
      render();
      return e;
    }

    case 'CYCLE_EDGE': {
      const e = getEdge(payload.id);
      if (!e) return;
      const isSelf = e.from === e.to;
      if (isSelf) {
        // fwd → none → 삭제
        if (e.mode === 'fwd') e.mode = 'none';
        else state.edges = state.edges.filter(ed => ed.id !== e.id);
      } else {
        // fwd → bwd → none → 삭제
        if      (e.mode === 'fwd') e.mode = 'bwd';
        else if (e.mode === 'bwd') e.mode = 'none';
        else state.edges = state.edges.filter(ed => ed.id !== e.id);
      }
      snapshot();
      render();
      break;
    }

    // ── 그룹 ──
    case 'CREATE_GROUP': {
      const g = {
        id:      gSeq++,
        name:    payload.name   || 'Group',
        color:   payload.color  || GROUP_COLORS[0],
        nodeIds: payload.nodeIds || [],
        order:   {},
        bounds:  payload.bounds || null, // 빈 그룹일 때 명시적 bounds
      };
      (payload.nodeIds || []).forEach((nid, i) => { g.order[nid] = i; });
      state.groups.push(g);
      snapshot();
      render();
      renderGroupsPanel();
      return g;
    }

    case 'DELETE_GROUP': {
      state.groups = state.groups.filter(g => g.id !== payload.id);
      snapshot();
      render();
      renderGroupsPanel();
      break;
    }

    case 'UPDATE_GROUP': {
      const g = getGroup(payload.id);
      if (!g) return;
      Object.assign(g, payload.props);
      render();
      renderGroupsPanel();
      break;
    }

    case 'ADD_NODE_TO_GROUP': {
      const g = getGroup(payload.groupId);
      const n = getNode(payload.nodeId);
      if (!g || !n || g.nodeIds.includes(payload.nodeId)) return;
      g.nodeIds.push(payload.nodeId);
      g.order[payload.nodeId] = g.nodeIds.length - 1;
      snapshot();
      render();
      renderGroupsPanel();
      break;
    }

    // ── 선택 ──
    case 'SELECT': {
      state.ui.selectedIds = payload.ids || [];
      state.ui.editBarNodeId = null;
      state.ui.focusNodeId   = null;
      render();
      hideEditBar();
      updateBottomBar();
      break;
    }

    case 'DESELECT': {
      state.ui.selectedIds   = [];
      state.ui.editBarNodeId = null;
      state.ui.focusNodeId   = null;
      render();
      hideEditBar();
      hideBottomBar();
      break;
    }

    case 'SHOW_EDIT_BAR': {
      state.ui.editBarNodeId = payload.id;
      render();
      showEditBar(payload.id);
      break;
    }

    case 'HIDE_EDIT_BAR': {
      state.ui.editBarNodeId = null;
      hideEditBar();
      break;
    }

    // ── 집중 모드 ──
    case 'TOGGLE_FOCUS': {
      if (state.ui.focusNodeId === payload.id) {
        state.ui.focusNodeId = null;
      } else {
        state.ui.focusNodeId = payload.id;
      }
      render();
      break;
    }

    // ── 잠금 ──
    case 'TOGGLE_LOCK': {
      const n = getNode(payload.id);
      if (!n) return;
      n.locked = !n.locked;
      snapshot();
      render();
      // 편집 바 아이콘 갱신
      syncEditBarLock(n);
      break;
    }

    // ── 카메라 ──
    case 'SET_CAMERA': {
      Object.assign(state.camera, payload);
      applyCam();
      break;
    }

    // ── UI 설정 ──
    case 'SET_GRID': {
      state.ui.gridStyle = payload.style;
      renderGrid();
      break;
    }

    case 'SET_SELECT_MODE': {
      state.ui.selectMode = payload.on;
      const el = document.getElementById('select-mode-ind');
      if (el) el.classList.toggle('visible', payload.on);
      const canvas = document.getElementById('canvas');
      if (canvas) canvas.classList.toggle('select-mode', payload.on);
      const btn = document.getElementById('btn-select-mode');
      if (btn) btn.classList.toggle('active', payload.on);
      break;
    }

    case 'SET_GROUP_DRAW_MODE': {
      state.ui.groupDrawMode = payload.on;
      const el = document.getElementById('group-draw-hint');
      if (el) el.classList.toggle('visible', payload.on);
      const canvas = document.getElementById('canvas');
      if (canvas) canvas.classList.toggle('group-draw', payload.on);
      break;
    }

    case 'SET_PANEL': {
      state.ui.activePanel = payload.id;
      updateSidebarPanel();
      break;
    }

    // ── 발표 모드 ──
    case 'START_PRESENT': {
      state.ui.presentMode  = true;
      state.ui.presentList  = payload.list;
      state.ui.presentIdx   = 0;
      render();
      showPresentUI();
      flyToNode(state.ui.presentList[0]);
      break;
    }

    case 'NAV_PRESENT': {
      const len = state.ui.presentList.length;
      state.ui.presentIdx = Math.max(0, Math.min(len - 1, payload.idx));
      const nid = state.ui.presentList[state.ui.presentIdx];
      flyToNode(nid);
      updatePresentCounter();
      // 선택하여 하단 바 갱신
      state.ui.selectedIds = [nid];
      updateBottomBar();
      break;
    }

    case 'END_PRESENT': {
      state.ui.presentMode = false;
      state.ui.selectedIds = [];
      render();
      hidePresentUI();
      hideBottomBar();
      break;
    }

    // ── 초기화 ──
    case 'RESET': {
      state.nodes  = [];
      state.edges  = [];
      state.groups = [];
      nSeq = 1; eSeq = 1; gSeq = 1;
      state.ui.selectedIds   = [];
      state.ui.editBarNodeId = null;
      state.ui.focusNodeId   = null;
      state.ui.presentMode   = false;
      history = []; histIdx = -1;
      snapshot();
      render();
      updateUI();
      break;
    }

    // ── 상태 복원 (JSON 불러오기) ──
    case 'RESTORE': {
      const d = payload.data;
      state.nodes  = d.nodes  || [];
      state.edges  = d.edges  || [];
      state.groups = d.groups || [];
      nSeq = d.nSeq || (state.nodes.length  + 1);
      eSeq = d.eSeq || (state.edges.length  + 1);
      gSeq = d.gSeq || (state.groups.length + 1);
      state.ui.selectedIds   = [];
      state.ui.editBarNodeId = null;
      state.ui.focusNodeId   = null;
      history = []; histIdx = -1;
      snapshot();
      render();
      updateUI();
      break;
    }

    // ── 핀 ──
    case 'ADD_PIN': {
      const n = getNode(payload.id);
      if (!n) return;
      pins.push({ shape: n.shape, color: n.color, size: n.size, border: n.border });
      savePins();
      renderPinsPanel();
      showToast('Pinned');
      break;
    }

    case 'DELETE_PIN': {
      pins.splice(payload.idx, 1);
      savePins();
      renderPinsPanel();
      break;
    }

    default:
      console.warn('[dispatch] Unknown action:', action);
  }
}

// ── 그룹 bounds 재계산 (노드 이동 시) ──────────────────────────
function _updateGroupBoundsForNode(nodeId) {
  // 해당 노드가 속한 빈 그룹의 bounds를 다시 계산할 필요는 없음
  // (renderGroups에서 실시간으로 계산)
}

// ── 핀 저장/불러오기 ──────────────────────────────────────────
function savePins() {
  try { localStorage.setItem('ts_pins', JSON.stringify(pins)); } catch(e) {}
}
function loadPins() {
  try {
    const raw = localStorage.getItem('ts_pins');
    if (raw) pins = JSON.parse(raw);
  } catch(e) { pins = []; }
}
