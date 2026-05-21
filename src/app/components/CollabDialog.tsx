import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useCollaborationStore, type CanvasRole } from '../stores/collaborationStore';
import { useCanvasStore } from '../store/canvasStore';
import {
  Users,
  Share,
  Copy,
  Crown,
  Eye,
  Edit3,
  LogOut,
  Check,
  ChevronDown,
  Shield,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from './ui/utils';

const ROLE_LABELS: Record<CanvasRole, string> = {
  host: 'Host',
  editor: 'Editor',
  commenter: 'View Only',
};

const ROLE_ICONS: Record<CanvasRole, React.ReactNode> = {
  host: <Crown className="w-3.5 h-3.5" />,
  editor: <Edit3 className="w-3.5 h-3.5" />,
  commenter: <Eye className="w-3.5 h-3.5" />,
};

interface CollabDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasData?: { nodes: any[]; connections: any[]; groups: any[] };
}

export function CollabDialog({ open, onOpenChange, canvasData }: CollabDialogProps) {
  const [copied, setCopied] = useState(false);
  const [openRoleMenuFor, setOpenRoleMenuFor] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const storeCanvasName = useCanvasStore((s) => s.canvasName);
  const profileName = useCanvasStore((s) => s.settings.profile.username);
  const [sessionName, setSessionName] = useState('');

  const {
    isConnected,
    isCollaborating,
    currentCanvasId,
    currentUserId,
    participants,
    currentRole,
    createCollaborativeCanvas,
    leaveCanvas,
    getShareableUrl,
    setUserRole,
  } = useCollaborationStore();

  // Pre-fill session name from store canvas name when dialog opens
  useEffect(() => {
    if (open && !isCollaborating) {
      setSessionName(storeCanvasName || 'Untitled Canvas');
    }
  }, [open, storeCanvasName, isCollaborating]);

  const shareUrl = currentCanvasId ? getShareableUrl(currentCanvasId) : '';
  const currentUser = participants.find((p) => p.userId === currentUserId);
  const otherParticipants = participants.filter((p) => p.userId !== currentUserId);

  // ---------- copy share link ----------
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast.success('Share link copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  // ---------- create session ----------
  const handleCreate = async () => {
    setIsCreating(true);
    // Resolve display name from the canvas profile first
    if (profileName?.trim()) {
      useCollaborationStore.setState({ currentUserName: profileName.trim() });
    }
    const result = await createCollaborativeCanvas(
      sessionName.trim() || 'Untitled Canvas',
      canvasData ?? { nodes: [], connections: [], groups: [] },
    );
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
    onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" style={{ zIndex: 50 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Collaboration
            <div className={cn('h-2 w-2 rounded-full ml-1', isConnected ? 'bg-green-500' : 'bg-gray-400')} />
            {isCollaborating && currentRole === 'host' && (
              <Badge variant="outline" className="ml-1 gap-1 text-xs">
                <Crown className="w-3 h-3 text-yellow-500" />
                Host
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isCollaborating
              ? 'Share the link to invite others to your canvas.'
              : 'Start a collaboration session to work together in real-time.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5">
          {isCollaborating ? (
            <>
              {/* ---------- Active session content ---------- */}

              {/* Share Link */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5" />
                  Share Link
                </label>
                <div className="flex gap-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="flex-1 text-sm font-mono select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Participants */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Participants ({participants.length})
                  </label>
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Wifi className="w-3 h-3" /> Live
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <WifiOff className="w-3 h-3" /> Offline
                    </span>
                  )}
                </div>

                <ScrollArea className="max-h-56">
                  <div className="space-y-1 pr-3">
                    {[currentUser, ...otherParticipants].filter(Boolean).map((p) => {
                      if (!p) return null;
                      const isMe = p.userId === currentUserId;
                      const canManage = currentRole === 'host' && !isMe;

                      return (
                        <div
                          key={p.userId}
                          className="flex items-center gap-3 rounded-lg border border-border/50 p-2.5 hover:bg-muted/30 transition-colors group"
                        >
                          <div
                            className="h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
                            style={{ backgroundColor: p.color }}
                          >
                            {p.userName.charAt(0).toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                              {p.userName}
                              {isMe && <span className="text-muted-foreground font-normal text-xs">(you)</span>}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {ROLE_ICONS[p.role]}
                              <span className={cn(p.role === 'host' && 'text-yellow-500', p.role === 'commenter' && 'text-gray-400')}>
                                {ROLE_LABELS[p.role]}
                              </span>
                            </div>
                          </div>

                          {canManage && (
                            <div className="relative">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setOpenRoleMenuFor(openRoleMenuFor === p.userId ? null : p.userId)}
                              >
                                <Shield className="w-3.5 h-3.5" />
                                <ChevronDown className="w-3 h-3" />
                              </Button>

                              {openRoleMenuFor === p.userId && (
                                <div className="absolute right-0 top-8 z-50 w-36 rounded-lg border bg-popover p-1 shadow-lg">
                                  {(['editor', 'commenter'] as CanvasRole[]).map((role) => (
                                    <button
                                      key={role}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-left hover:bg-accent transition-colors',
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
                </ScrollArea>
              </div>

              {/* Leave */}
              <Button
                variant="outline"
                onClick={handleLeave}
                className="w-full gap-2 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 dark:border-red-900 dark:hover:border-red-700"
              >
                <LogOut className="w-4 h-4" />
                Leave Session
              </Button>
            </>
          ) : (
            <>
              {/* ---------- Create session ---------- */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5" />
                  Session Name
                </label>
                <Input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Design Review, Brainstorm Session, Sprint Planning..."
                  className="w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <p className="text-xs text-muted-foreground">
                  Give your session a unique name so collaborators know what it's about
                </p>
              </div>

              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>Starting a session will:</p>
                <ul className="space-y-1.5 ml-4 list-disc">
                  <li>Make your current canvas available to others via a share link</li>
                  <li>Let you control who can edit vs view only</li>
                  <li>Sync changes in real-time</li>
                </ul>
              </div>

              <Button
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full gap-2"
                size="lg"
              >
                <Share className="w-4 h-4" />
                {isCreating ? 'Starting...' : 'Start Collaboration Session'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
