import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { MessageCircle } from 'lucide-react';
import { EnhancedChatDialog } from './EnhancedChatDialog';

export function SecondChatButton() {
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
      <div className="fixed bottom-6 left-6 z-40">
        <Button
          onClick={() => setChatOpen(true)}
          size="lg"
          className="w-14 h-14 rounded-full shadow-lg bg-blue-500 hover:bg-blue-600 text-white"
          title="Enhanced AI Assistant with Tools"
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      </div>
      
      <EnhancedChatDialog open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
}