import React, { useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Save, FolderOpen, Plus, Palette, Undo, Redo, Upload, Settings, Search, Edit2, Check, X, Zap, Users, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { GroupDialog } from './GroupDialog';
import { SettingsPanel } from './SettingsPanel';
import { NodeSearchDialog } from './NodeSearchDialog';
import { CollaborationPanel } from './CollaborationPanel';
import { useCollaborationStore } from '../stores/collaborationStore';

import { toast } from 'sonner';
import { toJpeg, toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export function Toolbar() {
  const collaborationEnabled = (import.meta as any)?.env?.VITE_ENABLE_COLLABORATION === 'true';
  const { userRole } = useCollaborationStore();
  const isCommenter = userRole === 'commenter';
  const {
    canvasName,
    groups,
    nodes,
    connections,
    selectedNodeId,
    selectedNodeIds,
    exportCanvas,
    importCanvas,
    newCanvas,
    updateGroup,
    deleteGroup,
    undo,
    redo,
    history,
    autoOrganizeNodes,
    setHighlightedGroup
  } = useCanvasStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [saveAsName, setSaveAsName] = useState(canvasName);
  const [exportFormat, setExportFormat] = useState<'json' | 'png' | 'jpeg' | 'pdf'>('json');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [groupsCollapsed, setGroupsCollapsed] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen for close all dialogs event
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      setSettingsOpen(false);
      setSaveAsOpen(false);
      setCollaborationOpen(false);
      setSearchOpen(false);
    };

    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    return () => window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
  }, []);

  const handleExport = () => {
    setSaveAsName(canvasName); // Pre-fill with current canvas name
    setSaveAsOpen(true);
  };

  const handleSaveAsConfirm = async () => {
    const filename = saveAsName.replace(/[^a-zA-Z0-9]/g, '_');
    
    if (exportFormat === 'json') {
      const data = exportCanvas();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('JSON data backup saved to Downloads folder!', {
        description: `File: ${filename}.json`
      });
    } else {
      await handleCanvasExport(filename, exportFormat);
    }
    
    setSaveAsOpen(false);
  };

  const handleCanvasExport = async (filename: string, format: 'png' | 'jpeg' | 'pdf') => {
    const hiddenElements: Array<{ element: HTMLElement; visibility: string }> = [];
    let exportLegend: HTMLDivElement | null = null;
    let originalTransform: { x: number; y: number; scale: number } | null = null;
    const TRANSPARENT_PIXEL =
      'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]);
    };

    try {
      toast.info(`Preparing ${format.toUpperCase()} export...`, {
        duration: 2000,
        description: 'Fitting canvas and capturing clean screenshot...',
      });

      const canvasContainer = document.querySelector('[data-infinite-canvas]') as HTMLElement;
      if (!canvasContainer) {
        throw new Error('Canvas container not found');
      }

      const { transform, fitToScreen, setTransform } = useCanvasStore.getState();
      originalTransform = { ...transform };

      const selectorsToHide = [
        '[data-sonner-toaster]',
        '.absolute.bottom-4.left-4',
        '.fixed.bottom-6.right-6',
        '.fixed.top-4.left-4',
      ];

      selectorsToHide.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          const element = node as HTMLElement;
          if (element !== canvasContainer && !canvasContainer.contains(element)) {
            hiddenElements.push({ element, visibility: element.style.visibility });
            element.style.visibility = 'hidden';
          }
        });
      });

      const grouped = groups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
        count: nodes.filter((node) => node.groupId === group.id).length,
      }));

      exportLegend = document.createElement('div');
      exportLegend.style.position = 'absolute';
      exportLegend.style.left = '16px';
      exportLegend.style.bottom = '16px';
      exportLegend.style.zIndex = '20';
      exportLegend.style.background = 'rgba(255,255,255,0.9)';
      exportLegend.style.backdropFilter = 'blur(8px)';
      exportLegend.style.border = '1px solid rgba(0,0,0,0.08)';
      exportLegend.style.borderRadius = '10px';
      exportLegend.style.padding = '10px 12px';
      exportLegend.style.maxWidth = '320px';
      exportLegend.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      exportLegend.style.fontSize = '12px';
      exportLegend.style.lineHeight = '1.4';
      exportLegend.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px; color:#111827;">${canvasName || 'Untitled Canvas'}</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${grouped
            .map(
              (group) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <div style="display:flex; align-items:center; gap:8px; color:#1f2937;">
                <span style="width:8px; height:8px; border-radius:999px; background:${group.color}; display:inline-block;"></span>
                <span>${group.name}</span>
              </div>
              <span style="color:#6b7280;">${group.count} node${group.count === 1 ? '' : 's'}</span>
            </div>
          `
            )
            .join('')}
        </div>
      `;
      canvasContainer.appendChild(exportLegend);

      const canvasRect = canvasContainer.getBoundingClientRect();
      fitToScreen({ width: canvasRect.width, height: canvasRect.height });
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Build an offscreen clone with pre-flight normalized styles.
      const exportClone = canvasContainer.cloneNode(true) as HTMLElement;
      exportClone.style.position = 'fixed';
      exportClone.style.left = '-100000px';
      exportClone.style.top = '0';
      exportClone.style.zIndex = '-1';
      exportClone.style.pointerEvents = 'none';
      document.body.appendChild(exportClone);

      try {
        // Hide in-canvas chrome directly in the clone (toolbar, zoom controls, mobile controls).
        const cloneSelectorsToHide = [
          '.absolute.top-4.right-4',
          '.absolute.top-4.left-4.flex.flex-col.gap-2',
          '.absolute.top-4.left-4.flex.gap-2',
        ];
        cloneSelectorsToHide.forEach((selector) => {
          exportClone.querySelectorAll(selector).forEach((element) => {
            (element as HTMLElement).style.display = 'none';
          });
        });

        const normalizeCloneTree = (source: HTMLElement, clone: HTMLElement) => {
          const computed = window.getComputedStyle(source);
          clone.className = '';
          clone.removeAttribute('class');
          clone.removeAttribute('style');

          // Re-apply full computed styles so layout geometry is preserved after class stripping.
          for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            const value = computed.getPropertyValue(prop);
            if (value) {
              clone.style.setProperty(prop, value);
            }
          }

          // Explicitly set resolved color values (pre-flight color normalization).
          clone.style.color = computed.color;
          clone.style.backgroundColor = computed.backgroundColor;
          clone.style.borderColor = computed.borderColor;

          const sourceChildren = Array.from(source.children);
          const cloneChildren = Array.from(clone.children);
          const childCount = Math.min(sourceChildren.length, cloneChildren.length);
          for (let i = 0; i < childCount; i++) {
            const sourceChild = sourceChildren[i];
            const cloneChild = cloneChildren[i];
            if (sourceChild instanceof HTMLElement && cloneChild instanceof HTMLElement) {
              normalizeCloneTree(sourceChild, cloneChild);
            }
          }
        };
        normalizeCloneTree(canvasContainer, exportClone);

        if (format === 'png' || format === 'jpeg') {
          exportClone.querySelectorAll('[data-node-type="browser"]').forEach((element) => {
            (element as HTMLElement).style.display = 'none';
          });
        }

        // Neutralize image URLs known to fail offline/cors and set resilient fallback.
        exportClone.querySelectorAll('img').forEach((imgNode) => {
          const img = imgNode as HTMLImageElement;
          const src = img.getAttribute('src') || '';
          if (src.includes('google.com') || src.includes('supabase.co')) {
            img.setAttribute('src', TRANSPARENT_PIXEL);
          }
          img.onerror = () => {
            img.src = TRANSPARENT_PIXEL;
          };
        });

        const commonImageOptions = {
          cacheBust: true,
          includeQueryParams: false,
          pixelRatio: 2,
          backgroundColor: '#f3f4f6',
        } as const;

        const imageDataUrl =
          format === 'jpeg'
            ? await withTimeout(
                toJpeg(exportClone, {
                ...commonImageOptions,
                quality: 0.95,
              }),
                12000,
                'JPEG export'
              )
            : await withTimeout(
                toPng(exportClone, commonImageOptions),
                12000,
                'PNG export'
              );

        if (format === 'pdf') {
          const pdfImageData = await withTimeout(
            toPng(exportClone, commonImageOptions),
            12000,
            'PDF rasterization'
          );
          const img = new Image();
          img.src = pdfImageData;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to prepare image for PDF export'));
          });
          const imgWidth = img.width;
          const imgHeight = img.height;
          const pdfWidth = 210;
          const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
          const pdf = new jsPDF({
            orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [pdfWidth, Math.min(pdfHeight, 297)],
          });

          pdf.addImage(pdfImageData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, 297));
          pdf.save(`${filename}.pdf`);
          toast.success('PDF export completed', { description: `${filename}.pdf` });
          return;
        }

        const a = document.createElement('a');
        a.href = imageDataUrl;
        a.download = `${filename}.${format}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`${format.toUpperCase()} export completed`, {
          description: `${filename}.${format}`,
        });
      } finally {
        document.body.removeChild(exportClone);
      }
    } catch (error) {
      console.error('Canvas export failed:', error);
      toast.error(`Visual export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSaveAsOpen(false);
    } finally {
      if (originalTransform) {
        useCanvasStore.getState().setTransform(originalTransform);
      }

      if (exportLegend?.parentNode) {
        exportLegend.parentNode.removeChild(exportLegend);
      }

      hiddenElements.forEach(({ element, visibility }) => {
        element.style.visibility = visibility;
      });
    }
  };

  const handleImport = () => {
    if (importData.trim()) {
      importCanvas(importData);
      setImportData('');
    }
  };

  const handleFileImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          // Validate it's valid JSON
          JSON.parse(content);
          importCanvas(content);
          toast.success(`Canvas imported from ${file.name}`);
        } catch (error) {
          toast.error('Invalid JSON file. Please select a valid canvas export file.');
        }
      };
      reader.readAsText(file);
    } else {
      toast.error('Please select a JSON file.');
    }
    
    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  const handleEditGroup = (group: any) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const handleGroupHighlight = (groupId: string) => {
    // Trigger group highlight effect
    const event = new CustomEvent('highlightGroup', { detail: { groupId } });
    window.dispatchEvent(event);
  };

  const handleSaveGroupName = (groupId: string) => {
    if (editingGroupName.trim()) {
      updateGroup(groupId, { name: editingGroupName.trim() });
      toast.success('Group name updated');
    }
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const handleCancelEditGroup = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const handleDeleteGroup = (groupId: string) => {
    setDeletingGroupId(groupId);
    // Highlight the group while showing delete confirmation
    setHighlightedGroup(groupId);
  };

  const confirmDeleteGroup = () => {
    if (deletingGroupId) {
      deleteGroup(deletingGroupId);
      toast.success('Group deleted');
      setDeletingGroupId(null);
      setEditingGroupId(null);
      setEditingGroupName('');
      setHighlightedGroup(null);
    }
  };

  const cancelDeleteGroup = () => {
    setDeletingGroupId(null);
    setHighlightedGroup(null);
  };





  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-4 shadow-lg">
      {/* Canvas controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            onClick={undo}
            disabled={history.past.length === 0}
            size="sm"
            variant="outline"
          >
            <Undo className="w-4 h-4" />
          </Button>
          
          <Button
            onClick={redo}
            disabled={history.future.length === 0}
            size="sm"
            variant="outline"
          >
            <Redo className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleExport} size="sm" variant="outline">
            <Save className="w-4 h-4 mr-1" />
            Save
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <FolderOpen className="w-4 h-4 mr-1" />
                Load
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Load Canvas</DialogTitle>
                <DialogDescription>
                  Import a canvas by pasting JSON data or selecting a file from your computer.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder="Paste JSON data here..."
                  className="w-full h-32 p-2 border rounded resize-none"
                />
                <div className="flex gap-2">
                  <Button onClick={handleImport} disabled={!importData.trim()}>
                    Import JSON
                  </Button>
                  <Button onClick={handleFileImport} variant="outline">
                    <Upload className="w-4 h-4 mr-1" />
                    From Computer
                  </Button>
                  <Button onClick={newCanvas} variant="outline" disabled={isCommenter} title={isCommenter ? 'Read-only: cannot create new canvas' : 'Create new canvas'}>
                    New Canvas
                  </Button>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Groups section */}
      <div className="border-t pt-3">
        {/* Collapsible Groups Section */}
        <Collapsible open={!groupsCollapsed} onOpenChange={(open) => setGroupsCollapsed(!open)}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between mb-2 select-none hover:bg-accent rounded px-1 -mx-1 cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <span className="text-sm font-medium">Groups</span>
              </div>
              {groupsCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="space-y-2 max-h-32 overflow-y-auto mb-2">
              {groups.map(group => (
                <div key={group.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  {editingGroupId === group.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        className="text-sm h-6 px-1 flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveGroupName(group.id);
                          if (e.key === 'Escape') handleCancelEditGroup();
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleSaveGroupName(group.id)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        onClick={() => handleDeleteGroup(group.id)}
                        title="Delete group"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span 
                        className="text-sm truncate flex-1 cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => handleGroupHighlight(group.id)}
                        title="Click to highlight group nodes"
                      >
                        {group.name}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                        onClick={() => handleEditGroup(group)}
                        title="Edit group name"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Badge variant="secondary" className="text-xs">
                        {group.nodes.length}
                      </Badge>
                    </>
                  )}
                </div>
              ))}
            </div>

            <GroupDialog
              trigger={
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="w-full"
                  data-group-dialog-trigger
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Group
                </Button>
              }
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Delete Group Confirmation Dialog */}
      <AlertDialog open={deletingGroupId !== null} onOpenChange={(open) => !open && cancelDeleteGroup()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingGroupId && (() => {
                const group = groups.find(g => g.id === deletingGroupId);
                return group ? (
                  <>This group contains <strong>{group.nodes.length} node{group.nodes.length !== 1 ? 's' : ''}</strong>. Are you sure you want to delete this group?</>
                ) : null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteGroup}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteGroup}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stats and Settings */}
      <div className="border-t pt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[rgba(125,123,155,1)]">{nodes.length} nodes</span>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
          <Button
            onClick={() => setSearchOpen(true)}
            size="sm"
            variant="outline"
            className="h-6 px-2 py-1"
            title="Search Nodes"
          >
            <Search className="w-3 h-3 mr-1" />
            <span className="text-xs">Search</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {selectedNodeIds.length > 0 && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
              {selectedNodeIds.length} selected
            </span>
          )}
          <Button
            onClick={() => {
              if (collaborationEnabled) {
                setCollaborationOpen(true);
              } else {
                toast.info('Collaboration is disabled for this private build.');
              }
            }}
            size="sm"
            variant="ghost"
            className={`h-6 w-6 p-0 ${collaborationEnabled ? '' : 'opacity-40'}`}
            title={collaborationEnabled ? 'Real-time Collaboration' : 'Collaboration disabled for private launch'}
          >
            <Users className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setSettingsOpen(true)}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Settings"
          >
            <Settings className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Save As Dialog */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save As</DialogTitle>
            <DialogDescription>
              Choose a name and format for your canvas export. PNG/JPEG formats create clean screenshots by hiding UI elements and fitting content to screen.
              <br /><br />
              <strong>Download troubleshooting:</strong>
              <br />• Check your Downloads folder (files save automatically)
              <br />• Enable downloads in browser settings if blocked
              <br />• If popup blockers interfere, we'll open images in new tabs for manual saving
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="saveAsName">Canvas Name</Label>
              <Input
                id="saveAsName"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="Enter canvas name..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="exportFormat">Export Format</Label>
              <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON (Data Backup)</SelectItem>
                  <SelectItem value="png">PNG (High Quality Image)</SelectItem>
                  <SelectItem value="jpeg">JPEG (Compressed Image)</SelectItem>
                  <SelectItem value="pdf">PDF (Document)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveAsConfirm}
                disabled={!saveAsName.trim()}
              >
                Export
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Node Search Dialog */}
      <NodeSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden">
          <SettingsPanel />
        </DialogContent>
      </Dialog>

      {/* Collaboration Panel */}
      {collaborationEnabled && (
        <CollaborationPanel
          isOpen={collaborationOpen}
          onClose={() => setCollaborationOpen(false)}
          canvasData={{ nodes, connections, groups }}
        />
      )}

    </div>
  );
}