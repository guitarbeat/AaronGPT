import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatSession, SessionStatus } from '../shared/sessionStore';

const LOCAL_SESSION_KEY = 'aarongpt_current_session_id';
const LEGACY_ALIAS_KEY = 'aarongpt_current_alias';

function getOrCreateBrowserSessionId(): string {
  // Clean up any legacy client-side "(You)" alias stored in localStorage
  localStorage.removeItem(LEGACY_ALIAS_KEY);

  let sessionId = localStorage.getItem(LOCAL_SESSION_KEY);
  if (!sessionId) {
    sessionId = `sess-visitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(LOCAL_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function useAaronRealtime() {
  const [sessionsMap, setSessionsMap] = useState<Record<string, ChatSession>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return getOrCreateBrowserSessionId();
  });
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessionsMap(data.sessions);
        }
      }
    } catch {
      // Ignore network error during startup
    }
  }, []);

  useEffect(() => {
    const sessionId = getOrCreateBrowserSessionId();
    setCurrentSessionId(sessionId);
    fetchInitialState();

    let isUnmounted = false;

    function connectWs() {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmounted) return;
        setWsConnected(true);
        // Register socket presence without creating an empty session on the server
        ws.send(
          JSON.stringify({
            type: 'session:join',
            sessionId: localStorage.getItem(LOCAL_SESSION_KEY) || sessionId,
          })
        );
      };

      ws.onmessage = (event) => {
        if (isUnmounted) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.sessions) {
            setSessionsMap(payload.sessions);
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setWsConnected(false);
        reconnectTimerRef.current = window.setTimeout(connectWs, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchInitialState]);

  const sendUserMessage = useCallback(
    async (text: string, targetSessionId?: string) => {
      const sid = targetSessionId || currentSessionId;
      const trimmed = text.trim();
      if (!trimmed) return;

      const messageId = `msg-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const userAgent = navigator.userAgent.includes('Mac') ? 'macOS / Browser' : 'Web Client';

      const res = await fetch('/api/message/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          text: trimmed,
          messageId,
          userAgent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessionsMap(data.sessions);
        }
      }
    },
    [currentSessionId]
  );

  const sendAaronReply = useCallback(async (sessionId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !sessionId) return;

    const messageId = `msg-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const res = await fetch('/api/message/aaron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        text: trimmed,
        messageId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sessions) {
        setSessionsMap(data.sessions);
      }
    }
  }, []);

  const setTyping = useCallback(
    async (sessionId: string, actor: 'user' | 'aaron', isTyping: boolean) => {
      if (!sessionId) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'typing:set',
            sessionId,
            actor,
            isTyping,
          })
        );
      } else {
        const res = await fetch('/api/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, actor, isTyping }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sessions) {
            setSessionsMap(data.sessions);
          }
        }
      }
    },
    []
  );

  const setSessionStatus = useCallback(async (sessionId: string, status: SessionStatus) => {
    const res = await fetch('/api/session/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, status }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sessions) {
        setSessionsMap(data.sessions);
      }
    }
  }, []);

  const markRead = useCallback(async (sessionId: string) => {
    const res = await fetch('/api/session/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sessions) {
        setSessionsMap(data.sessions);
      }
    }
  }, []);

  // Reset and reuse the visitor's existing session instead of multiplying new session IDs
  const startNewVisitorChat = useCallback(async () => {
    const sid = localStorage.getItem(LOCAL_SESSION_KEY) || currentSessionId;
    setCurrentSessionId(sid);
    try {
      const res = await fetch('/api/session/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessionsMap(data.sessions);
        }
      }
    } catch {
      // Fallback: clear locally if offline
      setSessionsMap((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    }
    return sid;
  }, [currentSessionId]);

  return {
    sessionsMap,
    sessionsList: Object.values(sessionsMap),
    currentSessionId,
    setCurrentSessionId,
    wsConnected,
    sendUserMessage,
    sendAaronReply,
    setTyping,
    setSessionStatus,
    markRead,
    startNewVisitorChat,
  };
}
