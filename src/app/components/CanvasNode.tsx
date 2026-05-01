import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Node, useCanvasStore } from "../store/canvasStore";
import { ImageWithFallback } from "./ImageWithFallback";
import { RichTextEditor } from "./RichTextEditor";
import { ImageMasonry } from "./ImageMasonry";
import { VideoMasonry } from "./VideoMasonry";
import { LinkManager } from "./LinkManager";
import { TagManager } from "./TagManager";
import { BrowserNode } from "./BrowserNode";
import { Maximize2, Trash2, Copy, Pin, PinOff, Sun, Moon, GripVertical, ChevronUp, ChevronDown, MessageSquareText } from "lucide-react";
import { createPortal } from "react-dom";

interface CanvasNodeProps {
  node: Node;
  isSelected: boolean;
  transform: { x: number; y: number; scale: number };
  onStartConnection: (nodeId: string, connectionPoint: string) => void;
  onCompleteConnection: (nodeId: string) => void;
  isConnectionTarget: boolean;
  isConnecting: boolean;
}

export function CanvasNode({
  node,
  isSelected,
  transform,
  onStartConnection,
  onCompleteConnection,
  isConnectionTarget,
  isConnecting,
}: CanvasNodeProps) {
  const updateNode = useCanvasStore((state) => state.updateNode);
  const groups = useCanvasStore((state) => state.groups);
  const addComment = useCanvasStore((state) => state.addComment);
  const removeComment = useCanvasStore((state) => state.removeComment);
  const zoomToNode = useCanvasStore((state) => state.zoomToNode);
  const zoomToNodes = useCanvasStore((state) => state.zoomToNodes);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isLinkDragActive, setIsLinkDragActive] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const nodeRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [showBrowserToolbar, setShowBrowserToolbar] = useState(false);

  // Find the group this node belongs to
  const nodeGroup = node.groupId
    ? groups.find((g) => g.id === node.groupId)
    : null;
  const borderColor = nodeGroup ? nodeGroup.color : "#d1d5db";

  const handleMouseDown = (e: React.MouseEvent) => {
    // For browser nodes, only allow dragging from the drag handle, not the node itself
    if (node.content.type === 'browser') {
      // Check if this is coming from the drag handle
      const target = e.target as HTMLElement;
      const isDragHandle = target.closest('[data-browser-drag-handle]');
      
      if (!isDragHandle) {
        // Not from drag handle, so don't start dragging - let browser be interactive
        return;
      }
      // If it's from the drag handle, select the node and continue to dragging logic below
      if (!isSelected) {
        selectNode(node.id);
      }
    }

    // Prevent node dragging with middle mouse button (used for canvas panning)
    if (e.button === 1) {
      return; // Middle button should only pan canvas, not move nodes
    }

    // Prevent dragging if node is pinned
    if (node.isPinned) {
      return; // Pinned nodes cannot be moved
    }

    // If we're in connecting mode and this is a target node, complete the connection
    if (isConnecting && isConnectionTarget) {
      e.preventDefault();
      e.stopPropagation();
      onCompleteConnection(node.id);
      return;
    }

    // If node is in editing mode, don't start dragging
    if (isEditing) {
      return;
    }

    // If link drag mode is active, don't start node dragging
    if (isLinkDragActive) {
      return;
    }

    // Check if clicking on a connection dot - if so, don't start dragging the node
    if (
      (e.target as HTMLElement).classList.contains("connection-dot")
    ) {
      return;
    }

    // Check if clicking on an input field, button, or other interactive element
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.tagName === 'INPUT' || 
                                target.tagName === 'BUTTON' || 
                                target.tagName === 'A' ||
                                target.contentEditable === 'true' ||
                                target.closest('input') ||
                                target.closest('button') ||
                                target.closest('a') ||
                                target.closest('[contenteditable="true"]');
    
    if (isInteractiveElement) {
      return; // Don't prevent default or start dragging
    }

    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    setDragStart({
      x: e.clientX - node.x * transform.scale,
      y: e.clientY - node.y * transform.scale,
    });
  };

  const handleNodeClick = (e: React.MouseEvent) => {
    // For browser nodes, don't select on click - only via drag handle
    if (node.content.type === 'browser') {
      // Don't interfere with browser interactions at all
      return;
    }

    // If we're in connecting mode and this is a target node, complete the connection
    if (isConnecting && isConnectionTarget) {
      e.preventDefault();
      e.stopPropagation();
      onCompleteConnection(node.id);
      return;
    }

    // Check if clicking on an interactive element - if so, don't interfere
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.tagName === 'INPUT' || 
                                target.tagName === 'BUTTON' || 
                                target.tagName === 'A' ||
                                target.contentEditable === 'true' ||
                                target.closest('input') ||
                                target.closest('button') ||
                                target.closest('a') ||
                                target.closest('[contenteditable="true"]');
    
    if (isInteractiveElement) {
      return; // Don't prevent default
    }

    // Close any open context menus when clicking on the node
    const closeEvent = new CustomEvent('closeContextMenu');
    window.dispatchEvent(closeEvent);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: node.width,
      height: node.height,
    });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isConnecting) return; // Don't allow editing during connection mode
    
    // Check if double-clicking on an interactive element - if so, don't interfere
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.tagName === 'INPUT' || 
                                target.tagName === 'BUTTON' || 
                                target.tagName === 'A' ||
                                target.contentEditable === 'true' ||
                                target.closest('input') ||
                                target.closest('button') ||
                                target.closest('a') ||
                                target.closest('[contenteditable="true"]');
    
    if (isInteractiveElement) {
      return; // Don't prevent default or enter editing mode
    }
    
    e.preventDefault();
    e.stopPropagation();
    if (node.content.type === "text") {
      setIsEditing(true);
    }
  };

  const handleContentChange = (value: string) => {
    updateNode(node.id, {
      content: { ...node.content, value },
    });
  };

  const handleContentBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Check if the key event is coming from an input field or other interactive element
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.tagName === 'INPUT' || 
                                target.tagName === 'BUTTON' || 
                                target.tagName === 'TEXTAREA' ||
                                target.contentEditable === 'true' ||
                                target.closest('input') ||
                                target.closest('button') ||
                                target.closest('textarea') ||
                                target.closest('[contenteditable="true"]');
    
    // If it's from an interactive element, only handle Escape for exiting editing mode
    if (isInteractiveElement && e.key !== "Escape") {
      return; // Let the input handle its own key events
    }

    if (e.key === "Enter" && !e.shiftKey && !isInteractiveElement) {
      e.preventDefault();
      setIsEditing(false);
    }
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const handleConnectionStart = (e: React.MouseEvent, connectionPoint: string) => {
    e.preventDefault();
    e.stopPropagation();
    onStartConnection(node.id, connectionPoint);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX =
          (e.clientX - dragStart.x) / transform.scale;
        const newY =
          (e.clientY - dragStart.y) / transform.scale;
        updateNode(node.id, { x: newX, y: newY });
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        const newWidth = Math.max(
          100,
          resizeStart.width + deltaX / transform.scale,
        );
        const newHeight = Math.max(
          60,
          resizeStart.height + deltaY / transform.scale,
        );
        updateNode(node.id, {
          width: newWidth,
          height: newHeight,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener(
          "mousemove",
          handleMouseMove,
        );
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [
    isDragging,
    isResizing,
    dragStart,
    resizeStart,
    node.id,
    transform.scale,
    updateNode,
  ]);



  const handleImagesChange = (images: string[]) => {
    updateNode(node.id, {
      content: { ...node.content, images },
    });
  };

  const handleLinksChange = (links: Array<{ url: string; title: string }>) => {
    updateNode(node.id, {
      content: { ...node.content, links },
    });
  };

  const handleVideosChange = (videos: string[]) => {
    updateNode(node.id, {
      content: { ...node.content, videos },
    });
  };

  const handleCommentSave = (comment: string) => {
    if (comment.trim()) {
      addComment(node.id, comment.trim());
    } else {
      removeComment(node.id);
    }
    setIsEditingComment(false);
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommentSave((e.target as HTMLTextAreaElement).value);
    } else if (e.key === 'Escape') {
      setIsEditingComment(false);
    }
  };

  // Auto-focus comment input when editing starts
  useEffect(() => {
    if (isEditingComment && commentInputRef.current) {
      commentInputRef.current.focus();
      commentInputRef.current.select();
    }
  }, [isEditingComment]);

  // Calculate fixed toolbar position (doesn't scale with canvas)
  useEffect(() => {
    // Only show toolbar if this is the only selected node OR if multiple nodes are selected and this is one of them
    const isMultiSelect = selectedNodeIds.length > 1;
    const shouldShowToolbar = isSelected && !isConnecting;
    
    // For multi-select, only calculate position once for the first node in the selection
    const isFirstSelectedNode = isMultiSelect && selectedNodeIds[0] === node.id;
    
    if (shouldShowToolbar && (!isMultiSelect || isFirstSelectedNode) && nodeRef.current) {
      const updateToolbarPosition = () => {
        // Get the canvas container
        const canvasContainer = document.querySelector('[data-infinite-canvas]');
        if (!canvasContainer) return;
        
        const canvasRect = canvasContainer.getBoundingClientRect();
        
        if (isMultiSelect) {
          // Calculate bounding box from the latest store snapshot without subscribing
          // every node component to the full node array.
          const selectedNodes = useCanvasStore.getState().nodes.filter(n => selectedNodeIds.includes(n.id));
          if (selectedNodes.length === 0) return;
          
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          
          selectedNodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
          });
          
          // Calculate center-top position of bounding box
          const centerX = (minX + maxX) / 2;
          const nodeScreenX = canvasRect.left + transform.x + centerX * transform.scale;
          const nodeScreenY = canvasRect.top + transform.y + minY * transform.scale;
          
          setToolbarPosition({
            x: nodeScreenX,
            y: nodeScreenY - 48 // 40px toolbar height + 8px gap
          });
        } else {
          // Single node - position at node's top center
          const nodeScreenX = canvasRect.left + transform.x + (node.x + node.width / 2) * transform.scale;
          const nodeScreenY = canvasRect.top + transform.y + node.y * transform.scale;
          
          setToolbarPosition({
            x: nodeScreenX,
            y: nodeScreenY - 48 // 40px toolbar height + 8px gap
          });
        }
      };

      updateToolbarPosition();
      
      // Update position on scroll/resize
      window.addEventListener('resize', updateToolbarPosition);
      return () => window.removeEventListener('resize', updateToolbarPosition);
    }
  }, [isSelected, isConnecting, node.id, node.x, node.y, node.width, transform.x, transform.y, transform.scale, selectedNodeIds]);

  // Handle zoom to node (supports multiple selection)
  const handleZoomToNode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get canvas size
    const canvasElement = document.querySelector('[data-infinite-canvas]');
    if (canvasElement) {
      const rect = canvasElement.getBoundingClientRect();
      if (selectedNodeIds.length > 1) {
        zoomToNodes(selectedNodeIds, { width: rect.width, height: rect.height });
      } else {
        zoomToNode(node.id, { width: rect.width, height: rect.height });
      }
    }
  };

  // Handle pin/unpin node
  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateNode(node.id, { isPinned: !node.isPinned });
  };

  // Handle delete node (supports multiple selection)
  const handleDeleteNode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedNodeIds.length > 1) {
      deleteNodes(selectedNodeIds);
    } else {
      deleteNode(node.id);
    }
  };

  // Handle duplicate node (supports multiple selection)
  const handleDuplicateNode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedNodeIds.length > 1) {
      // Duplicate all selected nodes
      selectedNodeIds.forEach(id => duplicateNode(id));
    } else {
      duplicateNode(node.id);
    }
  };

  const renderContent = () => {
    switch (node.content.type) {
      case "text":
        if (isEditing) {
          return (
            <RichTextEditor
              nodeId={node.id}
              value={node.content.value}
              onChange={handleContentChange}
              onBlur={handleContentBlur}
              onSave={() => setIsEditing(false)}
              groupColor={borderColor}
              autoFocus
            />
          );
        }
        return (
          <div 
            className="p-3 text-sm break-words rich-text-content text-left tiptap-display text-gray-900 dark:text-gray-100"
            dangerouslySetInnerHTML={{ __html: node.content.value }}
          />
        );

      case "image":
        // Use multi-image support with drag and drop
        const images = node.content.images || (node.content.value ? [node.content.value] : []);
        return (
          <ImageMasonry
            images={images}
            onImagesChange={handleImagesChange}
            nodeWidth={node.width}
          />
        );

      case "link":
        // Use multi-link support with editable links
        const links = node.content.links || (node.content.value ? [{ url: node.content.value, title: node.content.title || node.content.value }] : []);
        return (
          <LinkManager
            links={links}
            onLinksChange={handleLinksChange}
            onDragModeChange={setIsLinkDragActive}
          />
        );

      case "video":
        // Use multi-video support with drag and drop
        const videos = node.content.videos || (node.content.value ? [node.content.value] : []);
        return (
          <VideoMasonry
            videos={videos}
            onVideosChange={handleVideosChange}
            onDoubleClick={handleDoubleClick}
          />
        );

      case "browser":
        return (
          <BrowserNode
            nodeId={node.id}
            url={node.content.url || node.content.value || 'https://www.wikipedia.org'}
            isAwake={node.content.isAwake ?? true}
            favicon={node.content.favicon}
            pageTitle={node.content.pageTitle}
            history={node.content.history}
            historyIndex={node.content.historyIndex}
            showToolbar={showBrowserToolbar}
            onToggleToolbar={() => setShowBrowserToolbar(!showBrowserToolbar)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      className="absolute"
      style={{
        left: node.x,
        top: node.y,
      }}
      initial={node.isNew ? {
        opacity: 0,
        scale: 0.2,
      } : false}
      animate={node.isNew ? {
        opacity: 1,
        scale: 1,
      } : {}}
      transition={node.isNew ? {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
        scale: {
          type: "spring",
          stiffness: 200,
          damping: 20
        }
      } : {}}
    >


      <div
        ref={nodeRef}
        className={`rounded-lg bg-white dark:bg-gray-800 shadow-lg border-2 transition-all group ${
          isDragging ? "opacity-80" : ""
        } ${isConnectionTarget ? "ring-2 ring-blue-400 ring-opacity-50 cursor-pointer" : ""} ${
          isSelected ? "ring-2 ring-blue-500 ring-opacity-75" : ""
        } ${
          isConnecting ? "cursor-crosshair" : isEditing ? "cursor-text" : isLinkDragActive ? "cursor-default" : node.content.type === 'browser' ? "cursor-default" : "cursor-move select-none"
        }`}
        style={{
          width: node.width,
          height: node.height,
          borderColor: borderColor,
        }}
        onMouseDown={node.content.type === 'browser' ? undefined : handleMouseDown}
        onClick={node.content.type === 'browser' ? undefined : handleNodeClick}
        onDoubleClick={node.content.type === 'browser' ? undefined : handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
      {/* Connection points - shown when selected or when it's a connection target */}
      {(isSelected || isConnectionTarget) && (
        <>
          {/* Top center */}
          <div
            className="connection-dot absolute w-4 h-4 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-600 transition-colors hover:scale-110"
            style={{
              top: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
            }}
            onClick={(e) => handleConnectionStart(e, "top")}
          />
          {/* Left center */}
          <div
            className="connection-dot absolute w-4 h-4 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-600 transition-colors hover:scale-110"
            style={{
              top: "50%",
              left: "-8px",
              transform: "translateY(-50%)",
              zIndex: 10,
            }}
            onClick={(e) => handleConnectionStart(e, "left")}
          />
          {/* Right center */}
          <div
            className="connection-dot absolute w-4 h-4 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-600 transition-colors hover:scale-110"
            style={{
              top: "50%",
              right: "-8px",
              transform: "translateY(-50%)",
              zIndex: 10,
            }}
            onClick={(e) => handleConnectionStart(e, "right")}
          />
          {/* Bottom center */}
          <div
            className="connection-dot absolute w-4 h-4 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-600 transition-colors hover:scale-110"
            style={{
              bottom: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
            }}
            onClick={(e) => handleConnectionStart(e, "bottom")}
          />
        </>
      )}
      
      {/* Tags - positioned bottom-left, outside node, above comments */}
      {((node.tags && node.tags.length > 0) || isSelected) && (
        <div className={`absolute left-0 z-10 ${node.comment ? 'bottom-16' : 'bottom-0 translate-y-full pt-1'}`}>
          <TagManager nodeId={node.id} />
        </div>
      )}

      {/* Content */}
      <div className={`w-full ${node.comment ? 'h-[calc(100%-60px)]' : 'h-full'} overflow-hidden ${isEditing ? 'cursor-text' : ''}`}>
        {renderContent()}
      </div>

      {/* Comment Section */}
      {node.comment && (
        <div className="absolute bottom-0 left-0 right-0 min-h-10 max-h-20 bg-gray-300 dark:bg-gray-600 rounded-b-lg border-t border-gray-400 dark:border-gray-500 p-2">
          <div className="flex items-start gap-2">
            <MessageSquareText
              aria-label="Comment"
              className="w-3 h-3 flex-shrink-0 mt-0.5 text-gray-600 dark:text-gray-300"
            />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-black dark:text-white font-medium block mb-1">Comment:</span>
              {isEditingComment ? (
                <textarea
                  ref={commentInputRef}
                  defaultValue={node.comment}
                  className="w-full text-xs bg-transparent border-none outline-none text-black dark:text-white resize-none overflow-hidden"
                  rows={2}
                  style={{ minHeight: '2.5rem', maxHeight: '3.5rem' }}
                  onBlur={(e) => handleCommentSave(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleCommentSave((e.target as HTMLTextAreaElement).value);
                    } else if (e.key === 'Escape') {
                      setIsEditingComment(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div 
                  className="text-xs text-black dark:text-white cursor-pointer break-words leading-tight overflow-y-auto"
                  style={{ maxHeight: '3rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingComment(true);
                  }}
                >
                  {node.comment}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Resize handle - blue square in bottom right corner */}
      {isSelected && !isConnecting && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize rounded-br-md"
          onMouseDown={handleResizeStart}
        />
      )}
      </div>

      {/* Pin Icon Indicator - shown above pinned nodes */}
      {node.isPinned && (
        <div 
          className={`absolute left-0 text-blue-600 dark:text-blue-400 flex items-center ${
            node.content.type === 'browser' ? '-top-10 h-7' : '-top-6'
          }`}
          title="Node is pinned"
          style={{ pointerEvents: 'none' }}
        >
          <Pin size={18} fill="currentColor" />
        </div>
      )}

      {/* Browser Node Status Bar - shown above browser nodes */}
      {node.content.type === 'browser' && (
        <div 
          className={`absolute -top-10 flex items-center gap-2 h-7 transition-all duration-200`}
          style={{ 
            pointerEvents: 'auto',
            left: node.isPinned ? '28px' : '0'
          }}
        >
          {/* Drag Handle - larger clickable area for easy grabbing */}
          <div
            data-browser-drag-handle
            onMouseDown={handleMouseDown}
            className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all cursor-move relative group"
            title="Click to select & drag node"
            style={{ 
              padding: '8px', // Larger clickable area
              margin: '-8px',
              clipPath: 'none'
            }}
          >
            <GripVertical size={14} className="pointer-events-none" />
            {/* Invisible larger hit area */}
            <div className="absolute inset-0 scale-150 pointer-events-auto" style={{ opacity: 0 }} />
          </div>

          {/* Sleep/Wake Button - reversed icons */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateNode(node.id, {
                content: {
                  ...node.content,
                  isAwake: !node.content.isAwake
                }
              });
            }}
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
              node.content.isAwake 
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50' 
                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
            }`}
            title={node.content.isAwake ? "Put browser to sleep" : "Wake up browser"}
          >
            {node.content.isAwake ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          {/* Browser Toolbar Toggle Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowBrowserToolbar(!showBrowserToolbar);
            }}
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
              showBrowserToolbar 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title={showBrowserToolbar ? "Hide browser toolbar" : "Show browser toolbar"}
          >
            {showBrowserToolbar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Favicon + Page Title */}
          {node.content.url && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-2 h-7 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm max-w-xs">
              {node.content.favicon ? (
                <img 
                  src={node.content.favicon} 
                  alt="" 
                  className="w-4 h-4 flex-shrink-0 object-contain" 
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              ) : (
                <div className="w-4 h-4 flex-shrink-0 text-gray-400 flex items-center justify-center">🌐</div>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium">
                {node.content.pageTitle || new URL(node.content.url).hostname.replace('www.', '').toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Fixed-size Floating Action Toolbar - rendered via portal */}
      {/* Only show once - for single node OR first node in multi-selection */}
      {isSelected && !isConnecting && (selectedNodeIds.length <= 1 || selectedNodeIds[0] === node.id) && createPortal(
        <div 
          key={`toolbar-${node.id}`}
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 flex items-center h-10 floating-node-toolbar"
          style={{
            left: `${toolbarPosition.x}px`,
            top: `${toolbarPosition.y}px`,
            transform: 'translateX(-50%)',
            padding: '4px',
            gap: '4px',
            zIndex: 40
          }}
        >
          <button
            onClick={handleTogglePin}
            className={`h-8 w-8 flex items-center justify-center rounded transition-colors ${
              node.isPinned 
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
            title={node.isPinned ? "Unpin node" : "Pin node in place"}
          >
            {node.isPinned ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
          <button
            onClick={handleDeleteNode}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
            title="Delete node"
          >
            <Trash2 size={16} />
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
          <button
            onClick={handleDuplicateNode}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
            title="Duplicate node"
          >
            <Copy size={16} />
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
          <button
            onClick={handleZoomToNode}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
            title="Zoom to fit this node"
          >
            <Maximize2 size={16} />
          </button>
        </div>,
        document.body
      )}
    </motion.div>
  );
}
