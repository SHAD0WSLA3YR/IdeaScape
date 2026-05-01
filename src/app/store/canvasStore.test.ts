import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasStore } from './canvasStore';

const defaultGroups = [
  { id: 'coral', name: 'Coral Group', color: '#f87171', nodes: [] as string[] },
  { id: 'blue', name: 'Blue Group', color: '#3b82f6', nodes: [] as string[] },
  { id: 'green', name: 'Green Group', color: '#10b981', nodes: [] as string[] },
];

const resetStoreForTest = () => {
  useCanvasStore.setState((state) => ({
    ...state,
    canvasName: 'Untitled Canvas',
    nodes: [],
    connections: [],
    groups: defaultGroups.map((group) => ({ ...group, nodes: [] })),
    transform: { x: 0, y: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    commandStats: {},
    history: {
      past: [],
      present: { nodes: [], connections: [], groups: defaultGroups.map((group) => ({ ...group, nodes: [] })) },
      future: [],
    },
  }));
};

describe('canvasStore smoke tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem('ideascape-command-stats');
    resetStoreForTest();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('adds a node', () => {
    const before = useCanvasStore.getState().nodes.length;
    useCanvasStore.getState().addNode(100, 150);
    const after = useCanvasStore.getState().nodes.length;

    expect(after).toBe(before + 1);
  });

  it('updates transform zoom', () => {
    useCanvasStore.getState().setTransform({ scale: 1.8 });

    expect(useCanvasStore.getState().transform.scale).toBe(1.8);
  });

  it('pushes to undo history and can undo add node', () => {
    useCanvasStore.getState().addNode(20, 40);

    expect(useCanvasStore.getState().history.past.length).toBeGreaterThan(0);
    expect(useCanvasStore.getState().nodes.length).toBe(1);

    useCanvasStore.getState().undo();

    expect(useCanvasStore.getState().nodes.length).toBe(0);
    expect(useCanvasStore.getState().history.future.length).toBe(1);
  });

  it('recordCommandUsage increments count and persists to localStorage', () => {
    useCanvasStore.getState().recordCommandUsage('create-node');
    useCanvasStore.getState().recordCommandUsage('create-node');

    const stats = useCanvasStore.getState().commandStats['create-node'];
    expect(stats?.count).toBe(2);
    expect(typeof stats?.lastUsed).toBe('number');

    const raw = localStorage.getItem('ideascape-command-stats');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as Record<string, { count: number }>;
    expect(parsed['create-node']?.count).toBe(2);
  });

  it('debounces autosave for rapid node updates', () => {
    const now = new Date();
    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [
        {
          id: 'node-1',
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          content: { type: 'text', value: 'draft' },
          color: '#ffffff',
          selected: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    useCanvasStore.getState().updateNode('node-1', { x: 10 });
    useCanvasStore.getState().updateNode('node-1', { x: 20 });
    useCanvasStore.getState().updateNode('node-1', { x: 30 });

    vi.advanceTimersByTime(499);
    expect(setItemSpy).not.toHaveBeenCalledWith('mindmap-autosave', expect.any(String));

    vi.advanceTimersByTime(1);
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().nodes[0]?.x).toBe(30);
  });

  it('restores an older local backup instead of silently ignoring it', () => {
    const oldTimestamp = Date.now() - 45 * 24 * 60 * 60 * 1000;
    localStorage.setItem('mindmap-autosave', JSON.stringify({
      canvasName: 'Old Journal',
      nodes: [
        {
          id: 'memory-1',
          x: 10,
          y: 20,
          width: 200,
          height: 120,
          content: { type: 'text', value: 'still matters' },
          color: '#ffffff',
          selected: false,
          createdAt: new Date(oldTimestamp),
          updatedAt: new Date(oldTimestamp),
        },
      ],
      connections: [],
      groups: defaultGroups,
      transform: { x: 5, y: 6, scale: 1.2 },
      timestamp: oldTimestamp,
    }));

    const restored = useCanvasStore.getState().loadAutoSave();

    expect(restored).toBe(true);
    expect(useCanvasStore.getState().canvasName).toBe('Old Journal');
    expect(useCanvasStore.getState().nodes[0]?.content.value).toBe('still matters');
  });
});
