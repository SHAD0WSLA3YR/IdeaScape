import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { applyContentEditableCommand, clearContentEditableFormatting } from '../utils/contentEditableFormat';
import { GroupDialog } from './GroupDialog';
import { NodeSearchDialog } from './NodeSearchDialog';
import { Type, Image, Link, Trash2, Plus, Eraser, UserX, Search, Video, MessageCircle, Copy, Tag, Sparkles, Zap, ChevronRight, Bold, Italic, Underline, Highlighter, X, Globe } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId?: string;
  canvasPosition?: { x: number; y: number };
  onClose: () => void;
}

const groupColors = [
  '#3b82f6', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#ec4899'
];

export function ContextMenu({ x, y, nodeId, canvasPosition, onClose }: ContextMenuProps) {
  const { 
    nodes, 
    groups, 
    updateNode, 
    deleteNode, 
    addNode, 
    updateGroup, 
    addGroup, 
    clearCanvas, 
    addComment, 
    removeComment, 
    duplicateNode,
    summarizeCanvas,
    summarizeGroup,
    summarizeNodes,
    suggestConnections,
    suggestGroupNames
  } = useCanvasStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const submenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [position, setPosition] = useState({ x, y });
  const [commentInput, setCommentInput] = useState('');
  const [showEditSubmenu, setShowEditSubmenu] = useState(false);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
  const savedRangeRef = useRef<Range | null>(null);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [isSelectionCrossNode, setIsSelectionCrossNode] = useState(false);

  const selectedNode = nodeId ? nodes.find(n => n.id === nodeId) : null;
  const getSelectedNodeEditor = () => {
    if (!selectedNode) return null;
    return document.querySelector(
      `[contenteditable="true"][data-node-id="${selectedNode.id}"]`
    ) as HTMLElement | null;
  };

  // Check and save text selection state on mount
  useEffect(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      savedRangeRef.current = range.cloneRange();
      const startEditable = (range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement
      )?.closest('[contenteditable="true"]');
      const endEditable = (range.endContainer instanceof HTMLElement
        ? range.endContainer
        : range.endContainer.parentElement
      )?.closest('[contenteditable="true"]');
      if (startEditable && endEditable && startEditable === endEditable) {
        setHasTextSelection(true);
        setIsSelectionCrossNode(false);
      } else if (startEditable && endEditable) {
        setHasTextSelection(true);
        setIsSelectionCrossNode(true);
      } else {
        setHasTextSelection(false);
      }
    } else {
      setHasTextSelection(false);
    }
  }, []);

  // Listen for close all dialogs event
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      onClose();
    };

    const handleCloseContextMenu = () => {
      onClose();
    };

    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    window.addEventListener('closeContextMenu', handleCloseContextMenu);
    return () => {
      window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
      window.removeEventListener('closeContextMenu', handleCloseContextMenu);
    };
  }, [onClose]);

  // Calculate optimal position to keep menu in viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate the actual menu dimensions
    const menuWidth = menuRect.width || 192; // fallback to min-w-48 (12rem = 192px)
    const menuHeight = menuRect.height || 400; // estimated height

    let finalX = x;
    let finalY = y;

    // Horizontal positioning
    if (x + menuWidth > viewportWidth) {
      // If menu would overflow right, position it to the left of click
      finalX = x - menuWidth;
      
      // If that would overflow left, position at right edge with some margin
      if (finalX < 0) {
        finalX = viewportWidth - menuWidth - 16; // 16px margin
      }
    }

    // Vertical positioning
    if (y + menuHeight > viewportHeight) {
      // If menu would overflow bottom, position it above the click
      finalY = y - menuHeight;
      
      // If that would overflow top, position at bottom edge with some margin
      if (finalY < 0) {
        finalY = viewportHeight - menuHeight - 16; // 16px margin
      }
    }

    // Ensure menu doesn't go outside viewport bounds
    finalX = Math.max(8, Math.min(finalX, viewportWidth - menuWidth - 8));
    finalY = Math.max(8, Math.min(finalY, viewportHeight - menuHeight - 8));

    setPosition({ x: finalX, y: finalY });
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking inside a dialog
      const target = e.target as HTMLElement;
      if (target.closest('[data-slot="dialog-content"]') || target.closest('[data-slot="dialog-overlay"]')) {
        return;
      }
      
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        window.getSelection()?.removeAllRanges();
        savedRangeRef.current = null;
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      // Don't close context menu if escape is pressed inside a dialog
      const target = e.target as HTMLElement;
      if (target.closest('[data-slot="dialog-content"]')) {
        return;
      }
      
      if (e.key === 'Escape') {
        window.getSelection()?.removeAllRanges();
        savedRangeRef.current = null;
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      
      // Cleanup timeout on unmount
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current);
      }
    };
  }, [onClose]);



  const handleDelete = () => {
    if (selectedNode) {
      deleteNode(selectedNode.id);
    }
    onClose();
  };

  const handleChangeType = (type: 'text' | 'image' | 'link' | 'video' | 'browser') => {
    if (selectedNode) {
      let newContent: any = { type };
      
      if (type === 'text') {
        newContent.value = '<p style="font-size: 14px;">Double-click to edit</p>';
      } else if (type === 'image') {
        // Initialize with empty images array for drag and drop
        newContent.value = '';
        newContent.images = [];
      } else if (type === 'link') {
        // Initialize with empty links array for multiple links
        newContent.value = '';
        newContent.links = [];
      } else if (type === 'video') {
        // Initialize with empty videos array for drag and drop
        newContent.value = '';
        newContent.videos = [];
      } else if (type === 'browser') {
        // Initialize browser node in sleeping mode with history tracking
        newContent.value = 'https://www.wikipedia.org';
        newContent.url = 'https://www.wikipedia.org';
        newContent.isAwake = false; // Start in sleep mode
        newContent.history = ['https://www.wikipedia.org']; // Initialize history
        newContent.historyIndex = 0; // Start at first URL
        newContent.favicon = null; // Will be fetched when URL loads
        newContent.pageTitle = null; // Will be fetched when URL loads
      }

      updateNode(selectedNode.id, {
        content: newContent,
        // Pin browser nodes by default for better UX
        isPinned: type === 'browser' ? true : selectedNode.isPinned,
        // Set larger default size for browser nodes (7:5 aspect ratio - 700x500)
        width: type === 'browser' ? 700 : selectedNode.width,
        height: type === 'browser' ? 500 : selectedNode.height
      });
    }
    onClose();
  };

  const handleAssignToGroup = (groupId: string) => {
    if (selectedNode) {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        // Remove node from current group if it has one
        if (selectedNode.groupId) {
          const currentGroup = groups.find(g => g.id === selectedNode.groupId);
          if (currentGroup) {
            updateGroup(currentGroup.id, {
              nodes: currentGroup.nodes.filter(nodeId => nodeId !== selectedNode.id)
            });
          }
        }

        // Add node to new group
        updateGroup(groupId, {
          nodes: [...group.nodes, selectedNode.id]
        });

        // Update node's group assignment and color
        updateNode(selectedNode.id, { 
          groupId: groupId,
          color: group.color
        });
      }
    }
    onClose();
  };

  const handleRemoveFromGroup = () => {
    if (selectedNode && selectedNode.groupId) {
      const group = groups.find(g => g.id === selectedNode.groupId);
      if (group) {
        updateGroup(group.id, {
          nodes: group.nodes.filter(nodeId => nodeId !== selectedNode.id)
        });
        updateNode(selectedNode.id, { 
          groupId: undefined,
          color: '#f3f4f6' // Reset to default grey
        });
      }
    }
    onClose();
  };

  const handleCreateNewGroupSuccess = () => {
    onClose();
  };

  const handleOpenSearch = () => {
    // First close the context menu, then open search
    onClose();
    // Use a small delay to ensure context menu is closed before opening search
    setTimeout(() => {
      const event = new CustomEvent('openNodeSearch');
      window.dispatchEvent(event);
    }, 100);
  };

  const handleAddComment = () => {
    if (selectedNode && commentInput.trim()) {
      addComment(selectedNode.id, commentInput.trim());
      onClose();
    }
  };

  const handleRemoveComment = () => {
    if (selectedNode) {
      removeComment(selectedNode.id);
      onClose();
    }
  };

  const handleDuplicateNode = () => {
    if (selectedNode) {
      duplicateNode(selectedNode.id);
      onClose();
    }
  };

  const handleSummarizeGroup = () => {
    if (selectedNode && selectedNode.groupId) {
      summarizeGroup(selectedNode.groupId);
      onClose();
    }
  };

  const handleSummarizeCanvas = () => {
    summarizeCanvas();
    onClose();
  };

  const handleSuggestConnections = () => {
    suggestConnections();
    onClose();
  };

  const handleSuggestGroupNames = () => {
    if (selectedNode) {
      // Get all nodes in the same group for group name suggestions
      const groupNodes = nodes.filter(node => 
        selectedNode.groupId && node.groupId === selectedNode.groupId
      );
      if (groupNodes.length > 0) {
        suggestGroupNames(groupNodes.map(n => n.id));
      }
    }
    onClose();
  };

  // Text formatting — selection restore + contenteditable bridge (see contentEditableFormat.ts)
  const runFormatCommand = (command: string, value?: string) => {
    let selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (savedRangeRef.current && selection) {
        selection.removeAllRanges();
        selection.addRange(savedRangeRef.current);
      } else {
        return;
      }
    }

    applyContentEditableCommand(command, value);

    selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }

    if (selectedNode) {
      const editableElement = getSelectedNodeEditor();
      if (editableElement) {
        const content = editableElement.innerHTML;
        updateNode(selectedNode.id, {
          content: { ...selectedNode.content, value: content }
        });
      }
    }
  };

  const handleBold = () => {
    runFormatCommand('bold');
  };

  const handleItalic = () => {
    runFormatCommand('italic');
  };

  const handleUnderline = () => {
    runFormatCommand('underline');
  };

  const handleStrikethrough = () => {
    runFormatCommand('strikeThrough');
  };

  const handleHighlight = () => {
    if (selectedNode) {
      const group = groups.find(g => g.id === selectedNode.groupId);
      const color = group ? group.color + '40' : '#FFFF0040';
      runFormatCommand('backColor', color);
    }
  };

  const handleClearFormatting = () => {
    let selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (savedRangeRef.current && selection) {
        selection.removeAllRanges();
        selection.addRange(savedRangeRef.current);
      } else {
        return;
      }
    }

    clearContentEditableFormatting();

    selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }

    if (selectedNode) {
      const editableElement = getSelectedNodeEditor();
      if (editableElement) {
        const content = editableElement.innerHTML;
        updateNode(selectedNode.id, {
          content: { ...selectedNode.content, value: content }
        });
      }
    }
  };



  return (
    <div
      ref={menuRef}
      className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-2 z-50 min-w-48 max-h-96 overflow-y-auto"
      style={{ 
        left: position.x, 
        top: position.y,
        maxWidth: '300px' // prevent menu from getting too wide
      }}
    >
      {selectedNode ? (
        <>
          {/* Cross-node selection warning */}
          {selectedNode.content.type === 'text' && hasTextSelection && isSelectionCrossNode && (
            <>
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                Select text within a single node to format
              </div>
              <hr className="my-2" />
            </>
          )}

          {/* EDIT submenu for text nodes — only when text is selected within this node */}
          {selectedNode.content.type === 'text' && hasTextSelection && !isSelectionCrossNode && (
            <>
              <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Edit Text
              </div>
              <div className="relative">
                <button
                  ref={editButtonRef}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    // Clear any pending close timeout
                    if (submenuCloseTimeoutRef.current) {
                      clearTimeout(submenuCloseTimeoutRef.current);
                      submenuCloseTimeoutRef.current = null;
                    }
                    
                    if (editButtonRef.current) {
                      const rect = editButtonRef.current.getBoundingClientRect();
                      setSubmenuPosition({
                        x: rect.right + 4,
                        y: rect.top
                      });
                      setShowEditSubmenu(true);
                    }
                  }}
                  onMouseLeave={() => {
                    // Delay closing to give time to move to submenu
                    submenuCloseTimeoutRef.current = setTimeout(() => {
                      setShowEditSubmenu(false);
                    }, 300); // 300ms delay
                  }}
                  onClick={() => {
                    // Clear any pending close timeout
                    if (submenuCloseTimeoutRef.current) {
                      clearTimeout(submenuCloseTimeoutRef.current);
                      submenuCloseTimeoutRef.current = null;
                    }
                    
                    if (editButtonRef.current) {
                      const rect = editButtonRef.current.getBoundingClientRect();
                      setSubmenuPosition({
                        x: rect.right + 4,
                        y: rect.top
                      });
                      setShowEditSubmenu(!showEditSubmenu);
                    }
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center justify-between text-gray-900 dark:text-gray-100"
                >
                  <span className="flex items-center gap-2">
                    <Type size={16} className="text-blue-500" />
                    EDIT
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
              
              {/* Edit Submenu - Rendered at root level with fixed positioning */}
              {showEditSubmenu && (
                <div 
                  className="edit-submenu fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-2 min-w-48 z-[9999]"
                  style={{
                    left: `${submenuPosition.x}px`,
                    top: `${submenuPosition.y}px`
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    // Clear any pending close timeout when entering submenu
                    if (submenuCloseTimeoutRef.current) {
                      clearTimeout(submenuCloseTimeoutRef.current);
                      submenuCloseTimeoutRef.current = null;
                    }
                    setShowEditSubmenu(true);
                  }}
                  onMouseLeave={() => {
                    // Delay closing when leaving submenu
                    submenuCloseTimeoutRef.current = setTimeout(() => {
                      setShowEditSubmenu(false);
                    }, 200); // 200ms delay
                  }}
                >
                    {/* Formatting Options */}
                    <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Formatting
                    </div>
                    <button
                      onClick={handleBold}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <Bold size={16} className="text-gray-700 dark:text-gray-300" />
                      Bold
                    </button>
                    <button
                      onClick={handleItalic}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <Italic size={16} className="text-gray-700 dark:text-gray-300" />
                      Italic
                    </button>
                    <button
                      onClick={handleUnderline}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <Underline size={16} className="text-gray-700 dark:text-gray-300" />
                      Underline
                    </button>
                    <button
                      onClick={handleStrikethrough}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <Type size={16} className="text-gray-700 dark:text-gray-300" style={{ textDecoration: 'line-through' }} />
                      Strikethrough
                    </button>
                    <button
                      onClick={handleHighlight}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <Highlighter size={16} className="text-yellow-500" />
                      Highlight
                    </button>
                    
                    <hr className="my-2" />
                    
                    <button
                      onClick={handleClearFormatting}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <X size={16} className="text-red-500" />
                      Clear Formatting
                    </button>
                  </div>
                )}
              
              <hr className="my-2" />
            </>
          )}

          {/* Content Type */}
          <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Content Type
          </div>
          <button
            onClick={() => handleChangeType('text')}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Type size={16} className="text-blue-500" />
            Text
          </button>
          <button
            onClick={() => handleChangeType('image')}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Image size={16} className="text-green-500" />
            Image
          </button>
          <button
            onClick={() => handleChangeType('link')}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Link size={16} className="text-purple-500" />
            Link
          </button>
          <button
            onClick={() => handleChangeType('video')}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Video size={16} className="text-red-500" />
            Video
          </button>
          <button
            onClick={() => handleChangeType('browser')}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Globe size={16} className="text-cyan-500" />
            Browser
          </button>

          <hr className="my-2" />

          {/* Comments */}
          <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Comments
          </div>
          {selectedNode.comment ? (
            <>
              <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 mx-2 rounded">
                <div className="flex items-center gap-2">
                  <MessageCircle size={12} className="text-blue-500" />
                  <span className="font-medium">Current:</span>
                </div>
                <div className="mt-1 text-gray-800 dark:text-gray-200">"{selectedNode.comment}"</div>
              </div>
              <button
                onClick={handleRemoveComment}
                className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm text-red-600 dark:text-red-400 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Remove Comment
              </button>
            </>
          ) : (
            <div className="px-3 py-2">
              <input
                type="text"
                placeholder="Add a comment..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                className="w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddComment();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={handleAddComment}
                disabled={!commentInput.trim()}
                className="w-full mt-1 text-left px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MessageCircle size={14} />
                Add Comment
              </button>
            </div>
          )}

          <hr className="my-2" />

          {/* AI Features */}
          <>
            <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              AI Assistant
            </div>
            <button
              onClick={handleSummarizeCanvas}
              className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
            >
              <Sparkles size={16} className="text-purple-500" />
              Summarize Canvas
            </button>
            <button
              onClick={() => {
                if (selectedNode) {
                  // For single node, call summarize with just this node
                  summarizeNodes([selectedNode.id]);
                  onClose();
                }
              }}
              className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
            >
              <Sparkles size={16} className="text-purple-500" />
              Summarize Node
            </button>
            {selectedNode.groupId && (
              <>
                <button
                  onClick={handleSummarizeGroup}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                >
                  <Sparkles size={16} className="text-purple-500" />
                  Summarize Group
                </button>
                <button
                  onClick={handleSuggestGroupNames}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
                >
                  <Zap size={16} className="text-yellow-500" />
                  Suggest Group Names
                </button>
              </>
            )}
            <hr className="my-2" />
          </>

          {/* Group Assignment */}
          <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Group Assignment
          </div>
          <GroupDialog
            trigger={
              <button 
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
                onClick={(e) => e.stopPropagation()}
              >
                Create New Group
              </button>
            }
            nodeIds={selectedNode ? [selectedNode.id] : []}
            onSuccess={handleCreateNewGroupSuccess}
          />
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => handleAssignToGroup(group.id)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 ${
                selectedNode.groupId === group.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              <span 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: group.color }}
              />
              {group.name}
              {selectedNode.groupId === group.id && (
                <span className="ml-auto text-xs">✓</span>
              )}
            </button>
          ))}
          {selectedNode.groupId && (
            <button
              onClick={handleRemoveFromGroup}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/30 text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2"
            >
              <UserX size={16} />
              Remove from Group
            </button>
          )}

          <hr className="my-2" />

          {/* Actions */}
          <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Actions
          </div>
          <button
            onClick={handleDuplicateNode}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Copy size={16} className="text-green-500" />
            Duplicate Node
          </button>
          <button
            onClick={handleDelete}
            className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm text-red-600 dark:text-red-400 flex items-center gap-2"
          >
            <Trash2 size={16} />
            Delete Node
          </button>
        </>
      ) : (
        <>
          {/* Canvas context menu */}
          <button
            onClick={() => {
              if (canvasPosition) {
                addNode(canvasPosition.x, canvasPosition.y);
              }
              onClose();
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Plus size={16} className="text-blue-500" />
            Add Node Here
          </button>
          
          <button
            onClick={handleOpenSearch}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Search size={16} className="text-purple-500" />
            Search Nodes
          </button>

          {/* AI Features */}
          <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            AI Assistant
          </div>
          <button
            onClick={handleSummarizeCanvas}
            className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Sparkles size={16} className="text-purple-500" />
            Summarize Canvas
          </button>
          <button
            onClick={handleSuggestConnections}
            className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100"
          >
            <Sparkles size={16} className="text-purple-500" />
            Suggest Connections
          </button>
          
          <hr className="my-2 border-gray-200 dark:border-gray-600" />
          
          <button
            onClick={() => {
              clearCanvas();
              onClose();
            }}
            className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm text-red-600 dark:text-red-400 flex items-center gap-2"
          >
            <Eraser size={16} />
            Clear Canvas
          </button>
        </>
      )}
      

    </div>
  );
}