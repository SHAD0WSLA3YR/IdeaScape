import React, { useEffect, useState, useCallback, useRef } from 'react';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import { Toolbar } from './components/Toolbar';
import { MobileToolbar } from './components/MobileToolbar';
import { MobileActionMenu } from './components/MobileActionMenu';
import { DesktopChatButton } from './components/DesktopChatButton';
import { EditableTitle } from './components/EditableTitle';
import { HelpPanel } from './components/HelpPanel';
import { UserCursors } from './components/UserCursors';
import { CollaborationStatus } from './components/CollaborationStatus';
// import { CollaborationDebug } from './components/CollaborationDebug';
import { useCanvasStore } from './store/canvasStore';
import { useCollaborationStore } from './stores/collaborationStore';
import { useIsMobile } from './components/ui/use-mobile';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { NodeSearchDialog } from './components/NodeSearchDialog';
import { AISuggestionsPanel } from './components/AISuggestionsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CommandPalette } from './components/CommandPalette';

export default function App() {
  // Debug: Log the current URL and path for debugging routing issues
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('🌐 App loaded at:', window.location.href);
      console.log('📍 Pathname:', window.location.pathname);
    }
  }, []);
  const { 
    deleteNode, 
    deleteNodes,
    duplicateNode,
    selectedNodeId, 
    selectedNodeIds,
    undo, 
    redo, 
    exportCanvas,
    importCanvas,
    addNodeAtCenter,
    groupSelectedNodes,
    loadDurableSave,
    autoSave,
    settings,
    setTheme,
    cleanupStorage,
    getStorageInfo,
    setNodes,
    setConnections,
    setGroups
  } = useCanvasStore();

  const {
    isCollaborating,
    joinCanvas,
    updateCanvasData,
    leaveCanvas,
    userRole
  } = useCollaborationStore();
  const isCommenter = userRole === 'commenter';

  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Handle save export function
  const handleSave = useCallback(() => {
    try {
      const data = exportCanvas();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-${Date.now()}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Canvas exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    }
  }, [exportCanvas]);

  // Open group dialog function
  const openGroupDialog = useCallback(() => {
    // Find and click the Add Group button in the toolbar
    const addGroupButton = document.querySelector('[data-group-dialog-trigger]') as HTMLElement;
    if (addGroupButton && typeof addGroupButton.click === 'function') {
      addGroupButton.click();
    }
  }, []);

  // Handle duplicate node function
  const handleDuplicateNode = useCallback(() => {
    if (selectedNodeId) {
      duplicateNode(selectedNodeId);
    } else if (selectedNodeIds.length === 1) {
      duplicateNode(selectedNodeIds[0]);
    }
  }, [selectedNodeId, selectedNodeIds, duplicateNode]);

  // Auto-save periodically and on page unload
  useEffect(() => {
    let quotaErrorCount = 0;
    
    const performAutoSave = () => {
      try {
        autoSave();
        quotaErrorCount = 0; // Reset error count on successful save
        
      } catch (error) {
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          quotaErrorCount++;
          
          if (quotaErrorCount === 1) {
            // First time - show helpful message
            toast.error('Storage space full! Auto-save optimized. Consider exporting your canvas.', {
              duration: 8000,
              action: {
                label: 'Export Now',
                onClick: () => handleSave()
              }
            });
          } else if (quotaErrorCount >= 3) {
            // Multiple failures - show more urgent message
            toast.error('Critical: Unable to auto-save! Please export your work immediately.', {
              duration: 15000,
              action: {
                label: 'Export Canvas',
                onClick: () => handleSave()
              }
            });
          }
        } else {
          console.error('Auto-save failed:', error);
        }
      }
    };
    
    const autoSaveInterval = setInterval(performAutoSave, 30000); // Auto-save every 30 seconds

    const handleBeforeUnload = () => {
      try {
        autoSave();
      } catch (error) {
        // Silent failure on page unload - user is already leaving
        console.warn('Auto-save failed on page unload:', error);
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      clearInterval(autoSaveInterval);
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [autoSave, handleSave]);

  // Load auto-save on app start and perform storage maintenance
  useEffect(() => {
    // Wrap in setTimeout to avoid blocking initial render
    setTimeout(async () => {
      try {
        const didLoadAutoSave = await loadDurableSave();
        if (didLoadAutoSave) {
          toast.success('Previous work restored from auto-save');
        }
        
        // Cleanup storage on app start (async)
        setTimeout(() => {
          try {
            cleanupStorage();
            
            // Check storage usage and warn if high (non-blocking)
            const storageInfo = getStorageInfo();
            const usagePercent = (storageInfo.used / storageInfo.total) * 100;
            
            if (usagePercent > 80) {
              toast.warning(`Storage ${usagePercent.toFixed(0)}% full. Consider exporting your work.`, {
                duration: 5000,
                action: {
                  label: 'Export',
                  onClick: () => handleSave()
                }
              });
            }
          } catch (error) {
            console.warn('Storage cleanup/check failed:', error);
          }
        }, 1000);
      } catch (error) {
        console.warn('Auto-save load failed:', error);
      }
    }, 100);
  }, [loadDurableSave, cleanupStorage, getStorageInfo, handleSave]);

  // Initialize theme on app start
  useEffect(() => {
    setTheme(settings.theme);
  }, [settings.theme, setTheme]);

  // Refs for debounced sync and collision avoidance
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveEditRef = useRef(false);
  const lastBroadcastRef = useRef<string>('');
  const collaborationCleanupRef = useRef<(() => void) | null>(null);

  // Mark active edit for collision avoidance
  const setActiveEdit = useCallback((active: boolean) => {
    isActiveEditRef.current = active;
  }, []);

  // Get current canvas state for sync
  const { nodes, connections, groups } = useCanvasStore();

  // Debounced sync to collaboration canvas (300ms)
  const debouncedSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (!isCollaborating || isActiveEditRef.current) return;
      const snapshot = { nodes, connections, groups };
      const snapshotJson = JSON.stringify(snapshot);
      // Avoid broadcasting identical state
      if (snapshotJson !== lastBroadcastRef.current) {
        lastBroadcastRef.current = snapshotJson;
        updateCanvasData(snapshot);
      }
    }, 300);
  }, [isCollaborating, nodes, connections, groups, updateCanvasData]);

  // Replace snapshot equality check after remote updates
  const resetLastBroadcast = useCallback(() => {
    lastBroadcastRef.current = '';
  }, []);

  // Handle URL-based canvas sharing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const canvasId = params.get('canvas');
    if (canvasId) {
      joinCanvas(canvasId).then((result) => {
        if (result.success) {
          document.title = 'IdeaScape - Collaborating';
        }
      });
    }
    document.title = document.title || 'IdeaScape';
  }, [joinCanvas]);

  // Listen for real-time canvas updates from other users
  useEffect(() => {
    const handleCanvasUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.nodes && detail?.connections) {
        setNodes(detail.nodes);
        setConnections(detail.connections);
        if (detail.groups) setGroups(detail.groups);
        // Reset last broadcast so next local sync doesn't get deduped
        resetLastBroadcast();
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('collaboration:canvas_update', handleCanvasUpdate);
      return () => {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('collaboration:canvas_update', handleCanvasUpdate);
        }
      };
    }
  }, [setNodes, setConnections, setGroups, resetLastBroadcast]);

  // Sync local changes to collaborative canvas with debounce
  useEffect(() => {
    if (isCollaborating) {
      debouncedSync();
    }
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isCollaborating, nodes, connections, groups, debouncedSync]);

  // Clean up collaboration on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isCollaborating) {
        leaveCanvas();
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      // Run stored cleanup
      if (collaborationCleanupRef.current) {
        collaborationCleanupRef.current();
        collaborationCleanupRef.current = null;
      }
    };
  }, [isCollaborating, leaveCanvas]);

  // Listen for search dialog open events from context menu
  useEffect(() => {
    const handleOpenSearch = () => {
      setSearchOpen(true);
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('openNodeSearch', handleOpenSearch);
      return () => {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('openNodeSearch', handleOpenSearch);
        }
      };
    }
  }, []);

  // Listen for group dialog open events from keyboard shortcut
  useEffect(() => {
    const handleOpenGroupDialog = (event: CustomEvent) => {
      try {
        const nodeIds = event.detail?.nodeIds || [];
        if (nodeIds.length > 1) {
          // For multiple nodes, show the multi-select context menu
          // We'll dispatch a custom event to open the multi-select context menu
          const multiSelectEvent = new CustomEvent('showMultiSelectContextMenu', {
            detail: { nodeIds }
          });
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(multiSelectEvent);
          }
        } else {
          // For single/no nodes, show the regular group dialog
          openGroupDialog();
        }
      } catch (error) {
        console.warn('Error handling group dialog event:', error);
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('openGroupDialog', handleOpenGroupDialog);
      return () => {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('openGroupDialog', handleOpenGroupDialog);
        }
      };
    }
  }, [openGroupDialog]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        // Prevent shortcuts when typing in input fields
        const target = e.target as HTMLElement;
        const isInputField = target?.tagName === 'INPUT' || 
                            target?.tagName === 'TEXTAREA' || 
                            target?.contentEditable === 'true';

        if (isInputField) {
          // Only allow Delete key for selected nodes when not in input
          if (e.key === 'Delete') {
            if (selectedNodeIds.length > 1) {
              deleteNodes(selectedNodeIds);
            } else if (selectedNodeId) {
              deleteNode(selectedNodeId);
            }
          }
          return;
        }

        // Handle keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
          switch (e.key.toLowerCase()) {
            case 'k':
              e.preventDefault();
              setCommandPaletteOpen(true);
              break;
            case 'z':
              e.preventDefault();
              if (e.shiftKey) {
                redo(); // Ctrl+Shift+Z for redo
              } else {
                undo(); // Ctrl+Z for undo
              }
              break;
            case 'y':
              e.preventDefault();
              redo(); // Ctrl+Y for redo
              break;
            case 'e':
              e.preventDefault();
              handleSave(); // Ctrl+E for save
              break;
            case 'f':
              e.preventDefault();
              setSearchOpen(true); // Ctrl+F for quick search
              break;
            case 'g':
              e.preventDefault();
              if (isCommenter) { toast.error('Read-only: cannot create groups'); break; }
              if (selectedNodeIds.length > 0 || selectedNodeId) {
                groupSelectedNodes(); // Ctrl+G for group selected nodes
              } else {
                openGroupDialog(); // Ctrl+G for add group when nothing selected
              }
              break;
            case 'd':
              e.preventDefault();
              if (isCommenter) { toast.error('Read-only: cannot duplicate'); break; }
              handleDuplicateNode(); // Ctrl+D for duplicate node
              break;
          }
        } else {
          switch (e.key.toLowerCase()) {
            case 'n':
              e.preventDefault();
              if (isCommenter) { toast.error('Read-only: cannot add nodes'); break; }
              addNodeAtCenter(); // N for add node at center
              toast.success('New node added');
              break;
            case 'g':
              e.preventDefault();
              openGroupDialog(); // G for add group
              break;
            case 'delete':
              if (isCommenter) { toast.error('Read-only: cannot delete'); break; }
              if (selectedNodeIds.length > 1) {
                deleteNodes(selectedNodeIds);
                toast.success(`${selectedNodeIds.length} nodes deleted`);
              } else if (selectedNodeId) {
                deleteNode(selectedNodeId);
                toast.success('Node deleted');
              }
              break;
          }
        }
      } catch (error) {
        console.warn('Error in keyboard shortcut handler:', error);
      }
    };

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        if (typeof document !== 'undefined' && document.removeEventListener) {
          document.removeEventListener('keydown', handleKeyDown);
        }
      };
    }
  }, [deleteNode, deleteNodes, selectedNodeId, selectedNodeIds, undo, redo, handleSave, addNodeAtCenter, openGroupDialog, groupSelectedNodes, handleDuplicateNode, setSearchOpen, isCommenter]);

  // Listen for role changes — clear subscriptions if demoted to commenter
  useEffect(() => {
    if (!isCollaborating) return;
    if (isCommenter) {
      console.log('🔇 Role changed to commenter — clearing collaboration broadcasts');
      // Reset last broadcast so when/if re-promoted, sync resumes fresh
      resetLastBroadcast();
      toast.info('You now have read-only access');
    }
  }, [isCollaborating, isCommenter, resetLastBroadcast]);

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <div className="w-full h-screen relative overflow-hidden bg-gray-100 dark:bg-[#1a1d23]" ref={canvasContainerRef} data-infinite-canvas>
        <InfiniteCanvas />
        
        {/* Real-time collaboration user cursors */}
        <UserCursors containerRef={canvasContainerRef} />
        
        {/* Collaboration status indicator */}
        <CollaborationStatus />
        
        {/* Conditional rendering based on mobile detection */}
        {isMobile ? (
          <>
            <MobileToolbar />
            <MobileActionMenu />
          </>
        ) : (
          <>
            <Toolbar />
            <EditableTitle />
            <DesktopChatButton />
          </>
        )}
        
        {!isMobile && <HelpPanel />}
        <NodeSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenGroupDialog={openGroupDialog}
        />
        <AISuggestionsPanel />
        {/* <CollaborationDebug /> */}
        <Toaster position={isMobile ? "top-center" : "bottom-left"} />
      </div>
    </ErrorBoundary>
  );
}