import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ArrowUp, ChevronDown } from 'lucide-react';
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

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      {showDropdown ? (
        <div
          id={`${composerId}-canvas-suggestions`}
          className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-[min(40vh,260px)] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          role="listbox"
          aria-label={showSlash ? 'Slash commands' : 'Questions you might ask'}
        >
          {showSlash ? (
            <div className="p-1">
              {filteredSlash.map((cmd, i) => (
                <button
                  key={`${cmd.fill}-${cmd.description}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === highlightIndex}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-2 text-left text-xs',
                    i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/80',
                  )}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    applyInsert(cmd.fill);
                  }}
                >
                  <span className="font-mono text-[11px] font-medium">{cmd.fill.trim()}</span>
                  <span className="text-muted-foreground">{cmd.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-1">
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                From your canvas
              </div>
              {nodeSuggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={i === highlightIndex}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-2 text-left text-xs',
                    i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/80',
                  )}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    applyInsert(s.insertText);
                    setCanvasMenuOpen(false);
                  }}
                >
                  <span className="line-clamp-3">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background p-2 shadow-sm">
        {!showSlash ? (
          <button
            type="button"
            className="mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
            onClick={() => setCanvasMenuOpen((prev) => !prev)}
            aria-expanded={canvasMenuOpen}
            aria-controls={`${composerId}-canvas-suggestions`}
          >
            <span>From your canvas</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', canvasMenuOpen ? 'rotate-180' : '')} />
          </button>
        ) : null}

        <div className="flex items-end gap-2">
          <Textarea
            ref={taRef}
            id={composerId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            disabled={disabled}
            rows={2}
            className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={!value.trim() || isLoading || disabled}
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0 border-black bg-black text-white shadow-sm hover:bg-black/90 hover:text-white"
            title="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
