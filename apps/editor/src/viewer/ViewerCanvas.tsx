import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Shape, Line, Text, Group } from 'react-konva';
import type { Floor, NavNode } from '../types/building';
import type Konva from 'konva';

const NODE_COLOR: Record<string, string> = {
  room: '#1976D2', stairs: '#F57C00', elevator: '#7B1FA2',
  entrance: '#2E7D32', corridor: '#757575',
};
const AREA_FILL: Record<string, string> = {
  room: 'rgba(25,118,210,0.15)', stairs: 'rgba(245,124,0,0.18)',
  elevator: 'rgba(123,31,162,0.18)', entrance: 'rgba(46,125,50,0.18)',
};
const ROUTE_FILL = 'rgba(67,160,71,0.35)';

interface Props {
  floor: Floor;
  routeNodeIds: Set<string>;
  route: string[] | null;
}

export default function ViewerCanvas({ floor, routeNodeIds, route }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(0.08);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const allPts = (floor.contours ?? []).flat();
    let minX: number, maxX: number, minY: number, maxY: number;
    if (allPts.length >= 2) {
      minX = Math.min(...allPts.map((p: number[]) => p[0]));
      maxX = Math.max(...allPts.map((p: number[]) => p[0]));
      minY = Math.min(...allPts.map((p: number[]) => p[1]));
      maxY = Math.max(...allPts.map((p: number[]) => p[1]));
    } else if (floor.nodes.length > 0) {
      minX = Math.min(...floor.nodes.map((n: NavNode) => n.x));
      maxX = Math.max(...floor.nodes.map((n: NavNode) => n.x));
      minY = Math.min(...floor.nodes.map((n: NavNode) => n.y));
      maxY = Math.max(...floor.nodes.map((n: NavNode) => n.y));
    } else return;
    const pad = 400;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const z = Math.min(size.w / (maxX - minX), size.h / (maxY - minY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(z);
    setPos({ x: size.w / 2 - cx * z, y: size.h / 2 - cy * z });
  }, [floor, size.w, size.h]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;
    const factor = e.evt.deltaY > 0 ? 0.85 : 1 / 0.85;
    const newZoom = Math.min(Math.max(zoom * factor, 0.01), 5);
    const origin = { x: (ptr.x - pos.x) / zoom, y: (ptr.y - pos.y) / zoom };
    setZoom(newZoom);
    setPos({ x: ptr.x - origin.x * newZoom, y: ptr.y - origin.y * newZoom });
  }, [zoom, pos]);

  const nodeMap = new Map<string, NavNode>(floor.nodes.map((n: NavNode) => [n.id, n]));

  const routeSegs: number[][] = [];
  if (route) {
    for (let i = 0; i < route.length - 1; i++) {
      const a = nodeMap.get(route[i]);
      const b = nodeMap.get(route[i + 1]);
      if (a && b) routeSegs.push([a.x, a.y, b.x, b.y]);
    }
  }

  const contours = floor.contours ?? [];

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: '#f0f2f5' }}>
      <Stage
        ref={stageRef}
        width={size.w} height={size.h}
        draggable
        x={pos.x} y={pos.y}
        scaleX={zoom} scaleY={zoom}
        onWheel={handleWheel}
        onDragEnd={e => setPos({ x: e.target.x(), y: e.target.y() })}
      >
        <Layer>
          {contours.length > 0 && (
            <Shape
              listening={false}
              sceneFunc={(ctx: any) => {
                const nc: CanvasRenderingContext2D = ctx._context;
                nc.beginPath();
                for (const pts of contours) {
                  if (pts.length < 3) continue;
                  nc.moveTo(pts[0][0], pts[0][1]);
                  for (let i = 1; i < pts.length; i++) nc.lineTo(pts[i][0], pts[i][1]);
                  nc.closePath();
                }
                nc.fillStyle = 'rgba(0,0,0,0.04)';
                nc.fill('evenodd');
                for (const pts of contours) {
                  if (pts.length < 3) continue;
                  nc.beginPath();
                  nc.moveTo(pts[0][0], pts[0][1]);
                  for (let i = 1; i < pts.length; i++) nc.lineTo(pts[i][0], pts[i][1]);
                  nc.closePath();
                  nc.strokeStyle = '#333';
                  nc.lineWidth = 2 / zoom;
                  nc.stroke();
                }
              }}
            />
          )}

          {(floor.areas ?? []).map(area => {
            const node = nodeMap.get(area.nodeId);
            if (!node || area.points.length < 3) return null;
            const onRoute = routeNodeIds.has(area.nodeId);
            const color = NODE_COLOR[node.type] ?? '#1976D2';
            const fill = onRoute ? ROUTE_FILL : (AREA_FILL[node.type] ?? 'rgba(0,0,0,0.05)');
            const pts = area.points.flat();
            const cx = area.points.reduce((s: number, p: number[]) => s + p[0], 0) / area.points.length;
            const cy = area.points.reduce((s: number, p: number[]) => s + p[1], 0) / area.points.length;
            const areaW = Math.max(...area.points.map((p: number[]) => p[0])) - Math.min(...area.points.map((p: number[]) => p[0]));
            return (
              <Group key={area.nodeId} listening={false}>
                <Line points={pts} closed fill={fill}
                  stroke={onRoute ? '#43A047' : color}
                  strokeWidth={1.5 / zoom} />
                <Text
                  text={node.label}
                  x={cx} y={cy}
                  offsetX={node.label.length * 3.5} offsetY={7}
                  width={areaW} align="center"
                  fontSize={13} fill={onRoute ? '#1B5E20' : color} fontStyle="bold"
                />
              </Group>
            );
          })}

          {routeSegs.map((seg, i) => (
            <Line key={i} points={seg}
              stroke="#43A047" strokeWidth={2 / zoom}
              lineCap="round" lineJoin="round"
              listening={false} opacity={0.8} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
