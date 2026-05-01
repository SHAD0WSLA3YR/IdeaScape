import { create } from 'zustand';
import { DEFAULT_NVIDIA_MODEL, aiService, coerceNvidiaModel } from '../services/aiService';
import { DEFAULT_CANVAS_DOCUMENT_ID, canUseIndexedDb, loadCanvasSnapshot, normalizeCanvasSnapshot, saveCanvasSnapshot } from '../services/canvasPersistence';
import { createAISlice, initialAISuggestions, type AISlice } from '../../stores/slices/aiSlice';

export interface Point {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: {
    type: 'text' | 'image' | 'link' | 'video' | 'browser';
    value: string;
    title?: string;
    images?: string[]; // Array of image URLs for multiple images
    links?: Array<{ url: string; title: string }>; // Array of links for multiple links
    videos?: string[]; // Array of video URLs for multiple videos
    // Browser-specific fields
    url?: string; // Current URL for browser nodes
    isAwake?: boolean; // Sleep/wake state for browser nodes
    favicon?: string; // Auto-extracted favicon
    pageTitle?: string; // Auto-extracted page title
    history?: string[];
    historyIndex?: number;
  };
  groupId?: string;
  color: string;
  selected: boolean;
  isNew?: boolean; // Flag to track newly created nodes for animation
  createdAt: Date; // Timestamp for when the node was created
  updatedAt: Date; // Timestamp for when the node was last updated
  comment?: string; // Optional comment/annotation for the node
  tags?: string[]; // Array of tags for categorization and filtering
  isPinned?: boolean; // Flag to indicate if the node is pinned in place
}

export interface Connection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPoint?: string;
  toPoint?: string;
  color: string;
}

export interface NodeGroup {
  id: string;
  name: string;
  color: string;
  nodes: string[];
}

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isActive: boolean;
}

export type CommandUsageStat = {
  count: number;
  lastUsed: number;
};

const COMMAND_STATS_STORAGE_KEY = 'ideascape-command-stats';

function loadCommandStatsFromStorage(): Record<string, CommandUsageStat> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(COMMAND_STATS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CommandUsageStat>;
  } catch {
    return {};
  }
}

function persistCommandStatsToStorage(stats: Record<string, CommandUsageStat>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COMMAND_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore quota / private mode
  }
}

type CanvasHistorySnapshot = {
  nodes: Node[];
  connections: Connection[];
  groups: NodeGroup[];
};

/** Deep-clone history entries so `past` / `future` never share references with live state. */
function cloneHistorySnapshot(snapshot: CanvasHistorySnapshot): CanvasHistorySnapshot {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(snapshot) as CanvasHistorySnapshot;
    }
  } catch {
    // structuredClone can throw on exotic values; canvas data should be plain data
  }
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
      content: {
        ...node.content,
        images: node.content.images ? [...node.content.images] : undefined,
        links: node.content.links?.map((l) => ({ ...l })),
        videos: node.content.videos ? [...node.content.videos] : undefined,
        history: node.content.history ? [...node.content.history] : undefined,
      },
    })),
    connections: snapshot.connections.map((c) => ({ ...c })),
    groups: snapshot.groups.map((g) => ({ ...g, nodes: [...g.nodes] })),
  };
}

interface CanvasState {
  canvasName: string;
  nodes: Node[];
  connections: Connection[];
  groups: NodeGroup[];
  transform: CanvasTransform;
  selectedNodeId: string | null;
  selectedNodeIds: string[]; // Multi-select support
  selectionBox: SelectionBox;
  isDragging: boolean;
  isConnecting: boolean;
  connectingFromNodeId: string | null;
  history: {
    past: Array<{ nodes: Node[]; connections: Connection[]; groups: NodeGroup[] }>;
    present: { nodes: Node[]; connections: Connection[]; groups: NodeGroup[] };
    future: Array<{ nodes: Node[]; connections: Connection[]; groups: NodeGroup[] }>;
  };
  settings: {
    theme: 'light' | 'dark' | 'system';
    aiProvider: 'nvidia';
    aiModel: string;
    profile: {
      username: string;
      email: string;
    };
  };
  // Filtering and tagging state
  activeTagFilter: string | null; // Currently active tag filter
  hiddenNodes: Set<string>; // IDs of nodes hidden by filters
  
  // Group highlighting state
  highlightedGroupId: string | null; // Currently highlighted group ID

  /** Usage counts for command palette favorites (persisted separately from canvas data). */
  commandStats: Record<string, CommandUsageStat>;
}

interface CanvasActions {
  // Canvas actions
  setCanvasName: (name: string) => void;
  
  // Node actions
  addNode: (x: number, y: number) => string;
  addNodeAtCenter: () => string;
  addBrowserNodeAtCenter: () => string;
  duplicateNode: (id: string) => void; // Duplicate node action
  updateNode: (id: string, updates: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void; // Multi-delete
  selectNode: (id: string | null) => void;
  selectMultipleNodes: (ids: string[]) => void;
  clearSelection: () => void;
  
  // Connection actions
  addConnection: (fromNodeId: string, toNodeId: string, fromPoint?: string, toPoint?: string) => void;
  deleteConnection: (id: string) => void;
  
  // Group actions
  addGroup: (name: string, color: string, nodeIds: string[]) => void;
  updateGroup: (id: string, updates: Partial<NodeGroup>) => void;
  deleteGroup: (id: string) => void;
  assignNodesToGroup: (nodeIds: string[], groupId: string) => void;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodesFromGroups: (nodeIds: string[]) => void;
  
  // Transform actions
  setTransform: (transform: Partial<CanvasTransform>) => void;
  fitToScreen: (canvasSize: { width: number; height: number }) => void;
  zoomToNode: (nodeId: string, canvasSize: { width: number; height: number }) => void;
  zoomToNodes: (nodeIds: string[], canvasSize: { width: number; height: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  
  // Canvas actions
  setDragging: (isDragging: boolean) => void;
  setConnecting: (isConnecting: boolean, fromNodeId?: string) => void;
  clearCanvas: () => void;
  
  // Selection box actions
  startSelectionBox: (x: number, y: number) => void;
  updateSelectionBox: (x: number, y: number) => void;
  endSelectionBox: () => void;
  
  // History actions
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  
  // Save/Load
  exportCanvas: () => string;
  importCanvas: (data: string) => void;
  newCanvas: () => void;
  autoSave: () => void; // Auto-save to localStorage
  loadAutoSave: () => boolean; // Load from localStorage
  loadDurableSave: () => Promise<boolean>;
  
  // Settings actions
  updateSettings: (updates: Partial<CanvasState['settings']>) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setAiProvider: (provider: 'nvidia') => void;
  setAiModel: (model: string) => void;
  
  // Storage management
  cleanupStorage: () => void;
  getStorageInfo: () => { used: number; available: number; total: number };
  
  // Search functions
  searchNodesByContent: (query: string) => Node[];
  searchNodesByDate: (date: Date) => Node[];
  getNodesByDateRange: (startDate: Date, endDate: Date) => Node[];
  getAllNodesDates: () => Date[];
  
  // Comment actions
  addComment: (nodeId: string, comment: string) => void;
  removeComment: (nodeId: string) => void;
  
  // Tag and filtering actions
  addTagToNode: (nodeId: string, tag: string) => void;
  removeTagFromNode: (nodeId: string, tag: string) => void;
  getAllTags: () => string[];
  setTagFilter: (tag: string | null) => void;
  clearTagFilter: () => void;
  getVisibleNodes: () => Node[];
  
  // Group selected nodes action
  groupSelectedNodes: () => void;
  
  // Group highlighting actions
  setHighlightedGroup: (groupId: string | null) => void;
  
  // Layout actions
  autoOrganizeNodes: (layout: 'grid' | 'mindmap', centerNodeId?: string) => void;
  
  // Collaboration actions
  setNodes: (nodes: Node[]) => void;
  setConnections: (connections: Connection[]) => void;
  setGroups: (groups: NodeGroup[]) => void;

  recordCommandUsage: (commandId: string) => void;
}

const AUTO_SAVE_DEBOUNCE_MS = 500;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoSave(get: () => CanvasState & CanvasActions & AISlice, delay = AUTO_SAVE_DEBOUNCE_MS) {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    get().autoSave();
  }, delay);
}

const initialState: CanvasState = {
  canvasName: 'Untitled Canvas',
  nodes: [],
  connections: [],
  groups: [
    { id: 'coral', name: 'Coral Group', color: '#f87171', nodes: [] },
    { id: 'blue', name: 'Blue Group', color: '#3b82f6', nodes: [] },
    { id: 'green', name: 'Green Group', color: '#10b981', nodes: [] },
  ],
  transform: { x: 0, y: 0, scale: 1 },
  selectedNodeId: null,
  selectedNodeIds: [],
  selectionBox: {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    isActive: false,
  },
  isDragging: false,
  isConnecting: false,
  connectingFromNodeId: null,
  history: {
    past: [],
    present: { nodes: [], connections: [], groups: [] },
    future: [],
  },
  settings: {
    theme: 'system',
    aiProvider: 'nvidia',
    aiModel: DEFAULT_NVIDIA_MODEL,
    profile: {
      username: '',
      email: '',
    },
  },
  activeTagFilter: null,
  hiddenNodes: new Set(),
  highlightedGroupId: null,
  commandStats: loadCommandStatsFromStorage(),
};

export const useCanvasStore = create<CanvasState & CanvasActions & AISlice>((set, get) => ({
  ...initialState,

  setCanvasName: (name) => {
    set(state => ({ ...state, canvasName: name }));
    
    // Auto-save after changing canvas name
    scheduleAutoSave(get, 100);
  },

  clearCanvas: () => {
    set(state => {
      const newState = {
        ...state,
        nodes: [],
        connections: [],
        selectedNodeId: null,
      };
      
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: [],
        connections: [],
        groups: newState.groups,
      };
      newState.history.future = [];
      
      return newState;
    });
  },

  addNode: (x, y) => {
    const now = new Date();
    // Use timestamp + random to ensure uniqueness
    const uniqueId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNode: Node = {
      id: uniqueId,
      x,
      y,
      width: 200,
      height: 120,
      content: { type: 'text', value: '<p style="font-size: 14px;">Double-click to edit</p>' },
      color: '#ffffff',
      selected: false,
      isNew: true, // Mark as new for animation
      createdAt: now,
      updatedAt: now,
    };
    
    set(state => {
      const newState = { ...state, nodes: [...state.nodes, newNode] };
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      
      // Auto-save after adding node
      scheduleAutoSave(get, 100);
      
      return newState;
    });
    
    // Remove the isNew flag after animation duration
    setTimeout(() => {
      get().updateNode(newNode.id, { isNew: false });
    }, 600); // Match animation duration

    return uniqueId;
  },

  addNodeAtCenter: () => {
    const state = get();
    // Calculate center position relative to current transform
    const centerX = (window.innerWidth / 2 - state.transform.x) / state.transform.scale;
    const centerY = (window.innerHeight / 2 - state.transform.y) / state.transform.scale;

    return get().addNode(centerX - 100, centerY - 60); // Offset by half node size
  },

  addBrowserNodeAtCenter: () => {
    const state = get();
    const centerX = (window.innerWidth / 2 - state.transform.x) / state.transform.scale;
    const centerY = (window.innerHeight / 2 - state.transform.y) / state.transform.scale;
    const now = new Date();
    const uniqueId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startUrl = 'https://www.wikipedia.org';
    const newNode: Node = {
      id: uniqueId,
      x: centerX - 350,
      y: centerY - 250,
      width: 700,
      height: 500,
      content: {
        type: 'browser',
        value: startUrl,
        url: startUrl,
        isAwake: false,
        favicon: undefined,
        pageTitle: undefined,
        history: [startUrl],
        historyIndex: 0,
      },
      color: '#ffffff',
      selected: false,
      isNew: true,
      createdAt: now,
      updatedAt: now,
      isPinned: true,
    };

    set((s) => {
      const newState = { ...s, nodes: [...s.nodes, newNode] };
      newState.history.past.push(cloneHistorySnapshot(s.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      scheduleAutoSave(get, 100);
      return newState;
    });

    setTimeout(() => {
      get().updateNode(newNode.id, { isNew: false });
    }, 600);

    return uniqueId;
  },

  recordCommandUsage: (commandId) => {
    set((s) => {
      const prev = s.commandStats[commandId] ?? { count: 0, lastUsed: 0 };
      const nextStats = {
        ...s.commandStats,
        [commandId]: {
          count: prev.count + 1,
          lastUsed: Date.now(),
        },
      };
      persistCommandStatsToStorage(nextStats);
      return { ...s, commandStats: nextStats };
    });
  },

  duplicateNode: (id) => {
    const state = get();
    const nodeToDuplicate = state.nodes.find(n => n.id === id);
    if (!nodeToDuplicate) return;
    
    const now = new Date();
    // Use timestamp + random to ensure uniqueness even for rapid duplications
    const uniqueId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNode: Node = {
      ...nodeToDuplicate,
      id: uniqueId,
      x: nodeToDuplicate.x + 20, // Offset to make duplication visible
      y: nodeToDuplicate.y + 20,
      selected: false,
      isNew: true,
      createdAt: now,
      updatedAt: now,
    };
    
    set(state => {
      const newState = { ...state, nodes: [...state.nodes, newNode] };
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      
      // Auto-save after duplicating node
      scheduleAutoSave(get, 100);
      
      return newState;
    });
    
    // Remove the isNew flag after animation duration
    setTimeout(() => {
      get().updateNode(newNode.id, { isNew: false });
    }, 600);
  },

  updateNode: (id, updates) => {
    set(state => ({
      ...state,
      nodes: state.nodes.map(node => 
        node.id === id ? { 
          ...node, 
          ...updates,
          updatedAt: new Date() // Update timestamp whenever node is modified
        } : node
      ),
    }));
    
    // Auto-save after updating node
    scheduleAutoSave(get);
  },

  deleteNode: (id) => {
    set(state => {
      const newState = {
        ...state,
        nodes: state.nodes.filter(node => node.id !== id),
        connections: state.connections.filter(
          conn => conn.fromNodeId !== id && conn.toNodeId !== id
        ),
        groups: state.groups.map(group => ({
          ...group,
          nodes: group.nodes.filter(nodeId => nodeId !== id),
        })),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
      
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      
      // Auto-save after deleting node
      scheduleAutoSave(get, 100);
      
      return newState;
    });
  },

  selectNode: (id) => {
    set(state => ({
      ...state,
      selectedNodeId: id,
      selectedNodeIds: id ? [id] : [],
      nodes: state.nodes.map(node => ({
        ...node,
        selected: node.id === id,
      })),
    }));
  },

  selectMultipleNodes: (ids) => {
    set(state => ({
      ...state,
      selectedNodeId: null, // Clear single selection
      selectedNodeIds: ids,
      nodes: state.nodes.map(node => ({
        ...node,
        selected: ids.includes(node.id),
      })),
    }));
  },

  clearSelection: () => {
    set(state => ({
      ...state,
      selectedNodeId: null,
      selectedNodeIds: [],
      nodes: state.nodes.map(node => ({
        ...node,
        selected: false,
      })),
    }));
  },

  deleteNodes: (ids) => {
    set(state => {
      const newState = {
        ...state,
        nodes: state.nodes.filter(node => !ids.includes(node.id)),
        connections: state.connections.filter(
          conn => !ids.includes(conn.fromNodeId) && !ids.includes(conn.toNodeId)
        ),
        groups: state.groups.map(group => ({
          ...group,
          nodes: group.nodes.filter(nodeId => !ids.includes(nodeId)),
        })),
        selectedNodeId: null,
        selectedNodeIds: [],
      };
      
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      
      // Auto-save after deleting nodes
      scheduleAutoSave(get, 100);
      
      return newState;
    });
  },

  addConnection: (fromNodeId, toNodeId, fromPoint, toPoint) => {
    if (fromNodeId === toNodeId) return;
    
    const existingConnection = get().connections.find(
      conn => 
        (conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId) ||
        (conn.fromNodeId === toNodeId && conn.toNodeId === fromNodeId)
    );
    
    if (existingConnection) return;

    const newConnection: Connection = {
      id: `conn-${Date.now()}`,
      fromNodeId,
      toNodeId,
      fromPoint,
      toPoint,
      color: '#000000',
    };

    set(state => {
      const newState = {
        ...state,
        connections: [...state.connections, newConnection],
        isConnecting: false,
        connectingFromNodeId: null,
      };
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      return newState;
    });
    
    // Auto-save after adding connection
    scheduleAutoSave(get, 100);
  },

  deleteConnection: (id) => {
    set(state => {
      const newState = {
        ...state,
        connections: state.connections.filter(conn => conn.id !== id),
      };
      newState.history.past.push(cloneHistorySnapshot(state.history.present));
      newState.history.present = {
        nodes: newState.nodes,
        connections: newState.connections,
        groups: newState.groups,
      };
      newState.history.future = [];
      return newState;
    });
    
    // Auto-save after deleting connection
    scheduleAutoSave(get, 100);
  },

  addGroup: (name, color, nodeIds) => {
    const newGroup: NodeGroup = {
      id: `group-${Date.now()}`,
      name,
      color,
      nodes: nodeIds,
    };

    set(state => ({
      ...state,
      groups: [...state.groups, newGroup],
      nodes: state.nodes.map(node => 
        nodeIds.includes(node.id) 
          ? { ...node, groupId: newGroup.id }
          : node
      ),
    }));
  },

  updateGroup: (id, updates) => {
    set(state => ({
      ...state,
      groups: state.groups.map(group => 
        group.id === id ? { ...group, ...updates } : group
      ),
    }));
  },

  deleteGroup: (id) => {
    set(state => ({
      ...state,
      groups: state.groups.filter(group => group.id !== id),
      nodes: state.nodes.map(node => 
        node.groupId === id ? { ...node, groupId: undefined } : node
      ),
    }));
  },

  assignNodesToGroup: (nodeIds, groupId) => {
    set(state => {
      const group = state.groups.find(g => g.id === groupId);
      if (!group) return state;

      return {
        ...state,
        nodes: state.nodes.map(node => 
          nodeIds.includes(node.id) 
            ? { ...node, groupId: groupId }
            : node
        ),
        groups: state.groups.map(g => 
          g.id === groupId 
            ? { ...g, nodes: [...new Set([...g.nodes, ...nodeIds])] }
            : { ...g, nodes: g.nodes.filter(id => !nodeIds.includes(id)) }
        ),
      };
    });
  },

  addNodeToGroup: (nodeId, groupId) => {
    set(state => {
      const group = state.groups.find(g => g.id === groupId);
      if (!group) return state;

      return {
        ...state,
        nodes: state.nodes.map(node => 
          node.id === nodeId 
            ? { ...node, groupId: groupId }
            : node
        ),
        groups: state.groups.map(g => 
          g.id === groupId 
            ? { ...g, nodes: [...new Set([...g.nodes, nodeId])] }
            : { ...g, nodes: g.nodes.filter(id => id !== nodeId) }
        ),
      };
    });
  },

  removeNodesFromGroups: (nodeIds) => {
    set(state => ({
      ...state,
      nodes: state.nodes.map(node => 
        nodeIds.includes(node.id) 
          ? { ...node, groupId: undefined }
          : node
      ),
      groups: state.groups.map(group => ({
        ...group,
        nodes: group.nodes.filter(id => !nodeIds.includes(id)),
      })),
    }));
  },

  setTransform: (transform) => {
    set(state => ({
      ...state,
      transform: { ...state.transform, ...transform },
    }));
  },

  fitToScreen: (canvasSize) => {
    const state = get();
    if (state.nodes.length === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    state.nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    // Add padding around content
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate scale to fit content in canvas
    const scaleX = canvasSize.width / contentWidth;
    const scaleY = canvasSize.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

    // Calculate position to center content
    const x = (canvasSize.width - contentWidth * scale) / 2 - minX * scale;
    const y = (canvasSize.height - contentHeight * scale) / 2 - minY * scale;

    set(state => ({
      ...state,
      transform: { x, y, scale },
    }));
  },

  zoomToNode: (nodeId, canvasSize) => {
    const state = get();
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Add padding around node
    const padding = 50;
    const minX = node.x - padding;
    const minY = node.y - padding;
    const maxX = node.x + node.width + padding;
    const maxY = node.y + node.height + padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate scale to fit node in canvas
    const scaleX = canvasSize.width / contentWidth;
    const scaleY = canvasSize.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

    // Calculate position to center node
    const x = (canvasSize.width - contentWidth * scale) / 2 - minX * scale;
    const y = (canvasSize.height - contentHeight * scale) / 2 - minY * scale;

    set(state => ({
      ...state,
      transform: { x, y, scale },
    }));
  },

  zoomToNodes: (nodeIds, canvasSize) => {
    const state = get();
    const selectedNodes = state.nodes.filter(n => nodeIds.includes(n.id));
    if (selectedNodes.length === 0) return;

    // Calculate bounding box of all selected nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    selectedNodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    // Add padding around nodes
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate scale to fit nodes in canvas
    const scaleX = canvasSize.width / contentWidth;
    const scaleY = canvasSize.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

    // Calculate position to center nodes
    const x = (canvasSize.width - contentWidth * scale) / 2 - minX * scale;
    const y = (canvasSize.height - contentHeight * scale) / 2 - minY * scale;

    set(state => ({
      ...state,
      transform: { x, y, scale },
    }));
  },

  zoomIn: () => {
    set(state => {
      const newScale = Math.min(state.transform.scale * 1.2, 3);
      return {
        ...state,
        transform: { ...state.transform, scale: newScale },
      };
    });
  },

  zoomOut: () => {
    set(state => {
      const newScale = Math.max(state.transform.scale / 1.2, 0.1);
      return {
        ...state,
        transform: { ...state.transform, scale: newScale },
      };
    });
  },

  setDragging: (isDragging) => {
    set({ isDragging });
  },

  setConnecting: (isConnecting, fromNodeId) => {
    set({ isConnecting, connectingFromNodeId: fromNodeId || null });
  },

  undo: () => {
    set(state => {
      if (state.history.past.length === 0) return state;
      
      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);
      const restored = cloneHistorySnapshot(previous);
      const currentForFuture = cloneHistorySnapshot(state.history.present);
      
      return {
        ...state,
        nodes: restored.nodes,
        connections: restored.connections,
        groups: restored.groups,
        history: {
          past: newPast,
          present: {
            nodes: restored.nodes,
            connections: restored.connections,
            groups: restored.groups,
          },
          future: [currentForFuture, ...state.history.future],
        },
      };
    });
  },

  redo: () => {
    set(state => {
      if (state.history.future.length === 0) return state;
      
      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);
      const applied = cloneHistorySnapshot(next);
      const presentForPast = cloneHistorySnapshot(state.history.present);
      
      return {
        ...state,
        nodes: applied.nodes,
        connections: applied.connections,
        groups: applied.groups,
        history: {
          past: [...state.history.past, presentForPast],
          present: {
            nodes: applied.nodes,
            connections: applied.connections,
            groups: applied.groups,
          },
          future: newFuture,
        },
      };
    });
  },

  saveToHistory: () => {
    set(state => ({
      ...state,
      history: {
        past: [...state.history.past, cloneHistorySnapshot(state.history.present)],
        present: {
          nodes: state.nodes,
          connections: state.connections,
          groups: state.groups,
        },
        future: [],
      },
    }));
  },

  exportCanvas: () => {
    const state = get();
    return JSON.stringify({
      canvasName: state.canvasName,
      nodes: state.nodes,
      connections: state.connections,
      groups: state.groups,
      transform: state.transform,
    }, null, 2);
  },

  importCanvas: (data) => {
    try {
      const parsed = JSON.parse(data);
      const now = new Date();
      
      // Handle legacy nodes that don't have timestamps
      const nodesWithTimestamps = (parsed.nodes || []).map((node: any) => ({
        ...node,
        createdAt: node.createdAt || now,
        updatedAt: node.updatedAt || now,
      }));
      
      set(state => ({
        ...state,
        canvasName: parsed.canvasName || 'Untitled Canvas',
        nodes: nodesWithTimestamps,
        connections: parsed.connections || [],
        groups: parsed.groups || [],
        transform: parsed.transform || { x: 0, y: 0, scale: 1 },
        selectedNodeId: null,
        selectedNodeIds: [], // Clear multi-selection
        highlightedGroupId: null, // Clear group highlighting
        activeTagFilter: null, // Clear tag filters
        hiddenNodes: new Set(), // Reset hidden nodes
        aiSuggestions: initialAISuggestions, // Clear AI suggestions
      }));
      
      // Auto-close any open dialog boxes with a simple event dispatch
      setTimeout(() => {
        // Dispatch event to close all dialogs - components will handle this
        window.dispatchEvent(new CustomEvent('closeAllDialogs'));
      }, 50);
      
    } catch (error) {
      console.error('Failed to import canvas data:', error);
    }
  },

  newCanvas: () => {
    const commandStats = get().commandStats;
    set({
      ...initialState,
      commandStats,
      canvasName: 'Untitled Canvas',
      history: {
        past: [],
        present: { nodes: [], connections: [], groups: initialState.groups },
        future: [],
      },
    });
    
    // Clear auto-save when creating new canvas
    localStorage.removeItem('mindmap-autosave');
  },

  autoSave: () => {
    try {
      const state = get();
      
      // Optimize data for storage - remove unnecessary fields and compress
      const saveData = {
        schemaVersion: 1 as const,
        documentId: DEFAULT_CANVAS_DOCUMENT_ID,
        canvasName: state.canvasName,
        nodes: state.nodes.map(node => ({
          id: node.id,
          x: Math.round(node.x),
          y: Math.round(node.y),
          width: node.width,
          height: node.height,
          content: node.content,
          groupId: node.groupId,
          color: node.color,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          comment: node.comment, // Save comments
          tags: node.tags, // Save tags
          isPinned: node.isPinned, // Save pin state
          // Exclude selected, isNew and other transient properties
        })),
        connections: state.connections.map(conn => ({
          id: conn.id,
          fromNodeId: conn.fromNodeId,
          toNodeId: conn.toNodeId,
          fromPoint: conn.fromPoint,
          toPoint: conn.toPoint,
          color: conn.color,
        })),
        groups: state.groups,
        transform: {
          x: Math.round(state.transform.x),
          y: Math.round(state.transform.y),
          scale: Math.round(state.transform.scale * 100) / 100, // Round to 2 decimal places
        },
        settings: state.settings,
        timestamp: Date.now()
      };
      
      const dataString = JSON.stringify(saveData);
      
      // Check data size (localStorage limit is usually 5-10MB)
      const dataSize = new Blob([dataString]).size;
      
      if (dataSize > 4 * 1024 * 1024) { // 4MB limit to be safe
        // Try to clean up old auto-saves first
        const keys = Object.keys(localStorage);
        const autoSaveKeys = keys.filter(key => key.startsWith('mindmap-autosave-backup-'));
        autoSaveKeys.forEach(key => localStorage.removeItem(key));
        
        // If still too large, create a minimal backup
        if (dataSize > 4 * 1024 * 1024) {
          const minimalData = {
            canvasName: state.canvasName,
            nodes: state.nodes.map(node => ({
              id: node.id,
              x: Math.round(node.x),
              y: Math.round(node.y),
              width: node.width,
              height: node.height,
              content: { 
                type: node.content.type, 
                value: node.content.type === 'text' ? 'Content truncated due to size' : node.content.value,
                title: node.content.title 
              },
              groupId: node.groupId,
              color: node.color,
              createdAt: node.createdAt,
              updatedAt: node.updatedAt,
            })),
            connections: state.connections,
            groups: state.groups,
            transform: saveData.transform,
            settings: state.settings,
            timestamp: Date.now(),
            truncated: true
          };
          localStorage.setItem('mindmap-autosave', JSON.stringify(minimalData));
          if (canUseIndexedDb()) {
            void saveCanvasSnapshot(normalizeCanvasSnapshot(minimalData)).catch((error) => {
              console.warn('Failed to save minimal canvas to IndexedDB:', error);
            });
          }
          return;
        }
      }
      
      // Try to save, with fallback handling
      try {
        localStorage.setItem('mindmap-autosave', dataString);
        if (canUseIndexedDb()) {
          void saveCanvasSnapshot(normalizeCanvasSnapshot(saveData)).catch((error) => {
            console.warn('Failed to save canvas to IndexedDB:', error);
          });
        }
      } catch (quotaError) {
        if (quotaError.name === 'QuotaExceededError') {
          // Emergency cleanup - remove all non-essential localStorage items
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            if (!key.startsWith('mindmap-autosave') && !key.startsWith('mindmap-settings')) {
              localStorage.removeItem(key);
            }
          });
          
          // Try one more time with cleaned storage
          try {
            localStorage.setItem('mindmap-autosave', dataString);
            if (canUseIndexedDb()) {
              void saveCanvasSnapshot(normalizeCanvasSnapshot(saveData)).catch((error) => {
                console.warn('Failed to save canvas to IndexedDB:', error);
              });
            }
          } catch (finalError) {
            // Create backup key with timestamp and save minimal data
            const backupKey = `mindmap-autosave-backup-${Date.now()}`;
            const emergencyData = {
              canvasName: state.canvasName,
              nodeCount: state.nodes.length,
              connectionCount: state.connections.length,
              timestamp: Date.now(),
              error: 'Storage quota exceeded'
            };
            try {
              localStorage.setItem(backupKey, JSON.stringify(emergencyData));
            } catch (e) {
              // If even this fails, we're out of options
              console.error('Critical: Unable to save any data to localStorage');
            }
            throw finalError;
          }
        } else {
          throw quotaError;
        }
      }
    } catch (error) {
      console.warn('Failed to auto-save:', error);
      // Don't show error to user for auto-save failures unless it's critical
      if (error.name === 'QuotaExceededError') {
        // This will be handled by the App component
        throw error;
      }
    }
  },

  loadAutoSave: () => {
    try {
      const saved = localStorage.getItem('mindmap-autosave');
      if (saved) {
        const data = normalizeCanvasSnapshot(JSON.parse(saved));
        const rawSettings =
          data.settings && typeof data.settings === 'object'
            ? data.settings as Partial<CanvasState['settings']>
            : {};
        const loadedSettings = {
          ...initialState.settings,
          ...rawSettings,
          aiProvider: 'nvidia' as const,
          aiModel: coerceNvidiaModel(rawSettings.aiModel),
        };
        set(state => ({
          ...state,
          canvasName: data.canvasName || 'Untitled Canvas',
          nodes: data.nodes || [],
          connections: data.connections || [],
          groups: data.groups || initialState.groups,
          transform: data.transform || { x: 0, y: 0, scale: 1 },
          settings: loadedSettings,
          selectedNodeId: null,
          selectedNodeIds: [],
          history: {
            past: [],
            present: { 
              nodes: data.nodes || [], 
              connections: data.connections || [], 
              groups: data.groups || initialState.groups 
            },
            future: [],
          },
        }));

        // Sync AI provider and model with the loaded preferences.
        if (loadedSettings.aiProvider) {
          aiService.setProvider(loadedSettings.aiProvider);
        }
        if (loadedSettings.aiModel) {
          aiService.setModel(loadedSettings.aiModel);
        }

        return true; // Successfully loaded
      }
    } catch (error) {
      console.warn('Failed to load auto-save:', error);
    }
    return false; // No auto-save loaded
  },

  loadDurableSave: async () => {
    try {
      const data = await loadCanvasSnapshot();
      if (!data) return false;

      const rawSettings =
        data.settings && typeof data.settings === 'object'
          ? data.settings as Partial<CanvasState['settings']>
          : {};
      const loadedSettings = {
        ...initialState.settings,
        ...rawSettings,
        aiProvider: 'nvidia' as const,
        aiModel: coerceNvidiaModel(rawSettings.aiModel),
      };
      set(state => ({
        ...state,
        canvasName: data.canvasName || 'Untitled Canvas',
        nodes: data.nodes || [],
        connections: data.connections || [],
        groups: data.groups || initialState.groups,
        transform: data.transform || { x: 0, y: 0, scale: 1 },
        settings: loadedSettings,
        selectedNodeId: null,
        selectedNodeIds: [],
        history: {
          past: [],
          present: {
            nodes: data.nodes || [],
            connections: data.connections || [],
            groups: data.groups || initialState.groups,
          },
          future: [],
        },
      }));

      if (loadedSettings.aiProvider) {
        aiService.setProvider(loadedSettings.aiProvider);
      }
      if (loadedSettings.aiModel) {
        aiService.setModel(loadedSettings.aiModel);
      }

      return true;
    } catch (error) {
      console.warn('Failed to load durable canvas save:', error);
      return get().loadAutoSave();
    }
  },

  updateSettings: (updates) => {
    set(state => ({
      ...state,
      settings: { ...state.settings, ...updates }
    }));
    
    // Auto-save after updating settings
    scheduleAutoSave(get, 100);
  },

  setTheme: (theme) => {
    set(state => ({
      ...state,
      settings: { ...state.settings, theme }
    }));
    
    // Apply theme to document
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System theme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
    
    // Auto-save after changing theme
    scheduleAutoSave(get, 100);
  },

  setAiProvider: (provider) => {
    set(state => ({
      ...state,
      settings: { ...state.settings, aiProvider: provider }
    }));

    aiService.setProvider(provider);

    scheduleAutoSave(get, 100);
  },

  setAiModel: (model) => {
    const aiModel = coerceNvidiaModel(model);
    set(state => ({
      ...state,
      settings: { ...state.settings, aiModel }
    }));

    aiService.setModel(aiModel);

    scheduleAutoSave(get, 100);
  },

  cleanupStorage: () => {
    try {
      const keys = Object.keys(localStorage);
      
      // Remove old backup auto-saves (keep only the most recent 3)
      const backupKeys = keys
        .filter(key => key.startsWith('mindmap-autosave-backup-'))
        .sort()
        .reverse();
      
      if (backupKeys.length > 3) {
        backupKeys.slice(3).forEach(key => localStorage.removeItem(key));
      }
      
      // Remove any very old auto-saves (older than 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      keys.forEach(key => {
        if (key.startsWith('mindmap-autosave')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.timestamp && data.timestamp < thirtyDaysAgo) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // If we can't parse it, it's probably corrupted, so remove it
            localStorage.removeItem(key);
          }
        }
      });
      
      console.log('Storage cleanup completed');
    } catch (error) {
      console.warn('Storage cleanup failed:', error);
    }
  },

  getStorageInfo: () => {
    try {
      // Estimate localStorage usage
      let used = 0;
      Object.keys(localStorage).forEach(key => {
        used += localStorage.getItem(key)?.length || 0;
      });
      
      // Most browsers have a 5-10MB limit, we'll estimate 5MB as conservative
      const total = 5 * 1024 * 1024; // 5MB in bytes
      const available = total - used;
      
      return { used, available, total };
    } catch (error) {
      return { used: 0, available: 0, total: 0 };
    }
  },

  startSelectionBox: (x, y) => {
    set(state => ({
      ...state,
      selectionBox: {
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        isActive: true,
      },
    }));
  },

  updateSelectionBox: (x, y) => {
    set(state => ({
      ...state,
      selectionBox: {
        ...state.selectionBox,
        endX: x,
        endY: y,
      },
    }));
  },

  endSelectionBox: () => {
    const state = get();
    
    // Calculate selection bounds
    const { startX, startY, endX, endY } = state.selectionBox;
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const maxX = Math.max(startX, endX);
    const maxY = Math.max(startY, endY);
    
    // Find nodes within selection box
    const selectedNodes = state.nodes.filter(node => {
      const nodeLeft = node.x;
      const nodeTop = node.y;
      const nodeRight = node.x + node.width;
      const nodeBottom = node.y + node.height;
      
      // Check if node overlaps with selection box
      return nodeLeft < maxX && nodeRight > minX && nodeTop < maxY && nodeBottom > minY;
    });
    
    set(state => ({
      ...state,
      selectionBox: {
        ...state.selectionBox,
        isActive: false,
      },
      selectedNodeIds: selectedNodes.map(node => node.id),
      selectedNodeId: null,
      nodes: state.nodes.map(node => ({
        ...node,
        selected: selectedNodes.some(selected => selected.id === node.id),
      })),
    }));
  },

  // Search functions
  searchNodesByContent: (query) => {
    const state = get();
    const lowerQuery = query.toLowerCase();
    
    return state.nodes.filter(node => {
      const content = node.content.value?.toLowerCase() || '';
      const title = node.content.title?.toLowerCase() || '';
      const links = node.content.links?.map(link => 
        `${link.title.toLowerCase()} ${link.url.toLowerCase()}`
      ).join(' ') || '';
      const comment = node.comment?.toLowerCase() || '';
      const tags = node.tags?.join(' ').toLowerCase() || '';
      
      return content.includes(lowerQuery) || 
             title.includes(lowerQuery) || 
             links.includes(lowerQuery) ||
             comment.includes(lowerQuery) ||
             tags.includes(lowerQuery);
    });
  },

  searchNodesByDate: (date) => {
    const state = get();
    
    return state.nodes.filter(node => {
      if (!node.createdAt) return false;
      const nodeDate = new Date(node.createdAt);
      return nodeDate.toDateString() === date.toDateString();
    });
  },

  getNodesByDateRange: (startDate, endDate) => {
    const state = get();
    
    return state.nodes.filter(node => {
      if (!node.createdAt) return false;
      const nodeDate = new Date(node.createdAt);
      return nodeDate >= startDate && nodeDate <= endDate;
    });
  },

  getAllNodesDates: () => {
    const state = get();
    const dates = state.nodes
      .filter(node => node.createdAt)
      .map(node => new Date(node.createdAt))
      .sort((a, b) => b.getTime() - a.getTime()); // Most recent first
    
    // Remove duplicates
    const uniqueDates = dates.filter((date, index, array) => 
      index === 0 || date.toDateString() !== array[index - 1].toDateString()
    );
    
    return uniqueDates;
  },

  // Comment actions
  addComment: (nodeId, comment) => {
    set(state => ({
      ...state,
      nodes: state.nodes.map(node => 
        node.id === nodeId ? { ...node, comment, updatedAt: new Date() } : node
      ),
    }));
    
    // Auto-save after adding comment
    scheduleAutoSave(get, 100);
  },

  removeComment: (nodeId) => {
    set(state => ({
      ...state,
      nodes: state.nodes.map(node => 
        node.id === nodeId ? { ...node, comment: undefined, updatedAt: new Date() } : node
      ),
    }));
    
    // Auto-save after removing comment
    scheduleAutoSave(get, 100);
  },

  // Tag and filtering actions
  addTagToNode: (nodeId, tag) => {
    set(state => ({
      ...state,
      nodes: state.nodes.map(node => 
        node.id === nodeId 
          ? { 
              ...node, 
              tags: [...(node.tags || []), tag].filter((t, i, arr) => arr.indexOf(t) === i), // Remove duplicates
              updatedAt: new Date() 
            } 
          : node
      ),
    }));
    
    // Auto-save after adding tag
    scheduleAutoSave(get, 100);
  },

  removeTagFromNode: (nodeId, tag) => {
    set(state => ({
      ...state,
      nodes: state.nodes.map(node => 
        node.id === nodeId 
          ? { 
              ...node, 
              tags: (node.tags || []).filter(t => t !== tag),
              updatedAt: new Date() 
            } 
          : node
      ),
    }));
    
    // Auto-save after removing tag
    scheduleAutoSave(get, 100);
  },

  getAllTags: () => {
    const state = get();
    const allTags = new Set<string>();
    
    state.nodes.forEach(node => {
      if (node.tags) {
        node.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    return Array.from(allTags).sort();
  },

  setTagFilter: (tag) => {
    const state = get();
    set(state => ({
      ...state,
      activeTagFilter: tag,
      hiddenNodes: new Set(
        tag 
          ? state.nodes.filter(node => !node.tags?.includes(tag)).map(node => node.id)
          : []
      ),
    }));
  },

  clearTagFilter: () => {
    set(state => ({
      ...state,
      activeTagFilter: null,
      hiddenNodes: new Set(),
    }));
  },

  getVisibleNodes: () => {
    const state = get();
    if (!state.activeTagFilter) {
      return state.nodes;
    }
    return state.nodes.filter(node => !state.hiddenNodes.has(node.id));
  },

  groupSelectedNodes: () => {
    const state = get();
    const selectedNodeIds = state.selectedNodeIds.length > 0 ? state.selectedNodeIds : 
                           state.selectedNodeId ? [state.selectedNodeId] : [];
    
    if (selectedNodeIds.length === 0) return;
    
    // Trigger the group dialog with selected nodes
    const event = new CustomEvent('openGroupDialog', { 
      detail: { nodeIds: selectedNodeIds } 
    });
    window.dispatchEvent(event);
  },

  ...createAISlice(set as any, get as any),

  autoOrganizeNodes: () => {
    set(state => {
      // Save snapshot before making changes (for undo)
      const snapshot = cloneHistorySnapshot({
        nodes: state.nodes,
        connections: state.connections,
        groups: state.groups,
      });

      // Only organize selected nodes, or if none selected, don't do anything
      let nodesToOrganize: Node[] = [];
      if (state.selectedNodeIds.length > 0) {
        nodesToOrganize = state.nodes.filter(node => state.selectedNodeIds.includes(node.id));
      } else if (state.selectedNodeId) {
        nodesToOrganize = state.nodes.filter(node => node.id === state.selectedNodeId);
      } else {
        return state; // No nodes selected
      }

      if (nodesToOrganize.length === 0) return state;

      // Store original positions for reference
      const originalCenters = new Map<string, { x: number, y: number }>();
      nodesToOrganize.forEach(node => {
        originalCenters.set(node.id, {
          x: node.x + node.width / 2,
          y: node.y + node.height / 2
        });
      });

      // Filter connections that are relevant to the nodes being organized
      const relevantConnections = state.connections.filter(conn => 
        nodesToOrganize.some(n => n.id === conn.fromNodeId) && 
        nodesToOrganize.some(n => n.id === conn.toNodeId)
      );

      // Group nodes by their groups for soft container behavior
      const nodesByGroup = new Map<string | undefined, Node[]>();
      nodesToOrganize.forEach(node => {
        const groupId = node.groupId;
        if (!nodesByGroup.has(groupId)) {
          nodesByGroup.set(groupId, []);
        }
        nodesByGroup.get(groupId)!.push(node);
      });

      // FORCE-DIRECTED LAYOUT ALGORITHM
      // Each node has position, velocity, and forces applied to it
      interface NodePhysics {
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        width: number;
        height: number;
        groupId?: string;
        mass: number; // Larger nodes have more mass
      }

      // Initialize physics for each node
      const nodePhysics = new Map<string, NodePhysics>();
      nodesToOrganize.forEach(node => {
        nodePhysics.set(node.id, {
          id: node.id,
          x: node.x + node.width / 2, // Use center position
          y: node.y + node.height / 2,
          vx: 0,
          vy: 0,
          width: node.width,
          height: node.height,
          groupId: node.groupId,
          mass: Math.sqrt(node.width * node.height) / 10 // Mass based on node size
        });
      });

      // Physics constants
      const REPULSION_STRENGTH = 50000; // How strongly nodes repel each other
      const ATTRACTION_STRENGTH = 0.01; // How strongly connected nodes attract
      const DAMPING = 0.85; // Velocity damping to prevent oscillation
      const MIN_DISTANCE = 20; // Minimum distance between node centers
      const SPRING_LENGTH = 150; // Ideal distance for connected nodes
      const GROUP_ATTRACTION = 0.005; // How strongly group members attract each other
      const MAX_ITERATIONS = 300; // Maximum simulation steps
      const CONVERGENCE_THRESHOLD = 0.5; // Stop when average movement is small
      const MAX_VELOCITY = 50; // Cap on how fast nodes can move per iteration

      // Calculate group centers for soft container effect
      const groupCenters = new Map<string, { x: number, y: number, count: number }>();
      nodesByGroup.forEach((groupNodes, groupId) => {
        if (groupId && groupNodes.length > 1) {
          const centerX = groupNodes.reduce((sum, node) => sum + node.x + node.width / 2, 0) / groupNodes.length;
          const centerY = groupNodes.reduce((sum, node) => sum + node.y + node.height / 2, 0) / groupNodes.length;
          groupCenters.set(groupId, { x: centerX, y: centerY, count: groupNodes.length });
        }
      });

      // Simulation loop
      let iteration = 0;
      let converged = false;

      while (iteration < MAX_ITERATIONS && !converged) {
        iteration++;
        
        // Reset forces for this iteration
        nodePhysics.forEach(physics => {
          physics.vx *= DAMPING;
          physics.vy *= DAMPING;
        });

        // Apply repulsion forces between all node pairs
        const physicsArray = Array.from(nodePhysics.values());
        for (let i = 0; i < physicsArray.length; i++) {
          for (let j = i + 1; j < physicsArray.length; j++) {
            const nodeA = physicsArray[i];
            const nodeB = physicsArray[j];
            
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
              // Calculate repulsion force (stronger when nodes are closer)
              const minRequiredDistance = (nodeA.width + nodeB.width) / 2 + (nodeA.height + nodeB.height) / 2 + 30;
              const repulsionForce = distance < minRequiredDistance ? 
                REPULSION_STRENGTH / (distance * distance) * 2 : // Extra strong when overlapping
                REPULSION_STRENGTH / (distance * distance);
              
              const fx = (dx / distance) * repulsionForce;
              const fy = (dy / distance) * repulsionForce;
              
              // Apply equal and opposite forces
              nodeA.vx -= fx / nodeA.mass;
              nodeA.vy -= fy / nodeA.mass;
              nodeB.vx += fx / nodeB.mass;
              nodeB.vy += fy / nodeB.mass;
            }
          }
        }

        // Apply attraction forces for connected nodes (spring forces)
        relevantConnections.forEach(connection => {
          const nodeA = nodePhysics.get(connection.fromNodeId);
          const nodeB = nodePhysics.get(connection.toNodeId);
          
          if (nodeA && nodeB) {
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
              // Spring force (Hooke's law): F = k * (distance - restLength)
              const springForce = ATTRACTION_STRENGTH * (distance - SPRING_LENGTH);
              const fx = (dx / distance) * springForce;
              const fy = (dy / distance) * springForce;
              
              nodeA.vx += fx;
              nodeA.vy += fy;
              nodeB.vx -= fx;
              nodeB.vy -= fy;
            }
          }
        });

        // Apply group cohesion forces (soft containers)
        nodesByGroup.forEach((groupNodes, groupId) => {
          if (groupId && groupNodes.length > 1) {
            const groupCenter = groupCenters.get(groupId);
            if (groupCenter) {
              groupNodes.forEach(node => {
                const physics = nodePhysics.get(node.id);
                if (physics) {
                  const dx = groupCenter.x - physics.x;
                  const dy = groupCenter.y - physics.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  if (distance > 0) {
                    // Gentle attraction toward group center
                    const groupForce = GROUP_ATTRACTION * distance;
                    physics.vx += (dx / distance) * groupForce;
                    physics.vy += (dy / distance) * groupForce;
                  }
                }
              });
            }
          }
        });

        // Update positions and check for convergence
        let totalMovement = 0;
        nodePhysics.forEach(physics => {
          // Cap velocity to prevent explosive movement
          const velocity = Math.sqrt(physics.vx * physics.vx + physics.vy * physics.vy);
          if (velocity > MAX_VELOCITY) {
            physics.vx = (physics.vx / velocity) * MAX_VELOCITY;
            physics.vy = (physics.vy / velocity) * MAX_VELOCITY;
          }
          
          // Update position
          physics.x += physics.vx;
          physics.y += physics.vy;
          
          // Track movement for convergence
          totalMovement += Math.abs(physics.vx) + Math.abs(physics.vy);
        });

        // Check for convergence
        const averageMovement = totalMovement / nodePhysics.size;
        if (averageMovement < CONVERGENCE_THRESHOLD) {
          converged = true;
        }

        // Update group centers for next iteration
        nodesByGroup.forEach((groupNodes, groupId) => {
          if (groupId && groupNodes.length > 1) {
            const nodePhysicsForGroup = groupNodes.map(node => nodePhysics.get(node.id)!).filter(Boolean);
            if (nodePhysicsForGroup.length > 0) {
              const centerX = nodePhysicsForGroup.reduce((sum, physics) => sum + physics.x, 0) / nodePhysicsForGroup.length;
              const centerY = nodePhysicsForGroup.reduce((sum, physics) => sum + physics.y, 0) / nodePhysicsForGroup.length;
              groupCenters.set(groupId, { x: centerX, y: centerY, count: nodePhysicsForGroup.length });
            }
          }
        });
      }

      // Apply final overlap resolution pass (ensure no bounding boxes overlap)
      const finalNodes = new Map<string, { x: number, y: number }>();
      nodePhysics.forEach(physics => {
        finalNodes.set(physics.id, {
          x: physics.x - physics.width / 2, // Convert back from center to top-left
          y: physics.y - physics.height / 2
        });
      });

      // Final overlap resolution with actual bounding boxes
      let overlapResolutionIterations = 0;
      const maxOverlapIterations = 50;
      let hasOverlaps = true;

      while (hasOverlaps && overlapResolutionIterations < maxOverlapIterations) {
        hasOverlaps = false;
        overlapResolutionIterations++;

        const finalNodesArray = Array.from(finalNodes.entries());
        for (let i = 0; i < finalNodesArray.length; i++) {
          for (let j = i + 1; j < finalNodesArray.length; j++) {
            const [idA, posA] = finalNodesArray[i];
            const [idB, posB] = finalNodesArray[j];
            const nodeA = nodesToOrganize.find(n => n.id === idA)!;
            const nodeB = nodesToOrganize.find(n => n.id === idB)!;

            // Check if bounding boxes overlap
            const overlapX = Math.max(0, Math.min(posA.x + nodeA.width, posB.x + nodeB.width) - Math.max(posA.x, posB.x));
            const overlapY = Math.max(0, Math.min(posA.y + nodeA.height, posB.y + nodeB.height) - Math.max(posA.y, posB.y));
            
            if (overlapX > 0 && overlapY > 0) {
              hasOverlaps = true;
              
              // Move apart along the axis with smaller overlap
              const centerAX = posA.x + nodeA.width / 2;
              const centerAY = posA.y + nodeA.height / 2;
              const centerBX = posB.x + nodeB.width / 2;
              const centerBY = posB.y + nodeB.height / 2;
              
              if (overlapX < overlapY) {
                // Move horizontally
                const moveDistance = (overlapX + 20) / 2; // Add padding
                if (centerAX < centerBX) {
                  posA.x -= moveDistance;
                  posB.x += moveDistance;
                } else {
                  posA.x += moveDistance;
                  posB.x -= moveDistance;
                }
              } else {
                // Move vertically
                const moveDistance = (overlapY + 20) / 2; // Add padding
                if (centerAY < centerBY) {
                  posA.y -= moveDistance;
                  posB.y += moveDistance;
                } else {
                  posA.y += moveDistance;
                  posB.y -= moveDistance;
                }
              }
            }
          }
        }
      }

      // Apply the new positions to the organized nodes
      let organizedNodes = [...state.nodes];
      finalNodes.forEach((position, nodeId) => {
        const nodeIndex = organizedNodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) {
          organizedNodes[nodeIndex] = {
            ...organizedNodes[nodeIndex],
            x: Math.round(position.x),
            y: Math.round(position.y),
            updatedAt: new Date(),
          };
        }
      });

      console.log(`Force-directed layout completed in ${iteration} iterations (${converged ? 'converged' : 'max iterations reached'})`);

      return {
        ...state,
        nodes: organizedNodes,
        history: {
          ...state.history,
          past: [...state.history.past, snapshot],
          present: {
            nodes: organizedNodes,
            connections: state.connections,
            groups: state.groups,
          },
          future: [],
        },
      };
    });

    // Show success message
    const { toast } = import('sonner').then(module => {
      const nodeCount = get().selectedNodeIds.length || (get().selectedNodeId ? 1 : 0);
      module.toast.success(`${nodeCount} selected nodes organized with force-directed layout`);
    });
  },

  // Group highlighting actions
  setHighlightedGroup: (groupId: string | null) => {
    set(state => ({
      ...state,
      highlightedGroupId: groupId,
    }));
  },

  // Collaboration actions
  setNodes: (nodes: Node[]) => {
    set(state => ({
      ...state,
      nodes,
    }));
  },

  setConnections: (connections: Connection[]) => {
    set(state => ({
      ...state,
      connections,
    }));
  },

  setGroups: (groups: NodeGroup[]) => {
    set(state => ({
      ...state,
      groups,
    }));
  },
}));