import React from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Loader2, Check, X, Lightbulb, Link, Type, Brain, Info } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription } from './ui/alert';
import type { ConnectionSuggestion } from '../services/aiService';

export function AISuggestionsPanel() {
  const { 
    aiSuggestions, 
    clearAISuggestions,
    applyConnectionSuggestion,
    dismissConnectionSuggestion,
    nodes
  } = useCanvasStore();

  const { connections, groupSummary, groupNames, isLoading, error } = aiSuggestions;

  // Don't show the panel if there's nothing to display
  if (!isLoading && !error && connections.length === 0 && !groupSummary && groupNames.length === 0) {
    return null;
  }
  
  const stripHtml = (html: string): string => {
    if (!html) return '';
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const getNodeTitle = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return 'Untitled Node';
    
    let text = node.content.title || stripHtml(node.content.value || '');
    if (text.length > 60) {
      text = text.substring(0, 60).trim() + '...';
    }
    return text || 'Untitled Node';
  };

  const handleApplyConnection = (suggestion: ConnectionSuggestion) => {
    applyConnectionSuggestion(suggestion);
  };

  const handleDismissConnection = (suggestion: ConnectionSuggestion) => {
    dismissConnectionSuggestion(suggestion);
  };

  return (
    <Card className="fixed top-20 right-4 w-80 max-h-[calc(100vh-6rem)] shadow-lg border-2 flex flex-col ai-suggestions-panel" style={{ zIndex: 50 }}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
            {(connections.length > 0 || groupSummary || groupNames.length > 0) && (
              <Badge variant="secondary" className="ml-2 bg-purple-100 text-purple-700 text-xs">
                {connections.length + (groupSummary ? 1 : 0) + (groupNames.length > 0 ? 1 : 0)} suggestions
              </Badge>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAISuggestions}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        {isLoading && (
          <CardDescription className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating AI suggestions...
          </CardDescription>
        )}
        {error && (
          <CardDescription className="text-red-500 break-words">
            {error}
          </CardDescription>
        )}
        {!isLoading && !error && (
          <CardDescription>
            AI results ready
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full px-6 pb-4">
          <div className="space-y-4 pr-2">
            {/* Configuration Notice - Only show if no real suggestions */}
            {!isLoading && !error && connections.length === 0 && !groupSummary && groupNames.length === 0 && (
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs break-words">
                  AI features configured and ready. Use context menu options to generate suggestions.
                </AlertDescription>
              </Alert>
            )}
            
            {/* Group Summary */}
            {groupSummary && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm">Summary</h4>
                </div>
                <Card className="bg-card border-border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {groupSummary}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Group Name Suggestions */}
            {groupNames.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm">Group Name Ideas</h4>
                </div>
                <div className="flex flex-wrap gap-1">
                  {groupNames.map((name, index) => (
                    <Badge 
                      key={index} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-secondary text-xs font-normal break-words transition-colors"
                      onClick={() => {
                        // Copy to clipboard for easy use
                        navigator.clipboard.writeText(name);
                        // You could also trigger a custom event to suggest this name
                        const event = new CustomEvent('suggestGroupName', { detail: { name } });
                        window.dispatchEvent(event);
                      }}
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Click to copy group name
                </p>
              </div>
            )}

            {/* Connection Suggestions */}
            {connections.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm">
                    Connection Suggestions ({connections.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {connections.map((suggestion, index) => (
                    <Card key={index} className="overflow-hidden border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                      <div className="h-1 w-full bg-primary/20" />
                      <CardContent className="p-3 pt-2">
                        <div className="space-y-3">
                          <div className="text-sm flex flex-col gap-1.5">
                            <div className="flex items-center gap-1 text-foreground">
                              <span className="truncate max-w-[42%] bg-muted px-1.5 py-0.5 rounded text-xs font-medium border border-border" title={getNodeTitle(suggestion.nodeId1)}>
                                {getNodeTitle(suggestion.nodeId1)}
                              </span>
                              <span className="text-muted-foreground text-[10px] shrink-0 px-0.5">→</span> 
                              <span className="truncate max-w-[42%] bg-muted px-1.5 py-0.5 rounded text-xs font-medium border border-border" title={getNodeTitle(suggestion.nodeId2)}>
                                {getNodeTitle(suggestion.nodeId2)}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {suggestion.reason}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {Math.round(suggestion.confidence * 100)}% match
                            </Badge>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-green-50 hover:text-green-600 hover:border-green-200 dark:hover:bg-green-900/20 dark:hover:border-green-800"
                                onClick={() => handleApplyConnection(suggestion)}
                                title="Apply connection"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:border-red-800"
                                onClick={() => handleDismissConnection(suggestion)}
                                title="Dismiss suggestion"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Show separator between sections if multiple exist */}
            {((groupSummary ? 1 : 0) + (groupNames.length > 0 ? 1 : 0) + (connections.length > 0 ? 1 : 0)) > 1 && (
              <Separator />
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}