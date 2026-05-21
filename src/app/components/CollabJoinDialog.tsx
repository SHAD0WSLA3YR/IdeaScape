import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { useCollaborationStore } from '../stores/collaborationStore';
import { useCanvasStore } from '../store/canvasStore';
import { LogIn, Sparkles } from 'lucide-react';

interface CollabJoinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string;
}

const GUEST_NAMES = [
  'Wanderer', 'Dreamer', 'Voyager', 'Seeker',
  'Maker', 'Thinker', 'Drifter', 'Explorer',
];

export function CollabJoinDialog({ open, onOpenChange, canvasId }: CollabJoinDialogProps) {
  const [name, setName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { joinCanvas } = useCollaborationStore();

  // Pre-fill from profile name or localStorage
  useEffect(() => {
    if (!open) return;
    const profileName = useCanvasStore.getState().settings.profile.username;
    if (profileName?.trim()) {
      setName(profileName.trim());
      return;
    }
    const saved = localStorage.getItem('ideascape_user_name');
    if (saved) setName(saved);
  }, [open]);

  const handleJoin = async () => {
    const displayName = name.trim() || GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
    setIsJoining(true);
    try {
      // Save for next time
      localStorage.setItem('ideascape_user_name', displayName);
      const result = await joinCanvas(canvasId, displayName);
      if (result.success) {
        onOpenChange(false);
        toast.success(`Joined as ${displayName}`);
      } else {
        toast.error(result.error || 'Failed to join canvas');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-blue-500" />
            Join Collaborative Canvas
          </DialogTitle>
          <DialogDescription>
            Choose a display name so others can see you on the canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Your Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name (e.g. Alex, Design Team, shdwSlayer)..."
              className="rounded-lg border-border/60 bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoin();
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Pick something unique so people know it's you — leave blank for a random name
            </p>
          </div>

          <Button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full gap-2"
          >
            <LogIn className="w-4 h-4" />
            {isJoining ? 'Joining...' : 'Join Canvas'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
