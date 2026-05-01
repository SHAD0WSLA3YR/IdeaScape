/**
 * Browser Session Service
 * Manages persistent browser sessions using Supabase KV storage
 * Each browser node gets its own session stored in Supabase
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';

// Browser sessions stay local by default. Enable cloud sync explicitly after
// adding user-scoped storage/auth on the backend.
const BROWSER_SESSION_SYNC_ENABLED = (import.meta as any)?.env?.VITE_BROWSER_SESSION_SYNC === 'true';

interface Bookmark {
  url: string;
  title: string;
  favicon: string | null;
  addedAt: Date;
}

interface BrowserSession {
  nodeId: string;
  history: string[];
  historyIndex: number;
  bookmarks: Bookmark[];
  zoom: number;
  lastVisited: Date;
  currentUrl: string;
}

class BrowserSessionManager {
  private reachabilityChecked = false;
  private supabaseReachable = false;

  private getSessionKey(nodeId: string): string {
    return `browser_session_${nodeId}`;
  }

  private getLocalSessionKey(nodeId: string): string {
    return `ideascape-browser-session-${nodeId}`;
  }

  private async checkSupabaseReachability(): Promise<boolean> {
    if (this.reachabilityChecked) {
      return this.supabaseReachable;
    }

    this.reachabilityChecked = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`https://${projectId}.supabase.co/rest/v1/`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      this.supabaseReachable = response.ok;
    } catch {
      this.supabaseReachable = false;
    }
    return this.supabaseReachable;
  }

  private createMockSession(nodeId: string): BrowserSession {
    return {
      nodeId,
      history: [],
      historyIndex: 0,
      bookmarks: [],
      zoom: 1,
      lastVisited: new Date(),
      currentUrl: '',
    };
  }

  /**
   * Save session to Supabase
   */
  async saveSession(nodeId: string, session: Partial<BrowserSession>): Promise<void> {
    try {
      const key = this.getSessionKey(nodeId);
      const fullSession: BrowserSession = {
        nodeId,
        history: session.history || [],
        historyIndex: session.historyIndex || 0,
        bookmarks: session.bookmarks || [],
        zoom: session.zoom || 1,
        lastVisited: new Date(),
        currentUrl: session.currentUrl || '',
        ...session,
      };

      if (!BROWSER_SESSION_SYNC_ENABLED) {
        localStorage.setItem(this.getLocalSessionKey(nodeId), JSON.stringify(fullSession));
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-832115ea/browser-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            action: 'save',
            key,
            data: fullSession,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to save session: ${response.statusText}`);
      }

      console.log('✅ Browser session saved:', nodeId);
    } catch (error) {
      console.error('❌ Failed to save browser session:', error);
      // Don't throw - fail silently for better UX
    }
  }

  /**
   * Load session from Supabase
   */
  async loadSession(nodeId: string): Promise<BrowserSession | null> {
    if (!BROWSER_SESSION_SYNC_ENABLED) {
      const raw = localStorage.getItem(this.getLocalSessionKey(nodeId));
      if (!raw) return this.createMockSession(nodeId);
      const data = JSON.parse(raw) as BrowserSession;
      if (data.lastVisited) {
        data.lastVisited = new Date(data.lastVisited);
      }
      if (data.bookmarks) {
        data.bookmarks = data.bookmarks.map((b: any) => ({
          ...b,
          addedAt: new Date(b.addedAt),
        }));
      }
      return data;
    }

    const reachable = await this.checkSupabaseReachability();
    if (!reachable) {
      return this.createMockSession(nodeId);
    }

    try {
      const key = this.getSessionKey(nodeId);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-832115ea/browser-session?key=${encodeURIComponent(key)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null; // No session found
        }
        throw new Error(`Failed to load session: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Browser session loaded:', nodeId);
      
      // Parse dates
      if (data.lastVisited) {
        data.lastVisited = new Date(data.lastVisited);
      }
      if (data.bookmarks) {
        data.bookmarks = data.bookmarks.map((b: any) => ({
          ...b,
          addedAt: new Date(b.addedAt),
        }));
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to load browser session:', error);
      return null; // Return null on error
    }
  }

  /**
   * Update just the history
   */
  async updateHistory(
    nodeId: string,
    url: string,
    history: string[],
    historyIndex: number
  ): Promise<void> {
    try {
      // Load existing session
      const session = await this.loadSession(nodeId);
      
      // Update with new history
      await this.saveSession(nodeId, {
        ...(session || {}),
        history,
        historyIndex,
        currentUrl: url,
        nodeId,
      });
    } catch (error) {
      console.error('❌ Failed to update history:', error);
    }
  }

  /**
   * Add a bookmark
   */
  async addBookmark(nodeId: string, bookmark: Omit<Bookmark, 'addedAt'>): Promise<void> {
    try {
      const session = await this.loadSession(nodeId);
      const bookmarks = session?.bookmarks || [];
      
      // Check if bookmark already exists
      if (bookmarks.some(b => b.url === bookmark.url)) {
        console.log('⚠️ Bookmark already exists:', bookmark.url);
        return;
      }

      // Add new bookmark
      const newBookmark: Bookmark = {
        ...bookmark,
        addedAt: new Date(),
      };

      await this.saveSession(nodeId, {
        ...(session || { nodeId }),
        bookmarks: [...bookmarks, newBookmark],
      });

      console.log('✅ Bookmark added:', bookmark.url);
    } catch (error) {
      console.error('❌ Failed to add bookmark:', error);
    }
  }

  /**
   * Remove a bookmark
   */
  async removeBookmark(nodeId: string, url: string): Promise<void> {
    try {
      const session = await this.loadSession(nodeId);
      if (!session) return;

      const bookmarks = session.bookmarks.filter(b => b.url !== url);

      await this.saveSession(nodeId, {
        ...session,
        bookmarks,
      });

      console.log('✅ Bookmark removed:', url);
    } catch (error) {
      console.error('❌ Failed to remove bookmark:', error);
    }
  }

  /**
   * Update zoom level
   */
  async updateZoom(nodeId: string, zoom: number): Promise<void> {
    try {
      const session = await this.loadSession(nodeId);

      await this.saveSession(nodeId, {
        ...(session || { nodeId }),
        zoom,
      });
    } catch (error) {
      console.error('❌ Failed to update zoom:', error);
    }
  }

  /**
   * Clear session (for cleanup)
   */
  async clearSession(nodeId: string): Promise<void> {
    try {
      const key = this.getSessionKey(nodeId);

      if (!BROWSER_SESSION_SYNC_ENABLED) {
        localStorage.removeItem(this.getLocalSessionKey(nodeId));
        return;
      }

      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-832115ea/browser-session`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ key }),
        }
      );

      console.log('✅ Browser session cleared:', nodeId);
    } catch (error) {
      console.error('❌ Failed to clear session:', error);
    }
  }
}

// Export singleton instance
export const browserSessionManager = new BrowserSessionManager();
export type { BrowserSession, Bookmark };
