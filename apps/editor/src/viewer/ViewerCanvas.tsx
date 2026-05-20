import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  rotation: number; // degrees: 0, 90, 180, 270
}

function rotatePt(x: number, y: number, px: number, py: number, deg: number) {
  const r = deg * Math.PI / 180;
  const dx = x - px, dy = y - py;
  return { x: px + dx * Math.cos(r) - dy * Math.sin(r), y: py + dx * Math.sin(r) + dy * Math.cos(r) };
}

export default function ViewerCanvas({ floor, routeNodeIds, route, rotation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(0.08);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Refs for stale-closure-safe access in effects
  const prevRotationRef = useRef(rotation);
  const zoomRef = useRef(zoom);
  const sizeRef = useRef(size);
  zoomRef.current = zoom;
  sizeRef.current = size;

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Rotation pivot = center of building bounding box
  const pivot = useMemo(() => {
    const allPts = (floor.contours ?? []).flat();
    if (allPts.length >= 2) {
      const xs = allPts.map((p: number[]) => p[0]);
      const ys = allPts.map((p: number[]) => p[1]);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    if (floor.nodes.length > 0) {
      const xs = floor.nodes.map((n: NavNode) => n.x);
      const ys = floor.nodes.map((n: NavNode) => n.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    return { x: 5000, y: 4000 };
  }, [floor]);

  const pivotRef = useRef(pivot);
  pivotRef.current = pivot;

  // Fit to bbox on floor or size change (NOT on rotation — rotation handled separately)
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
    const bboxW = maxX - minX, bboxH = maxY - minY;
    const z = Math.min(sizeRef.current.w / bboxW, sizeRef.current.h / bboxH);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setZoom(z);
    setPos({ x: sizeRef.current.w / 2 - cx * z, y: sizeRef.current.h / 2 - cy * z });
    prevRotationRef.current = rotation; // sync so rotation effect starts from correct baseline
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, size.w, size.h]);

  // On rotation change: keep the current viewport center pointing at the same virtual point
  useEffect(() => {
    const prevR = prevRotationRef.current;
    prevRotationRef.current = rotation;
    if (prevR === rotation) return;
    const p = pivotRef.current;
    const z = zoomRef.current;
    const s = sizeRef.current;
    setPos(cur => {
      // Layer-space point currently at screen center
      const lcx = (s.w / 2 - cur.x) / z;
      const lcy = (s.h / 2 - cur.y) / z;
      // Un-rotate from old angle → virtual center
      const vc = rotatePt(lcx, lcy, p.x, p.y, -prevR);
      // Re-rotate with new angle → new layer center
      const nlc = rotatePt(vc.x, vc.y, p.x, p.y, rotation);
      return { x: s.w / 2 - nlc.x * z, y: s.h / 2 - nlc.y * z };
    });
  }, [rotation]);

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

  // Text labels: rendered outside the rotating Group at their rotated positions — always upright
  const areaLabels = useMemo(() => {
    return (floor.areas ?? []).map(area => {
      const node = nodeMap.get(area.nodeId);
      if (!node || area.points.length < 3) return null;
      const cx = area.points.reduce((s: number, p: number[]) => s + p[0], 0) / area.points.length;
      const cy = area.points.reduce((s: number, p: number[]) => s + p[1], 0) / area.points.length;
      const xs = area.points.map((p: number[]) => p[0]);
      const ys = area.points.map((p: number[]) => p[1]);
      const areaW = Math.max(...xs) - Math.min(...xs);
      const areaH = Math.max(...ys) - Math.min(...ys);
      // Use extent along screen-horizontal axis after rotation
      const textW = rotation % 180 === 0 ? areaW : areaH;
      const rotated = rotatePt(cx, cy, pivot.x, pivot.y, rotation);
      const onRoute = routeNodeIds.has(area.nodeId);
      const color = NODE_COLOR[node.type] ?? '#1976D2';
      return { id: area.nodeId, x: rotated.x, y: rotated.y, textW, onRoute, color, label: node.label };
    }).filter(Boolean) as { id: string; x: number; y: number; textW: number; onRoute: boolean; color: string; label: string }[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.areas, floor.nodes, pivot, rotation, routeNodeIds]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#f0f2f5' }}>
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
          {/* Rotating group: contours, area polygons, route lines */}
          <Group x={pivot.x} y={pivot.y} rotation={rotation} offsetX={pivot.x} offsetY={pivot.y}>

            {/* Contours — even-odd fill */}
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

            {/* Area polygons (no text here) */}
            {(floor.areas ?? []).map(area => {
              const node = nodeMap.get(area.nodeId);
              if (!node || area.points.length < 3) return null;
              const onRoute = routeNodeIds.has(area.nodeId);
              const color = NODE_COLOR[node.type] ?? '#1976D2';
              const fill = onRoute ? ROUTE_FILL : (AREA_FILL[node.type] ?? 'rgba(0,0,0,0.05)');
              return (
                <Line key={area.nodeId} listening={false}
                  points={area.points.flat()} closed
                  fill={fill}
                  stroke={onRoute ? '#43A047' : color}
                  strokeWidth={1.5 / zoom} />
              );
            })}

            {/* Route path */}
            {routeSegs.map((seg, i) => (
              <Line key={i} points={seg}
                stroke="#43A047" strokeWidth={2 / zoom}
                lineCap="round" lineJoin="round"
                listening={false} opacity={0.8} />
            ))}

          </Group>

          {/* Non-rotating text labels at the rotated positions of each area centroid */}
          <Group listening={false}>
            {areaLabels.map(t => (
              <Text key={t.id}
                text={t.label}
                x={t.x} y={t.y}
                offsetX={t.textW / 2} offsetY={7}
                width={t.textW} align="center"
                fontSize={13} fill={t.onRoute ? '#1B5E20' : t.color} fontStyle="bold"
              />
            ))}
          </Group>

        </Layer>
      </Stage>
    </div>
  );
}
