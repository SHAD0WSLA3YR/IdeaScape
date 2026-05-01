import React, { useState, useMemo, useEffect } from 'react';
import { useCanvasStore, type Node, type NodeGroup } from '../store/canvasStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Search, Calendar, Eye, Globe, Link2, Play, FileText, Image as ImageIcon } from 'lucide-react';

interface NodeSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function stripHtml(html: string): string {
  if (!html) return '';
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function getDomainFromUrl(url?: string): string {
  if (!url) return 'Invalid URL';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getTextMatchSnippet(text: string, query: string) {
  const normalizedText = text.trim();
  if (!normalizedText) return null;
  if (!query.trim()) {
    return {
      before: '',
      match: '',
      after: truncateText(normalizedText, 100),
    };
  }

  const textLower = normalizedText.toLowerCase();
  const queryLower = query.toLowerCase().trim();
  const matchIndex = textLower.indexOf(queryLower);

  if (matchIndex === -1) {
    return {
      before: '',
      match: '',
      after: truncateText(normalizedText, 100),
    };
  }

  const contextChars = 45;
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(normalizedText.length, matchIndex + queryLower.length + contextChars);
  const before = normalizedText.slice(start, matchIndex);
  const match = normalizedText.slice(matchIndex, matchIndex + queryLower.length);
  const after = normalizedText.slice(matchIndex + queryLower.length, end);

  return {
    before: start > 0 ? `...${before}` : before,
    match,
    after: end < normalizedText.length ? `${after}...` : after,
  };
}

interface SearchResultItemProps {
  node: Node;
  query: string;
  group?: NodeGroup;
  onClick: () => void;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  node,
  query,
  group,
  onClick,
}) => {
  const contentType = node.content.type;
  const createdDate = node.createdAt
    ? new Date(node.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown date';

  const textContent = stripHtml(node.content.value || '');
  const textSnippet = getTextMatchSnippet(textContent, query);
  const commentText = (node.comment || '').trim();
  const commentSnippet = getTextMatchSnippet(commentText, query);
  const hasCommentMatch = Boolean(
    query.trim() &&
      commentText &&
      commentText.toLowerCase().includes(query.toLowerCase().trim())
  );
  const primaryLink = node.content.links?.[0];
  const imageUrl = node.content.images?.[0];
  const browserUrl = node.content.url || node.content.value;

  let title = '';
  let secondary = '';
  let iconSlot: React.ReactNode = null;
  let contentPreview: React.ReactNode = null;

  switch (contentType) {
    case 'image':
      title = node.content.title || 'Image node';
      secondary = imageUrl ? truncateText(imageUrl, 70) : 'No image URL';
      iconSlot = imageUrl ? (
        <img src={imageUrl} alt="" className="h-8 w-8 rounded object-cover border border-gray-200 dark:border-gray-700" />
      ) : (
        <div className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center">
          <ImageIcon className="h-4 w-4 text-gray-500" />
        </div>
      );
      contentPreview = (
        <p className="text-xs text-muted-foreground truncate">{secondary}</p>
      );
      break;
    case 'link':
      title = primaryLink?.title || node.content.title || 'Link node';
      secondary = primaryLink?.url || node.content.value;
      iconSlot = (
        <div className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <Link2 className="h-4 w-4 text-gray-500" />
        </div>
      );
      contentPreview = (
        <>
          <p className="text-xs text-foreground truncate">{getDomainFromUrl(secondary)}</p>
          <p className="text-xs text-muted-foreground truncate">{secondary}</p>
        </>
      );
      break;
    case 'video':
      title = node.content.title || 'Video node';
      secondary = node.content.videos?.[0] || node.content.value;
      iconSlot = (
        <div className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <Play className="h-4 w-4 text-gray-500" />
        </div>
      );
      contentPreview = (
        <p className="text-xs text-muted-foreground truncate">{secondary || 'Video content'}</p>
      );
      break;
    case 'browser':
      title = node.content.pageTitle || 'Browser node';
      secondary = browserUrl || '';
      iconSlot = (
        <div className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <Globe className="h-4 w-4 text-gray-500" />
        </div>
      );
      contentPreview = (
        <>
          <p className="text-xs text-foreground truncate">{getDomainFromUrl(secondary)}</p>
          <p className="text-xs text-muted-foreground truncate">{secondary}</p>
        </>
      );
      break;
    case 'text':
    default:
      title = node.content.title || 'Text node';
      iconSlot = (
        <div className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <FileText className="h-4 w-4 text-gray-500" />
        </div>
      );
      contentPreview = (
        <p className="text-sm text-foreground overflow-hidden">
          {textSnippet ? (
            <>
              <span>{textSnippet.before}</span>
              {textSnippet.match ? <mark className="bg-yellow-200 dark:bg-yellow-700/60 rounded px-0.5">{textSnippet.match}</mark> : null}
              <span>{textSnippet.after}</span>
            </>
          ) : (
            'Empty text node'
          )}
        </p>
      );
      break;
  }

  return (
    <div
      className="border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-all duration-200 ease-in-out hover:shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0">{iconSlot}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs capitalize">
              {contentType}
            </Badge>
            <span className="text-xs text-muted-foreground">{createdDate}</span>
          </div>
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <div className="mt-1">{contentPreview}</div>
          {hasCommentMatch && commentSnippet ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Comment: </span>
              <span>{commentSnippet.before}</span>
              {commentSnippet.match ? (
                <mark className="bg-yellow-200 dark:bg-yellow-700/60 rounded px-0.5">
                  {commentSnippet.match}
                </mark>
              ) : null}
              <span>{commentSnippet.after}</span>
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-0.5 text-[11px] text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: group?.color || '#9ca3af' }}
              />
              {group?.name || 'Ungrouped'}
            </span>
            {(node.tags || []).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" variant="ghost" className="shrink-0">
          <Eye className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export function NodeSearchDialog({ open, onOpenChange }: NodeSearchDialogProps) {
  const nodes = useCanvasStore((state) => state.nodes);
  const groups = useCanvasStore((state) => state.groups);
  const setTransform = useCanvasStore((state) => state.setTransform);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState('search');

  // Listen for close all dialogs event
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      onOpenChange(false);
    };

    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    return () => window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
  }, [onOpenChange]);

  // Search nodes by content including tags
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return nodes.filter(node => {
      const content = stripHtml(node.content.value || '').toLowerCase();
      const title = node.content.title?.toLowerCase() || '';
      const links = node.content.links?.map(link => 
        `${link.title.toLowerCase()} ${link.url.toLowerCase()}`
      ).join(' ') || '';
      const tags = node.tags?.join(' ').toLowerCase() || '';
      const comment = node.comment?.toLowerCase() || '';
      
      return content.includes(query) || 
             title.includes(query) || 
             links.includes(query) ||
             tags.includes(query) ||
             comment.includes(query);
    });
  }, [nodes, searchQuery]);

  const groupsById = useMemo(() => {
    return new Map(groups.map((group) => [group.id, group]));
  }, [groups]);

  // Group nodes by date
  const nodesByDate = useMemo(() => {
    const grouped = new Map<string, typeof nodes>();
    
    nodes.forEach(node => {
      const date = node.createdAt ? new Date(node.createdAt).toISOString().split('T')[0] : 'unknown';
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(node);
    });

    // Sort dates in descending order (most recent first)
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return new Date(b[0]).getTime() - new Date(a[0]).getTime();
    });

    return sortedEntries;
  }, [nodes]);

  // Filter nodes by selected date
  const dateFilteredNodes = useMemo(() => {
    if (!selectedDate) return [];
    
    return nodes.filter(node => {
      if (!node.createdAt) return selectedDate === 'unknown';
      return new Date(node.createdAt).toISOString().split('T')[0] === selectedDate;
    });
  }, [nodes, selectedDate]);

  const handleNodeClick = (node: Node) => {
    // Clear any existing selection
    clearSelection();
    
    // Select the clicked node
    selectNode(node.id);
    
    // Center the viewport on the node without changing the user's zoom level.
    const currentScale = useCanvasStore.getState().transform.scale;
    setTransform({
      x: window.innerWidth / 2 - (node.x + node.width / 2) * currentScale,
      y: window.innerHeight / 2 - (node.y + node.height / 2) * currentScale,
      scale: currentScale
    });
    
    // Close the dialog
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col transition-all duration-300 ease-in-out node-search-dialog" style={{ zIndex: 50 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Search Nodes
          </DialogTitle>
          <DialogDescription>
            Search node content or browse by date
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 transition-all duration-300">
            <TabsTrigger value="search" className="flex items-center gap-2 transition-all duration-200">
              <Search className="w-4 h-4" />
              Search Content
            </TabsTrigger>
            <TabsTrigger value="date" className="flex items-center gap-2 transition-all duration-200">
              <Calendar className="w-4 h-4" />
              Browse Dates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-4 flex-1 flex flex-col space-y-4 transition-all duration-300 ease-in-out">
            <Input
              placeholder="Search by content, title, links, tags, or comments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full transition-all duration-200"
            />

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-4">
                {searchQuery.trim() === '' ? (
                  <div className="text-center text-muted-foreground py-8">
                    Enter a search term to find nodes
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No nodes found matching "{searchQuery}"
                  </div>
                ) : (
                  searchResults.map(node => {
                    return (
                      <SearchResultItem
                        key={node.id}
                        node={node}
                        query={searchQuery}
                        group={node.groupId ? groupsById.get(node.groupId) : undefined}
                        onClick={() => handleNodeClick(node)}
                      />
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {searchResults.length > 0 && (
              <div className="text-xs text-muted-foreground text-center">
                Found {searchResults.length} node{searchResults.length > 1 ? 's' : ''}
              </div>
            )}
          </TabsContent>

          <TabsContent value="date" className="mt-4 flex-1 flex flex-col space-y-4 transition-all duration-300 ease-in-out">
            <div className="grid grid-cols-2 gap-4 transition-all duration-300">
              <ScrollArea className="max-h-64 border rounded transition-all duration-200">
                <div className="p-2 space-y-1">
                  <h4 className="text-sm font-medium mb-2 px-2">Dates</h4>
                  {nodesByDate.map(([date, dateNodes]) => {
                    const displayDate = date === 'unknown' ? 'Unknown Date' : new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const isSelected = selectedDate === date;
                    
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(isSelected ? '' : date)}
                        className={`w-full text-left px-2 py-1 rounded text-sm transition-all duration-200 ease-in-out ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground transform scale-[1.02]' 
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:transform hover:scale-[1.01]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{displayDate}</span>
                          <Badge variant="secondary" className="text-xs">
                            {dateNodes.length}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>

              <ScrollArea className="max-h-64 border rounded transition-all duration-200">
                <div className="p-2 space-y-2">
                  <h4 className="text-sm font-medium mb-2 transition-all duration-200">
                    {selectedDate ? (
                      selectedDate === 'unknown' ? 'Unknown Date' : new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    ) : (
                      'Select a date'
                    )}
                  </h4>
                  {selectedDate === '' ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      Select a date to view nodes
                    </div>
                  ) : (
                    dateFilteredNodes.map(node => {
                      return (
                        <SearchResultItem
                          key={node.id}
                          node={node}
                          query=""
                          group={node.groupId ? groupsById.get(node.groupId) : undefined}
                          onClick={() => handleNodeClick(node)}
                        />
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {selectedDate && dateFilteredNodes.length > 0 && (
              <div className="text-xs text-muted-foreground text-center">
                {dateFilteredNodes.length} node{dateFilteredNodes.length > 1 ? 's' : ''} created on{' '}
                {selectedDate === 'unknown' ? 'unknown date' : new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}