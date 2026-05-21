import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useCollaborationStore } from '../stores/collaborationStore';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Crown } from 'lucide-react';

interface ParticipantStackProps {
  /** Background colour of the container for the overlap cut-out effect. */
  containerBg?: string;
}

export function ParticipantStack({ containerBg = 'bg-white/90 dark:bg-gray-800/90' }: ParticipantStackProps) {
  const maxVisible = 3;
  const { isCollaborating, participants, currentUserId } = useCollaborationStore();

  if (!isCollaborating || participants.length === 0) return null;

  const others = participants.filter((p) => p.userId !== currentUserId);
  const me = participants.find((p) => p.userId === currentUserId);
  const display = [me, ...others].filter(Boolean) as typeof participants;

  // Show first 2 avatars, 3rd slot is always the overflow counter if >2 total
  const showAvatars = display.slice(0, 2);
  const overflow = display.length - 2;

  return (
    <div className="flex items-center -space-x-2">
      <AnimatePresence>
        {showAvatars.map((participant) => (
          <Tooltip key={participant.userId}>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.5, x: -8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.5, x: 8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative"
              >
                {/* Active glow ring */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    boxShadow: `0 0 0 0 ${participant.color}`,
                  }}
                  animate={{
                    boxShadow: [
                      `0 0 0 0 ${participant.color}80`,
                      `0 0 0 3px ${participant.color}40`,
                      `0 0 0 0 ${participant.color}80`,
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />

                {/* Avatar circle */}
                <div
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full text-2xs font-bold text-white ring-2 ${containerBg} ring-inset`}
                  style={{ backgroundColor: participant.color }}
                >
                  {participant.userName.charAt(0).toUpperCase()}
                </div>

                {/* Role indicator */}
                {participant.role === 'host' && (
                  <span className="absolute -bottom-1 -right-1">
                    <Crown className="w-2.5 h-2.5 text-yellow-400 drop-shadow-sm" />
                  </span>
                )}
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 text-xs">
              <span>{participant.userName}</span>
              {participant.userId === currentUserId && (
                <span className="text-muted-foreground">(you)</span>
              )}
              {participant.role === 'host' && (
                <Crown className="w-3 h-3 text-yellow-400" />
              )}
              {participant.role === 'commenter' && (
                <span className="rounded bg-blue-500/20 px-1 text-2xs text-blue-400">view</span>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </AnimatePresence>

      {/* Overflow count (always 3rd slot if >2) */}
      {overflow >= 1 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-2xs font-medium text-muted-foreground ring-2 ${containerBg} ring-inset bg-muted/50`}
            >
              +{overflow}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {overflow} more participant{overflow !== 1 ? 's' : ''}
          </TooltipContent>
        </Tooltip>
      )}

    </div>
  );
}
