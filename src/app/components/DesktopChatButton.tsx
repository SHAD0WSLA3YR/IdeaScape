import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { MessageCircle } from 'lucide-react';
import { EnhancedChatDialog } from './EnhancedChatDialog';

export function DesktopChatButton() {
  const [chatOpen, setChatOpen] = useState(false);
  const [mode, setMode] = useState<'sidebar' | 'floating'>('sidebar');

  // Listen for close all dialogs event
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      setChatOpen(false);
      setMode('sidebar');
    };

    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    return () => window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
  }, []);

  const handleToggle = useCallback(() => {
    if (!chatOpen) {
      setChatOpen(true);
      setMode('sidebar');
    } else if (mode === 'sidebar') {
      setMode('floating');
    } else {
      setMode('sidebar');
    }
  }, [chatOpen, mode]);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={handleToggle}
          size="lg"
          className="w-14 h-14 rounded-full shadow-lg bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-all duration-200 hover:scale-105"
          title={mode === 'floating' && chatOpen ? 'Switch to sidebar' : 'Chat'}
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      </div>
      
      <EnhancedChatDialog
        open={chatOpen}
        onOpenChange={(open) => {
          setChatOpen(open);
          if (!open) setMode('sidebar');
        }}
        variant={mode}
      />
    </>
  );
}
