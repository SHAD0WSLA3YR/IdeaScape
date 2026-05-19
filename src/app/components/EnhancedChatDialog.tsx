import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Terminal, X, ChevronUp, ExternalLink, Minimize2 } from 'lucide-react';
import Draggable from 'react-draggable';
import { enhancedAiService } from '../services/enhancedAiService';
import { aiService, type NodeData } from '../services/aiService';
import { toast } from 'sonner';
import { pickFlavorStatus, shouldShowActiveStatus } from './ChatDialogStatus';
import { cn } from './ui/utils';
import { ChatComposerArea, type SlashCommandItem } from './ChatComposerArea';
import { buildAiQuestionSuggestions, buildNodeChatSuggestions, type NodeChatSuggestion } from './chatNodeSuggestions';
import { DOTM_LOADERS, pickNextLoaderIndex } from './ui/dotm-loaders';
import { useCanvasStore, loadFloatingPosition, saveFloatingPosition, loadFloatingSize, saveFloatingSize, type Node } from '../store/canvasStore';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  isToolResult?: boolean;
  toolName?: string;
}

interface EnhancedChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: 'sidebar' | 'floating';
}

type InlineToken = {
  text: string;
  kind: 'text' | 'bold' | 'italic' | 'code';
};

function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;
  const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

  for (const match of text.matchAll(inlinePattern)) {
    const start = match.index ?? 0;
    const fullMatch = match[0];

    if (start > index) {
      tokens.push({ text: text.slice(index, start), kind: 'text' });
    }

    if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      tokens.push({ text: fullMatch.slice(2, -2), kind: 'bold' });
    } else if (fullMatch.startsWith('*') && fullMatch.endsWith('*')) {
      tokens.push({ text: fullMatch.slice(1, -1), kind: 'italic' });
    } else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      tokens.push({ text: fullMatch.slice(1, -1), kind: 'code' });
    } else {
      tokens.push({ text: fullMatch, kind: 'text' });
    }

    index = start + fullMatch.length;
  }

  if (index < text.length) {
    tokens.push({ text: text.slice(index), kind: 'text' });
  }
  return tokens;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const tokens = parseInlineMarkdown(text);
  return tokens.map((token, index) => {
    const key = `${token.kind}-${index}`;
    if (token.kind === 'bold') {
      return <strong key={key}>{token.text}</strong>;
    }
    if (token.kind === 'italic') {
      return <em key={key}>{token.text}</em>;
    }
    if (token.kind === 'code') {
      return (
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 text-[0.9em] dark:bg-white/10">
          {token.text}
        </code>
      );
    }
    return <React.Fragment key={key}>{token.text}</React.Fragment>;
  });
}

function renderAssistantMessage(content: string, isToolResult?: boolean, toolName?: string): React.ReactNode {
  if (isToolResult && toolName) {
    return (
      <div className="border-l-2 border-blue-400 pl-2">
        <div className="text-xs text-blue-500 mb-1">Tool: {toolName}</div>
        {renderAssistantMessage(content)}
      </div>
    );
  }

  const lines = content.split('\n');

  return lines.map((line, index) => {
    const trimmed = line.trim();
    const key = `line-${index}`;

    if (trimmed.length === 0) {
      return <br key={key} />;
    }

    if (trimmed.startsWith('### ')) {
      return (
        <h4 key={key} className="text-sm font-semibold mt-2 first:mt-0">
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>
      );
    }

    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={key} className="text-sm font-semibold mt-2 first:mt-0">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>
      );
    }

    if (trimmed.startsWith('# ')) {
      return (
        <h2 key={key} className="text-sm font-bold mt-2 first:mt-0">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>
      );
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <div key={key} className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
        </div>
      );
    }

    const numberedItem = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedItem) {
      return (
        <div key={key} className="flex gap-2">
          <span>{numberedItem[1]}.</span>
          <span>{renderInlineMarkdown(numberedItem[2])}</span>
        </div>
      );
    }

    return <React.Fragment key={key}>{renderInlineMarkdown(line)}{index < lines.length - 1 ? <br /> : null}</React.Fragment>;
  });
}

function ShimmerStatusText({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <motion.span
      className={cn(
        'inline-block font-semibold tracking-wide text-muted-foreground [--shimmer-contrast:rgba(255,255,255,0.75)] dark:[--shimmer-contrast:rgba(255,255,255,0.35)]',
        className,
      )}
      style={{
        WebkitTextFillColor: 'transparent',
        background:
          'currentColor linear-gradient(to right, currentColor 0%, var(--shimmer-contrast) 42%, var(--shimmer-contrast) 58%, currentColor 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '55% 200%',
      } as React.CSSProperties}
      initial={{ backgroundPositionX: '250%' }}
      animate={{ backgroundPositionX: ['-120%', '250%'] }}
      transition={{
        duration: 3.6,
        repeat: Infinity,
        repeatDelay: 1,
        ease: 'linear',
      }}
    >
      {children}
    </motion.span>
  );
}

function nodeToSuggestionData(node: Node): NodeData {
  const contentParts = [
    node.content.value,
    node.comment,
    node.content.pageTitle,
    node.content.url,
    ...(node.content.links ?? []).map((link) => `${link.title} ${link.url}`),
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' | ');

  return {
    id: node.id,
    title: node.content.title || node.content.pageTitle || node.content.value?.slice(0, 80) || `${node.content.type} node`,
    content: contentParts,
    groupId: node.groupId,
    tags: node.tags,
    links: node.content.links,
    images: node.content.images,
    videos: node.content.videos,
    type: node.content.type === 'browser' ? 'link' : node.content.type,
  };
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  { fill: '/clear', description: 'Clear this chat' },
  { fill: '/websearch ', description: 'Search the web and show direct results' },
  { fill: '/summarize_selection', description: 'Summarize selected nodes' },
  { fill: '/find_similar ', description: 'Find nodes similar to a node ID' },
  { fill: '/suggest_connections', description: 'Suggest connections between selected nodes' },
  { fill: '/get_canvas_summary', description: 'Get a quick canvas overview' },
  { fill: '/organize_group ', description: 'Get layout suggestions for a group ID' },
];

export function EnhancedChatDialog({ open, onOpenChange, variant: variantProp = 'sidebar' }: EnhancedChatDialogProps) {
  const [mode, setMode] = useState<'sidebar' | 'floating'>(variantProp);
  const nodes = useCanvasStore((state) => state.nodes);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('');
  const [activeAiMessageId, setActiveAiMessageId] = useState<string | null>(null);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [nodeSuggestions, setNodeSuggestions] = useState<NodeChatSuggestion[]>([]);
  const lastSuggestionNodeCountRef = useRef<number | null>(null);
  const [loaderIndex, setLoaderIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Floating mode state
  const [chatSize, setChatSize] = useState(() => {
    const saved = loadFloatingSize();
    return saved ?? { width: 380, height: 520 };
  });
  const chatSizeRef = useRef(chatSize);
  chatSizeRef.current = chatSize;
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const savedPosition = useMemo(() => loadFloatingPosition(), []);
  const floatingPosRef = useRef(floatingPos);
  floatingPosRef.current = floatingPos;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = chatSizeRef.current.width;
    const startH = chatSizeRef.current.height;
    const startPos = floatingPosRef.current ?? savedPosition;

    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      // Bottom-left handle: drag right = shrink from left, drag left = expand from left
      // Right edge stays anchored, left edge moves
      const newWidth = Math.max(320, startW - dx);
      const newHeight = Math.max(400, startH + dy);
      const widthDelta = startW - newWidth;
      setChatSize({ width: newWidth, height: newHeight });
      setFloatingPos({ x: (startPos?.x ?? 0) + widthDelta, y: (startPos?.y ?? 0) });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      saveFloatingSize(chatSizeRef.current);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [savedPosition]);

  // Sidebar scroll-hide state
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollTopRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = (e.target as HTMLDivElement).scrollTop;
    if (scrollTop > lastScrollTopRef.current) {
      // Scrolling down - show header
      setHeaderVisible(true);
    } else if (scrollTop < lastScrollTopRef.current) {
      // Scrolling up - hide header
      setHeaderVisible(false);
    }
    lastScrollTopRef.current = scrollTop;

    // Reset on scroll stop
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      setHeaderVisible(true);
    }, 800);
  }, []);

  const StatusLoader = DOTM_LOADERS[loaderIndex ?? 0];

  const fallbackSuggestions = useMemo(() => buildNodeChatSuggestions(nodes).slice(0, 4), [nodes]);

  useEffect(() => {
    if (!isLoading || isStreamingResponse) return;

      setCurrentStatus(prev => prev || pickFlavorStatus());
    const interval = window.setInterval(() => {
      setCurrentStatus(pickFlavorStatus());
    }, 500);

    return () => window.clearInterval(interval);
  }, [isLoading, isStreamingResponse]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (open) {
      window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }), 80);
    }
  }, [messages, open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const inputElement = document.getElementById('enhanced-chat-composer') as HTMLTextAreaElement | null;
        if (inputElement) {
          inputElement.focus();
        }
      }, 200);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (lastSuggestionNodeCountRef.current === nodes.length && nodeSuggestions.length > 0) return;

    let cancelled = false;
    lastSuggestionNodeCountRef.current = nodes.length;

    const generateSuggestions = async () => {
      if (!nodes.length) {
        setNodeSuggestions([]);
        return;
      }

      try {
        const topNodes = [...nodes]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 12)
          .map(nodeToSuggestionData);
        const questions = await aiService.suggestLikelyQuestionsFromNodes(topNodes);
        if (cancelled) return;
        const aiSuggestions = buildAiQuestionSuggestions(nodes, questions).slice(0, 4);
        setNodeSuggestions(aiSuggestions.length ? aiSuggestions : fallbackSuggestions);
      } catch (error) {
        if (cancelled) return;
        console.warn('[AI Suggestions] Falling back to local canvas suggestions:', error);
        setNodeSuggestions(fallbackSuggestions);
      }
    };

    generateSuggestions();

    return () => {
      cancelled = true;
    };
  }, [open, nodes, nodes.length, nodeSuggestions.length, fallbackSuggestions]);

  // Listen for close all dialogs event
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      onOpenChange(false);
    };

    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    return () => window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
  }, [onOpenChange]);

  const handleSendMessage = async () => {
    const message = inputMessage.trim();
    if (!message || isLoading) return;

    if (message === '/clear') {
      clearChat();
      setInputMessage('');
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: message,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setLoaderIndex((previous) => pickNextLoaderIndex(previous));

    // Refocus input after sending so user can keep typing
    requestAnimationFrame(() => {
      const inputElement = document.getElementById('enhanced-chat-composer') as HTMLTextAreaElement | null;
      inputElement?.focus();
    });

    let aiMessageId: string | null = null;

    try {
      aiMessageId = `ai-${Date.now()}`;
      setActiveAiMessageId(aiMessageId);
      setIsStreamingResponse(false);
      setCurrentStatus(pickFlavorStatus());

      const aiMessage: Message = {
        id: aiMessageId,
        content: '',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);

      let streamStarted = false;
      const response = await enhancedAiService.enhancedChatStream(message, (chunk) => {
        if (!streamStarted) {
          streamStarted = true;
          setIsStreamingResponse(true);
          setTimeout(() => setCurrentStatus('Generating...'), 400);
        }

        setMessages(prev =>
          prev.map((msg) => (msg.id === aiMessageId ? { ...msg, content: msg.content + chunk } : msg)),
        );
      });

      setMessages(prev =>
        prev.map((msg) => (msg.id === aiMessageId ? { ...msg, content: response } : msg)),
      );
    } catch (error) {
      console.error('Enhanced chat error:', error);
      toast.error('Failed to get AI response. Please try again.');

      if (aiMessageId) {
        setMessages(prev => prev.filter((msg) => msg.id !== aiMessageId || msg.content.trim().length > 0));
      }

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: `AI could not respond right now: ${error instanceof Error ? error.message : 'request failed'}`,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentStatus('');
      setActiveAiMessageId(null);
      setIsStreamingResponse(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  // Greeting name from profile
  const username = useCanvasStore((s) => s.settings.profile.username);
  const displayName = username || 'there';

  // Shared chat content (used by both sidebar and floating mode)
  const chatContent = (
    <>
      {/* Zig-zag mesh background - fades to 0 behind greeting, visible at bottom */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.15] dark:opacity-[0.25]"
           style={{
             backgroundImage: `linear-gradient(135deg, currentColor 25%, transparent 25%),
                              linear-gradient(225deg, currentColor 25%, transparent 25%),
                              linear-gradient(45deg, currentColor 25%, transparent 25%),
                              linear-gradient(315deg, currentColor 25%, transparent 25%)`,
             backgroundPosition: '10px 0, 10px 0, 0 0, 0 0',
             backgroundSize: '20px 20px',
             backgroundRepeat: 'repeat',
               maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.6) 100%)',
               WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.6) 100%)',
             color: 'var(--mesh-color, rgb(107 114 128))',
           } as React.CSSProperties}
      />

      {/* Floating mode: frosted drag handle header — absolute overlay so messages scroll UNDER the glass */}
      {mode === 'floating' && (
        <div className={`drag-handle absolute top-0 left-0 right-0 z-20 cursor-grab active:cursor-grabbing select-none transition-opacity duration-300 ${headerVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {/* Frosted glass background — blurs messages that scroll underneath */}
          <div className="absolute inset-0 backdrop-blur-xl bg-gradient-to-b from-background/80 via-background/60 to-background/30 pointer-events-none rounded-t-xl border-b border-border/20" />
          <div className="relative z-10 flex items-center justify-end px-3 py-2.5 gap-1">
            <button
              onClick={() => setMode('sidebar')}
              className="relative p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground after:content-[''] after:absolute after:inset-[-10px]"
              title="Dock back to sidebar"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="relative p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground after:content-[''] after:absolute after:inset-[-10px]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sidebar mode: sr-only header */}
      {mode === 'sidebar' && (
        <DialogHeader className="sr-only">
          <DialogTitle>AI Chat Assistant</DialogTitle>
          <DialogDescription>
            Chat with AI with canvas-aware tools and commands
          </DialogDescription>
        </DialogHeader>
      )}

      {/* Scrollable Main Area */}
      <main
        onScroll={handleChatScroll}
        ref={messagesEndRef}
        className={cn(
          "relative z-10 flex-1 flex flex-col overflow-y-auto scroll-smooth",
          mode === 'floating' ? 'px-3 pt-14' : 'px-1',
        )}
      >
        {/* Spacer to push greeting toward center (scroll appears when messages overflow) */}
        <div className="flex-1"></div>

        {/* Hero Greeting */}
        {messages.length === 0 && (
          <div className="w-full mx-auto mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-2xl font-semibold mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Hello, {displayName.toUpperCase()}
            </h1>
            <p className="text-xl font-medium text-muted-foreground">
              How can I help you today?
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((message) => {
            const showStatus = shouldShowActiveStatus({
              activeMessageId: activeAiMessageId,
              messageId: message.id,
              currentStatus,
              isUserMessage: message.isUser,
            });
            const showBubble = message.isUser || message.content.trim().length > 0 || !showStatus;

            return (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] flex flex-col ${message.isUser ? 'items-end' : 'items-start'}`}>
                  {showStatus && (
                    <div className="text-xs opacity-90 font-mono mb-1 ml-1 flex items-center gap-2">
                      <StatusLoader className="text-orange-500" />
                      <ShimmerStatusText>{currentStatus}</ShimmerStatusText>
                      <span className="ai-chat-status-dots" aria-hidden="true">
                        <span>.</span>
                        <span>.</span>
                        <span>.</span>
                      </span>
                    </div>
                  )}

                  {showBubble && (
                    <div
                      className={`rounded-lg p-3 ${
                        message.isUser
                          ? 'bg-primary text-primary-foreground'
                          : message.isToolResult
                          ? 'bg-orange-50/10 dark:bg-orange-950/20 border border-orange-200/20 dark:border-orange-700/30 text-orange-700 dark:text-orange-300'
                          : 'bg-muted/80 text-foreground'
                      }`}
                    >
                      <div className="text-[14px] break-words overflow-wrap-anywhere">
                        {message.isUser ? (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {renderAssistantMessage(message.content, message.isToolResult, message.toolName)}
                          </div>
                        )}
                      </div>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="h-4 w-full"></div>
      </main>

      {/* Footer / Input Container */}
      <footer className="relative z-20 p-1 w-full">
        <ChatComposerArea
          value={inputMessage}
          onChange={setInputMessage}
          onSend={handleSendMessage}
          disabled={isLoading}
          placeholder="type / for skills..."
          composerId="enhanced-chat-composer"
          nodeSuggestions={nodeSuggestions}
          slashCommands={SLASH_COMMANDS}
          isLoading={isLoading}
        />
      </footer>

      {/* Resize handle for floating mode */}
      {mode === 'floating' && (
        <div
          className="absolute bottom-0 left-0 w-8 h-8 cursor-sw-resize z-50 group"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute bottom-1.5 left-1.5 w-4 h-4 border-l-2 border-b-2 border-white/20 group-hover:border-white/40 transition-colors" />
        </div>
      )}
    </>
  );

  // Floating mode: render as draggable widget on canvas
  if (mode === 'floating') {
    if (!open) return null;
    const defaultX = typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 450) : 1200;
    const initialPos = floatingPos ?? savedPosition ?? { x: defaultX, y: 80 };
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <Draggable
          handle=".drag-handle"
          position={initialPos}
          onDrag={(_, data) => setFloatingPos({ x: data.x, y: data.y })}
          onStop={(_, data) => {
            setFloatingPos({ x: data.x, y: data.y });
            saveFloatingPosition({ x: data.x, y: data.y });
          }}
        >
          <div
            className="pointer-events-auto flex flex-col rounded-xl border border-border/50 overflow-hidden shadow-2xl bg-background/95 backdrop-blur-md"
            style={{
              width: chatSize.width,
              height: chatSize.height,
            }}
          >
            {chatContent}
          </div>
        </Draggable>
      </div>
    );
  }

  // Sidebar mode: render as Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
         hideOverlay
         hideCloseButton
         className="ai-chat-panel fixed !left-auto !right-2 !top-2 z-50 flex h-[calc(100vh-1rem)] w-[min(380px,calc(100vw-1rem))] max-w-none !translate-x-0 !translate-y-0 flex-col gap-3 rounded-xl border border-border/50 bg-background/95 text-foreground font-sans overflow-hidden shadow-2xl backdrop-blur-md data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full sm:max-w-none"
       >
        {/* Sidebar frost tray + pop-out + close buttons (top-right) */}
        {mode === 'sidebar' && (
          <div className={`absolute top-0 right-0 z-[60] transition-opacity duration-300 ${headerVisible ? 'opacity-100' : 'opacity-0'}`}>
            {/* Frosted glass tray — same style as floating header, just behind buttons */}
            <div className="absolute top-1.5 right-1.5 h-11 w-[88px] rounded-lg backdrop-blur-xl bg-gradient-to-b from-background/80 via-background/60 to-background/30 border-b border-border/20 pointer-events-none" />
            {/* Pop-out button */}
            <button
              onClick={() => setMode('floating')}
              className="absolute top-4 right-12 p-1.5 rounded-md hover:bg-accent/60 transition-colors text-foreground/70 hover:text-foreground after:content-[''] after:absolute after:inset-[-10px]"
              title="Pop out to floating window"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            {/* Close button in same frost area */}
            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-4 right-3 p-1.5 rounded-md hover:bg-accent/60 transition-colors text-foreground/70 hover:text-foreground after:content-[''] after:absolute after:inset-[-10px]"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {chatContent}
      </DialogContent>
    </Dialog>
  );
}
