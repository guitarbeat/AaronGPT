import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatSession, SessionStatus } from '../shared/sessionStore';

const LOCAL_SESSION_KEY = 'aarongpt_current_session_id';
const LOCAL_ALIAS_KEY = 'aarongpt_current_alias';

function getOrCreateBrowserSessionId(): { sessionId: string; alias: string } {
  let sessionId = localStorage.getItem(LOCAL_SESSION_KEY);
  let alias = localStorage.getItem(LOCAL_ALIAS_KEY);

  if (!sessionId) {
    const randomNum = Math.floor(420 + Math.random() * 480);
    sessionId = `sess-visitor-${Date.now().toString(36)}`;
    alias = `Visitor #${randomNum} (You)`;
    localStorage.setItem(LOCAL_SESSION_KEY, sessionId);
    localStorage.setItem(LOCAL_ALIAS_KEY, alias);
  }

  return {
    sessionId,
    alias: alias || 'Visitor (You)',
  };
}

export function useAaronRealtime() {
  const [sessionsMap, setSessionsMap] = useState<Record<string, ChatSession>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return getOrCreateBrowserSessionId().sessionId;
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

  const joinCurrentSession = useCallback(async (sessionId: string, alias?: string) => {
    try {
      const res = await fetch('/api/session/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          alias: alias || localStorage.getItem(LOCAL_ALIAS_KEY) || 'Visitor (You)',
          userAgent: navigator.userAgent.includes('Mac') ? 'macOS / Browser' : 'Web Client',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessionsMap(data.sessions);
        }
      }
    } catch {
      // Handled via WS or next sync
    }
  }, []);

  useEffect(() => {
    const { sessionId, alias } = getOrCreateBrowserSessionId();
    setCurrentSessionId(sessionId);
    fetchInitialState().then(() => {
      joinCurrentSession(sessionId, alias);
    });

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
        ws.send(
          JSON.stringify({
            type: 'session:join',
            sessionId: localStorage.getItem(LOCAL_SESSION_KEY) || sessionId,
            alias: localStorage.getItem(LOCAL_ALIAS_KEY) || alias,
            userAgent: navigator.userAgent.includes('Mac') ? 'macOS / Browser' : 'Web Client',
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
  }, [fetchInitialState, joinCurrentSession]);

  const sendUserMessage = useCallback(
    async (text: string, targetSessionId?: string) => {
      const sid = targetSessionId || currentSessionId;
      const trimmed = text.trim();
      if (!trimmed) return;

      const messageId = `msg-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const alias =
        sid === currentSessionId
          ? localStorage.getItem(LOCAL_ALIAS_KEY) || 'Visitor (You)'
          : undefined;

      // Always send via HTTP POST to guarantee immediate state return even when HMR/WS is disabled
      const res = await fetch('/api/message/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          text: trimmed,
          messageId,
          alias,
          userAgent: 'Web Client',
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

  const startNewVisitorChat = useCallback(async () => {
    const randomNum = Math.floor(500 + Math.random() * 490);
    const newSessionId = `sess-visitor-${Date.now().toString(36)}`;
    const newAlias = `Visitor #${randomNum} (You)`;
    localStorage.setItem(LOCAL_SESSION_KEY, newSessionId);
    localStorage.setItem(LOCAL_ALIAS_KEY, newAlias);
    setCurrentSessionId(newSessionId);
    await joinCurrentSession(newSessionId, newAlias);
    return newSessionId;
  }, [joinCurrentSession]);

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
