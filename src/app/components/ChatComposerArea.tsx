import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ArrowUp, ChevronDown, Send } from 'lucide-react';
import { cn } from './ui/utils';
import type { NodeChatSuggestion } from './chatNodeSuggestions';

export type SlashCommandItem = {
  fill: string;
  description: string;
};

type DropdownEntry =
  | { type: 'canvas'; key: string; suggestion: NodeChatSuggestion }
  | { type: 'slash'; key: string; cmd: SlashCommandItem };

type ChatComposerAreaProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  composerId: string;
  nodeSuggestions: NodeChatSuggestion[];
  slashCommands: SlashCommandItem[];
  isLoading: boolean;
};

export function ChatComposerArea({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'Ask anything',
  composerId,
  nodeSuggestions,
  slashCommands,
  isLoading,
}: ChatComposerAreaProps) {
  const [focused, setFocused] = useState(false);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const MIN_TEXTAREA_HEIGHT = 44;
  const MAX_TEXTAREA_HEIGHT = MIN_TEXTAREA_HEIGHT * 2;

  const showSlash = value.startsWith('/');
  const showCanvasSuggestions = canvasMenuOpen;

  const filteredSlash = useMemo(() => {
    if (!showSlash) return [];
    const tail = value.slice(1).toLowerCase();
    return slashCommands.filter((c) => {
      const cmd = (c.fill.split(/\s+/)[0] ?? '').toLowerCase();
      if (!tail) return true;
      const afterSlash = cmd.startsWith('/') ? cmd.slice(1) : cmd;
      return (
        cmd.startsWith(`/${tail}`) ||
        afterSlash.startsWith(tail) ||
        c.description.toLowerCase().includes(tail)
      );
    });
  }, [showSlash, value, slashCommands]);

  const dropdownItems: DropdownEntry[] = useMemo(() => {
    if (showSlash) {
      return filteredSlash.map((cmd, i) => ({ type: 'slash' as const, key: `slash-${i}-${cmd.fill}`, cmd }));
    }
    if (showCanvasSuggestions && nodeSuggestions.length > 0) {
      return nodeSuggestions.map((s) => ({ type: 'canvas' as const, key: s.id, suggestion: s }));
    }
    return [];
  }, [showSlash, filteredSlash, showCanvasSuggestions, nodeSuggestions]);

  const showDropdown = dropdownItems.length > 0 && !disabled && (showSlash ? focused : canvasMenuOpen);

  useEffect(() => {
    setHighlightIndex(0);
  }, [showSlash, nodeSuggestions, filteredSlash, showCanvasSuggestions]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setFocused(false);
        setCanvasMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const applyInsert = useCallback(
    (text: string) => {
      onChange(text);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        const len = text.length;
        taRef.current?.setSelectionRange(len, len);
      });
    },
    [onChange],
  );

  const resizeTextarea = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
    const next = Math.max(MIN_TEXTAREA_HEIGHT, Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const applyHighlighted = useCallback(() => {
    const item = dropdownItems[highlightIndex];
    if (!item) return;
    if (item.type === 'canvas') applyInsert(item.suggestion.insertText);
    else applyInsert(item.cmd.fill);
    if (item.type === 'canvas') {
      setCanvasMenuOpen(false);
    }
  }, [dropdownItems, highlightIndex, applyInsert]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % dropdownItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + dropdownItems.length) % dropdownItems.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setFocused(false);
        setCanvasMenuOpen(false);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        applyHighlighted();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const renderDropdownContent = () => {
    if (!showDropdown) return null;

    if (showSlash) {
      return (
      <div className="bg-popover rounded-xl border border-border shadow-xl p-1">
          {filteredSlash.map((cmd, i) => (
            <button
              key={`${cmd.fill}-${cmd.description}-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlightIndex}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-2 text-left text-sm',
                i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/80',
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(ev) => {
                ev.preventDefault();
                applyInsert(cmd.fill);
              }}
            >
              <span className="font-mono text-sm font-medium">{cmd.fill.trim()}</span>
              <span className="text-sm text-foreground/90 dark:text-foreground/95">{cmd.description}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="bg-popover rounded-xl border border-border shadow-xl p-1">
        {nodeSuggestions.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={i === highlightIndex}
            className={cn(
              'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-2 text-left text-sm',
              i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/80',
            )}
            onMouseEnter={() => setHighlightIndex(i)}
            onMouseDown={(ev) => {
              ev.preventDefault();
              applyInsert(s.insertText);
              setCanvasMenuOpen(false);
            }}
          >
             <span className="line-clamp-3 text-sm">{s.label}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      {renderDropdownContent()}

      <div className="rounded-lg bg-background shadow-sm">
        {!showSlash ? (
          <button
            type="button"
            className="mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium uppercase tracking-wide text-foreground/90 hover:bg-muted/60 dark:text-foreground/95"
            onClick={() => setCanvasMenuOpen((prev) => !prev)}
            aria-expanded={canvasMenuOpen}
          >
            <span>From your canvas</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', canvasMenuOpen ? 'rotate-180' : '')} />
          </button>
        ) : null}

        <div className="flex items-center gap-2">
          <div className="bg-muted/30 border border-border rounded-lg flex items-center pr-2 flex-1">
            <Textarea
              ref={taRef}
              id={composerId}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setCanvasMenuOpen(false)}
              placeholder="type / for skills..."
              disabled={disabled}
              rows={1}
              className="flex-1 bg-transparent border-none focus:ring-0 focus-visible:ring-0 text-foreground py-3 px-4 resize-none min-h-[48px] max-h-32 text-[14px] placeholder:text-muted-foreground leading-relaxed"
              onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim() || isLoading || disabled}
              className={`p-3 rounded-full transition-all ${
                value.trim()
                  ? 'bg-black text-white shadow-lg shadow-black/20'
                  : 'text-gray-500 hover:bg-white/5 cursor-not-allowed'
              }`}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
