import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Search,
  CheckCircle2,
  Clock,
  MessageSquare,
  ArrowLeft,
  Sparkles,
  Eye,
  Sun,
  Moon,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  ChatSession,
  SessionStatus,
  DEFAULT_MACROS,
  computeDashboardMetrics,
} from '../shared/sessionStore';

interface OperatorDashboardProps {
  sessions: ChatSession[];
  currentUserSessionId: string;
  wsConnected: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSendAaronReply: (sessionId: string, text: string) => Promise<void>;
  onAaronTyping: (sessionId: string, isTyping: boolean) => void;
  onUpdateStatus: (sessionId: string, status: SessionStatus) => Promise<void>;
  onMarkRead: (sessionId: string) => Promise<void>;
  onExitToPublicChat: (sessionIdToView?: string) => void;
}

const EMBLEM_CLEAN = '/assets/aarongpt_emblem_clean.png';

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatRelativeAgo(ts: number): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export const OperatorDashboard: React.FC<OperatorDashboardProps> = ({
  sessions,
  currentUserSessionId,
  theme,
  onToggleTheme,
  onSendAaronReply,
  onAaronTyping,
  onUpdateStatus,
  onMarkRead,
  onExitToPublicChat,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(() => {
    const waiting = sessions.find((s) => s.status === 'waiting');
    return waiting?.id || sessions[0]?.id || currentUserSessionId;
  });
  // Mobile-first navigation state: 'queue' shows full-screen session list, 'chat' shows full-screen active chat
  const [mobileView, setMobileView] = useState<'queue' | 'chat'>('queue');
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  const typingTimerRef = useRef<number | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const metrics = useMemo(() => computeDashboardMetrics(sessions), [sessions]);

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => {
      if (a.status === 'waiting' && b.status !== 'waiting') return -1;
      if (b.status === 'waiting' && a.status !== 'waiting') return 1;
      return b.updatedAt - a.updatedAt;
    });

    return sorted.filter((s) => {
      if (statusFilter === 'waiting' && s.status !== 'waiting') return false;
      if (statusFilter === 'resolved' && s.status !== 'resolved') return false;
      if (!q) return true;
      const inAlias = s.alias.toLowerCase().includes(q);
      const inTitle = s.title.toLowerCase().includes(q);
      const inMessages = s.messages.some((m) => m.text.toLowerCase().includes(q));
      return inAlias || inTitle || inMessages;
    });
  }, [sessions, statusFilter, searchQuery]);

  // Selected session lookup
  const selectedSession = useMemo(() => {
    return (
      sessions.find((s) => s.id === selectedSessionId) ||
      filteredSessions[0] ||
      sessions[0]
    );
  }, [sessions, selectedSessionId, filteredSessions]);

  // If the selected session disappears (e.g. reset by visitor), return to the queue on mobile
  useEffect(() => {
    if (!selectedSession && mobileView === 'chat') {
      setMobileView('queue');
    }
  }, [selectedSession, mobileView]);

  useEffect(() => {
    if (selectedSession && selectedSession.unreadCount > 0) {
      onMarkRead(selectedSession.id);
    }
  }, [selectedSession, onMarkRead]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.messages.length, mobileView]);

  const currentDraft = selectedSession ? replyDrafts[selectedSession.id] || '' : '';

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setMobileView('chat');
  };

  const handleDraftChange = (val: string) => {
    if (!selectedSession) return;
    setReplyDrafts((prev) => ({ ...prev, [selectedSession.id]: val }));

    onAaronTyping(selectedSession.id, val.trim().length > 0);
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      onAaronTyping(selectedSession.id, false);
    }, 2500);
  };

  const handlePickQuickReply = (macroText: string) => {
    handleDraftChange(macroText);
    setShowQuickReplies(false);
  };

  const handleSendManualReply = async (overrideText?: string) => {
    if (!selectedSession || isSending) return;
    const textToSend = (overrideText !== undefined ? overrideText : currentDraft).trim();
    if (!textToSend) return;

    setIsSending(true);
    setReplyDrafts((prev) => ({ ...prev, [selectedSession.id]: '' }));
    setShowQuickReplies(false);
    onAaronTyping(selectedSession.id, false);
    try {
      await onSendAaronReply(selectedSession.id, textToSend);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC] transition-colors duration-150">
      {/* Top Header — compact & non-overflowing on mobile */}
      <header className="h-14 px-3.5 sm:px-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-2 sm:gap-4 shrink-0 bg-white dark:bg-[#212121]">
        {/* Brand & Queue Summary */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 select-none">
          {!emblemError && (
            <img
              src={EMBLEM_CLEAN}
              alt="AaronGPT Proof emblem"
              referrerPolicy="no-referrer"
              onError={() => setEmblemError(true)}
              className="w-7 h-7 object-contain shrink-0"
            />
          )}
          <div className="flex items-baseline gap-1.5 min-w-0 truncate">
            <span className="font-bold text-[15px] sm:text-base tracking-tight text-[#0D0D0D] dark:text-[#FFF1D9] shrink-0">
              Aaron<span className="text-[#FFAA08]">GPT</span>
            </span>
            <span className="text-xs text-[#5D5D5D] dark:text-[#B4B4B4] font-medium truncate">
              Backstage
            </span>
          </div>

          {metrics.waitingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFAA08]/15 text-[#D98800] dark:text-[#FFAA08] text-[11px] font-semibold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFAA08]" />
              <span>{metrics.waitingCount}</span>
              <span className="hidden sm:inline">waiting</span>
            </span>
          )}
        </div>

        {/* Actions: Theme Toggle & Return to Chat */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
            title={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
            className="w-9 h-9 rounded-lg text-[#5D5D5D] dark:text-[#B4B4B4] hover:text-[#0D0D0D] dark:hover:text-white hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors flex items-center justify-center cursor-pointer shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onExitToPublicChat()}
            className="h-9 px-3 sm:px-3.5 rounded-lg bg-[#0D0D0D] dark:bg-[#ECECEC] text-white dark:text-[#0D0D0D] text-xs font-semibold hover:opacity-85 transition-opacity flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="sm:hidden">Public Chat</span>
            <span className="hidden sm:inline">Return to Chat</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Master-Detail on Mobile, Two-Column on md+ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column / Mobile Full-Screen Queue */}
        <aside
          aria-label="Visitor sessions queue"
          className={`${
            mobileView === 'queue' ? 'flex' : 'hidden md:flex'
          } w-full md:w-80 shrink-0 md:border-r border-black/10 dark:border-white/10 bg-[#FAFAFA] dark:bg-[#1A1A1A] flex-col min-h-0`}
        >
          {/* Search & Filter Strip */}
          <div className="p-3 sm:p-3.5 border-b border-black/10 dark:border-white/10 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#5D5D5D] dark:text-[#B4B4B4] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search visitors or messages..."
                aria-label="Search visitors or messages"
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#262626] border border-black/10 dark:border-white/10 rounded-xl text-base sm:text-xs text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#676767] dark:placeholder-[#9B9B9B] focus:outline-none focus:border-[#FFAA08]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#EFEFEF] dark:bg-[#262626] rounded-xl">
              {(['all', 'waiting', 'resolved'] as const).map((filterKey) => {
                const isActive = statusFilter === filterKey;
                const label =
                  filterKey === 'all'
                    ? `All (${sessions.length})`
                    : filterKey === 'waiting'
                    ? `Needs Reply${metrics.waitingCount > 0 ? ` (${metrics.waitingCount})` : ''}`
                    : 'Resolved';
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setStatusFilter(filterKey)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-[#333333] text-[#0D0D0D] dark:text-white shadow-xs'
                        : 'text-[#5D5D5D] dark:text-[#B4B4B4] hover:text-[#0D0D0D] dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
            {filteredSessions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-xs text-[#5D5D5D] dark:text-[#B4B4B4]">
                <MessageSquare className="w-7 h-7 mx-auto mb-2.5 opacity-35" />
                <p className="text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                  No sessions in queue
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed">
                  {sessions.length === 0
                    ? 'When a visitor sends a message in the public chat, their conversation will appear here live.'
                    : 'No sessions match your current search or filter.'}
                </p>
              </div>
            ) : (
              filteredSessions.map((sess) => {
                const isSelected = selectedSession?.id === sess.id;
                const lastMsg = sess.messages[sess.messages.length - 1];
                const isWaiting = sess.status === 'waiting';

                return (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => handleSelectSession(sess.id)}
                    className={`w-full text-left p-4 sm:p-3.5 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-white dark:bg-[#2A2A2A] md:shadow-xs'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm sm:text-xs font-semibold text-[#0D0D0D] dark:text-[#ECECEC] truncate">
                            {sess.alias}
                          </span>
                          {sess.unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-[#FFAA08] text-black text-[10px] font-bold tabular-nums shrink-0">
                              {sess.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#5D5D5D] dark:text-[#B4B4B4] font-mono tabular-nums shrink-0">
                          {formatRelativeAgo(sess.updatedAt)}
                        </span>
                      </div>

                      <div className="text-xs text-[#5D5D5D] dark:text-[#B4B4B4] line-clamp-1 mb-1.5">
                        {lastMsg ? (
                          <span>
                            <strong className="font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                              {lastMsg.sender === 'user' ? 'Visitor: ' : 'You: '}
                            </strong>
                            {lastMsg.text}
                          </span>
                        ) : (
                          <span className="italic">Connected, awaiting prompt...</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#5D5D5D] dark:text-[#B4B4B4]">
                        <span
                          className={
                            isWaiting
                              ? 'text-[#D98800] dark:text-[#FFAA08] font-semibold'
                              : sess.status === 'resolved'
                              ? 'opacity-60'
                              : 'text-emerald-600 dark:text-emerald-400 font-medium'
                          }
                        >
                          {isWaiting
                            ? '● Needs Reply'
                            : sess.status === 'resolved'
                            ? 'Resolved'
                            : 'Active'}
                        </span>
                        {sess.isUserTyping ? (
                          <span className="text-[#D98800] dark:text-[#FFAA08] italic">
                            Visitor typing...
                          </span>
                        ) : (
                          <span className="tabular-nums font-mono">{sess.messages.length} msgs</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-[#5D5D5D] dark:text-[#B4B4B4] shrink-0 md:hidden" />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Main Panel / Mobile Full-Screen Active Conversation */}
        <section
          aria-label="Conversation responder"
          className={`${
            mobileView === 'chat' ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col min-w-0 bg-white dark:bg-[#212121]`}
        >
          {selectedSession ? (
            <>
              {/* Selected Session Header */}
              <div className="px-3.5 sm:px-6 py-2.5 sm:py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-2 sm:gap-4 shrink-0 bg-white dark:bg-[#212121]">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Mobile Back to Queue Button */}
                  <button
                    type="button"
                    onClick={() => setMobileView('queue')}
                    aria-label="Back to visitor queue"
                    className="md:hidden h-9 px-2.5 -ml-1 rounded-lg hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-semibold text-[#0D0D0D] dark:text-[#ECECEC] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 stroke-[2.25]" />
                    <span>Queue</span>
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                      <span className="truncate">{selectedSession.alias}</span>
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          selectedSession.status === 'waiting'
                            ? 'bg-[#FFAA08]/15 text-[#D98800] dark:text-[#FFAA08]'
                            : selectedSession.status === 'resolved'
                            ? 'bg-black/5 dark:bg-white/10 text-[#5D5D5D] dark:text-[#B4B4B4]'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {selectedSession.status === 'waiting'
                          ? 'Needs Reply'
                          : selectedSession.status === 'resolved'
                          ? 'Resolved'
                          : 'Active'}
                      </span>
                    </div>
                    <div className="hidden sm:flex text-xs text-[#5D5D5D] dark:text-[#B4B4B4] mt-0.5 items-center gap-2 truncate">
                      <span>{selectedSession.userAgent}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{selectedSession.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onExitToPublicChat(selectedSession.id)}
                    title="Preview Visitor Screen"
                    className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-black/10 dark:border-white/10 hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Preview Visitor</span>
                  </button>

                  {selectedSession.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(selectedSession.id, 'resolved')}
                      className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-black/10 dark:border-white/10 hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Resolve</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(selectedSession.id, 'waiting')}
                      className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-black/10 dark:border-white/10 hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#FFAA08]" />
                      <span>Reopen</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Message Transcript */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
                {selectedSession.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#5D5D5D] dark:text-[#B4B4B4] px-4">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                      Session connected
                    </p>
                    <p className="text-xs mt-1 max-w-sm leading-relaxed">
                      Waiting for visitor to type their prompt. You can also send a message right now.
                    </p>
                  </div>
                ) : (
                  selectedSession.messages.map((m) => {
                    const isUser = m.sender === 'user';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-[#5D5D5D] dark:text-[#B4B4B4] mb-1 px-1">
                          <span className="font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                            {isUser ? selectedSession.alias : 'You (AaronGPT)'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatTimestamp(m.timestamp)}
                          </span>
                          {!isUser && typeof m.responseTimeMs === 'number' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                                {(m.responseTimeMs / 1000).toFixed(1)}s
                              </span>
                            </>
                          )}
                        </div>

                        <div
                          className={`max-w-[85%] sm:max-w-xl rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                            isUser
                              ? 'bg-[#F4F4F4] dark:bg-[#2F2F2F] text-[#0D0D0D] dark:text-[#ECECEC]'
                              : 'bg-[#FFF9EE] dark:bg-[#2D2316] text-[#0D0D0D] dark:text-[#FFF1D9] border border-[#FFAA08]/30 dark:border-[#FFAA08]/40'
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Compact Composer with Collapsible Quick Replies */}
              <div className="px-3.5 sm:px-6 pb-4 pt-2 border-t border-black/10 dark:border-white/10 bg-white dark:bg-[#212121] shrink-0 space-y-2">
                {/* Toggleable Quick Replies Tray */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowQuickReplies((prev) => !prev)}
                    aria-expanded={showQuickReplies}
                    className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4] hover:text-[#0D0D0D] dark:hover:text-white hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#FFAA08]" />
                    <span>Quick Replies</span>
                    {showQuickReplies ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {selectedSession.isUserTyping && (
                    <span className="text-[11px] text-[#D98800] dark:text-[#FFAA08] italic">
                      {selectedSession.alias} is typing...
                    </span>
                  )}
                </div>

                {showQuickReplies && (
                  <div className="flex flex-wrap gap-1.5 p-2.5 rounded-2xl bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-black/10 dark:border-white/10">
                    {DEFAULT_MACROS.map((macro) => (
                      <button
                        key={macro.id}
                        type="button"
                        onClick={() => handlePickQuickReply(macro.text)}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#262626] border border-black/10 dark:border-white/10 text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] hover:border-[#FFAA08] transition-colors text-left cursor-pointer"
                      >
                        {macro.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Streamlined Reply Composer matching Public Chat feel */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendManualReply();
                  }}
                  className="relative flex items-end gap-2 rounded-3xl bg-[#F4F4F4] dark:bg-[#2F2F2F] border border-black/10 dark:border-white/10 focus-within:border-[#FFAA08] transition-colors px-4 py-2.5 shadow-xs"
                >
                  <label htmlFor="aaron-manual-reply-input" className="sr-only">
                    Reply as AaronGPT
                  </label>
                  <textarea
                    id="aaron-manual-reply-input"
                    rows={1}
                    value={currentDraft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendManualReply();
                      }
                    }}
                    placeholder={`Reply to ${selectedSession.alias}...`}
                    className="flex-1 max-h-32 resize-none bg-transparent text-base sm:text-sm text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#676767] dark:placeholder-[#9B9B9B] focus:outline-none leading-relaxed py-0.5"
                  />
                  <button
                    type="submit"
                    disabled={!currentDraft.trim() || isSending}
                    aria-label="Send reply"
                    className="w-9 h-9 rounded-full bg-[#FFAA08] hover:bg-[#ffc043] disabled:opacity-25 disabled:pointer-events-none text-black transition-opacity flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4 stroke-[2.75]" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#5D5D5D] dark:text-[#B4B4B4]">
              {!emblemError && (
                <img
                  src={EMBLEM_CLEAN}
                  alt="Proof emblem"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 object-contain mb-3 opacity-60"
                />
              )}
              <p className="text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                No conversation selected
              </p>
              <p className="text-xs mt-1 max-w-xs leading-relaxed">
                When a visitor sends a message in the public chat, select their session from the queue to reply live.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
