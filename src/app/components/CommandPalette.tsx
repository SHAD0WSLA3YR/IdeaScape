import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCanvasStore } from '../store/canvasStore';
import {
  Plus,
  FolderPlus,
  Search,
  Maximize2,
  Users,
  Undo2,
  Redo2,
  Folder,
  Globe,
  Sparkles,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from './ui/command';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSearch: () => void;
  onOpenGroupDialog: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenSearch,
  onOpenGroupDialog,
}: CommandPaletteProps) {
  const {
    nodes,
    groups,
    selectedNodeId,
    selectedNodeIds,
    addNodeAtCenter,
    addBrowserNodeAtCenter,
    groupSelectedNodes,
    fitToScreen,
    zoomToNodes,
    undo,
    redo,
    history,
    recordCommandUsage,
    summarizeCanvas,
    summarizeNodes,
  } = useCanvasStore();

  const [commandResetKey, setCommandResetKey] = useState(0);

  useEffect(() => {
    if (open) {
      setCommandResetKey((k) => k + 1);
    }
  }, [open]);

  const handleJumpToGroup = (groupId: string) => {
    const nodeIds = nodes.filter((node) => node.groupId === groupId).map((node) => node.id);
    if (nodeIds.length > 0) {
      zoomToNodes(nodeIds, { width: window.innerWidth, height: window.innerHeight });
    }
    window.dispatchEvent(new CustomEvent('highlightGroup', { detail: { groupId } }));
  };

  const hasSelection = selectedNodeIds.length > 0 || Boolean(selectedNodeId);

  const runWithUsage = (commandId: string, action: () => void | Promise<void>) => {
    recordCommandUsage(commandId);
    void Promise.resolve(action()).finally(() => onOpenChange(false));
  };

  const execCommand = (commandId: string) => {
    if (commandId.startsWith('jump-group:')) {
      const groupId = commandId.slice('jump-group:'.length);
      runWithUsage(commandId, () => handleJumpToGroup(groupId));
      return;
    }

    switch (commandId) {
      case 'create-node':
        runWithUsage(commandId, () => {
          addNodeAtCenter();
        });
        break;
      case 'create-browser-node':
        runWithUsage(commandId, () => {
          addBrowserNodeAtCenter();
        });
        break;
      case 'create-group':
        runWithUsage(commandId, () => onOpenGroupDialog());
        break;
      case 'search-nodes':
        runWithUsage(commandId, () => onOpenSearch());
        break;
      case 'fit-canvas':
        runWithUsage(commandId, () => {
          fitToScreen({ width: window.innerWidth, height: window.innerHeight });
        });
        break;
      case 'group-selected':
        if (!hasSelection) return;
        runWithUsage(commandId, () => groupSelectedNodes());
        break;
      case 'undo':
        if (history.past.length === 0) return;
        runWithUsage(commandId, () => undo());
        break;
      case 'redo':
        if (history.future.length === 0) return;
        runWithUsage(commandId, () => redo());
        break;
      case 'ai-summarize': {
        const ids =
          selectedNodeIds.length > 0
            ? selectedNodeIds
            : selectedNodeId
              ? [selectedNodeId]
              : [];
        if (ids.length === 0) {
          toast.info('Select a node (or multiple) to summarize.');
          onOpenChange(false);
          return;
        }
        runWithUsage(commandId, () => summarizeNodes(ids));
        break;
      }
      case 'ai-summarize-canvas':
        runWithUsage(commandId, () => summarizeCanvas());
        break;
      default:
        break;
    }
  };

  const hasGroupSelection = hasSelection;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Global Command Palette"
      commandResetKey={commandResetKey}
    >
      <CommandInput
        placeholder="Search commands, groups, tools…"
      />
      <CommandList>
        <CommandEmpty>No command found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="create-node"
            onSelect={() => execCommand('create-node')}
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>Create Node</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="create-browser-node"
            onSelect={() => execCommand('create-browser-node')}
          >
            <Globe className="mr-2 h-4 w-4" />
            <span>Create Browser Node</span>
          </CommandItem>
          <CommandItem
            value="create-group"
            onSelect={() => execCommand('create-group')}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            <span>Create Group</span>
            <CommandShortcut>G</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="ai-summarize-canvas"
            onSelect={() => execCommand('ai-summarize-canvas')}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>AI Summarize Canvas</span>
          </CommandItem>
          <CommandItem
            value="ai-summarize"
            onSelect={() => execCommand('ai-summarize')}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>AI Summarize Selection</span>
          </CommandItem>
          <CommandItem
            value="search-nodes"
            onSelect={() => execCommand('search-nodes')}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>Search Nodes</span>
            <CommandShortcut>Ctrl+F</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="fit-canvas"
            onSelect={() => execCommand('fit-canvas')}
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            <span>Fit Canvas To Screen</span>
          </CommandItem>
          <CommandItem
            value="group-selected"
            disabled={!hasGroupSelection}
            onSelect={() => execCommand('group-selected')}
          >
            <Users className="mr-2 h-4 w-4" />
            <span>Group Selected Nodes</span>
            <CommandShortcut>Ctrl+G</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="undo"
            disabled={history.past.length === 0}
            onSelect={() => execCommand('undo')}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            <span>Undo</span>
            <CommandShortcut>Ctrl+Z</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="redo"
            disabled={history.future.length === 0}
            onSelect={() => execCommand('redo')}
          >
            <Redo2 className="mr-2 h-4 w-4" />
            <span>Redo</span>
            <CommandShortcut>Ctrl+Y</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Groups">
          {groups.map((group) => (
            <CommandItem
              key={group.id}
              value={`jump ${group.name} group`}
              onSelect={() => execCommand(`jump-group:${group.id}`)}
            >
              <div
                className="mr-2 h-4 w-4 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center"
                style={{ backgroundColor: group.color }}
              >
                <Folder className="h-2.5 w-2.5 text-white opacity-80 mix-blend-overlay" />
              </div>
              <span>Jump To Group: {group.name}</span>
              <CommandShortcut>{group.nodes.length} nodes</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
