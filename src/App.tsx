/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { useAaronRealtime } from './hooks/useAaronRealtime';
import { PublicChatView } from './components/PublicChatView';
import { OperatorDashboard } from './components/OperatorDashboard';
import { computeDashboardMetrics } from './shared/sessionStore';

const THEME_STORAGE_KEY = 'aarongpt_theme_mode';

export default function App() {
  const {
    sessionsMap,
    sessionsList,
    currentSessionId,
    setCurrentSessionId,
    wsConnected,
    sendUserMessage,
    sendAaronReply,
    setTyping,
    setSessionStatus,
    markRead,
    startNewVisitorChat,
  } = useAaronRealtime();

  const [isOperatorMode, setIsOperatorMode] = useState<boolean>(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const currentSession = sessionsMap[currentSessionId];

  const sortedSessions = useMemo(() => {
    return [...sessionsList].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessionsList]);

  const visitorSessions = useMemo(() => {
    const own = sortedSessions.filter(
      (s) => s.id === currentSessionId || s.id.startsWith('sess-visitor-')
    );
    return own.length > 0 ? own : currentSession ? [currentSession] : [];
  }, [sortedSessions, currentSessionId, currentSession]);

  const metrics = useMemo(() => computeDashboardMetrics(sessionsList), [sessionsList]);

  if (isOperatorMode) {
    return (
      <OperatorDashboard
        sessions={sortedSessions}
        currentUserSessionId={currentSessionId}
        wsConnected={wsConnected}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSendAaronReply={sendAaronReply}
        onAaronTyping={(sessionId, isTyping) => setTyping(sessionId, 'aaron', isTyping)}
        onUpdateStatus={setSessionStatus}
        onMarkRead={markRead}
        onExitToPublicChat={(sessionIdToView) => {
          if (sessionIdToView) {
            setCurrentSessionId(sessionIdToView);
          }
          setIsOperatorMode(false);
        }}
      />
    );
  }

  return (
    <PublicChatView
      currentSession={currentSession}
      userSessions={visitorSessions}
      currentSessionId={currentSessionId}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSelectSession={(sid) => setCurrentSessionId(sid)}
      onNewChat={async () => {
        await startNewVisitorChat();
      }}
      onSendMessage={async (text) => {
        await sendUserMessage(text, currentSessionId);
      }}
      onUserTyping={(isTyping) => {
        setTyping(currentSessionId, 'user', isTyping);
      }}
      onTriggerSecretAaron={() => setIsOperatorMode(true)}
      waitingCount={metrics.waitingCount}
    />
  );
}
