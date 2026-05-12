import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { MessageCircle } from 'lucide-react';
import { EnhancedChatDialog } from './EnhancedChatDialog';

export function DesktopChatButton() {
  const [chatOpen, setChatOpen] = useState(false);

  // Listen for close all dialogs event
  useEffect(() => {
    const handleCloseAllDialogs = () => {
      setChatOpen(false);
    };

    window.addEventListener('closeAllDialogs', handleCloseAllDialogs);
    return () => window.removeEventListener('closeAllDialogs', handleCloseAllDialogs);
  }, []);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setChatOpen(true)}
          size="lg"
          className="w-14 h-14 rounded-full shadow-lg bg-[#171717] hover:bg-[#2a2a2a] text-white border-0 flex items-center justify-center transition-all duration-200 hover:scale-105"
          title="Chat with AI Assistant"
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      </div>
      
      <EnhancedChatDialog open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
}
