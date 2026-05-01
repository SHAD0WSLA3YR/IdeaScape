import React from 'react';
import { motion } from 'motion/react';

type LoaderProps = { className?: string };

function DotmSquare2({ className }: LoaderProps) {
  return (
    <motion.div
      className={`h-3.5 w-3.5 rounded-[3px] border border-current ${className ?? ''}`}
      animate={{ rotate: [0, 90, 180, 270, 360] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
    />
  );
}

function DotmSquare12({ className }: LoaderProps) {
  return (
    <div className={`grid h-3.5 w-3.5 grid-cols-2 gap-[2px] ${className ?? ''}`}>
      {[0, 1, 2, 3].map((idx) => (
        <motion.span
          key={idx}
          className="rounded-[1px] bg-current"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: idx * 0.12, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function DotmSquare11({ className }: LoaderProps) {
  return (
    <motion.div
      className={`h-3.5 w-3.5 rounded-[3px] border border-current p-[2px] ${className ?? ''}`}
      animate={{ scale: [0.86, 1, 0.86] }}
      transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="h-full w-full rounded-[1px] bg-current/75" />
    </motion.div>
  );
}

function DotmSquare20({ className }: LoaderProps) {
  return (
    <div className={`relative h-3.5 w-3.5 ${className ?? ''}`}>
      <motion.span
        className="absolute left-0 top-0 h-1.5 w-1.5 rounded-[1px] bg-current"
        animate={{ x: [0, 8, 8, 0, 0], y: [0, 0, 8, 8, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        className="absolute left-2 top-2 h-1.5 w-1.5 rounded-[1px] bg-current"
        animate={{ x: [0, -8, -8, 0, 0], y: [0, 0, -8, -8, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

export const DOTM_LOADERS = [DotmSquare2, DotmSquare12, DotmSquare11, DotmSquare20] as const;

export function pickNextLoaderIndex(previousIndex: number | null): number {
  const total = DOTM_LOADERS.length;
  if (total <= 1) return 0;
  if (previousIndex === null || previousIndex < 0 || previousIndex >= total) {
    return Math.floor(Math.random() * total);
  }
  let next = previousIndex;
  while (next === previousIndex) {
    next = Math.floor(Math.random() * total);
  }
  return next;
}
