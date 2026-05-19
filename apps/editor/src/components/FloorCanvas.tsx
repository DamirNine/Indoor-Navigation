import { useEffect, useState, useCallback, useRef } from 'react';
import { Stage, Layer, Circle, Line, Image as KonvaImage, Rect, Text, Group, Shape } from 'react-konva';
import { useEditorStore } from '../store/editorStore';
import AddNodeDialog from './AddNodeDialog';
import AddEdgeDialog from './AddEdgeDialog';
import type { NavNode, NodeType, EdgeType } from '../types/building';

const VIRTUAL_W = 10000;
const VIRTUAL_H = 8000;
const SNAP_DIST = 22;
const SEGMENT_CLICK_DIST = 28;

function ptToSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

function constrainTo45(last: [number, number], x: number, y: number): [number, number] {
  const dx = x - last[0], dy = y - last[1];
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return [x, y];
  const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [last[0] + dist * Math.cos(snapped), last[1] + dist * Math.sin(snapped)];
}

// Generate n arc points from A through control B to C (circular arc through 3 points).
// Returns intermediate points only — not A, includes C.
function arcThrough3Pts(A: [number, number], B: [number, number], C: [number, number], n = 10): [number, number][] {
  const [x1, y1] = A, [x2, y2] = B, [x3, y3] = C;
  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(D) < 0.1) return [C];
  const ux = ((x1 ** 2 + y1 ** 2) * (y2 - y3) + (x2 ** 2 + y2 ** 2) * (y3 - y1) + (x3 ** 2 + y3 ** 2) * (y1 - y2)) / D;
  const uy = ((x1 ** 2 + y1 ** 2) * (x3 - x2) + (x2 ** 2 + y2 ** 2) * (x1 - x3) + (x3 ** 2 + y3 ** 2) * (x2 - x1)) / D;
  const r = Math.hypot(x1 - ux, y1 - uy);
  const a0 = Math.atan2(y1 - uy, x1 - ux);
  const a2 = Math.atan2(y3 - uy, x3 - ux);
  const aB = Math.atan2(y2 - uy, x2 - ux);
  let da = a2 - a0;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;
  const mid = a0 + da * 0.5;
  if (Math.abs(Math.atan2(Math.sin(mid - aB), Math.cos(mid - aB))) > Math.PI / 2)
    da = da - Math.sign(da) * 2 * Math.PI;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + da * (i + 1) / n;
    return [+(ux + r * Math.cos(a)).toFixed(1), +(uy + r * Math.sin(a)).toFixed(1)] as [number, number];
  });
}

function applyCtxTransform(px: number, py: number, cx: number, cy: number, t: { tx: number; ty: number; scale: number; rot: number }): [number, number] {
  const dx = px - cx, dy = py - cy;
  const sx = dx * t.scale, sy = dy * t.scale;
  const rx = sx * Math.cos(t.rot) - sy * Math.sin(t.rot);
  const ry = sx * Math.sin(t.rot) + sy * Math.cos(t.rot);
  return [rx + cx + t.tx, ry + cy + t.ty];
}

const NODE_COLOR: Record<NodeType, string> = {
  room: '#1976D2', stairs: '#F57C00', elevator: '#7B1FA2',
  entrance: '#2E7D32', corridor: '#757575',
};
const AREA_FILL: Record<NodeType, string> = {
  room: 'rgba(25,118,210,0.15)', stairs: 'rgba(245,124,0,0.18)',
  elevator: 'rgba(123,31,162,0.18)', entrance: 'rgba(46,125,50,0.18)',
  corridor: '',
};

interface Props {
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  stagePos: { x: number; y: number };
  setStagePos: (p: { x: number; y: number }) => void;
}

type ZoneMode = 'draw' | 'edit' | null;

export default function FloorCanvas({ zoom, setZoom, stagePos, setStagePos }: Props) {
  const {
    building, activeFloorIndex, tool, selectedNodeId, selectedEdgeKey, pendingEdgeFromId,
    previewRoute, addNode, selectNode, selectEdge, setPendingEdgeFrom, addEdge,
    moveNode, moveNodes, undo, addArea, addFloorContour, updateFloorContour, updateAllFloorsContours, removeFloorContour,
  } = useEditorStore();

  const routeSet = new Set(previewRoute ?? []);
  const routePairs = new Set(
    (previewRoute ?? []).slice(0, -1).map((id, i) => {
      const a = id, b = previewRoute![i + 1];
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    })
  );
  const isRouteEdge = (from: string, to: string) => {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    return routePairs.has(key);
  };

  const floor = building.floors[activeFloorIndex];

  const [addNodePos, setAddNodePos] = useState<{ x: number; y: number } | null>(null);
  const [pendingEdgeTo, setPendingEdgeTo] = useState<NavNode | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 500 });

  // Zone state
  const [zoneMode, setZoneMode] = useState<ZoneMode>(null);
  const [zoneNodeId, setZoneNodeId] = useState<string | null>(null);
  const [zonePoints, setZonePoints] = useState<number[][]>([]);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Contour state
  const [contourMode, setContourMode] = useState<ZoneMode>(null);
  const [contourPoints, setContourPoints] = useState<number[][]>([]);
  const [editingContourIdx, setEditingContourIdx] = useState<number | null>(null);

  // Multi-select, drag, rubber-band, arc
  const [shiftKey, setShiftKey] = useState(false);
  const [selVerts, setSelVerts] = useState<number[]>([]);
  const [selNodeIds, setSelNodeIds] = useState<string[]>([]);
  const [rubberBand, setRubberBand] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [isArcMode, setIsArcMode] = useState(false);
  const [arcControlPt, setArcControlPt] = useState<[number, number] | null>(null);
  const [draggingNodePos, setDraggingNodePos] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const [ctxMode, setCtxMode] = useState(false);
  const [ctxTx, setCtxTx] = useState({ tx: 0, ty: 0, scale: 1, rot: 0 });

  // Precision panel state
  const [precDx, setPrecDx] = useState(0);
  const [precDy, setPrecDy] = useState(0);
  const [stretchAxis, setStretchAxis] = useState<'x' | 'y'>('x');
  const [stretchAnchor, setStretchAnchor] = useState<'min' | 'center' | 'max'>('center');
  const [stretchTarget, setStretchTarget] = useState(0);
  const [uniformSpacing, setUniformSpacing] = useState(true);

  useEffect(() => {
    if (selNodeIds.length >= 2) {
      const nodes = selNodeIds.map(id => floor.nodes.find(n => n.id === id)).filter(Boolean) as NavNode[];
      const vals = nodes.map(n => stretchAxis === 'x' ? n.x : n.y);
      setStretchTarget(Math.round(Math.max(...vals) - Math.min(...vals)));
    } else if (selVerts.length >= 2 && editingContourIdx !== null) {
      const contour = floor.contours?.[editingContourIdx];
      if (contour) {
        const vals = selVerts.map(i => stretchAxis === 'x' ? contour[i][0] : contour[i][1]);
        setStretchTarget(Math.round(Math.max(...vals) - Math.min(...vals)));
      }
    }
  }, [selNodeIds.join(','), selVerts.join(','), stretchAxis, editingContourIdx]);

  // Refs for drag tracking (avoid stale closures)
  const dragging = useRef<{ indices: number[]; startMouse: [number, number]; startPts: [number, number][] } | null>(null);
  const nodeDrag = useRef<{ ids: string[]; startMouse: [number, number]; startPositions: { [id: string]: [number, number] } } | null>(null);
  const didDrag = useRef(false);
  const dragDist = useRef(0);
  const ctxDrag = useRef<{ type: 'move' | 'scale' | 'rotate'; startMouse: [number, number]; startTx: { tx: number; ty: number; scale: number; rot: number }; pivotX: number; pivotY: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastPinchDist = useRef(0);
  const isPanning = tool === 'pan';
  const isMoving = tool === 'move';
  const isZone = tool === 'zone';
  const isContour = tool === 'contour';

  // Map<nodeId, anchorColor> — green=min, red=max, orange=center-closest
  const stretchAnchorMap = (() => {
    const m = new Map<string, string>();
    if (!isMoving || selNodeIds.length < 2) return m;
    const nodes = selNodeIds.map(id => floor.nodes.find(n => n.id === id)).filter(Boolean) as NavNode[];
    const vals = nodes.map(n => stretchAxis === 'x' ? n.x : n.y);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const nMin = nodes.find(n => (stretchAxis === 'x' ? n.x : n.y) === minV);
    const nMax = nodes.find(n => (stretchAxis === 'x' ? n.x : n.y) === maxV);
    if (stretchAnchor === 'min' && nMin) {
      m.set(nMin.id, '#E53935');
    } else if (stretchAnchor === 'max' && nMax) {
      m.set(nMax.id, '#E53935');
    } else {
      const midV = (minV + maxV) / 2;
      const nCenter = nodes.reduce((best, n) => {
        const v = stretchAxis === 'x' ? n.x : n.y;
        const bv = stretchAxis === 'x' ? best.x : best.y;
        return Math.abs(v - midV) < Math.abs(bv - midV) ? n : best;
      });
      m.set(nCenter.id, '#E53935');
    }
    return m;
  })();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setStageSize({ w: Math.floor(width), h: Math.floor(height) });
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setStageSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!floor?.imageDataUrl) { setBgImage(null); return; }
    const img = new window.Image();
    img.onload = () => setBgImage(img);
    img.src = floor.imageDataUrl;
  }, [floor?.imageDataUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setShiftKey(e.shiftKey);
      if ((e.key === 'z' || e.key === 'я') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.repeat) { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, []);

  const cancelZone = useCallback(() => {
    setZoneMode(null); setZoneNodeId(null); setZonePoints([]); setSelectedVertex(null); setCursorPos(null);
  }, []);

  const cancelContour = useCallback(() => {
    setContourMode(null); setContourPoints([]); setEditingContourIdx(null); setCursorPos(null);
    setSelVerts([]); setRubberBand(null); setIsArcMode(false); setArcControlPt(null);
    dragging.current = null; ctxDrag.current = null;
    setCtxMode(false); setCtxTx({ tx: 0, ty: 0, scale: 1, rot: 0 });
  }, []);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setPendingEdgeFrom(null); setPendingEdgeTo(null); cancelZone(); cancelContour(); }
    if (e.key === 'Delete' && zoneMode === 'edit' && selectedVertex !== null) {
      setZonePoints(pts => pts.filter((_, i) => i !== selectedVertex));
      setSelectedVertex(null);
    }
    if (e.key === 'Delete' && contourMode === 'edit' && selVerts.length > 0) {
      const del = new Set(selVerts);
      setContourPoints(pts => { const next = pts.filter((_, i) => !del.has(i)); return next.length >= 3 ? next : pts; });
      setSelVerts([]);
    }
  }, [setPendingEdgeFrom, cancelZone, cancelContour, zoneMode, selectedVertex, contourMode, selVerts]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  useEffect(() => { if (!isZone) cancelZone(); }, [isZone, cancelZone]);

  useEffect(() => {
    if (!isContour) { cancelContour(); return; }
    const existing = floor?.contours;
    if (existing && existing.length > 0) {
      setEditingContourIdx(0); setContourMode('edit'); setContourPoints([...existing[0]]);
    } else {
      setEditingContourIdx(null); setContourMode('draw'); setContourPoints([]);
    }
    setSelVerts([]); setIsArcMode(false); setArcControlPt(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContour, activeFloorIndex]);

  const handleWheel = (e: any) => {
    if (!isPanning) return;
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const ptr = stage.getPointerPosition();
    const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => {
      const nz = Math.min(Math.max(z * factor, 0.1), 5);
      setStagePos({ x: ptr.x - (ptr.x - stagePos.x) * (nz / z), y: ptr.y - (ptr.y - stagePos.y) * (nz / z) });
      return nz;
    });
  };

  const handleTouchMove = (e: any) => {
    if (!isPanning) return;
    const touches = e.evt.touches;
    if (touches.length !== 2) { lastPinchDist.current = 0; return; }
    const dist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
    if (lastPinchDist.current > 0) {
      const cx = (touches[0].clientX + touches[1].clientX) / 2;
      const cy = (touches[0].clientY + touches[1].clientY) / 2;
      const rect = containerRef.current?.getBoundingClientRect();
      const ox = cx - (rect?.left ?? 0), oy = cy - (rect?.top ?? 0);
      const factor = dist / lastPinchDist.current;
      setZoom(z => {
        const nz = Math.min(Math.max(z * factor, 0.1), 5);
        setStagePos({ x: ox - (ox - stagePos.x) * (nz / z), y: oy - (oy - stagePos.y) * (nz / z) });
        return nz;
      });
    }
    lastPinchDist.current = dist;
  };

  if (!floor) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#f5f5f5' }}>
      Добавьте этаж в левой панели
    </div>
  );

  const getNode = (id: string) => floor.nodes.find(n => n.id === id);

  const ctxAllPts = (floor.contours ?? []).flat();
  const ctxBbox = ctxAllPts.length >= 2 ? (() => {
    const xs = ctxAllPts.map((p: number[]) => p[0]);
    const ys = ctxAllPts.map((p: number[]) => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  })() : null;
  const ctxCx = ctxBbox ? (ctxBbox.minX + ctxBbox.maxX) / 2 : 0;
  const ctxCy = ctxBbox ? (ctxBbox.minY + ctxBbox.maxY) / 2 : 0;

  const toVirtXY = (stage: any): [number, number] => {
    const ptr = stage.getPointerPosition();
    if (!ptr) return [0, 0];
    return [(ptr.x - stagePos.x) / zoom, (ptr.y - stagePos.y) / zoom];
  };

  const toVirtual = (e: any) => {
    const [x, y] = toVirtXY(e.target.getStage());
    return { x, y };
  };

  const snap = (x: number, y: number): [number, number] => {
    for (const area of (floor.areas ?? [])) {
      if (area.nodeId === zoneNodeId) continue;
      for (const [px, py] of area.points)
        if (Math.hypot(x - px, y - py) < SNAP_DIST) return [px, py];
    }
    return [x, y];
  };

  const snapContour = (x: number, y: number): [number, number] => {
    for (const area of (floor.areas ?? []))
      for (const [px, py] of area.points)
        if (Math.hypot(x - px, y - py) < SNAP_DIST) return [px, py];
    for (const c of (floor.contours ?? []))
      for (const [px, py] of c)
        if (Math.hypot(x - px, y - py) < SNAP_DIST) return [px, py];
    for (const [px, py] of contourPoints)
      if (Math.hypot(x - px, y - py) < SNAP_DIST) return [px, py];
    return [x, y];
  };

  const nearestContourSegment = (x: number, y: number): number | null => {
    if (contourPoints.length < 2) return null;
    let best: number | null = null, bestDist = SEGMENT_CLICK_DIST;
    for (let i = 0; i < contourPoints.length; i++) {
      const [x1, y1] = contourPoints[i], [x2, y2] = contourPoints[(i + 1) % contourPoints.length];
      const d = ptToSegDist(x, y, x1, y1, x2, y2);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };

  const centroid = (pts: number[][]) => ({
    x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
    y: pts.reduce((s, p) => s + p[1], 0) / pts.length,
  });

  const saveZone = () => {
    if (zoneNodeId && zonePoints.length >= 3) addArea({ nodeId: zoneNodeId, points: zonePoints });
    cancelZone();
  };

  const saveContour = () => {
    if (contourPoints.length < 3) return;
    if (editingContourIdx !== null) {
      updateFloorContour(editingContourIdx, contourPoints);
    } else {
      addFloorContour(contourPoints);
      setEditingContourIdx(floor.contours?.length ?? 0);
      setContourMode('edit');
    }
    setSelVerts([]);
  };

  const startNewContour = () => {
    if (editingContourIdx !== null && contourPoints.length >= 3)
      updateFloorContour(editingContourIdx, contourPoints);
    setEditingContourIdx(null); setContourMode('draw'); setContourPoints([]);
    setSelVerts([]); setIsArcMode(false); setArcControlPt(null);
  };

  const deleteContour = () => {
    if (editingContourIdx === null) return;
    if (!window.confirm('Удалить контур?')) return;
    removeFloorContour(editingContourIdx);
    setContourMode('draw'); setContourPoints([]); setEditingContourIdx(null); setSelVerts([]);
  };

  const switchToContour = (ci: number, pts: number[][]) => {
    if (editingContourIdx !== null && contourPoints.length >= 3)
      updateFloorContour(editingContourIdx, contourPoints);
    setEditingContourIdx(ci); setContourPoints([...pts]); setContourMode('edit'); setSelVerts([]);
  };

  // ── VERTEX MOUSE DOWN → start drag ───────────────────────────────────────
  const handleVertexMouseDown = (e: any, i: number) => {
    e.cancelBubble = true;
    didDrag.current = false; dragDist.current = 0;
    const [mx, my] = toVirtXY(e.target.getStage());
    const indices = selVerts.includes(i) ? selVerts : [i];
    if (!selVerts.includes(i)) setSelVerts([i]);
    dragging.current = {
      indices,
      startMouse: [mx, my],
      startPts: contourPoints.map(p => [p[0], p[1]]),
    };
    setRubberBand(null);
  };

  // ── STAGE MOUSE DOWN → rubber band ──────────────────────────────────────
  const handleStageMouseDown = (e: any) => {
    didDrag.current = false; dragDist.current = 0;
    if (isPanning) return;
    if (ctxMode) return;
    if (e.target.getClassName() === 'Circle') return;
    const [x, y] = toVirtXY(e.target.getStage());
    if (isMoving) {
      setRubberBand({ sx: x, sy: y, ex: x, ey: y });
      if (!shiftKey) setSelNodeIds([]);
      return;
    }
    if (!isContour || contourMode !== 'edit') return;
    setRubberBand({ sx: x, sy: y, ex: x, ey: y });
    if (!shiftKey) setSelVerts([]);
  };

  // ── STAGE MOUSE UP → end drag / rubber band ──────────────────────────────
  const handleStageMouseUp = () => {
    if (ctxDrag.current) { ctxDrag.current = null; return; }
    if (nodeDrag.current) {
      if (draggingNodePos) {
        for (const id of nodeDrag.current.ids) {
          const orig = nodeDrag.current.startPositions[id];
          if (orig) moveNode(id, +(orig[0] + draggingNodePos.dx).toFixed(1), +(orig[1] + draggingNodePos.dy).toFixed(1));
        }
      }
      nodeDrag.current = null;
      setDraggingNodePos(null);
      setTimeout(() => { didDrag.current = false; }, 10);
      return;
    }
    if (dragging.current) {
      dragging.current = null;
      setContourPoints(pts => pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]));
      setTimeout(() => { didDrag.current = false; }, 10);
      return;
    }
    if (rubberBand && dragDist.current > 8) {
      const { sx, sy, ex, ey } = rubberBand;
      const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
      const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
      if (isMoving) {
        const sel = floor.nodes
          .filter(n => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY)
          .map(n => n.id);
        setSelNodeIds(shiftKey ? prev => [...new Set([...prev, ...sel])] : sel);
      } else {
        const sel = contourPoints.map(([px, py], i) =>
          px >= minX && px <= maxX && py >= minY && py <= maxY ? i : -1
        ).filter(i => i >= 0);
        setSelVerts(shiftKey ? prev => [...new Set([...prev, ...sel])] : sel);
      }
      didDrag.current = true;
    }
    setRubberBand(null);
  };

  // ── MOUSE MOVE ────────────────────────────────────────────────────────────
  const handleMouseMove = (e: any) => {
    const [x, y] = toVirtXY(e.target.getStage());

    if (ctxDrag.current) {
      const d = ctxDrag.current;
      if (d.type === 'move') {
        setCtxTx({ ...d.startTx, tx: d.startTx.tx + (x - d.startMouse[0]), ty: d.startTx.ty + (y - d.startMouse[1]) });
      } else if (d.type === 'scale') {
        const startDist = Math.hypot(d.startMouse[0] - d.pivotX, d.startMouse[1] - d.pivotY);
        if (startDist > 5) {
          const curDist = Math.hypot(x - d.pivotX, y - d.pivotY);
          setCtxTx({ ...d.startTx, scale: Math.max(0.05, d.startTx.scale * curDist / startDist) });
        }
      } else {
        const startAngle = Math.atan2(d.startMouse[1] - d.pivotY, d.startMouse[0] - d.pivotX);
        setCtxTx({ ...d.startTx, rot: d.startTx.rot + (Math.atan2(y - d.pivotY, x - d.pivotX) - startAngle) });
      }
      return;
    }

    if (nodeDrag.current) {
      const d = nodeDrag.current;
      const dx = x - d.startMouse[0], dy = y - d.startMouse[1];
      if (Math.hypot(dx, dy) > 4) didDrag.current = true;
      setDraggingNodePos({ ids: d.ids, dx, dy });
      return;
    }

    if (dragging.current) {
      const d = dragging.current;
      const dx = x - d.startMouse[0], dy = y - d.startMouse[1];
      dragDist.current = Math.hypot(dx, dy);
      if (dragDist.current > 4) didDrag.current = true;
      setContourPoints(pts => pts.map((p, i) => {
        if (d.indices.includes(i)) return [d.startPts[i][0] + dx, d.startPts[i][1] + dy];
        return p;
      }));
      return;
    }

    if (rubberBand) {
      dragDist.current = Math.hypot(x - rubberBand.sx, y - rubberBand.sy);
      setRubberBand(rb => rb ? { ...rb, ex: x, ey: y } : null);
      return;
    }

    if (isZone && zoneMode === 'draw' && zoneNodeId) {
      let [cx, cy]: [number, number] = [x, y];
      if (shiftKey && zonePoints.length > 0)
        [cx, cy] = constrainTo45(zonePoints[zonePoints.length - 1] as [number, number], x, y);
      setCursorPos({ x: cx, y: cy });
    }
    if (isContour && contourMode === 'draw') {
      let [cx, cy]: [number, number] = [x, y];
      if (shiftKey && !isArcMode && contourPoints.length > 0)
        [cx, cy] = constrainTo45(contourPoints[contourPoints.length - 1] as [number, number], x, y);
      setCursorPos({ x: cx, y: cy });
    }
  };

  // ── STAGE CLICK ──────────────────────────────────────────────────────────
  const handleStageClick = (e: any) => {
    if (didDrag.current) return;
    if (isPanning) return;
    const className = e.target.getClassName();
    const onBg = className === 'Stage' || className === 'Rect' || className === 'Image';

    if (tool === 'node' && onBg) { setAddNodePos(toVirtual(e)); return; }

    if (isZone) {
      if (zoneMode === 'draw' && zoneNodeId && onBg) {
        let { x, y } = toVirtual(e);
        if (shiftKey && zonePoints.length > 0)
          [x, y] = constrainTo45(zonePoints[zonePoints.length - 1] as [number, number], x, y);
        const [sx, sy] = snap(x, y);
        if (zonePoints.length >= 3 && Math.hypot(sx - zonePoints[0][0], sy - zonePoints[0][1]) < SNAP_DIST) { saveZone(); return; }
        setZonePoints(pts => [...pts, [sx, sy]]);
        return;
      }
      if (zoneMode === 'edit' && selectedVertex !== null && className !== 'Circle') {
        const { x, y } = toVirtual(e);
        const [sx, sy] = snap(x, y);
        setZonePoints(pts => pts.map((p, i) => i === selectedVertex ? [sx, sy] : p));
        setSelectedVertex(null);
        return;
      }
    }

    if (isContour && contourMode === 'draw' && onBg) {
      let { x, y } = toVirtual(e);
      if (shiftKey && !isArcMode && contourPoints.length > 0)
        [x, y] = constrainTo45(contourPoints[contourPoints.length - 1] as [number, number], x, y);

      if (isArcMode) {
        if (!arcControlPt) { setArcControlPt([x, y]); return; }
        if (contourPoints.length > 0) {
          const last = contourPoints[contourPoints.length - 1] as [number, number];
          const arcPts = arcThrough3Pts(last, arcControlPt, [x, y]);
          setContourPoints(pts => [...pts, ...arcPts]);
        } else {
          setContourPoints([[x, y]]);
        }
        setArcControlPt(null);
        return;
      }

      const [sx, sy] = snapContour(x, y);
      if (contourPoints.length >= 3 && Math.hypot(sx - contourPoints[0][0], sy - contourPoints[0][1]) < SNAP_DIST) {
        saveContour(); return;
      }
      setContourPoints(pts => [...pts, [sx, sy]]);
      return;
    }

    if (isContour && contourMode === 'edit' && className !== 'Circle') {
      if (selVerts.length > 0) { setSelVerts([]); return; }
      const { x, y } = toVirtual(e);
      const segIdx = nearestContourSegment(x, y);
      if (segIdx !== null)
        setContourPoints(pts => [...pts.slice(0, segIdx + 1), [x, y], ...pts.slice(segIdx + 1)]);
    }
  };

  const handleNodeMouseDown = (e: any, node: NavNode) => {
    if (!isMoving) return;
    e.cancelBubble = true;

    if (shiftKey) {
      setSelNodeIds(prev => prev.includes(node.id) ? prev.filter(id => id !== node.id) : [...prev, node.id]);
      return;
    }

    didDrag.current = false;
    const [mx, my] = toVirtXY(e.target.getStage());
    const ids = selNodeIds.includes(node.id) ? selNodeIds : [node.id];
    if (!selNodeIds.includes(node.id)) setSelNodeIds([node.id]);
    const startPositions: { [id: string]: [number, number] } = {};
    for (const id of ids) {
      const n = floor.nodes.find(n => n.id === id);
      if (n) startPositions[id] = [n.x, n.y];
    }
    nodeDrag.current = { ids, startMouse: [mx, my], startPositions };
  };

  const handleNodeClick = (node: NavNode) => {
    if (isPanning) return;
    if (isMoving) return; // drag-only in move mode
    if (isZone) {
      if (node.type === 'corridor') return;
      if (zoneMode !== 'edit' || zoneNodeId !== node.id) {
        const existing = (floor.areas ?? []).find(a => a.nodeId === node.id);
        if (existing) { setZoneMode('edit'); setZoneNodeId(node.id); setZonePoints([...existing.points]); setSelectedVertex(null); }
        else { setZoneMode('draw'); setZoneNodeId(node.id); setZonePoints([]); setSelectedVertex(null); }
      }
      return;
    }
    if (tool === 'select') { selectNode(node.id); return; }
    if (tool === 'edge') {
      if (!pendingEdgeFromId) setPendingEdgeFrom(node.id);
      else if (pendingEdgeFromId === node.id) setPendingEdgeFrom(null);
      else setPendingEdgeTo(node);
    }
  };

  const handleAddNode = (type: NodeType, label: string) => {
    if (!addNodePos) return;
    addNode({ id: `${type}-${Date.now().toString(36)}`, type, label, x: addNodePos.x, y: addNodePos.y });
    setAddNodePos(null);
  };

  const handleAddEdge = (type: EdgeType, weight: number) => {
    if (!pendingEdgeFromId || !pendingEdgeTo) return;
    addEdge({ from: pendingEdgeFromId, to: pendingEdgeTo.id, type, weight });
    setPendingEdgeFrom(null); setPendingEdgeTo(null);
  };

  const handleCtxBodyMouseDown = (e: any) => {
    e.cancelBubble = true;
    const [mx, my] = toVirtXY(e.target.getStage());
    ctxDrag.current = { type: 'move', startMouse: [mx, my], startTx: { ...ctxTx }, pivotX: ctxCx + ctxTx.tx, pivotY: ctxCy + ctxTx.ty };
  };

  const handleCtxCornerMouseDown = (e: any) => {
    e.cancelBubble = true;
    const [mx, my] = toVirtXY(e.target.getStage());
    ctxDrag.current = { type: 'scale', startMouse: [mx, my], startTx: { ...ctxTx }, pivotX: ctxCx + ctxTx.tx, pivotY: ctxCy + ctxTx.ty };
  };

  const handleCtxRotateMouseDown = (e: any) => {
    e.cancelBubble = true;
    const [mx, my] = toVirtXY(e.target.getStage());
    ctxDrag.current = { type: 'rotate', startMouse: [mx, my], startTx: { ...ctxTx }, pivotX: ctxCx + ctxTx.tx, pivotY: ctxCy + ctxTx.ty };
  };

  const applyCtxTxAll = () => {
    if (!ctxBbox) return;
    const contoursByFloor = building.floors.map(f => {
      if (!f.contours) return undefined;
      return f.contours.map(contour =>
        contour.map(([px, py]: number[]) => {
          const [nx, ny] = applyCtxTransform(px, py, ctxCx, ctxCy, ctxTx);
          return [+nx.toFixed(1), +ny.toFixed(1)];
        })
      );
    });
    updateAllFloorsContours(contoursByFloor);
    setCtxTx({ tx: 0, ty: 0, scale: 1, rot: 0 });
    setCtxMode(false);
  };

  const cancelCtxMode = () => {
    setCtxTx({ tx: 0, ty: 0, scale: 1, rot: 0 });
    setCtxMode(false);
  };

  const applyGroupMove = () => {
    const moves = selNodeIds
      .map(id => floor.nodes.find(nd => nd.id === id))
      .filter(Boolean)
      .map(n => ({ id: n!.id, x: n!.x + precDx, y: n!.y + precDy }));
    if (moves.length) moveNodes(moves);
  };

  const applyStretch = () => {
    if (selNodeIds.length < 2) return;
    const nodes = selNodeIds.map(id => floor.nodes.find(n => n.id === id)).filter(Boolean) as NavNode[];
    const vals = nodes.map(n => stretchAxis === 'x' ? n.x : n.y);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = maxV - minV;

    // Find the actual anchor node (not the midpoint)
    const midV = (minV + maxV) / 2;
    const anchorNode = stretchAnchor === 'min'
      ? nodes.find(n => (stretchAxis === 'x' ? n.x : n.y) === minV)!
      : stretchAnchor === 'max'
      ? nodes.find(n => (stretchAxis === 'x' ? n.x : n.y) === maxV)!
      : nodes.reduce((best, n) => {
          const v = stretchAxis === 'x' ? n.x : n.y;
          const bv = stretchAxis === 'x' ? best.x : best.y;
          return Math.abs(v - midV) < Math.abs(bv - midV) ? n : best;
        });
    const anchorV = stretchAxis === 'x' ? anchorNode.x : anchorNode.y;

    let moves: Array<{ id: string; x: number; y: number }>;

    if (uniformSpacing) {
      const sorted = [...nodes].sort((a, b) => {
        const av = stretchAxis === 'x' ? a.x : a.y;
        const bv = stretchAxis === 'x' ? b.x : b.y;
        return av - bv;
      });
      const k = sorted.findIndex(n => n.id === anchorNode.id);
      const step = sorted.length === 1 ? 0 : stretchTarget / (sorted.length - 1);
      const newStart = anchorV - k * step;
      moves = sorted.map((n, i) => {
        const nv = +(newStart + i * step).toFixed(1);
        return stretchAxis === 'x' ? { id: n.id, x: nv, y: n.y } : { id: n.id, x: n.x, y: nv };
      });
    } else {
      if (span === 0) return;
      const ratio = stretchTarget / span;
      moves = nodes.map(n => {
        const v = stretchAxis === 'x' ? n.x : n.y;
        const nv = +(anchorV + (v - anchorV) * ratio).toFixed(1);
        return stretchAxis === 'x' ? { id: n.id, x: nv, y: n.y } : { id: n.id, x: n.x, y: nv };
      });
    }
    moveNodes(moves);
  };

  const applySnap90 = () => {
    if (selNodeIds.length < 1) return;
    const selSet = new Set(selNodeIds);
    const pos: Record<string, { x: number; y: number }> = {};
    selNodeIds.forEach(id => {
      const n = floor.nodes.find(nd => nd.id === id);
      if (n) pos[id] = { x: n.x, y: n.y };
    });
    for (let iter = 0; iter < 20; iter++) {
      for (const edge of floor.edges) {
        const fromSel = selSet.has(edge.from);
        const toSel = selSet.has(edge.to);
        if (!fromSel && !toSel) continue;
        const fp = fromSel ? pos[edge.from] : (() => { const n = floor.nodes.find(nd => nd.id === edge.from); return n ? { x: n.x, y: n.y } : null; })();
        const tp = toSel ? pos[edge.to] : (() => { const n = floor.nodes.find(nd => nd.id === edge.to); return n ? { x: n.x, y: n.y } : null; })();
        if (!fp || !tp) continue;
        const adx = Math.abs(tp.x - fp.x), ady = Math.abs(tp.y - fp.y);
        if (adx < ady) {
          const ax = (fromSel && toSel) ? (fp.x + tp.x) / 2 : fromSel ? tp.x : fp.x;
          if (fromSel) pos[edge.from].x = ax;
          if (toSel) pos[edge.to].x = ax;
        } else {
          const ay = (fromSel && toSel) ? (fp.y + tp.y) / 2 : fromSel ? tp.y : fp.y;
          if (fromSel) pos[edge.from].y = ay;
          if (toSel) pos[edge.to].y = ay;
        }
      }
    }
    moveNodes(Object.entries(pos).map(([id, p]) => ({ id, x: +p.x.toFixed(1), y: +p.y.toFixed(1) })));
  };

  // ── ARC PREVIEW POINTS ────────────────────────────────────────────────────
  const arcPreview = (isContour && contourMode === 'draw' && isArcMode && arcControlPt && cursorPos && contourPoints.length > 0)
    ? arcThrough3Pts(contourPoints[contourPoints.length - 1] as [number, number], arcControlPt, [cursorPos.x, cursorPos.y])
    : null;

  // ── HINTS ─────────────────────────────────────────────────────────────────
  const totalContours = floor.contours?.length ?? 0;
  const contourHint = isContour
    ? contourMode === 'draw'
      ? isArcMode
        ? arcControlPt ? 'Дуга: кликните конечную точку' : 'Дуга: кликните контрольную точку (пик дуги)'
        : `Кликайте вершины${shiftKey ? ' (угол 45°)' : ''}${contourPoints.length >= 3 ? ' • на первую точку чтобы замкнуть' : ''}`
      : selVerts.length > 1
        ? `Выделено ${selVerts.length} точек — тяните для перемещения • Del удалить`
        : selVerts.length === 1
          ? 'Точка выбрана — тяните для перемещения • Shift+клик для мультивыбора'
          : `Контур${totalContours > 1 ? ` ${(editingContourIdx ?? 0) + 1}/${totalContours}` : ''} — тяните вершину • обведите область мышью для выбора • клик по сегменту вставляет точку`
    : null;

  const zoneHint = isZone
    ? zoneMode === 'draw'
      ? `${getNode(zoneNodeId!)?.label || ''} — кликайте${shiftKey ? ' (45°)' : ''}${zonePoints.length >= 3 ? ' • на первую точку чтобы замкнуть' : ''}`
      : zoneMode === 'edit'
        ? selectedVertex !== null ? 'Нажмите куда переместить вершину' : `${getNode(zoneNodeId!)?.label || ''} — нажмите вершину чтобы переместить`
        : 'Нажмите на узел для рисования/редактирования области'
    : null;

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e0e0e0' }}>
      {pendingEdgeFromId && <Hint color="#1976D2">Нажмите на второй узел</Hint>}

      {ctxMode && ctxBbox && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#E65100', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
          <span>Трансформация: bbox — переместить, углы — масштаб, ● — повернуть</span>
          <button onClick={applyCtxTxAll} style={{ padding: '2px 8px', background: '#43a047', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Применить</button>
          <button onClick={cancelCtxMode} style={{ padding: '2px 8px', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Отмена</button>
        </div>
      )}

      {contourHint && !ctxMode && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#212121', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
          <span>{contourHint}</span>
          {contourMode === 'draw' && (
            <button onClick={() => { setIsArcMode(a => !a); setArcControlPt(null); }}
              style={{ padding: '2px 8px', background: isArcMode ? '#6a1b9a' : '#37474F', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
              ⌒ {isArcMode ? 'Дуга вкл' : 'Дуга'}
            </button>
          )}
          {contourMode === 'edit' && selVerts.length > 0 && (
            <button onClick={() => {
              const del = new Set(selVerts);
              setContourPoints(pts => { const n = pts.filter((_, i) => !del.has(i)); return n.length >= 3 ? n : pts; });
              setSelVerts([]);
            }} style={{ padding: '2px 8px', background: '#c62828', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Удалить выбранные</button>
          )}
          {contourMode === 'edit' && (
            <button onClick={startNewContour} style={{ padding: '2px 8px', background: '#1565c0', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>+ Новый контур</button>
          )}
          {contourMode === 'edit' && (
            <button onClick={saveContour} style={{ padding: '2px 8px', background: '#43a047', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Сохранить</button>
          )}
          {contourMode === 'edit' && totalContours > 0 && (
            <button onClick={() => setCtxMode(true)} style={{ padding: '2px 8px', background: '#E65100', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>⤢ Трансформировать все</button>
          )}
          {contourMode === 'edit' && (
            <button onClick={deleteContour} style={{ padding: '2px 8px', background: '#b71c1c', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Удалить контур</button>
          )}
          {contourMode === 'draw' && contourPoints.length >= 3 && (
            <button onClick={saveContour} style={{ padding: '2px 8px', background: '#43a047', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Замкнуть</button>
          )}
          <button onClick={cancelContour} style={{ padding: '2px 8px', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Отмена</button>
        </div>
      )}

      {zoneHint && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#37474F', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
          <span>{zoneHint}</span>
          {zoneMode === 'edit' && selectedVertex !== null && zonePoints.length > 3 && (
            <button onClick={() => { setZonePoints(pts => pts.filter((_, i) => i !== selectedVertex)); setSelectedVertex(null); }}
              style={{ padding: '2px 8px', background: '#c62828', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Удалить точку</button>
          )}
          {zoneMode === 'edit' && (
            <button onClick={saveZone} style={{ padding: '2px 8px', background: '#43a047', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Сохранить</button>
          )}
          {zoneMode === 'draw' && zonePoints.length >= 3 && (
            <button onClick={saveZone} style={{ padding: '2px 8px', background: '#43a047', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Замкнуть</button>
          )}
          <button onClick={cancelZone} style={{ padding: '2px 8px', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Отмена</button>
        </div>
      )}

      <Stage
        width={stageSize.w} height={stageSize.h}
        scaleX={zoom} scaleY={zoom} x={stagePos.x} y={stagePos.y}
        draggable={isPanning}
        onDragEnd={e => setStagePos({ x: e.target.x(), y: e.target.y() })}
        onClick={handleStageClick} onTap={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleStageMouseUp}
        onWheel={handleWheel} onTouchMove={handleTouchMove}
        onTouchEnd={() => { lastPinchDist.current = 0; }}
        style={{ cursor: isPanning ? 'grab' : (tool === 'node' || isZone || isContour) ? 'crosshair' : isMoving ? 'cell' : 'default' }}
      >
        <Layer>
          {bgImage
            ? <KonvaImage image={bgImage} width={VIRTUAL_W} height={VIRTUAL_H} />
            : <Rect width={VIRTUAL_W} height={VIRTUAL_H} fill="#e8e8e8" />
          }

          {/* Saved contours — even-odd fill: nested contours punch holes */}
          {(() => {
            let allC = (floor.contours ?? []).map((savedPts, ci) =>
              (isContour && contourMode === 'edit' && ci === editingContourIdx) ? contourPoints : savedPts
            );
            if (ctxMode && ctxBbox) allC = allC.map(pts =>
              pts.map(([px, py]: number[]) => applyCtxTransform(px, py, ctxCx, ctxCy, ctxTx))
            );
            if (allC.every(pts => pts.length < 3)) return null;
            return (
              <Shape
                key="contours"
                listening={false}
                sceneFunc={(ctx: any) => {
                  const nc: CanvasRenderingContext2D = ctx._context;
                  nc.beginPath();
                  for (const pts of allC) {
                    if (pts.length < 3) continue;
                    nc.moveTo(pts[0][0], pts[0][1]);
                    for (let i = 1; i < pts.length; i++) nc.lineTo(pts[i][0], pts[i][1]);
                    nc.closePath();
                  }
                  nc.fillStyle = 'rgba(0,0,0,0.04)';
                  nc.fill('evenodd');
                  for (let ci = 0; ci < allC.length; ci++) {
                    const pts = allC[ci];
                    if (pts.length < 3) continue;
                    nc.beginPath();
                    nc.moveTo(pts[0][0], pts[0][1]);
                    for (let i = 1; i < pts.length; i++) nc.lineTo(pts[i][0], pts[i][1]);
                    nc.closePath();
                    nc.strokeStyle = 'black';
                    nc.lineWidth = (isContour && ci === editingContourIdx) ? 3 : 2;
                    nc.stroke();
                  }
                }}
              />
            );
          })()}

          {/* Non-active contour vertices (click to switch) */}
          {isContour && !ctxMode && contourMode === 'edit' && (floor.contours ?? []).map((cPts, ci) => {
            if (ci === editingContourIdx) return null;
            return cPts.map((pt: number[], i: number) => (
              <Circle key={`cv-${ci}-${i}`} x={pt[0]} y={pt[1]} radius={5}
                fill="#bdbdbd" stroke="#555" strokeWidth={1.5}
                onClick={() => switchToContour(ci, cPts)} onTap={() => switchToContour(ci, cPts)} />
            ));
          })}

          {/* Draw mode preview */}
          {isContour && contourMode === 'draw' && contourPoints.length > 0 && (() => {
            const flat = contourPoints.flatMap((p: number[]) => p);
            const last = contourPoints[contourPoints.length - 1];
            return (
              <Group listening={false}>
                {contourPoints.length >= 3 && (
                  <Line points={flat} closed fill="rgba(0,0,0,0.06)" stroke="black" strokeWidth={3} dash={[8, 5]} />
                )}
                {arcPreview ? (
                  <Line points={[last[0], last[1], ...arcPreview.flatMap(p => p)]}
                    stroke="#6a1b9a" strokeWidth={3} dash={[8, 5]} />
                ) : cursorPos ? (
                  <Line points={[...flat, cursorPos.x, cursorPos.y]} stroke="black" strokeWidth={3} dash={[8, 5]} />
                ) : null}
                {arcControlPt && (
                  <Circle x={arcControlPt[0]} y={arcControlPt[1]} radius={8} fill="#6a1b9a" opacity={0.8} />
                )}
                <Circle x={contourPoints[0][0]} y={contourPoints[0][1]} radius={9} fill="black" opacity={0.6} />
                {contourPoints.map((pt: number[], i: number) => (
                  <Circle key={i} x={pt[0]} y={pt[1]} radius={4} fill="black" />
                ))}
              </Group>
            );
          })()}

          {/* Edit mode vertex handles */}
          {isContour && !ctxMode && contourMode === 'edit' && editingContourIdx !== null && contourPoints.length >= 3 && (
            <Group>
              {contourPoints.map((pt: number[], i: number) => {
                const isSel = selVerts.includes(i);
                return (
                  <Circle key={i} x={pt[0]} y={pt[1]}
                    radius={isSel ? 9 : 7}
                    fill={isSel ? '#1976D2' : 'white'}
                    stroke={isSel ? '#0D47A1' : 'black'} strokeWidth={isSel ? 3 : 2.5}
                    onMouseDown={(e: any) => handleVertexMouseDown(e, i)}
                    onClick={(e: any) => {
                      if (didDrag.current) return;
                      e.cancelBubble = true;
                      if (shiftKey) setSelVerts(prev => prev.includes(i) ? prev.filter(v => v !== i) : [...prev, i]);
                      else setSelVerts([i]);
                    }}
                    onTap={(e: any) => { e.cancelBubble = true; setSelVerts([i]); }}
                  />
                );
              })}
            </Group>
          )}

          {/* Rubber band selection rect */}
          {(isMoving || (isContour && contourMode === 'edit')) && rubberBand && dragDist.current > 8 && (
            <Rect
              x={Math.min(rubberBand.sx, rubberBand.ex)} y={Math.min(rubberBand.sy, rubberBand.ey)}
              width={Math.abs(rubberBand.ex - rubberBand.sx)} height={Math.abs(rubberBand.ey - rubberBand.sy)}
              stroke="#1976D2" strokeWidth={2 / zoom} dash={[6 / zoom, 4 / zoom]}
              fill="rgba(25,118,210,0.08)" listening={false}
            />
          )}

          {/* Contour group transform handles */}
          {ctxMode && ctxBbox && (() => {
            const { minX, maxX, minY, maxY } = ctxBbox;
            const corners: [number, number][] = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
            const tCorners = corners.map(([px, py]) => applyCtxTransform(px, py, ctxCx, ctxCy, ctxTx));
            const topMid = applyCtxTransform(ctxCx, minY - 150, ctxCx, ctxCy, ctxTx);
            const topCenter = applyCtxTransform((minX + maxX) / 2, minY, ctxCx, ctxCy, ctxTx);
            const bboxFlat = tCorners.flatMap(p => p);
            return (
              <Group key="ctx-handles">
                <Line points={bboxFlat} closed stroke="#FF6F00" strokeWidth={2 / zoom}
                  dash={[8 / zoom, 4 / zoom]} fill="rgba(255,111,0,0.06)"
                  onMouseDown={handleCtxBodyMouseDown} />
                {tCorners.map(([tx, ty], i) => (
                  <Circle key={`cc${i}`} x={tx} y={ty} radius={8 / zoom}
                    fill="white" stroke="#FF6F00" strokeWidth={2 / zoom}
                    onMouseDown={handleCtxCornerMouseDown} />
                ))}
                <Line points={[topCenter[0], topCenter[1], topMid[0], topMid[1]]}
                  stroke="#FF6F00" strokeWidth={1.5 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />
                <Circle x={topMid[0]} y={topMid[1]} radius={10 / zoom}
                  fill="#FF6F00" stroke="white" strokeWidth={2 / zoom}
                  onMouseDown={handleCtxRotateMouseDown} />
              </Group>
            );
          })()}

          {/* Saved areas */}
          {(floor.areas ?? []).map(area => {
            const node = getNode(area.nodeId);
            if (!node || area.points.length < 3) return null;
            const pts = area.points.flatMap(p => p);
            const c = centroid(area.points);
            const isActive = zoneNodeId === area.nodeId;
            return (
              <Group key={area.nodeId}>
                <Line points={pts} closed fill={AREA_FILL[node.type] || 'rgba(0,0,0,0.05)'}
                  stroke={isActive ? '#F57C00' : NODE_COLOR[node.type]} strokeWidth={isActive ? 2.5 : 1.5} />
                <Text text={node.label} x={c.x - node.label.length * 4} y={c.y - 7}
                  fontSize={13} fill={NODE_COLOR[node.type]} fontStyle="bold" />
              </Group>
            );
          })}

          {/* Zone draw preview */}
          {isZone && zoneMode === 'draw' && zonePoints.length > 0 && (() => {
            const pts = zonePoints.flatMap(p => p);
            const linePoints = cursorPos ? [...pts, cursorPos.x, cursorPos.y] : pts;
            return (
              <Group listening={false}>
                {zonePoints.length >= 3 && (
                  <Line points={pts} closed fill="rgba(55,71,79,0.1)" stroke="#37474F" strokeWidth={1.5} dash={[6, 4]} />
                )}
                <Line points={linePoints} stroke="#37474F" strokeWidth={1.5} dash={[6, 4]} />
                <Circle x={zonePoints[0][0]} y={zonePoints[0][1]} radius={8} fill="#37474F" opacity={0.7} />
                {zonePoints.map((pt, i) => <Circle key={i} x={pt[0]} y={pt[1]} radius={3} fill="#37474F" />)}
              </Group>
            );
          })()}

          {/* Zone edit handles */}
          {isZone && zoneMode === 'edit' && zonePoints.length >= 3 && (() => {
            const pts = zonePoints.flatMap(p => p);
            return (
              <Group>
                <Line points={pts} closed fill="rgba(55,71,79,0.08)" stroke="#F57C00" strokeWidth={2} dash={[6, 4]} />
                {zonePoints.map((pt, i) => (
                  <Circle key={i} x={pt[0]} y={pt[1]} radius={selectedVertex === i ? 10 : 7}
                    fill={selectedVertex === i ? '#F57C00' : 'white'} stroke="#F57C00" strokeWidth={2}
                    onClick={() => setSelectedVertex(idx => idx === i ? null : i)}
                    onTap={() => setSelectedVertex(idx => idx === i ? null : i)} />
                ))}
              </Group>
            );
          })()}

          {/* Edges */}
          {floor.edges.map(edge => {
            const from = getNode(edge.from), to = getNode(edge.to);
            if (!from || !to) return null;
            const key = `${edge.from}->${edge.to}`;
            const isSel = selectedEdgeKey === key || selectedEdgeKey === `${edge.to}->${edge.from}`;
            const onRoute = isRouteEdge(edge.from, edge.to);
            return (
              <Line key={key} points={[from.x, from.y, to.x, to.y]}
                stroke={isSel ? '#f44336' : onRoute ? '#43a047' : '#555'}
                strokeWidth={isSel ? 3 : onRoute ? 4 : 2}
                onClick={() => { if (tool === 'select') selectEdge(key); }}
                onTap={() => { if (tool === 'select') selectEdge(key); }}
                hitStrokeWidth={12} />
            );
          })}

          {/* Nodes */}
          {floor.nodes.map(node => {
            const onRoute = routeSet.has(node.id);
            const isZoneTarget = isZone && zoneNodeId === node.id;
            const isDraggingThis = draggingNodePos !== null && draggingNodePos.ids.includes(node.id);
            const isSelected = isMoving && selNodeIds.includes(node.id);
            const nx = isDraggingThis ? node.x + draggingNodePos!.dx : node.x;
            const ny = isDraggingThis ? node.y + draggingNodePos!.dy : node.y;
            return (
              <Group key={node.id} x={nx} y={ny}
                onClick={() => handleNodeClick(node)} onTap={() => handleNodeClick(node)}
                onMouseDown={(e: any) => handleNodeMouseDown(e, node)}>
                {onRoute && <Circle radius={20} fill="rgba(67,160,71,0.25)" />}
                {stretchAnchorMap.has(node.id) && (() => {
                  const c = stretchAnchorMap.get(node.id)!;
                  return <Circle radius={48} fill={c + '33'} stroke={c} strokeWidth={3} />;
                })()}
                {isSelected && <>
                  <Circle radius={20} fill="white" opacity={0.7} />
                  <Circle radius={20} fill="rgba(25,118,210,0.35)" stroke="#1976D2" strokeWidth={3} />
                </>}
                <Circle radius={14} fill={NODE_COLOR[node.type]}
                  stroke={isZoneTarget || isDraggingThis ? '#F57C00' :
                    isSelected ? '#1976D2' :
                    selectedNodeId === node.id || pendingEdgeFromId === node.id ? '#f44336' :
                    onRoute ? '#43a047' : 'white'}
                  strokeWidth={isZoneTarget || isDraggingThis || isSelected || selectedNodeId === node.id || pendingEdgeFromId === node.id || onRoute ? 3 : 1.5} />
                <Text text={node.label} x={-node.label.length * 3} y={16} fontSize={11} fill="#333" />
              </Group>
            );
          })}
        </Layer>
      </Stage>

      {addNodePos && <AddNodeDialog onConfirm={handleAddNode} onCancel={() => setAddNodePos(null)} />}
      {pendingEdgeTo && pendingEdgeFromId && (() => {
        const fromNode = getNode(pendingEdgeFromId);
        return fromNode ? (
          <AddEdgeDialog fromLabel={fromNode.label} toLabel={pendingEdgeTo.label}
            onConfirm={handleAddEdge}
            onCancel={() => { setPendingEdgeTo(null); setPendingEdgeFrom(null); }} />
        ) : null;
      })()}

      {isMoving && selNodeIds.length > 0 && (() => {
        const selNodes = selNodeIds.map(id => floor.nodes.find(n => n.id === id)).filter(Boolean) as NavNode[];
        const vals = selNodes.map(n => stretchAxis === 'x' ? n.x : n.y);
        const currentSpan = selNodes.length > 1 ? Math.round(Math.max(...vals) - Math.min(...vals)) : 0;
        const sliderMax = Math.max(currentSpan * 3, 200);
        const btnBase: React.CSSProperties = { flex: 1, padding: '3px 0', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 };
        return (
          <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'white', border: '1px solid #ccc', borderRadius: 6, padding: 12, zIndex: 20, width: 250, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Точное перемещение · {selNodeIds.length} узл.</div>

            {/* ── Сдвиг группы ── */}
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Сдвиг по пикселям</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 6 }}>
              <label style={{ flex: 1, fontSize: 11 }}>dx
                <input type="number" value={precDx} onChange={e => setPrecDx(+e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 2 }} />
              </label>
              <label style={{ flex: 1, fontSize: 11 }}>dy
                <input type="number" value={precDy} onChange={e => setPrecDy(+e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 2 }} />
              </label>
              <button onClick={applyGroupMove}
                style={{ padding: '4px 10px', marginBottom: 1, background: '#1976D2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                →
              </button>
            </div>

            {/* ── Выровнять 90° ── */}
            {selNodes.length >= 1 && (
              <button onClick={applySnap90}
                style={{ width: '100%', marginBottom: 10, padding: '4px 0', background: '#5C6BC0', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Выровнять углы 90°
              </button>
            )}

            {/* ── Растяжение ── */}
            {selNodes.length >= 2 && (<>
              <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 11, color: '#666', marginBottom: 6 }}>Растяжение / сжатие</div>

              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {(['x', 'y'] as const).map(ax => (
                  <button key={ax} onClick={() => setStretchAxis(ax)}
                    style={{ ...btnBase, background: stretchAxis === ax ? '#1976D2' : '#eee', color: stretchAxis === ax ? 'white' : '#333' }}>
                    Ось {ax.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {([
                  ['min',    '● Мин',   '#E53935', '#FFEBEE'],
                  ['center', '● Центр', '#E53935', '#FFEBEE'],
                  ['max',    '● Макс',  '#E53935', '#FFEBEE'],
                ] as const).map(([v, label, activeColor, activeBg]) => (
                  <button key={v} onClick={() => setStretchAnchor(v)}
                    style={{ ...btnBase,
                      background: stretchAnchor === v ? activeBg : '#eee',
                      color: stretchAnchor === v ? activeColor : '#333',
                      fontWeight: stretchAnchor === v ? 700 : 400,
                      border: stretchAnchor === v ? `1.5px solid ${activeColor}` : '1.5px solid transparent',
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Текущее: {currentSpan} px</div>
              <input type="range" min={0} max={sliderMax} value={stretchTarget}
                onChange={e => setStretchTarget(+e.target.value)}
                style={{ width: '100%', marginBottom: 4 }} />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input type="number" value={stretchTarget} min={0}
                  onChange={e => setStretchTarget(+e.target.value)}
                  style={{ flex: 1, boxSizing: 'border-box' }} />
                <button onClick={applyStretch}
                  style={{ padding: '4px 10px', background: '#388E3C', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                  Применить
                </button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={uniformSpacing} onChange={e => setUniformSpacing(e.target.checked)} />
                Равномерное расстояние между узлами
              </label>
            </>)}
          </div>
        );
      })()}
    </div>
  );
}

function Hint({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: color, color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, pointerEvents: 'none' }}>
      {children}
    </div>
  );
}
