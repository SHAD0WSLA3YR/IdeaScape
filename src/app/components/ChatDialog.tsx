import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Send, MessageCircle } from 'lucide-react';
import { aiService } from '../services/aiService';
import { toast } from 'sonner';
import { pickFlavorStatus, shouldShowActiveStatus } from './ChatDialogStatus';
import { cn } from './ui/utils';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function renderAssistantMessage(content: string): React.ReactNode {
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
        duration: 2,
        repeat: Infinity,
        repeatDelay: 1,
        ease: 'linear',
      }}
    >
      {children}
    </motion.span>
  );
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      content: "Ask me anything about your canvas, ideas, or how to organize what you're working on.",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('');
  const [activeAiMessageId, setActiveAiMessageId] = useState<string | null>(null);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);

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
      setTimeout(() => {
        const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }, 100);
    }
  }, [messages, open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const inputElement = document.querySelector('[data-chat-input]') as HTMLInputElement;
        if (inputElement) {
          inputElement.focus();
        }
      }, 200);
    }
  }, [open]);

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

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: message,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

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
      const response = await aiService.chatStream(message, (chunk) => {
        if (!streamStarted) {
          streamStarted = true;
          setIsStreamingResponse(true);
          // Keep the last flavor status visible briefly, then switch to "Generating..."
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
      console.error('Chat error:', error);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        content: "Ask me anything about your canvas, ideas, or how to organize what you're working on.",
        isUser: false,
        timestamp: new Date()
      }
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[500px] flex flex-col ai-chat-panel" style={{ zIndex: 50 }}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            AI Chat Assistant
          </DialogTitle>
          <DialogDescription>
            Chat with AI to get help with organizing your ideas.
          </DialogDescription>
        </DialogHeader>

        {/* This div is the key to the layout, making its children flex items. */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Messages Area. flex-grow makes it take up all available space, and min-h-0 prevents overflow. */}
          <ScrollArea className="flex-grow border rounded-lg p-3 min-h-0">
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
                        <div className="text-xs opacity-90 font-mono mb-1 ml-1">
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
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <div className="text-sm break-words overflow-wrap-anywhere">
                            {message.isUser ? (
                              <p className="whitespace-pre-wrap">{message.content}</p>
                            ) : (
                              <div className="whitespace-pre-wrap">{renderAssistantMessage(message.content)}</div>
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
            </div>
          </ScrollArea>

          {/* Input Area. flex-shrink-0 keeps it from shrinking when the chat area grows. */}
          <div className="flex-shrink-0 space-y-2">
            <div className="flex gap-2">
              <Input
                data-chat-input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                size="sm"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex justify-between items-center">
              <Button
                onClick={clearChat}
                variant="ghost"
                size="sm"
                className="text-xs h-6"
              >
                Clear Chat
              </Button>
              <p className="text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}