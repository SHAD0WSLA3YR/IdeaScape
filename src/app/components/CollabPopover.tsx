import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useCollaborationStore, type CanvasRole, ROLE_PERMISSIONS } from '../stores/collaborationStore';
import {
  Users,
  Share,
  Copy,
  UserX,
  Crown,
  Eye,
  Edit3,
  LogOut,
  Check,
  ChevronDown,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from './ui/utils';

const ROLE_LABELS: Record<CanvasRole, string> = {
  host: 'Host',
  editor: 'Editor',
  commenter: 'View Only',
};

const ROLE_ICONS: Record<CanvasRole, React.ReactNode> = {
  host: <Crown className="w-3 h-3" />,
  editor: <Edit3 className="w-3 h-3" />,
  commenter: <Eye className="w-3 h-3" />,
};

const ROLE_COLORS: Record<CanvasRole, string> = {
  host: 'text-yellow-500',
  editor: 'text-blue-500',
  commenter: 'text-gray-400',
};

interface CollabPopoverProps {
  /** Canvas data snapshot to share with new joiners. */
  canvasData?: { nodes: any[]; connections: any[]; groups: any[] };
}

export function CollabPopover({ canvasData }: CollabPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openRoleMenuFor, setOpenRoleMenuFor] = useState<string | null>(null);

  const {
    isCollaborating,
    isConnected,
    currentCanvasId,
    currentUserId,
    participants,
    currentRole,
    collaborativeCanvas,
    createCollaborativeCanvas,
    leaveCanvas,
    getShareableUrl,
    setUserRole,
    updateCanvasData,
  } = useCollaborationStore();

  const shareUrl = currentCanvasId ? getShareableUrl(currentCanvasId) : '';
  const currentUser = participants.find((p) => p.userId === currentUserId);

  // ---------- copy share link ----------
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast.success('Share link copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  // ---------- create session ----------
  const [canvasName, setCanvasName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!canvasName.trim()) {
      toast.error('Enter a canvas name');
      return;
    }
    setIsCreating(true);
    const result = await createCollaborativeCanvas(canvasName.trim(), canvasData ?? { nodes: [], connections: [], groups: [] });
    setIsCreating(false);

    if (result.success) {
      toast.success('Collaboration session started!');
    } else {
      toast.error(result.error || 'Failed to create session');
    }
  };

  // ---------- leave ----------
  const handleLeave = async () => {
    await leaveCanvas();
    setOpen(false);
    toast.success('Left collaborative session');
  };

  // ---------- change role ----------
  const handleRoleChange = async (targetUserId: string, role: CanvasRole) => {
    const result = await setUserRole(targetUserId, role);
    if (result.success) {
      toast.success(`Permission updated`);
    } else {
      toast.error(result.error || 'Failed to update role');
    }
    setOpenRoleMenuFor(null);
  };

  const otherParticipants = participants.filter((p) => p.userId !== currentUserId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 relative"
          title="Collaboration"
        >
          <Users className="w-3 h-3" />
          {participants.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-1 text-2xs font-bold text-white leading-none">
              {participants.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {/* -------- Header -------- */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="w-4 h-4" />
              Collaboration
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  isConnected ? 'bg-green-500' : 'bg-gray-400',
                )}
              />
            </div>
            {isCollaborating && currentRole === 'host' && (
              <Badge variant="outline" className="text-2xs h-5 gap-1">
                <Crown className="w-2.5 h-2.5 text-yellow-500" />
                Host
              </Badge>
            )}
          </div>

          {isCollaborating ? (
            /* -------- Active session -------- */
            <div className="space-y-3 px-4 py-3">
              {/* Share link */}
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                  Share Link
                </label>
                <div className="flex gap-1">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="h-7 text-2xs font-mono select-all rounded-md"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={handleCopy}>
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </div>

              {/* Participant count summary */}
              <div className="text-2xs text-muted-foreground">
                {participants.length} participant{participants.length !== 1 ? 's' : ''} connected
              </div>

              {/* Participant list */}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {[currentUser, ...otherParticipants].filter(Boolean).map((p) => {
                  if (!p) return null;
                  const isMe = p.userId === currentUserId;
                  const canManage = currentRole === 'host' && !isMe;

                  return (
                    <div
                      key={p.userId}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors group"
                    >
                      {/* Color dot */}
                      <div
                        className="h-6 w-6 flex-shrink-0 rounded-full flex items-center justify-center text-2xs font-bold text-white"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.userName.charAt(0).toUpperCase()}
                      </div>

                      {/* Name + role */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-medium truncate">
                          {p.userName}
                          {isMe && <span className="text-muted-foreground font-normal">(you)</span>}
                        </div>
                        <div className={cn('flex items-center gap-1 text-2xs', ROLE_COLORS[p.role])}>
                          {ROLE_ICONS[p.role]}
                          {ROLE_LABELS[p.role]}
                        </div>
                      </div>

                      {/* Role changer (host only) */}
                      {canManage && (
                        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-2xs gap-0.5"
                            onClick={() => setOpenRoleMenuFor(openRoleMenuFor === p.userId ? null : p.userId)}
                          >
                            <Shield className="w-3 h-3" />
                            <ChevronDown className="w-2.5 h-2.5" />
                          </Button>

                          {openRoleMenuFor === p.userId && (
                            <div className="absolute right-0 top-8 z-50 w-32 rounded-lg border bg-popover p-1 shadow-lg">
                              {(['editor', 'commenter'] as CanvasRole[]).map((role) => (
                                <button
                                  key={role}
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left hover:bg-accent transition-colors',
                                    p.role === role && 'bg-accent font-medium',
                                  )}
                                  onClick={() => handleRoleChange(p.userId, role)}
                                >
                                  {ROLE_ICONS[role]}
                                  {ROLE_LABELS[role]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Leave button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLeave}
                className="w-full h-7 text-xs gap-1.5 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 dark:border-red-900 dark:hover:border-red-700"
              >
                <LogOut className="w-3 h-3" />
                Leave Session
              </Button>
            </div>
          ) : (
            /* -------- Create new session -------- */
            <div className="space-y-3 px-4 py-3">
              <div className="space-y-1.5">
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                  Canvas Name
                </label>
                <Input
                  value={canvasName}
                  onChange={(e) => setCanvasName(e.target.value)}
                  placeholder="My Shared Canvas"
                  className="h-8 text-sm rounded-md"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>

              <Button
                onClick={handleCreate}
                disabled={isCreating || !canvasName.trim()}
                className="w-full h-8 text-xs gap-1.5"
              >
                <Share className="w-3 h-3" />
                {isCreating ? 'Creating...' : 'Start Collaboration'}
              </Button>

              <div className="text-2xs text-muted-foreground space-y-1 leading-relaxed">
                <p>• Share the link to invite others</p>
                <p>• Host controls who can edit vs view only</p>
              </div>
            </div>
          )}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
