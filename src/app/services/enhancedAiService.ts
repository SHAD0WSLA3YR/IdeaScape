/**
 * Enhanced AI Service with Tool Capabilities
 * Wraps the existing AI service to add tool execution capabilities
 * inspired by Gemma 4's WebMCP system
 */

import { aiService } from './aiService';
import {
  webSearchTool,
  summarizeSelectionTool,
  findSimilarTool,
  suggestConnectionsTool,
  getCanvasSummaryTool,
  organizeGroupTool,
  ToolResult
} from './canvasTools';
import { useCanvasStore } from '../store/canvasStore';

// Tool definitions matching Gemma 4's WebMCP approach
export const AVAILABLE_TOOLS = {
  websearch: {
    name: 'websearch',
    description: 'Search the web for current information on a topic',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    },
    execute: webSearchTool
  },
  summarize_selection: {
    name: 'summarize_selection',
    description: 'Summarize the content of currently selected nodes',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    execute: summarizeSelectionTool
  },
  find_similar: {
    name: 'find_similar',
    description: 'Find nodes similar to a given node ID',
    parameters: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'The ID of the node to find similar nodes for'
        }
      },
      required: ['node_id']
    },
    execute: findSimilarTool
  },
  suggest_connections: {
    name: 'suggest_connections',
    description: 'Suggest logical connections between currently selected nodes',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    execute: suggestConnectionsTool
  },
  get_canvas_summary: {
    name: 'get_canvas_summary',
    description: 'Get an overview of the current canvas state',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    execute: getCanvasSummaryTool
  },
  organize_group: {
    name: 'organize_group',
    description: 'Get layout improvement suggestions for a group',
    parameters: {
      type: 'object',
      properties: {
        group_id: {
          type: 'string',
          description: 'The ID of the group to organize'
        }
      },
      required: ['group_id']
    },
    execute: organizeGroupTool
  }
};

export type ToolName = keyof typeof AVAILABLE_TOOLS;

export interface ToolCall {
  name: ToolName;
  arguments: Record<string, any>;
  id: string; // Unique identifier for this tool call
}

export interface ToolExecutionResult {
  toolCall: ToolCall;
  result: ToolResult;
}

export class EnhancedAIService {
  private aiService: typeof aiService;
  
  constructor() {
    this.aiService = aiService;
  }
  
  // Delegate all existing methods to the original AI service
  get provider() {
    return this.aiService.provider;
  }
  
  get model() {
    return this.aiService.model;
  }
  
  setProvider(p: AIProvider) {
    this.aiService.setProvider(p);
  }
  
  setModel(m: string) {
    this.aiService.setModel(m);
  }
  
  getRateLimitStatus() {
    return this.aiService.getRateLimitStatus();
  }
  
  // Existing AI methods (delegated)
  async summarizeGroup(nodes: any[]) {
    return this.aiService.summarizeGroup(nodes);
  }
  
  async suggestConnections(allNodes: any[], existingConnections: any[]) {
    return this.aiService.suggestConnections(allNodes, existingConnections);
  }
  
  async suggestGroupNames(nodes: any[]) {
    return this.aiService.suggestGroupNames(nodes);
  }
  
  async generateSmartSummary(allNodes: any[], allGroups: any[]) {
    return this.aiService.generateSmartSummary(allNodes, allGroups);
  }
  
  async chat(message: string) {
    return this.aiService.chat(message);
  }
  
  async chatStream(message: string, onChunk: (chunk: string) => void) {
    return this.aiService.chatStream(message, onChunk);
  }
  
  // Enhanced chat method with tool support
  async enhancedChat(message: string): Promise<string> {
    // Check if message starts with a tool command
    const toolInvocation = this.parseToolCommand(message);
    
    if (toolInvocation) {
      // Execute the tool first
      const toolResult = await this.executeTool(toolInvocation);
      
      // If tool succeeded, enhance the prompt with results
      if (toolResult.result.success && toolResult.result.data) {
        const enhancedPrompt = this.createToolEnhancedPrompt(message, toolResult);
        return this.aiService.chat(enhancedPrompt);
      } else {
        // If tool failed, return error message or fall back to normal chat
        const errorMessage = toolResult.result.error || 'Tool execution failed';
        return `I encountered an error while trying to use a tool: ${errorMessage}\n\nLet me try to help you anyway:\n\n${await this.aiService.chat(message)}`;
      }
    } else {
      // Normal chat without tool invocation
      return this.aiService.chat(message);
    }
  }
  
  // Enhanced chat stream method with tool support
  async enhancedChatStream(message: string, onChunk: (chunk: string) => void): Promise<string> {
    console.log('[EnhancedAI] enhancedChatStream called with:', message);
    // Check if message starts with a tool command
    const toolInvocation = this.parseToolCommand(message);
    console.log('[EnhancedAI] Tool invocation:', toolInvocation);
    
    if (toolInvocation) {
      console.log('[EnhancedAI] Tool invocation detected:', toolInvocation.name);
      // Execute the tool first
      const toolResult = await this.executeTool(toolInvocation);
      console.log('[EnhancedAI] Tool result:', toolResult);
      
      // If tool succeeded, enhance the prompt with results
      if (toolResult.result.success && toolResult.result.data) {
        const enhancedPrompt = this.createToolEnhancedPrompt(message, toolResult);
        console.log('[EnhancedAI] Enhanced prompt:', enhancedPrompt.substring(0, 200) + '...');
        return this.aiService.chatStream(enhancedPrompt, onChunk);
      } else {
        // If tool failed, stream error message then fall back
        const errorMessage = toolResult.result.error || 'Tool execution failed';
        console.log('[EnhancedAI] Tool failed:', errorMessage);
        onChunk(`I encountered an error while trying to use a tool: ${errorMessage}\n\nLet me try to help you anyway:\n\n`);
        return this.aiService.chatStream(message, onChunk);
      }
    } else {
      // Normal chat stream without tool invocation
      console.log('[EnhancedAI] No tool invocation, normal chat');
      return this.aiService.chatStream(message, onChunk);
    }
  }
  
   private parseToolCommand(message: string): ToolCall | null {
    const trimmed = message.trim();
    
    // Check if message starts with a slash command
    if (!trimmed.startsWith('/')) {
      return null;
    }
    
    console.log('[EnhancedAI] Detected slash command:', trimmed);
    
    // Extract command and arguments
    const parts = trimmed.slice(1).split(/\s+/);
    const commandName = parts[0].toLowerCase();
    
    console.log('[EnhancedAI] Command name:', commandName);
    
    // Find matching tool
    const tool = Object.values(AVAILABLE_TOOLS).find(t => t.name === commandName);
    if (!tool) {
      console.log('[EnhancedAI] No tool found for command:', commandName);
      return null;
    }
    
    console.log('[EnhancedAI] Found tool:', tool.name);
    
    // Parse arguments based on tool schema
    const args: Record<string, any> = {};
    
    try {
      // Handle different tool argument patterns
      switch (commandName) {
        case 'websearch':
          if (parts.length >= 2) {
            args.query = parts.slice(1).join(' ');
          } else {
            return null; // Missing required query argument
          }
          break;
          
        case 'find_similar':
          if (parts.length >= 2) {
            args.node_id = parts[1];
          } else {
            return null; // Missing required node_id argument
          }
          break;
          
        case 'organize_group':
          if (parts.length >= 2) {
            args.group_id = parts[1];
          } else {
            return null; // Missing required group_id argument
          }
          break;
          
        // Other tools have no required arguments
        case 'summarize_selection':
        case 'suggest_connections':
        case 'get_canvas_summary':
          // No arguments needed
          break;
      }
    } catch (e) {
      return null;
    }
    
    // Generate unique ID for this tool call
    const callId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      name: tool.name as ToolName,
      arguments: args,
      id: callId
    };
  }
  
  private async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const tool = AVAILABLE_TOOLS[toolCall.name];
    if (!tool) {
      return {
        toolCall,
        result: {
          success: false,
          error: `Unknown tool: ${toolCall.name}`
        }
      };
    }
    
    try {
      const result = await tool.execute(toolCall.arguments);
      return {
        toolCall,
        result
      };
    } catch (error) {
      return {
        toolCall,
        result: {
          success: false,
          error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }
  
  private createToolEnhancedPrompt(originalMessage: string, toolResult: ToolExecutionResult): string {
    const { toolCall, result } = toolResult;
    
    if (!result.success || !result.data) {
      return originalMessage; // Fallback to original if tool failed
    }
    
    // Format tool results for inclusion in prompt
    let toolContext = '';
    
    switch (toolCall.name) {
      case 'websearch':
        toolContext = `Web search results for "${result.data.query}":\n${result.data.summary}\n\n`;
        break;
        
      case 'summarize_selection':
        toolContext = `Summary of selected nodes (${result.data.nodeCount} nodes):\n${result.data.summary}\n\n`;
        break;
        
      case 'find_similar':
        toolContext = `Similar nodes to ${result.data.targetNodeId}:\n`;
        result.data.similarNodes.forEach((node: any, index: number) => {
          toolContext += `${index + 1}. ${node.title} - ${node.similarityReason}\n`;
        });
        toolContext += '\n';
        break;
        
      case 'suggest_connections':
        toolContext = `Suggested connections between selected nodes:\n`;
        result.data.suggestions.forEach((conn: any, index: number) => {
          toolContext += `${index + 1}. Connect "${conn.nodeId1}" and "${conn.nodeId2}": ${conn.reason} (confidence: ${conn.confidence})\n`;
        });
        toolContext += '\n';
        break;
        
      case 'get_canvas_summary':
        toolContext = `Current canvas overview:\n`;
        toolContext += `- Total nodes: ${result.data.totalNodes}\n`;
        toolContext += `- Total groups: ${result.data.totalGroups}\n`;
        toolContext += `- Total connections: ${result.data.totalConnections}\n`;
        toolContext += `- Connection density: ${result.data.connectionDensity}\n`;
        toolContext += `- Node types: ${JSON.stringify(result.data.typeCounts)}\n\n`;
        break;
        
      case 'organize_group':
        toolContext = `Organization suggestions for group "${result.data.groupName}" (${result.data.nodeCount} nodes):\n`;
        result.data.suggestions.forEach((suggestion: string, index: number) => {
          toolContext += `${index + 1}. ${suggestion}\n`;
        });
        toolContext += `\nSuggested center point: (${result.data.centerPoint.x.toFixed(0)}, ${result.data.centerPoint.y.toFixed(0)})\n`;
        if (result.data.scatterVariance) {
          toolContext += `Scatter variance: ${result.data.scatterVariance.toFixed(0)} (higher = more scattered)\n`;
        }
        toolContext += '\n';
        break;
    }
    
    // Construct enhanced prompt: tool context + original request
    return `${toolContext}Based on the above information, please respond to the following user request:\n\n${originalMessage}`;
  }
}

// Create and export singleton instance
export const enhancedAiService = new EnhancedAIService();