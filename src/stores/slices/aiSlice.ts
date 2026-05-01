import type { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { aiService } from '../../app/services/aiService';
import type { ConnectionSuggestion } from '../../app/services/aiService';

type NodeLike = {
  id: string;
  groupId?: string;
  content: {
    type: 'text' | 'image' | 'link' | 'video' | 'browser';
    value: string;
    title?: string;
    links?: Array<{ url: string; title: string }>;
    images?: string[];
    videos?: string[];
  };
  tags?: string[];
};

type GroupLike = {
  id: string;
  name?: string;
  nodes?: string[];
};

type ConnectionLike = {
  fromNodeId: string;
  toNodeId: string;
};

export type AISuggestionsState = {
  connections: ConnectionSuggestion[];
  groupSummary: string | null;
  groupNames: string[];
  isLoading: boolean;
  error: string | null;
};

export const initialAISuggestions: AISuggestionsState = {
  connections: [],
  groupSummary: null,
  groupNames: [],
  isLoading: false,
  error: null,
};

export interface AISlice {
  aiSuggestions: AISuggestionsState;
  summarizeCanvas: () => Promise<void>;
  summarizeGroup: (groupIdOrNodeIds: string | string[]) => Promise<void>;
  summarizeNodes: (nodeIds: string[]) => Promise<void>;
  nodeToAIData: (node: NodeLike) => any;
  suggestConnections: () => Promise<void>;
  suggestGroupNames: (nodeIds: string[]) => Promise<void>;
  applyConnectionSuggestion: (suggestion: ConnectionSuggestion) => void;
  dismissConnectionSuggestion: (suggestion: ConnectionSuggestion) => void;
  clearAISuggestions: () => void;
}

type AIStoreDeps = {
  nodes: NodeLike[];
  groups: GroupLike[];
  connections: ConnectionLike[];
  addConnection: (fromNodeId: string, toNodeId: string, fromPoint?: string, toPoint?: string) => void;
} & AISlice;

export const createAISlice: StateCreator<AIStoreDeps, [], [], AISlice> = (set, get) => ({
  aiSuggestions: initialAISuggestions,

  nodeToAIData: (node) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Converting node to AI data:', {
        id: node.id,
        title: (node.content.title || node.content.value || 'Untitled').substring(0, 30) + '...',
        contentLength: node.content.value?.length || 0,
        type: node.content.type,
        hasLinks: node.content.links?.length || 0,
        hasImages: node.content.images?.length || 0,
        hasVideos: node.content.videos?.length || 0,
        hasTags: node.tags?.length || 0,
      });
    }

    return {
      id: node.id,
      title: node.content.title || node.content.value || 'Untitled',
      content: node.content.value,
      groupId: node.groupId,
      tags: node.tags,
      links: node.content.links,
      images: node.content.images,
      videos: node.content.videos,
      type: node.content.type,
    };
  },

  summarizeCanvas: async () => {
    const state = get();

    if (state.nodes.length === 0) {
      toast.info('Add a few nodes before asking AI to summarize the canvas.');
      return;
    }

    set((current) => ({
      ...current,
      aiSuggestions: {
        ...current.aiSuggestions,
        isLoading: true,
        error: null,
      },
    }));

    try {
      const nodeData = state.nodes.map((node) => get().nodeToAIData(node));
      const groupData = state.groups.map((group) => ({
        id: group.id,
        name: group.name || 'Untitled Group',
        nodeIds: group.nodes || [],
      }));

      const summary = await aiService.generateSmartSummary(nodeData, groupData);

      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          groupSummary: summary,
          isLoading: false,
        },
      }));

      toast.success('Canvas summary generated', {
        description: 'Generated using your configured AI endpoint',
        duration: 4000,
      });
    } catch (error) {
      console.error('Error generating canvas summary:', error);
      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to summarize canvas',
        },
      }));

      toast.error('Failed to summarize canvas. Please try again.');
    }
  },

  summarizeGroup: async (groupIdOrNodeIds) => {
    const state = get();
    let groupNodes: NodeLike[] = [];

    if (typeof groupIdOrNodeIds === 'string') {
      const group = state.groups.find((g) => g.id === groupIdOrNodeIds);
      if (!group) return;
      groupNodes = state.nodes.filter((node) => node.groupId === groupIdOrNodeIds);
    } else if (Array.isArray(groupIdOrNodeIds)) {
      groupNodes = state.nodes.filter((node) => groupIdOrNodeIds.includes(node.id));
    } else {
      return;
    }

    if (groupNodes.length === 0) return;

    set((current) => ({
      ...current,
      aiSuggestions: {
        ...current.aiSuggestions,
        isLoading: true,
        error: null,
      },
    }));

    try {
      const nodeData = groupNodes.map((node) => get().nodeToAIData(node));

      const summary = await aiService.summarizeGroup(nodeData);

      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          groupSummary: summary,
          isLoading: false,
        },
      }));

      toast.success('Group summary generated!', {
        description: 'Generated using your configured AI endpoint',
        duration: 4000,
      });
    } catch (error) {
      console.error('Error generating group summary:', error);
      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to generate summary',
        },
      }));

      toast.error('Failed to generate group summary. Please try again.');
    }
  },

  summarizeNodes: async (nodeIds) => {
    return get().summarizeGroup(nodeIds);
  },

  suggestConnections: async () => {
    const state = get();

    if (state.nodes.length < 2) {
      toast.info('Need at least 2 nodes to suggest connections');
      return;
    }

    set((current) => ({
      ...current,
      aiSuggestions: {
        ...current.aiSuggestions,
        isLoading: true,
        error: null,
      },
    }));

    try {
      const nodeData = state.nodes.map((node) => get().nodeToAIData(node));

      const existingConnections = state.connections.map((conn) => ({
        from: conn.fromNodeId,
        to: conn.toNodeId,
      }));

      const suggestions = await aiService.suggestConnections(nodeData, existingConnections);

      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          connections: suggestions,
          isLoading: false,
        },
      }));

      if (suggestions.length > 0) {
        toast.success(`Found ${suggestions.length} connection suggestions!`, {
          description: 'Generated using your configured AI endpoint',
          duration: 4000,
        });
      } else {
        toast.info('No new connection suggestions found');
      }
    } catch (error) {
      console.error('Error generating connection suggestions:', error);
      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to suggest connections',
        },
      }));

      toast.error('Failed to suggest connections. Please try again.');
    }
  },

  suggestGroupNames: async (nodeIds) => {
    const state = get();
    const nodes = state.nodes.filter((node) => nodeIds.includes(node.id));

    if (nodes.length === 0) return;

    set((current) => ({
      ...current,
      aiSuggestions: {
        ...current.aiSuggestions,
        isLoading: true,
        error: null,
      },
    }));

    try {
      const nodeData = nodes.map((node) => get().nodeToAIData(node));

      const suggestions = await aiService.suggestGroupNames(nodeData);

      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          groupNames: suggestions,
          isLoading: false,
        },
      }));

      if (suggestions.length > 0) {
        toast.success('Group name suggestions generated!', {
          description: 'Generated using your configured AI endpoint',
          duration: 4000,
        });
      } else {
        toast.info('No group name suggestions found');
      }
    } catch (error) {
      console.error('Error generating group name suggestions:', error);
      set((current) => ({
        ...current,
        aiSuggestions: {
          ...current.aiSuggestions,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to suggest group names',
        },
      }));

      toast.error('Failed to suggest group names. Please try again.');
    }
  },

  applyConnectionSuggestion: (suggestion) => {
    const state = get();
    const fromNode = state.nodes.find((node) => node.id === suggestion.nodeId1);
    const toNode = state.nodes.find((node) => node.id === suggestion.nodeId2);

    if (!fromNode || !toNode) return;

    get().addConnection(suggestion.nodeId1, suggestion.nodeId2);

    set((current) => ({
      ...current,
      aiSuggestions: {
        ...current.aiSuggestions,
        connections: current.aiSuggestions.connections.filter(
          (existing) => existing.nodeId1 !== suggestion.nodeId1 || existing.nodeId2 !== suggestion.nodeId2
        ),
      },
    }));

    toast.success('Connection added');
  },

  dismissConnectionSuggestion: (suggestion) => {
    set((current) => ({
      ...current,
      aiSuggestions: {
        ...current.aiSuggestions,
        connections: current.aiSuggestions.connections.filter(
          (existing) => existing.nodeId1 !== suggestion.nodeId1 || existing.nodeId2 !== suggestion.nodeId2
        ),
      },
    }));
  },

  clearAISuggestions: () => {
    set((current) => ({
      ...current,
      aiSuggestions: initialAISuggestions,
    }));
  },
});
