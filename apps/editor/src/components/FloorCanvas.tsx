import { useEffect, useState, useCallback, useRef } from 'react';
import { Stage, Layer, Circle, Line, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
import { useEditorStore } from '../store/editorStore';
import AddNodeDialog from './AddNodeDialog';
import AddEdgeDialog from './AddEdgeDialog';
import type { NavNode, NodeType, EdgeType } from '../types/building';

const NODE_COLOR: Record<NodeType, string> = {
  room: '#1976D2',
  stairs: '#F57C00',
  elevator: '#7B1FA2',
  entrance: '#2E7D32',
};

export default function FloorCanvas() {
  const {
    building, activeFloorIndex, tool, selectedNodeId, selectedEdgeKey, pendingEdgeFromId,
    addNode, selectNode, selectEdge, setPendingEdgeFrom, addEdge,
  } = useEditorStore();

  const floor = building.floors[activeFloorIndex];
  const [addNodePos, setAddNodePos] = useState<{ x: number; y: number } | null>(null);
  const [pendingEdgeTo, setPendingEdgeTo] = useState<NavNode | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 500 });
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (!floor) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#f5f5f5' }}>
        Добавьте этаж в левой панели
      </div>
    );
  }

  const getNode = (id: string) => floor.nodes.find(n => n.id === id);

  const handleStageClick = (e: any) => {
    if (tool !== 'node') return;
    const className = e.target.getClassName();
    if (className !== 'Stage' && className !== 'Rect' && className !== 'Image') return;
    const pos = e.target.getStage().getPointerPosition();
    setAddNodePos({ x: pos.x, y: pos.y });
  };

  const handleNodeClick = (node: NavNode) => {
    if (tool === 'select') { selectNode(node.id); return; }
    if (tool === 'edge') {
      if (!pendingEdgeFromId) {
        setPendingEdgeFrom(node.id);
      } else if (pendingEdgeFromId === node.id) {
        setPendingEdgeFrom(null);
      } else {
        setPendingEdgeTo(node);
      }
    }
  };

  const handleAddNode = (type: NodeType, label: string) => {
    if (!addNodePos) return;
    const id = `${type}-${Date.now().toString(36)}`;
    addNode({ id, type, label, x: addNodePos.x, y: addNodePos.y });
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
      <Stage width={stageSize.w} height={stageSize.h} onClick={handleStageClick} style={{ cursor: tool === 'node' ? 'crosshair' : 'default' }}>
        <Layer>
          {bgImage
            ? <KonvaImage image={bgImage} width={stageSize.w} height={stageSize.h} />
            : <Rect width={stageSize.w} height={stageSize.h} fill="#e8e8e8" />
          }

          {floor.edges.map(edge => {
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            if (!from || !to) return null;
            const key = `${edge.from}->${edge.to}`;
            const isSelected = selectedEdgeKey === key || selectedEdgeKey === `${edge.to}->${edge.from}`;
            return (
              <Line
                key={key}
                points={[from.x, from.y, to.x, to.y]}
                stroke={isSelected ? '#f44336' : '#555'}
                strokeWidth={isSelected ? 3 : 2}
                onClick={() => { if (tool === 'select') selectEdge(key); }}
                hitStrokeWidth={10}
              />
            );
          })}

          {floor.nodes.map(node => (
            <Group key={node.id} x={node.x} y={node.y} onClick={() => handleNodeClick(node)}>
              <Circle
                radius={14}
                fill={NODE_COLOR[node.type]}
                stroke={selectedNodeId === node.id || pendingEdgeFromId === node.id ? '#f44336' : 'white'}
                strokeWidth={selectedNodeId === node.id || pendingEdgeFromId === node.id ? 3 : 1.5}
              />
              <Text text={node.label} x={-node.label.length * 3} y={16} fontSize={11} fill="#333" />
            </Group>
          ))}
        </Layer>
      </Stage>

      {addNodePos && (
        <AddNodeDialog onConfirm={handleAddNode} onCancel={() => setAddNodePos(null)} />
      )}
      {pendingEdgeTo && pendingEdgeFromId && (() => {
        const fromNode = getNode(pendingEdgeFromId);
        return fromNode ? (
          <AddEdgeDialog
            fromLabel={fromNode.label}
            toLabel={pendingEdgeTo.label}
            onConfirm={handleAddEdge}
            onCancel={() => { setPendingEdgeTo(null); setPendingEdgeFrom(null); }}
          />
        ) : null;
      })()}
    </div>
  );
}
