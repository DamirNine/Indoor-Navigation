import { useEffect, useState, useCallback, useRef } from 'react';
import { Stage, Layer, Circle, Line, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
import { useEditorStore } from '../store/editorStore';
import AddNodeDialog from './AddNodeDialog';
import AddEdgeDialog from './AddEdgeDialog';
import type { NavNode, NodeType, EdgeType } from '../types/building';

const VIRTUAL_W = 5000;
const VIRTUAL_H = 4000;

const NODE_COLOR: Record<NodeType, string> = {
  room: '#1976D2',
  stairs: '#F57C00',
  elevator: '#7B1FA2',
  entrance: '#2E7D32',
};

interface Props {
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  stagePos: { x: number; y: number };
  setStagePos: (p: { x: number; y: number }) => void;
}

export default function FloorCanvas({ zoom, setZoom, stagePos, setStagePos }: Props) {
  const {
    building, activeFloorIndex, tool, selectedNodeId, selectedEdgeKey, pendingEdgeFromId,
    previewRoute, addNode, selectNode, selectEdge, setPendingEdgeFrom, addEdge, updateNode,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPinchDist = useRef(0);
  const isPanning = tool === 'pan';
  const isMoving = tool === 'move';

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

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setPendingEdgeFrom(null); setPendingEdgeTo(null); }
  }, [setPendingEdgeFrom]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  const handleWheel = (e: any) => {
    if (!isPanning) return;
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const ptr = stage.getPointerPosition();
    const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => {
      const nz = Math.min(Math.max(z * factor, 0.1), 5);
      setStagePos({
        x: ptr.x - (ptr.x - stagePos.x) * (nz / z),
        y: ptr.y - (ptr.y - stagePos.y) * (nz / z),
      });
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
      const ox = cx - (rect?.left ?? 0);
      const oy = cy - (rect?.top ?? 0);
      const factor = dist / lastPinchDist.current;
      setZoom(z => {
        const nz = Math.min(Math.max(z * factor, 0.1), 5);
        setStagePos({
          x: ox - (ox - stagePos.x) * (nz / z),
          y: oy - (oy - stagePos.y) * (nz / z),
        });
        return nz;
      });
    }
    lastPinchDist.current = dist;
  };

  const handleTouchEnd = () => { lastPinchDist.current = 0; };

  if (!floor) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#f5f5f5' }}>
        Добавьте этаж в левой панели
      </div>
    );
  }

  const getNode = (id: string) => floor.nodes.find(n => n.id === id);

  const toVirtual = (e: any) => {
    const ptr = e.target.getStage().getPointerPosition();
    return { x: (ptr.x - stagePos.x) / zoom, y: (ptr.y - stagePos.y) / zoom };
  };

  const handleStageClick = (e: any) => {
    if (isPanning) return;
    const className = e.target.getClassName();
    const onBackground = className === 'Stage' || className === 'Rect' || className === 'Image';

    if (isMoving && movingNodeId && onBackground) {
      const { x, y } = toVirtual(e);
      updateNode(movingNodeId, { x, y });
      setMovingNodeId(null);
      return;
    }

    if (tool === 'node' && onBackground) {
      setAddNodePos(toVirtual(e));
    }
  };

  const handleNodeClick = (node: NavNode) => {
    if (isPanning) return;
    if (isMoving) {
      setMovingNodeId(id => id === node.id ? null : node.id);
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
    setPendingEdgeFrom(null);
    setPendingEdgeTo(null);
  };

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e0e0e0' }}>
      {pendingEdgeFromId && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#1976D2', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, pointerEvents: 'none' }}>
          Нажмите на второй узел
        </div>
      )}
      {isMoving && movingNodeId && (
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#F57C00', color: 'white', padding: '4px 12px', borderRadius: 4, zIndex: 10, fontSize: 12, pointerEvents: 'none' }}>
          Нажмите куда переместить узел
        </div>
      )}

      <Stage
        width={stageSize.w}
        height={stageSize.h}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        draggable={isPanning}
        onDragEnd={e => setStagePos({ x: e.target.x(), y: e.target.y() })}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: isPanning ? 'grab' : tool === 'node' ? 'crosshair' : isMoving ? 'cell' : 'default' }}
      >
        <Layer>
          {bgImage
            ? <KonvaImage image={bgImage} width={VIRTUAL_W} height={VIRTUAL_H} />
            : <Rect width={VIRTUAL_W} height={VIRTUAL_H} fill="#e8e8e8" />
          }

          {floor.edges.map(edge => {
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            if (!from || !to) return null;
            const key = `${edge.from}->${edge.to}`;
            const isSelected = selectedEdgeKey === key || selectedEdgeKey === `${edge.to}->${edge.from}`;
            const onRoute = isRouteEdge(edge.from, edge.to);
            return (
              <Line key={key} points={[from.x, from.y, to.x, to.y]}
                stroke={isSelected ? '#f44336' : onRoute ? '#43a047' : '#555'}
                strokeWidth={isSelected ? 3 : onRoute ? 4 : 2}
                onClick={() => { if (tool === 'select') selectEdge(key); }}
                onTap={() => { if (tool === 'select') selectEdge(key); }}
                hitStrokeWidth={12}
              />
            );
          })}

          {floor.nodes.map(node => {
            const onRoute = routeSet.has(node.id);
            return (
              <Group key={node.id} x={node.x} y={node.y}
                onClick={() => handleNodeClick(node)} onTap={() => handleNodeClick(node)}>
                {onRoute && <Circle radius={20} fill="rgba(67,160,71,0.25)" />}
                <Circle radius={14} fill={NODE_COLOR[node.type]}
                  stroke={
                    movingNodeId === node.id ? '#F57C00' :
                    selectedNodeId === node.id || pendingEdgeFromId === node.id ? '#f44336' :
                    onRoute ? '#43a047' : 'white'
                  }
                  strokeWidth={movingNodeId === node.id || selectedNodeId === node.id || pendingEdgeFromId === node.id || onRoute ? 3 : 1.5}
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
