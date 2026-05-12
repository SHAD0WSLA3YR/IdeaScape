/**
 * Canvas-Specific Tools for Enhanced Chatbot
 * Implements tools that can be invoked by the AI assistant to interact with the canvas
 */

import { useCanvasStore } from '../store/canvasStore';

// Tool result types
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Type for canvas node
type CanvasNode = ReturnType<typeof useCanvasStore.getState>['getNodeById'] extends (...args: any[]) => infer R ? R : never;

function normalizeSearchQuery(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object') {
    const maybeQuery = (input as { query?: unknown }).query;
    if (typeof maybeQuery === 'string') return maybeQuery.trim();
  }
  return '';
}

// Web Search Tool - calls server-side search API.
export async function webSearchTool(queryInput: unknown): Promise<ToolResult> {
  try {
    const query = normalizeSearchQuery(queryInput);
    if (!query) {
      return {
        success: false,
        error: 'Please provide a search query after /websearch.'
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count: 5 }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Search API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        query,
        results: data.results || [],
        summary: data.summary || `Search results for ${query}`,
        answer: data.answer || null,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Web search failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Summarize Selection Tool
export async function summarizeSelectionTool(): Promise<ToolResult> {
  try {
    const { selectedNodeIds, getNodeById } = useCanvasStore.getState();
    
    if (selectedNodeIds.length === 0) {
      return {
        success: false,
        error: 'No nodes selected. Please select nodes to summarize.'
      };
    }
    
    const nodes = selectedNodeIds
      .map(id => getNodeById(id))
      .filter((node): node is NonNullable<typeof node> => node !== null);
    
    if (nodes.length === 0) {
      return {
        success: false,
        error: 'Selected nodes not found.'
      };
    }
    
    // Extract text content from nodes
    const nodeContents = nodes
      .map(node => {
        const content = node.content || node.title || '';
        return content.trim();
      })
      .filter(content => content.length > 0);
    
    if (nodeContents.length === 0) {
      return {
        success: false,
        error: 'Selected nodes contain no text content to summarize.'
      };
    }
    
    const combinedText = nodeContents.join(' ');
    // Simple summarization - take first 200 chars and add indicator
    const summary = combinedText.length > 200 
      ? combinedText.substring(0, 200) + '...' 
      : combinedText;
    
    return {
      success: true,
      data: {
        nodeCount: nodes.length,
        summary,
        nodeIds: selectedNodeIds
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Summarize selection failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Find Similar Nodes Tool
export async function findSimilarTool(nodeId: string): Promise<ToolResult> {
  try {
    const { getNodeById, nodes } = useCanvasStore.getState();
    
    const targetNode = getNodeById(nodeId);
    if (!targetNode) {
      return {
        success: false,
        error: `Node with ID ${nodeId} not found.`
      };
    }
    
    // Find nodes with similar tags or content
    const similarNodes = nodes
      .filter(node => node.id !== nodeId) // Exclude the target node
      .filter(node => {
        // Check tag similarity
        const targetTags = new Set(targetNode.tags || []);
        const nodeTags = new Set(node.tags || []);
        const commonTags = [...targetTags].filter(tag => nodeTags.has(tag));
        
        // Check content similarity (simple word overlap)
        const targetWords = new Set((targetNode.content || targetNode.title || '').toLowerCase().split(/\s+/));
        const nodeWords = new Set((node.content || node.title || '').toLowerCase().split(/\s+/));
        const commonWords = [...targetWords].filter(word => nodeWords.has(word));
        
        return commonTags.length > 0 || commonWords.length > 2;
      })
      .map(node => ({
        id: node.id,
        title: node.title,
        similarityReason: node.tags && targetNode.tags 
          ? `Shares tags: ${[...new Set(node.tags)].filter(t => targetNode.tags?.includes(t)).join(', ')}`
          : `Content similarity detected`
      }))
      .slice(0, 5); // Limit to top 5
    
    return {
      success: true,
      data: {
        targetNodeId: nodeId,
        similarNodes,
        count: similarNodes.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Find similar failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Suggest Connections Tool
export async function suggestConnectionsTool(): Promise<ToolResult> {
  try {
    const { selectedNodeIds, getNodeById, nodes } = useCanvasStore.getState();
    
    if (selectedNodeIds.length < 2) {
      return {
        success: false,
        error: 'Please select at least 2 nodes to suggest connections between.'
      };
    }
    
    const selectedNodes = selectedNodeIds
      .map(id => getNodeById(id))
      .filter((node): node is NonNullable<typeof node> => node !== null);
    
    if (selectedNodes.length < 2) {
      return {
        success: false,
        error: 'Some selected nodes not found.'
      };
    }
    
    // Generate connection suggestions based on shared tags or content similarity
    const suggestions = [];
    
    for (let i = 0; i < selectedNodes.length; i++) {
      for (let j = i + 1; j < selectedNodes.length; j++) {
        const nodeA = selectedNodes[i];
        const nodeB = selectedNodes[j];
        
        let reason = '';
        let confidence = 0.5;
        
        // Check for shared tags
        const tagsA = new Set(nodeA.tags || []);
        const tagsB = new Set(nodeB.tags || []);
        const sharedTags = [...tagsA].filter(tag => tagsB.has(tag));
        
        if (sharedTags.length > 0) {
          reason = `Shares tags: ${sharedTags.join(', ')}`;
          confidence = 0.8;
        } else {
          // Check content similarity
          const contentA = (nodeA.content || nodeA.title || '').toLowerCase();
          const contentB = (nodeB.content || nodeB.title || '').toLowerCase();
          const wordsA = new Set(contentA.split(/\s+/));
          const wordsB = new Set(contentB.split(/\s+/));
          const sharedWords = [...wordsA].filter(word => wordsB.has(word));
          
          if (sharedWords.length > 2) {
            reason = `Related content: ${sharedWords.slice(0, 3).join(', ')}`;
            confidence = 0.6;
          }
        }
        
        if (reason) {
          suggestions.push({
            nodeId1: nodeA.id,
            nodeId2: nodeB.id,
            reason,
            confidence
          });
        }
      }
    }
    
    // Sort by confidence and limit results
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const limitedSuggestions = suggestions.slice(0, 3);
    
    return {
      success: true,
      data: {
        suggestions: limitedSuggestions,
        count: limitedSuggestions.length,
        basedOnSelection: selectedNodeIds
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Suggest connections failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Get Canvas Summary Tool
export async function getCanvasSummaryTool(): Promise<ToolResult> {
  try {
    const { nodes, groups, connections } = useCanvasStore.getState();
    
    // Count by type
    const typeCounts = nodes.reduce((acc, node) => {
      acc[node.type || 'text'] = (acc[node.type || 'text'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Group info
    const groupInfo = groups.map(group => ({
      id: group.id,
      name: group.name,
      nodeCount: group.nodeIds.length
    }));
    
    // Connection density
    const maxPossibleConnections = nodes.length * (nodes.length - 1) / 2;
    const connectionDensity = maxPossibleConnections > 0 
      ? (connections.length / maxPossibleConnections) * 100 
      : 0;
    
    return {
      success: true,
      data: {
        totalNodes: nodes.length,
        totalGroups: groups.length,
        totalConnections: connections.length,
        typeCounts,
        groupInfo,
        connectionDensity: `${connectionDensity.toFixed(1)}%`,
        canvasName: 'Current Canvas' // Could get from store if available
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Get canvas summary failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Organize Group Tool (layout suggestions)
export async function organizeGroupTool(groupId: string): Promise<ToolResult> {
  try {
    const { groups, nodes } = useCanvasStore.getState();
    
    const group = groups.find(g => g.id === groupId);
    if (!group) {
      return {
        success: false,
        error: `Group with ID ${groupId} not found.`
      };
    }
    
    const groupNodes = group.nodeIds
      .map(id => nodes.find(n => n.id === id))
      .filter((node): node is NonNullable<typeof node> => node !== null);
    
    if (groupNodes.length === 0) {
      return {
        success: false,
        error: 'Group contains no nodes.'
      };
    }
    
    // Simple organization suggestion: arrange in a grid or circle
    const suggestions = [
      `Consider arranging ${groupNodes.length} nodes in a circular layout for better visual flow`,
      `Group nodes by similarity: ${groupNodes.length > 3 ? 'Consider sub-grouping' : 'Nodes are well-contained'}`
    ];
    
    // Check if nodes have positional data that suggests they're scattered
    const positions = groupNodes.map(node => ({
      x: node.x || 0,
      y: node.y || 0
    }));
    
    const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
    const avgY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
    
    const variance = positions.reduce((sum, p) => {
      const dx = p.x - avgX;
      const dy = p.y - avgY;
      return sum + (dx * dx + dy * dy);
    }, 0) / positions.length;
    
    if (variance > 10000) { // Arbitrary threshold for "scattered"
      suggestions.push(`Nodes appear scattered (variance: ${variance.toFixed(0)}). Consider organizing them closer together.`);
    }
    
    return {
      success: true,
      data: {
        groupId,
        groupName: group.name,
        nodeCount: groupNodes.length,
        suggestions,
        centerPoint: { x: avgX, y: avgY },
        scatterVariance: variance
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Organize group failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
