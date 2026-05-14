import { useEffect, useState, useCallback, useRef } from 'react';
import { Stage, Layer, Circle, Line, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
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
    moveNode, addArea, addFloorContour, updateFloorContour, removeFloorContour,
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
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
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
  const [rubberBand, setRubberBand] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [isArcMode, setIsArcMode] = useState(false);
  const [arcControlPt, setArcControlPt] = useState<[number, number] | null>(null);

  // Refs for drag tracking (avoid stale closures)
  const dragging = useRef<{ indices: number[]; startMouse: [number, number]; startPts: [number, number][] } | null>(null);
  const didDrag = useRef(false);
  const dragDist = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastPinchDist = useRef(0);
  const isPanning = tool === 'pan';
  const isMoving = tool === 'move';
  const isZone = tool === 'zone';
  const isContour = tool === 'contour';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
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
    const onKey = (e: KeyboardEvent) => setShiftKey(e.shiftKey);
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
    dragging.current = null;
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
    if (!isContour || contourMode !== 'edit' || isPanning) return;
    if (e.target.getClassName() === 'Circle') return;
    const [x, y] = toVirtXY(e.target.getStage());
    setRubberBand({ sx: x, sy: y, ex: x, ey: y });
    if (!shiftKey) setSelVerts([]);
  };

  // ── STAGE MOUSE UP → end drag / rubber band ──────────────────────────────
  const handleStageMouseUp = () => {
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
      const sel = contourPoints.map(([px, py], i) =>
        px >= minX && px <= maxX && py >= minY && py <= maxY ? i : -1
      ).filter(i => i >= 0);
      setSelVerts(shiftKey ? prev => [...new Set([...prev, ...sel])] : sel);
      didDrag.current = true;
    }
    setRubberBand(null);
  };

  // ── MOUSE MOVE ────────────────────────────────────────────────────────────
  const handleMouseMove = (e: any) => {
    const [x, y] = toVirtXY(e.target.getStage());

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

    if (isMoving && movingNodeId && onBg) {
      const { x, y } = toVirtual(e); moveNode(movingNodeId, x, y); setMovingNodeId(null); return;
    }
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

  const handleNodeClick = (node: NavNode) => {
    if (isPanning) return;
    if (isMoving) { setMovingNodeId(id => id === node.id ? null : node.id); return; }
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
      {isMoving && movingNodeId && <Hint color="#F57C00">Нажмите куда переместить узел</Hint>}

      {contourHint && (
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

          {/* Saved contours */}
          {(floor.contours ?? []).map((savedPts, ci) => {
            const pts = (isContour && contourMode === 'edit' && ci === editingContourIdx) ? contourPoints : savedPts;
            if (pts.length < 3) return null;
            return (
              <Line key={`c-${ci}`} points={pts.flatMap((p: number[]) => p)} closed
                stroke="black" strokeWidth={ci === editingContourIdx && isContour ? 3 : 2}
                fill="rgba(0,0,0,0.04)" listening={false} />
            );
          })}

          {/* Non-active contour vertices (click to switch) */}
          {isContour && contourMode === 'edit' && (floor.contours ?? []).map((cPts, ci) => {
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
          {isContour && contourMode === 'edit' && editingContourIdx !== null && contourPoints.length >= 3 && (
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
          {isContour && contourMode === 'edit' && rubberBand && dragDist.current > 8 && (
            <Rect
              x={Math.min(rubberBand.sx, rubberBand.ex)} y={Math.min(rubberBand.sy, rubberBand.ey)}
              width={Math.abs(rubberBand.ex - rubberBand.sx)} height={Math.abs(rubberBand.ey - rubberBand.sy)}
              stroke="#1976D2" strokeWidth={2 / zoom} dash={[6 / zoom, 4 / zoom]}
              fill="rgba(25,118,210,0.08)" listening={false}
            />
          )}

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
              <Group>
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
            return (
              <Group key={node.id} x={node.x} y={node.y}
                onClick={() => handleNodeClick(node)} onTap={() => handleNodeClick(node)}>
                {onRoute && <Circle radius={20} fill="rgba(67,160,71,0.25)" />}
                <Circle radius={14} fill={NODE_COLOR[node.type]}
                  stroke={isZoneTarget || movingNodeId === node.id ? '#F57C00' :
                    selectedNodeId === node.id || pendingEdgeFromId === node.id ? '#f44336' :
                    onRoute ? '#43a047' : 'white'}
                  strokeWidth={isZoneTarget || movingNodeId === node.id || selectedNodeId === node.id || pendingEdgeFromId === node.id || onRoute ? 3 : 1.5} />
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
