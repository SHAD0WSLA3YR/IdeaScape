declare module 'react-draggable' {
  import * as React from 'react';

  export interface DraggableBounds {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  }

  export interface DraggableProps {
    axis?: 'both' | 'x' | 'y' | 'none';
    handle?: string;
    bounds?: DraggableBounds | string | false;
    defaultPosition?: { x: number; y: number };
    position?: { x: number; y: number };
    onStart?: (e: MouseEvent, data: DraggableData) => void;
    onDrag?: (e: MouseEvent, data: DraggableData) => void;
    onStop?: (e: MouseEvent, data: DraggableData) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }

  export interface DraggableData {
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
    lastX: number;
    lastY: number;
  }

  export default class Draggable extends React.Component<DraggableProps> {}
}
