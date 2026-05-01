import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink, AlertCircle, Sparkles, Camera, ZoomIn, ZoomOut, Link2, FileText, Image as ImageIcon, Star, StarOff, BookMarked, Trash2, Moon, History } from 'lucide-react';
import { useCanvasStore } from '../store/canvasStore';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from './ui/dropdown-menu';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { browserSessionManager, type Bookmark } from '../services/browserSessionService';

interface BrowserNodeProps {
  nodeId: string;
  url: string;
  isAwake: boolean;
  favicon?: string;
  pageTitle?: string;
  history?: string[];
  historyIndex?: number;
  showToolbar?: boolean;
  onToggleToolbar?: () => void;
}

export function BrowserNode({ nodeId, url, isAwake, favicon, pageTitle, history: initialHistory, historyIndex: initialHistoryIndex, showToolbar = false, onToggleToolbar }: BrowserNodeProps) {
  const updateNode = useCanvasStore((state) => state.updateNode);
  
  // Get the current node to access its history
  const currentNode = useCanvasStore((state) => state.nodes.find(n => n.id === nodeId));
  const nodeHistory = currentNode?.content?.history || initialHistory || [url || 'https://www.wikipedia.org'];
  const nodeHistoryIndex = currentNode?.content?.historyIndex ?? initialHistoryIndex ?? 0;
  
  // Local state for instant UI updates
  const [currentUrl, setCurrentUrl] = useState(nodeHistory[nodeHistoryIndex] || url || 'https://www.wikipedia.org');
  const [inputUrl, setInputUrl] = useState(currentUrl);
  const [history, setHistory] = useState<string[]>(nodeHistory);
  const [historyIndex, setHistoryIndex] = useState(nodeHistoryIndex);
  const [iframeError, setIframeError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(favicon || null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  // Debounce store updates to avoid excessive writes
  const updateStoreTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Load session from Supabase on mount
  useEffect(() => {
    const loadSession = async () => {
      const session = await browserSessionManager.loadSession(nodeId);
      if (session) {
        console.log('📚 Loaded browser session:', session);
        setHistory(session.history || [url]);
        setHistoryIndex(session.historyIndex || 0);
        setZoomLevel(session.zoom || 1);
        setBookmarks(session.bookmarks || []);
        
        // Update current URL if session has one
        if (session.currentUrl && session.currentUrl !== currentUrl) {
          setCurrentUrl(session.currentUrl);
          setInputUrl(session.currentUrl);
        }
      }
    };
    
    loadSession();
  }, [nodeId]);
  
  // Check if current URL is bookmarked
  useEffect(() => {
    setIsBookmarked(bookmarks.some(b => b.url === currentUrl));
  }, [currentUrl, bookmarks]);
  
  // Fetch favicon when URL changes
  useEffect(() => {
    if (!currentUrl) return;
    
    try {
      const url = new URL(currentUrl);
      const domain = url.hostname;
      
      // Try multiple favicon services in priority order
      const faviconServices = [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`, // Google's favicon service (most reliable)
        `https://icons.duckduckgo.com/ip3/${domain}.ico`, // DuckDuckGo favicon service
        `${url.origin}/favicon.ico`, // Direct favicon.ico
      ];
      
      // Set the first service immediately for instant feedback
      setFaviconUrl(faviconServices[0]);
      
      // Update store with favicon
      updateNode(nodeId, {
        content: {
          type: 'browser',
          value: currentUrl,
          url: currentUrl,
          isAwake: currentNode?.content?.isAwake ?? true,
          favicon: faviconServices[0],
          pageTitle,
          history,
          historyIndex
        }
      });
    } catch (error) {
      // Invalid URL, keep existing favicon or use default
      console.warn('Invalid URL for favicon fetch:', error);
    }
  }, [currentUrl]);
  
  // Helper to update store with debouncing
  const updateStore = (newUrl: string, newHistory: string[], newIndex: number) => {
    if (updateStoreTimeoutRef.current) {
      clearTimeout(updateStoreTimeoutRef.current);
    }
    
    updateStoreTimeoutRef.current = setTimeout(() => {
      updateNode(nodeId, {
        content: {
          type: 'browser',
          value: newUrl,
          url: newUrl,
          isAwake: true,
          favicon,
          pageTitle,
          history: newHistory,
          historyIndex: newIndex
        }
      });
    }, 100); // 100ms debounce - feels instant but reduces store updates
  };

  // Wake up browser
  const handleWakeUp = () => {
    updateNode(nodeId, {
      content: {
        type: 'browser',
        value: currentUrl,
        url: currentUrl,
        isAwake: true,
        favicon,
        pageTitle,
        history,
        historyIndex
      }
    });
  };

  // Navigation handlers with history tracking
  const handleNavigate = (newUrl: string) => {
    // Smart navigation: detect if it's a search query or URL
    let processedUrl = newUrl.trim();
    
    // If it doesn't look like a URL, treat it as a search query
    if (!processedUrl.startsWith('http://') && 
        !processedUrl.startsWith('https://') && 
        !processedUrl.includes('.') && 
        processedUrl.length > 0) {
      // It's a search query - use Google search
      processedUrl = `https://www.google.com/search?q=${encodeURIComponent(processedUrl)}`;
    } else if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      // It looks like a domain - add https://
      processedUrl = 'https://' + processedUrl;
    }
    
    // Clear forward history and add new URL
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(processedUrl);
    const newIndex = newHistory.length - 1;
    
    // Update local state immediately for snappy response
    setHistory(newHistory);
    setHistoryIndex(newIndex);
    setCurrentUrl(processedUrl);
    setInputUrl(processedUrl);
    setIframeError(false);
    setIsLoading(true);
    
    // Update store with debouncing
    updateStore(processedUrl, newHistory, newIndex);
    
    // Save to Supabase
    browserSessionManager.updateHistory(nodeId, processedUrl, newHistory, newIndex);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const newUrl = history[newIndex];
      
      // Update local state immediately for instant response
      setHistoryIndex(newIndex);
      setCurrentUrl(newUrl);
      setInputUrl(newUrl);
      setIframeError(false);
      setIsLoading(true);
      
      // Update store with debouncing
      updateStore(newUrl, history, newIndex);
      
      // Save to Supabase
      browserSessionManager.updateHistory(nodeId, newUrl, history, newIndex);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const newUrl = history[newIndex];
      
      // Update local state immediately for instant response
      setHistoryIndex(newIndex);
      setCurrentUrl(newUrl);
      setInputUrl(newUrl);
      setIframeError(false);
      setIsLoading(true);
      
      // Update store with debouncing
      updateStore(newUrl, history, newIndex);
      
      // Save to Supabase
      browserSessionManager.updateHistory(nodeId, newUrl, history, newIndex);
    }
  };

  const handleJumpToHistory = (index: number) => {
    if (index < 0 || index >= history.length || index === historyIndex) return;
    const targetUrl = history[index];
    setHistoryIndex(index);
    setCurrentUrl(targetUrl);
    setInputUrl(targetUrl);
    setIframeError(false);
    setIsLoading(true);
    updateStore(targetUrl, history, index);
    browserSessionManager.updateHistory(nodeId, targetUrl, history, index);
  };

  const handleClearHistory = () => {
    const keepUrl = history[historyIndex] || currentUrl;
    const nextHistory = [keepUrl];
    setHistory(nextHistory);
    setHistoryIndex(0);
    setCurrentUrl(keepUrl);
    setInputUrl(keepUrl);
    updateStore(keepUrl, nextHistory, 0);
    browserSessionManager.updateHistory(nodeId, keepUrl, nextHistory, 0);
    setHistoryOpen(false);
    toast.success('History cleared');
  };
  
  // Toggle bookmark
  const handleToggleBookmark = async () => {
    try {
      const url = new URL(currentUrl);
      const title = url.hostname;
      
      if (isBookmarked) {
        // Remove bookmark
        await browserSessionManager.removeBookmark(nodeId, currentUrl);
        setBookmarks(bookmarks.filter(b => b.url !== currentUrl));
        toast.success('Bookmark removed');
      } else {
        // Add bookmark
        await browserSessionManager.addBookmark(nodeId, {
          url: currentUrl,
          title,
          favicon: faviconUrl,
        });
        const newBookmark: Bookmark = {
          url: currentUrl,
          title,
          favicon: faviconUrl,
          addedAt: new Date(),
        };
        setBookmarks([...bookmarks, newBookmark]);
        toast.success('Bookmark added!');
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
      toast.error('Failed to update bookmark');
    }
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIframeError(false);
      setIsLoading(true);
      iframeRef.current.src = currentUrl;
    }
  };

  const handleOpenInNewTab = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  // Screenshot capture with oklch color fix
  const handleScreenshot = async () => {
    if (!containerRef.current) return;
    
    try {
      toast.info('Capturing screenshot...');
      
      // Clone the element to avoid modifying the original
      const clone = containerRef.current.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      
      // Convert all oklch colors to rgb for html2canvas compatibility
      const convertOklchToRgb = (element: HTMLElement) => {
        const computedStyle = window.getComputedStyle(element);
        const bg = computedStyle.backgroundColor;
        const color = computedStyle.color;
        
        element.style.backgroundColor = bg;
        element.style.color = color;
        
        // Recursively convert children
        Array.from(element.children).forEach(child => {
          convertOklchToRgb(child as HTMLElement);
        });
      };
      
      convertOklchToRgb(clone);
      
      // Capture the cloned element
      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true
      });
      
      // Remove clone
      document.body.removeChild(clone);
      
      // Convert to data URL
      const imageUrl = canvas.toDataURL('image/png');
      
      // Get current node position
      const { nodes: allNodes, addNode: addNodeToStore } = useCanvasStore.getState();
      const currentNode = allNodes.find(n => n.id === nodeId);
      const nodeX = currentNode?.x || 0;
      const nodeY = currentNode?.y || 0;
      
      // Add node to the right of the browser
      addNodeToStore(nodeX + 750, nodeY);
      
      // Get the newly created node and update it
      setTimeout(() => {
        const { nodes: updatedNodes, updateNode: updateNodeInStore } = useCanvasStore.getState();
        const newNode = updatedNodes[updatedNodes.length - 1];
        
        if (newNode) {
          updateNodeInStore(newNode.id, {
            content: {
              type: 'image',
              value: '',
              images: [imageUrl]
            },
            width: 500,
            height: 375
          });
          
          toast.success('Screenshot saved as image node!');
        }
      }, 100);
      
    } catch (error) {
      console.error('Screenshot failed:', error);
      toast.error(`Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 0.1, 2); // Max 200%
    setZoomLevel(newZoom);
    browserSessionManager.updateZoom(nodeId, newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 0.1, 0.5); // Min 50%
    setZoomLevel(newZoom);
    browserSessionManager.updateZoom(nodeId, newZoom);
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
    browserSessionManager.updateZoom(nodeId, 1);
  };

  // Handle iframe load
  const handleIframeLoad = () => {
    setIsLoading(false);
    setIframeError(false);
    
    // NOTE: Due to CORS security, we cannot detect when users click links
    // inside the iframe. The iframe navigates but we cannot access its URL.
    // This means history only tracks URLs navigated via the URL bar, not
    // internal link clicks. This is a browser security feature.
  };

  // Handle iframe error
  const handleIframeError = () => {
    setIsLoading(false);
    setIframeError(true);
  };
  
  // Helper to create a text node
  const handleCreateTextNode = () => {
    const { nodes: allNodes, addNode: addNodeToStore } = useCanvasStore.getState();
    const currentNode = allNodes.find(n => n.id === nodeId);
    const nodeX = currentNode?.x || 0;
    const nodeY = currentNode?.y || 0;
    
    addNodeToStore(nodeX + 750, nodeY + 100);
    toast.info('Text node created! Copy text from browser and paste it in the new node.');
  };
  
  // Helper to create a link node
  const handleCreateLinkNode = () => {
    const { nodes: allNodes, addNode: addNodeToStore } = useCanvasStore.getState();
    const currentNode = allNodes.find(n => n.id === nodeId);
    const nodeX = currentNode?.x || 0;
    const nodeY = currentNode?.y || 0;
    
    const linkNodeId = addNodeToStore(nodeX + 750, nodeY + 200);
    
    const { updateNode: updateNodeInStore } = useCanvasStore.getState();
    updateNodeInStore(linkNodeId, {
      content: {
        type: 'link',
        value: currentUrl,
        title: pageTitle || currentUrl,
        links: [{ url: currentUrl, title: pageTitle || currentUrl }]
      }
    });
    toast.success('Link node created with current URL!');
  };

  // Detect iframe blocking
  useEffect(() => {
    if (!isAwake) return;

    const checkIframeBlocked = setTimeout(() => {
      if (iframeRef.current && isLoading) {
        // If still loading after 5 seconds, assume blocked
        setIframeError(true);
        setIsLoading(false);
      }
    }, 5000);

    return () => clearTimeout(checkIframeBlocked);
  }, [isLoading, isAwake]);

  // No hover detection - toolbar only shows via toggle button
  
  // Keyboard shortcuts for browser node
  useEffect(() => {
    if (!isAwake) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this browser node is in focus or selected
      const isBrowserFocused = containerRef.current?.contains(document.activeElement);
      
      // Ctrl/Cmd + L: Show toolbar and focus URL bar
      if ((e.ctrlKey || e.metaKey) && e.key === 'l' && isBrowserFocused) {
        e.preventDefault();
        if (onToggleToolbar && !showToolbar) {
          onToggleToolbar();
        }
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
          setIsInputFocused(true);
        }, 100);
      }
      
      // Ctrl/Cmd + R: Refresh page
      if ((e.ctrlKey || e.metaKey) && e.key === 'r' && isBrowserFocused) {
        e.preventDefault();
        handleRefresh();
      }
      
      // F5: Refresh page (alternative)
      if (e.key === 'F5' && isBrowserFocused) {
        e.preventDefault();
        handleRefresh();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAwake, handleRefresh]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (updateStoreTimeoutRef.current) {
        clearTimeout(updateStoreTimeoutRef.current);
      }
    };
  }, []);

  // Sleep mode UI
  if (!isAwake) {
    return (
      <div 
        className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 cursor-pointer group transition-all duration-300 hover:from-slate-800 hover:via-slate-700 hover:to-slate-800"
        onClick={handleWakeUp}
      >
        {/* Moon icon with glow effect — no pointer capture so clicks hit the root / button */}
        <div className="relative mb-6 pointer-events-none">
          <div className="absolute inset-0 bg-blue-500/30 blur-xl rounded-full animate-pulse" />
          <Moon 
            size={64} 
            className="relative text-blue-400 group-hover:text-blue-300 transition-colors duration-300" 
            strokeWidth={1.5}
          />
        </div>

        {/* Text — pointer-events-none so "click anywhere" is reliable */}
        <div className="text-center space-y-2 pointer-events-none">
          <h3 className="text-white text-xl">Browser is Sleeping</h3>
          <p className="text-gray-400 text-sm">Click anywhere to wake up • Content paused to save resources</p>
          {currentUrl && (
            <div className="flex items-center justify-center gap-2 mt-4 px-4 py-2 bg-black/20 rounded-md backdrop-blur-sm">
              {faviconUrl ? (
                <img 
                  src={faviconUrl} 
                  alt="" 
                  className="w-4 h-4" 
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              ) : (
                <span className="text-gray-500 text-xs">🌐</span>
              )}
              <p className="text-gray-500 text-xs font-mono">
                {new URL(currentUrl).hostname}
              </p>
            </div>
          )}
        </div>

        {/* Wake up button — above overlays, explicit hit target */}
        <Button
          type="button"
          className="relative z-10 mt-8 pointer-events-auto bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg transition-all duration-300 group-hover:scale-105 flex items-center gap-2"
          onClick={(e) => {
            e.stopPropagation();
            handleWakeUp();
          }}
        >
          <Sparkles size={18} />
          Click to wake up
        </Button>
      </div>
    );
  }

  // Error/Blocked site UI - now with navigation bar still accessible
  const errorOverlay = iframeError && (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 dark:from-slate-900 dark:to-slate-800 p-8 pointer-events-auto">
      <div className="max-w-md text-center space-y-6">
        {/* Error icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full" />
          <AlertCircle size={64} className="relative text-orange-500 mx-auto" strokeWidth={1.5} />
        </div>

        {/* Error message */}
        <div className="space-y-2">
          <h3 className="text-gray-900 dark:text-white text-xl">This site blocks embedding</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {new URL(currentUrl).hostname} prevents being displayed in iframes for security reasons.
          </p>
        </div>

        {/* Solution */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-orange-200 dark:border-orange-900/30 space-y-4">
          <div className="text-left space-y-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>🔓 Unlock all websites:</strong>
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Install the "Ignore X-Frame headers" Chrome extension to browse any site:
            </p>
          </div>
          
          <div className="flex flex-col gap-2">
            <a
              href="https://chromewebstore.google.com/detail/ignore-x-frame-headers/gleekbfjekiniecknbkamfmkohkpodhe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
            >
              Install from Chrome Store
              <ExternalLink size={14} />
            </a>
            <a
              href="https://github.com/guilryder/chrome-extensions/tree/main/xframe_ignore"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
            >
              Open Source Version (GitHub)
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {/* Fallback option */}
        <div className="flex gap-2 justify-center">
          <Button
            onClick={handleOpenInNewTab}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ExternalLink size={16} />
            Open in New Tab
          </Button>
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RotateCw size={16} />
            Try Again
          </Button>
        </div>

        {/* Hint to use URL bar */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          💡 Tip: Hover over the top to access the URL bar and try a different site
        </p>
      </div>
    </div>
  );

  // Active browser UI
  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-white dark:bg-slate-900"
    >
      {/* Glassmorphism nav bar - appears on hover - always above error overlay */}
      <div 
        ref={toolbarRef}
        className={`absolute top-0 left-0 right-0 z-30 transition-all duration-300 ${
          showToolbar || iframeError ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="m-3 p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
          <div className="flex items-center gap-2">
            {/* Navigation buttons */}
            <div className="flex gap-1">
              <Button
                onClick={handleBack}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Go back"
                disabled={historyIndex <= 0}
              >
                <ArrowLeft size={16} className={historyIndex <= 0 ? 'opacity-40' : ''} />
              </Button>
              <Button
                onClick={handleForward}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Go forward"
                disabled={historyIndex >= history.length - 1}
              >
                <ArrowRight size={16} className={historyIndex >= history.length - 1 ? 'opacity-40' : ''} />
              </Button>
              <Button
                onClick={handleRefresh}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Refresh"
              >
                <RotateCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </Button>
            </div>

            {/* URL input */}
            <div className="flex-1 flex items-center gap-2 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-1.5">
              {/* SSL indicator (lock icon for HTTPS) */}
              {currentUrl.startsWith('https://') && (
                <span className="text-green-600 dark:text-green-400 flex-shrink-0" title="Secure connection (HTTPS)">
                  🔒
                </span>
              )}
              
              {/* Favicon */}
              {faviconUrl ? (
                <img 
                  src={faviconUrl} 
                  alt="Site icon" 
                  className="w-4 h-4 flex-shrink-0" 
                  onError={(e) => {
                    // Fallback to globe icon if favicon fails to load
                    e.currentTarget.style.display = 'none';
                  }} 
                />
              ) : (
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">🌐</span>
              )}
              <input
                ref={inputRef}
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onFocus={() => {
                  setIsInputFocused(true);
                }}
                onBlur={() => {
                  setIsInputFocused(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNavigate(inputUrl);
                    inputRef.current?.blur();
                    setIsInputFocused(false);
                  } else if (e.key === 'Escape') {
                    setInputUrl(currentUrl);
                    inputRef.current?.blur();
                    setIsInputFocused(false);
                  }
                }}
                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 dark:text-gray-300 min-w-0"
                placeholder="Enter URL or search..."
              />
            </div>

            {/* Tool buttons */}
            <div className="flex gap-1">
              {/* Zoom out */}
              <Button
                onClick={handleZoomOut}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title={`Zoom out (current: ${Math.round(zoomLevel * 100)}%)`}
                disabled={zoomLevel <= 0.5}
              >
                <ZoomOut size={16} className={zoomLevel <= 0.5 ? 'opacity-40' : ''} />
              </Button>
              
              {/* Zoom level display */}
              <Button
                onClick={handleZoomReset}
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                title="Reset zoom to 100%"
              >
                {Math.round(zoomLevel * 100)}%
              </Button>
              
              {/* Zoom in */}
              <Button
                onClick={handleZoomIn}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title={`Zoom in (current: ${Math.round(zoomLevel * 100)}%)`}
                disabled={zoomLevel >= 2}
              >
                <ZoomIn size={16} className={zoomLevel >= 2 ? 'opacity-40' : ''} />
              </Button>
              
              {/* Screenshot */}
              <Button
                onClick={handleScreenshot}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Capture screenshot"
              >
                <Camera size={16} />
              </Button>
              
              {/* Bookmark toggle */}
              <Button
                onClick={handleToggleBookmark}
                size="sm"
                variant="ghost"
                className={`h-8 w-8 p-0 ${isBookmarked ? 'text-yellow-500 hover:text-yellow-600' : ''}`}
                title={isBookmarked ? `Remove bookmark (${bookmarks.length} total)` : 'Add bookmark'}
              >
                {isBookmarked ? <Star size={16} fill="currentColor" /> : <Star size={16} />}
              </Button>
              
              {/* Bookmarks dropdown menu */}
              <DropdownMenu open={bookmarksOpen} onOpenChange={setBookmarksOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 relative"
                    title={`View bookmarks (${bookmarks.length})`}
                  >
                    <BookMarked size={16} />
                    {bookmarks.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        {bookmarks.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel>Bookmarks ({bookmarks.length})</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {bookmarks.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No bookmarks yet. Click the ⭐ star to bookmark pages!
                    </div>
                  ) : (
                    bookmarks.map((bookmark, index) => (
                      <DropdownMenuItem
                        key={index}
                        className="flex items-center gap-2 p-2 cursor-pointer group"
                        onClick={() => {
                          handleNavigate(bookmark.url);
                          setBookmarksOpen(false); // Close dropdown after navigation
                          toast.success(`Navigating to ${bookmark.title}`);
                        }}
                      >
                        {bookmark.favicon ? (
                          <img src={bookmark.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <span className="text-gray-400">🌐</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{bookmark.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{bookmark.url}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            browserSessionManager.removeBookmark(nodeId, bookmark.url);
                            setBookmarks(bookmarks.filter(b => b.url !== bookmark.url));
                            toast.success('Bookmark removed');
                          }}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </Button>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* History dropdown */}
              <DropdownMenu open={historyOpen} onOpenChange={setHistoryOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    title={`History (${history.length})`}
                  >
                    <History size={14} className="mr-1" />
                    History
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-96 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>History ({history.length})</span>
                    {history.length > 1 && (
                      <button
                        onClick={handleClearHistory}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        Clear
                      </button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {history.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No history yet.
                    </div>
                  ) : (
                    history.map((entry, idx) => {
                      const isCurrent = idx === historyIndex;
                      let hostname = entry;
                      try { hostname = new URL(entry).hostname; } catch {}
                      return (
                        <DropdownMenuItem
                          key={`${entry}-${idx}`}
                          className={`flex items-center gap-2 p-2 cursor-pointer ${
                            isCurrent ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                          }`}
                          onClick={() => {
                            handleJumpToHistory(idx);
                            setHistoryOpen(false);
                          }}
                        >
                          <span className="text-xs font-mono text-gray-400 w-6 text-right flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {isCurrent && '• '}{hostname}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {entry}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* External link */}
              <Button
                onClick={handleOpenInNewTab}
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Open in new tab"
              >
                <ExternalLink size={16} />
              </Button>
              
              {/* Extract/Create dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    title="Extract content to canvas"
                  >
                     ⋮
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Extract to Canvas</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleScreenshot} className="gap-2">
                    <Camera size={14} />
                    Screenshot → Image Node
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreateTextNode} className="gap-2">
                    <FileText size={14} />
                    Create Text Node (for copy-paste)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreateLinkNode} className="gap-2">
                    <Link2 size={14} />
                    Create Link Node (current URL)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Browser embeds cannot read in-page clicks or protected sites. Use screenshots, links, or copy-paste for durable capture.
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 z-20 animate-pulse" />
      )}

      {!iframeError && (
        <div className="absolute bottom-2 left-2 right-2 z-10 rounded-md bg-white/85 dark:bg-gray-900/85 px-2 py-1 text-[11px] text-gray-600 dark:text-gray-300 shadow-sm pointer-events-none">
          Some sites block embeds, and in-page clicks cannot be saved automatically. Capture important pages as links or screenshots.
        </div>
      )}

      {/* Browser iframe - fully interactive */}
      <iframe
        ref={iframeRef}
        src={currentUrl}
        className="w-full h-full border-none"
        title="Browser Node"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-navigation allow-top-navigation"
        style={{ 
          pointerEvents: 'auto', // Always interactive - use drag handle to move node
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'top left',
          width: `${100 / zoomLevel}%`,
          height: `${100 / zoomLevel}%`
        }}
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />

      {/* Error overlay - shows above iframe when there's an error, but navigation bar is still accessible */}
      {errorOverlay}
    </div>
  );
}
