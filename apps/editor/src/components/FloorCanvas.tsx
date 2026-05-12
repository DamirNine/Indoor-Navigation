import { useEffect, useState, useCallback, useRef } from 'react';
import { Stage, Layer, Circle, Line, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
import { useEditorStore } from '../store/editorStore';
import AddNodeDialog from './AddNodeDialog';
import AddEdgeDialog from './AddEdgeDialog';
import type { NavNode, NodeType, EdgeType } from '../types/building';

const VIRTUAL_W = 5000;
const VIRTUAL_H = 4000;
const SNAP_DIST = 22;

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
    moveNode, addArea,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const lastPinchDist = useRef(0);
  const isPanning = tool === 'pan';
  const isMoving = tool === 'move';
  const isZone = tool === 'zone';

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

  const cancelZone = useCallback(() => {
    setZoneMode(null); setZoneNodeId(null); setZonePoints([]); setSelectedVertex(null); setCursorPos(null);
  }, []);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setPendingEdgeFrom(null); setPendingEdgeTo(null); cancelZone();
    }
    if (e.key === 'Delete' && zoneMode === 'edit' && selectedVertex !== null) {
      setZonePoints(pts => pts.filter((_, i) => i !== selectedVertex));
      setSelectedVertex(null);
    }
  }, [setPendingEdgeFrom, cancelZone, zoneMode, selectedVertex]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  useEffect(() => { if (!isZone) cancelZone(); }, [isZone, cancelZone]);

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

  const toVirtual = (e: any) => {
    const ptr = e.target.getStage().getPointerPosition();
    return { x: (ptr.x - stagePos.x) / zoom, y: (ptr.y - stagePos.y) / zoom };
  };

  // Snap click position to any existing area vertex within SNAP_DIST
  const snap = (x: number, y: number): [number, number] => {
    for (const area of (floor.areas ?? [])) {
      if (area.nodeId === zoneNodeId) continue; // don't snap to own points while drawing
      for (const [px, py] of area.points) {
        if (Math.hypot(x - px, y - py) < SNAP_DIST) return [px, py];
      }
    }
    return [x, y];
  };

  const centroid = (pts: number[][]) => ({
    x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
    y: pts.reduce((s, p) => s + p[1], 0) / pts.length,
  });

  const saveZone = () => {
    if (zoneNodeId && zonePoints.length >= 3) addArea({ nodeId: zoneNodeId, points: zonePoints });
    cancelZone();
  };

  const deleteVertex = () => {
    if (selectedVertex === null || zonePoints.length <= 3) return;
    setZonePoints(pts => pts.filter((_, i) => i !== selectedVertex));
    setSelectedVertex(null);
  };

  // ── STAGE CLICK ──────────────────────────────────────────────────────────
  const handleStageClick = (e: any) => {
    if (isPanning) return;
    const className = e.target.getClassName();
    const onBackground = className === 'Stage' || className === 'Rect' || className === 'Image';

    if (isMoving && movingNodeId && onBackground) {
      const { x, y } = toVirtual(e);
      moveNode(movingNodeId, x, y);
      setMovingNodeId(null);
      return;
    }

    if (tool === 'node' && onBackground) { setAddNodePos(toVirtual(e)); return; }

    if (isZone) {
      if (zoneMode === 'draw' && zoneNodeId && onBackground) {
        const { x, y } = toVirtual(e);
        const [sx, sy] = snap(x, y);

        // Close polygon if near first point and >= 3 pts
        if (zonePoints.length >= 3) {
          const [fx, fy] = zonePoints[0];
          if (Math.hypot(sx - fx, sy - fy) < SNAP_DIST) { saveZone(); return; }
        }
        setZonePoints(pts => [...pts, [sx, sy]]);
        return;
      }

      if (zoneMode === 'edit' && onBackground) {
        if (selectedVertex !== null) {
          // Move selected vertex
          const { x, y } = toVirtual(e);
          const [sx, sy] = snap(x, y);
          setZonePoints(pts => pts.map((p, i) => i === selectedVertex ? [sx, sy] : p));
          setSelectedVertex(null);
        }
        return;
      }
    }
  };

  const handleNodeClick = (node: NavNode) => {
    if (isPanning) return;
    if (isMoving) { setMovingNodeId(id => id === node.id ? null : node.id); return; }
    if (isZone) {
      if (node.type === 'corridor') return; // corridors don't get zones
      if (zoneMode !== 'edit' || zoneNodeId !== node.id) {
        // Switch to this node: edit mode if has area, draw mode if not
        const existing = (floor.areas ?? []).find(a => a.nodeId === node.id);
        if (existing) {
          setZoneMode('edit'); setZoneNodeId(node.id); setZonePoints([...existing.points]); setSelectedVertex(null);
        } else {
          setZoneMode('draw'); setZoneNodeId(node.id); setZonePoints([]); setSelectedVertex(null);
        }
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

  const handleMouseMove = (e: any) => {
    if (isZone && (zoneMode === 'draw') && zoneNodeId) setCursorPos(toVirtual(e));
  };

  // ── HINT TEXT ─────────────────────────────────────────────────────────────
  const zoneHint = isZone
    ? zoneMode === 'draw'
      ? `${getNode(zoneNodeId!)?.label || ''} — кликайте чтобы добавить вершины${zonePoints.length >= 3 ? ' • снова нажмите на первую точку чтобы замкнуть' : ''}`
      : zoneMode === 'edit'
      ? selectedVertex !== null
        ? 'Нажмите куда переместить вершину'
        : `${getNode(zoneNodeId!)?.label || ''} — нажмите на вершину чтобы переместить`
      : 'Нажмите на узел для рисования/редактирования области'
    : null;

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e0e0e0' }}>
      {/* Hints */}
      {pendingEdgeFromId && <Hint color="#1976D2">Нажмите на второй узел</Hint>}
      {isMoving && movingNodeId && <Hint color="#F57C00">Нажмите куда переместить узел</Hint>}
      {zoneHint && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#37474F', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
          <span>{zoneHint}</span>
          {zoneMode === 'edit' && selectedVertex !== null && zonePoints.length > 3 && (
            <button onClick={deleteVertex} style={{ padding: '2px 8px', background: '#c62828', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Удалить точку</button>
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
        onWheel={handleWheel} onTouchMove={handleTouchMove}
        onTouchEnd={() => { lastPinchDist.current = 0; }}
        onMouseMove={handleMouseMove}
        style={{ cursor: isPanning ? 'grab' : (tool === 'node' || isZone) ? 'crosshair' : isMoving ? 'cell' : 'default' }}
      >
        <Layer>
          {bgImage
            ? <KonvaImage image={bgImage} width={VIRTUAL_W} height={VIRTUAL_H} />
            : <Rect width={VIRTUAL_W} height={VIRTUAL_H} fill="#e8e8e8" />
          }

          {/* Saved areas */}
          {(floor.areas ?? []).map(area => {
            const node = getNode(area.nodeId);
            if (!node || area.points.length < 3) return null;
            const pts = area.points.flatMap(p => p);
            const c = centroid(area.points);
            const isActive = zoneNodeId === area.nodeId;
            return (
              <Group key={area.nodeId}>
                <Line points={pts} closed
                  fill={AREA_FILL[node.type] || 'rgba(0,0,0,0.05)'}
                  stroke={isActive ? '#F57C00' : NODE_COLOR[node.type]}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                <Text text={node.label} x={c.x - node.label.length * 4} y={c.y - 7}
                  fontSize={13} fill={NODE_COLOR[node.type]} fontStyle="bold" />
              </Group>
            );
          })}

          {/* Zone being drawn */}
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
                {zonePoints.map((pt, i) => (
                  <Circle key={i} x={pt[0]} y={pt[1]} radius={3} fill="#37474F" />
                ))}
              </Group>
            );
          })()}

          {/* Zone being edited — vertex handles */}
          {isZone && zoneMode === 'edit' && zonePoints.length >= 3 && (() => {
            const pts = zonePoints.flatMap(p => p);
            return (
              <Group>
                <Line points={pts} closed fill="rgba(55,71,79,0.08)" stroke="#F57C00" strokeWidth={2} dash={[6, 4]} />
                {zonePoints.map((pt, i) => (
                  <Circle key={i} x={pt[0]} y={pt[1]} radius={selectedVertex === i ? 10 : 7}
                    fill={selectedVertex === i ? '#F57C00' : 'white'}
                    stroke="#F57C00" strokeWidth={2}
                    onClick={() => setSelectedVertex(idx => idx === i ? null : i)}
                    onTap={() => setSelectedVertex(idx => idx === i ? null : i)}
                  />
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
                hitStrokeWidth={12}
              />
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
                  strokeWidth={isZoneTarget || movingNodeId === node.id || selectedNodeId === node.id || pendingEdgeFromId === node.id || onRoute ? 3 : 1.5}
                />
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
            onCancel={() => { setPendingEdgeTo(null); setPendingEdgeFrom(null); }}
          />
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
