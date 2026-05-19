export type NodeType = 'room' | 'stairs' | 'elevator' | 'entrance' | 'corridor';
export type EdgeType = 'walk' | 'stairs' | 'elevator';
export type Tool = 'select' | 'node' | 'edge' | 'pan' | 'move' | 'zone' | 'contour' | 'wall';

export interface NavNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
}

export interface NavEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface CrossFloorEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface Area {
  nodeId: string;
  points: number[][]; // [[x1,y1], [x2,y2], ...]
}

export interface Floor {
  level: number;
  name: string;
  image?: string;        // filename written into JSON
  imageFile?: File;      // in-memory only, NOT serialised
  imageDataUrl?: string; // in-memory only, NOT serialised
  nodes: NavNode[];
  edges: NavEdge[];
  areas?: Area[];
  contours?: number[][][];  // building outline polygons [[[x,y],...],...]
  walls?: number[][];       // interior walls [[x1,y1,x2,y2],...]
}

export interface Building {
  id: string;
  name: string;
  floors: Floor[];
  crossFloorEdges: CrossFloorEdge[];
}
