import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../utils/supabase/info';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

interface UserPresence {
  userId: string;
  userName: string;
  cursor?: { x: number; y: number };
  lastSeen: string;
  color: string;
}

interface CollaborativeCanvas {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  participants: string[];
  maxParticipants: number;
}

type CanvasRole = 'editor' | 'commenter' | null;

interface CollaborationState {
  // Connection state
  isConnected: boolean;
  isCollaborating: boolean;
  currentCanvasId: string | null;
  currentUserId: string | null;
  
  // Canvas and users
  collaborativeCanvas: CollaborativeCanvas | null;
  participants: UserPresence[];
  
  // Permission state
  userRole: CanvasRole;
  focusedNodesByOthers: Set<string>;
  
  // Real-time updates
  realtimeChannel: any;
  /** @internal 10-second heartbeat timer for presence refresh */
  _heartbeatTimer: ReturnType<typeof setInterval> | null;
  
  // Actions
  generateUserId: () => string;
  createCollaborativeCanvas: (name: string, data: any) => Promise<{ success: boolean; canvasId?: string; shareUrl?: string; error?: string }>;
  joinCanvas: (canvasId: string, userName?: string) => Promise<{ success: boolean; error?: string }>;
  leaveCanvas: () => Promise<void>;
  updateCanvasData: (data: any) => Promise<{ success: boolean; error?: string }>;
  updatePresence: (presence: Partial<UserPresence>) => Promise<void>;
  subscribeToCanvas: (canvasId: string) => void;
  unsubscribeFromCanvas: () => void;
  
  // Canvas sharing
  getShareableUrl: (canvasId: string) => string;
  
  // Participant management
  getOtherParticipants: () => UserPresence[];
  getCurrentUser: () => UserPresence | null;
}

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-832115ea`;

export const useCollaborationStore = create<CollaborationState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    isConnected: false,
    isCollaborating: false,
    currentCanvasId: null,
    currentUserId: null,
    collaborativeCanvas: null,
    participants: [],
    userRole: null,
    focusedNodesByOthers: new Set(),
    realtimeChannel: null,
    _heartbeatTimer: null,

    // Generate unique user ID
    generateUserId: () => {
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      set({ currentUserId: userId });
      
      // Store in localStorage for persistence across page reloads
      localStorage.setItem('ideascape_user_id', userId);
      
      return userId;
    },

    // Create a new collaborative canvas
    createCollaborativeCanvas: async (name: string, data: any) => {
      try {
        console.log('🔄 Creating collaborative canvas:', name);
        
        let { currentUserId } = get();
        
        // Generate user ID if not exists
        if (!currentUserId) {
          const storedUserId = localStorage.getItem('ideascape_user_id');
          if (storedUserId) {
            currentUserId = storedUserId;
            set({ currentUserId });
            console.log('📱 Using stored user ID:', currentUserId);
          } else {
            currentUserId = get().generateUserId();
            console.log('🆕 Generated new user ID:', currentUserId);
          }
        }

        const requestUrl = `${API_BASE}/canvas/create`;
        console.log('📡 Making request to:', requestUrl);
        console.log('📦 Request payload:', { name, userId: currentUserId, dataSize: JSON.stringify(data).length });

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            name,
            data,
            userId: currentUserId
          })
        });

        console.log('📊 Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ HTTP Error:', response.status, errorText);
          return { 
            success: false, 
            error: `Server error (${response.status}): ${errorText}` 
          };
        }

        const result = await response.json();
        console.log('📦 Response data:', result);

        if (result.success) {
          console.log('✅ Created collaborative canvas:', result.canvasId);
          return {
            success: true,
            canvasId: result.canvasId,
            shareUrl: result.shareUrl
          };
        } else {
          console.error('❌ Server returned error:', result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('❌ Network/connection error creating canvas:', error);
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return { success: false, error: 'Network connection failed. Please check your internet connection.' };
        }
        
        return { success: false, error: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}` };
      }
    },

    // Join an existing canvas
    joinCanvas: async (canvasId: string, userName?: string) => {
      try {
        console.log('🔄 Attempting to join canvas:', canvasId);
        
        let { currentUserId } = get();
        
        // Generate user ID if not exists
        if (!currentUserId) {
          const storedUserId = localStorage.getItem('ideascape_user_id');
          if (storedUserId) {
            currentUserId = storedUserId;
            set({ currentUserId });
            console.log('📱 Using stored user ID:', currentUserId);
          } else {
            currentUserId = get().generateUserId();
            console.log('🆕 Generated new user ID:', currentUserId);
          }
        }

        const requestUrl = `${API_BASE}/canvas/${canvasId}/join`;
        console.log('📡 Making request to:', requestUrl);

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            userId: currentUserId,
            userName: userName || `User ${Date.now().toString().slice(-4)}`
          })
        });

        console.log('📊 Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ HTTP Error:', response.status, errorText);
          return { 
            success: false, 
            error: `Server error (${response.status}): ${errorText}` 
          };
        }

        const result = await response.json();
        console.log('📦 Response data:', result);

        if (result.success) {
          // Detect user role from canvas metadata (server determines editor vs commenter)
          const userRoleFromServer: CanvasRole = result.canvas?.userRole ?? result.role ?? 'editor';

          set({
            isCollaborating: true,
            currentCanvasId: canvasId,
            collaborativeCanvas: result.canvas,
            userRole: userRoleFromServer
          });

          console.log(`🔑 User role: ${userRoleFromServer}`);

          // Subscribe to real-time updates
          get().subscribeToCanvas(canvasId);
          
          // Start 10-second presence heartbeat
          const timer = setInterval(() => {
            try {
              const state = get();
              if (!state.isCollaborating || !state.currentCanvasId) return;
              state.updatePresence({ lastSeen: new Date().toISOString() });
            } catch (err) {
              console.warn('Presence heartbeat failed:', err);
            }
          }, 10_000);
          set({ _heartbeatTimer: timer });
          
          console.log('✅ Successfully joined canvas:', canvasId);
          return { success: true };
        } else {
          console.error('❌ Join failed - server returned error:', result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('❌ Network/connection error joining canvas:', error);
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return { success: false, error: 'Network connection failed. Please check your internet connection.' };
        }
        
        return { success: false, error: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}` };
      }
    },

    // Leave the current canvas
    leaveCanvas: async () => {
      const { currentCanvasId, currentUserId, _heartbeatTimer } = get();
      
      if (!currentCanvasId || !currentUserId) return;

      // Clear presence heartbeat
      if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
      }

      try {
        await fetch(`${API_BASE}/canvas/${currentCanvasId}/leave`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ userId: currentUserId })
        });

        // Unsubscribe from real-time updates
        get().unsubscribeFromCanvas();

        set({
          isCollaborating: false,
          currentCanvasId: null,
          collaborativeCanvas: null,
          participants: [],
          userRole: null,
          focusedNodesByOthers: new Set(),
          _heartbeatTimer: null
        });

        console.log('✅ Left canvas');
      } catch (error) {
        console.error('❌ Error leaving canvas:', error);
      }
    },

    // Update canvas data
    updateCanvasData: async (data: any) => {
      const { currentCanvasId, currentUserId } = get();
      
      if (!currentCanvasId || !currentUserId) {
        return { success: false, error: 'Not connected to a canvas' };
      }

      try {
        const response = await fetch(`${API_BASE}/canvas/${currentCanvasId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            data,
            userId: currentUserId
          })
        });

        const result = await response.json();

        if (result.success) {
          console.log('✅ Canvas data updated');
          return { success: true };
        } else {
          console.error('❌ Failed to update canvas:', result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('❌ Error updating canvas:', error);
        return { success: false, error: 'Failed to update canvas' };
      }
    },

    // Update user presence (cursor, etc.)
    updatePresence: async (presence: Partial<UserPresence>) => {
      const { currentCanvasId, currentUserId } = get();
      
      if (!currentCanvasId || !currentUserId) return;

      try {
        await fetch(`${API_BASE}/canvas/${currentCanvasId}/presence`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            userId: currentUserId,
            presence
          })
        });
      } catch (error) {
        console.error('❌ Error updating presence:', error);
      }
    },

    // Subscribe to real-time canvas updates
    subscribeToCanvas: (canvasId: string) => {
      const { realtimeChannel } = get();
      
      // Unsubscribe from previous channel if exists
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
      }

      const channel = supabase.channel(`canvas:${canvasId}`)
        .on('broadcast', { event: 'canvas_update' }, (payload) => {
          const { currentUserId } = get();
          
          // Don't update if this user made the change
          if (payload.payload.updatedBy === currentUserId) return;
          
          console.log('📡 Received canvas update from another user');
          
          // Trigger a callback to update the main canvas
          const event = new CustomEvent('collaboration:canvas_update', {
            detail: payload.payload
          });
          window.dispatchEvent(event);
        })
        .on('broadcast', { event: 'presence_update' }, (payload) => {
          console.log('📡 Received presence update');
          
          // Update participants list
          set((state) => {
            const { participants } = state;
            const updatedPresence = payload.payload.presence;
            const existingIndex = participants.findIndex(p => p.userId === updatedPresence.userId);
            
            if (existingIndex >= 0) {
              participants[existingIndex] = updatedPresence;
            } else {
              participants.push(updatedPresence);
            }
            
            return { participants: [...participants] };
          });
        })
        .on('broadcast', { event: 'user_left' }, (payload) => {
          console.log('📡 User left canvas');
          
          // Remove user from participants
          set((state) => ({
            participants: state.participants.filter(p => p.userId !== payload.payload.userId)
          }));
        })
        // Track nodes focused by remote users (for deletion guard)
        .on('broadcast', { event: 'node_focus' }, (payload) => {
          const { userId, nodeId } = payload.payload ?? {};
          if (!userId || !nodeId) return;
          const { currentUserId } = get();
          if (userId === currentUserId) return; // ignore own focus
          set((state) => {
            const next = new Set(state.focusedNodesByOthers);
            next.add(nodeId);
            return { focusedNodesByOthers: next };
          });
        })
        .on('broadcast', { event: 'node_blur' }, (payload) => {
          const { userId, nodeId } = payload.payload ?? {};
          if (!userId || !nodeId) return;
          const { currentUserId } = get();
          if (userId === currentUserId) return;
          set((state) => {
            const next = new Set(state.focusedNodesByOthers);
            next.delete(nodeId);
            return { focusedNodesByOthers: next };
          });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Subscribed to canvas real-time updates');
            set({ isConnected: true });
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Real-time subscription error');
            set({ isConnected: false });
          }
        });

      set({ realtimeChannel: channel });
    },

    // Unsubscribe from real-time updates
    unsubscribeFromCanvas: () => {
      const { realtimeChannel, _heartbeatTimer } = get();
      
      // Clear presence heartbeat
      if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
      }
      
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        set({ realtimeChannel: null, isConnected: false, _heartbeatTimer: null });
        console.log('✅ Unsubscribed from canvas updates');
      }
    },

    // Get shareable URL for canvas
    getShareableUrl: (canvasId: string) => {
      return `${window.location.origin}/canvas/${canvasId}`;
    },

    // Get other participants (excluding current user)
    getOtherParticipants: () => {
      const { participants, currentUserId } = get();
      return participants.filter(p => p.userId !== currentUserId);
    },

    // Get current user presence
    getCurrentUser: () => {
      const { participants, currentUserId } = get();
      return participants.find(p => p.userId === currentUserId) || null;
    }
  }))
);

// Auto-leave canvas when page unloads
window.addEventListener('beforeunload', () => {
  const store = useCollaborationStore.getState();
  if (store.isCollaborating) {
    store.leaveCanvas();
  }
});