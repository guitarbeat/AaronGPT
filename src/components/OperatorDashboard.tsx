import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Send,
  Search,
  CheckCircle2,
  Clock,
  MessageSquare,
  ArrowLeft,
  Sparkles,
  Eye,
  Sun,
  Moon,
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
  wsConnected,
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  const typingTimerRef = useRef<number | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const metrics = useMemo(() => computeDashboardMetrics(sessions), [sessions]);

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => {
      // Waiting sessions on top, then most recent update
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

  useEffect(() => {
    if (selectedSession && selectedSession.unreadCount > 0) {
      onMarkRead(selectedSession.id);
    }
  }, [selectedSession, onMarkRead]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.messages.length]);

  const currentDraft = selectedSession ? replyDrafts[selectedSession.id] || '' : '';

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

  const handleSendManualReply = async (overrideText?: string) => {
    if (!selectedSession || isSending) return;
    const textToSend = (overrideText !== undefined ? overrideText : currentDraft).trim();
    if (!textToSend) return;

    setIsSending(true);
    setReplyDrafts((prev) => ({ ...prev, [selectedSession.id]: '' }));
    onAaronTyping(selectedSession.id, false);
    try {
      await onSendAaronReply(selectedSession.id, textToSend);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC] transition-colors duration-150">
      {/* Top Header */}
      <header className="h-14 px-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-6 shrink-0 bg-white dark:bg-[#212121]">
        {/* Brand & Connection Status */}
        <div className="flex items-center gap-3 select-none">
          {!emblemError && (
            <img
              src={EMBLEM_CLEAN}
              alt="AaronGPT Proof emblem"
              referrerPolicy="no-referrer"
              onError={() => setEmblemError(true)}
              className="w-7 h-7 object-contain shrink-0"
            />
          )}
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-base tracking-tight text-[#0D0D0D] dark:text-[#FFF1D9]">
              Aaron<span className="text-[#FFAA08]">GPT</span>
            </span>
            <span className="text-xs text-[#5D5D5D] dark:text-[#B4B4B4] font-medium">
              Backstage
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 ml-2 text-[11px] text-[#5D5D5D] dark:text-[#B4B4B4]">
            <span aria-hidden="true">·</span>
            <span>{sessions.length} total sessions</span>
            {metrics.waitingCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#FFAA08]">
                  {metrics.waitingCount} awaiting reply
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions: Theme Toggle & Return to Chat */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
            title={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
            className="p-2 rounded-lg text-[#5D5D5D] dark:text-[#B4B4B4] hover:text-[#0D0D0D] dark:hover:text-white hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer shrink-0"
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
            className="px-3.5 py-1.5 rounded-lg bg-[#0D0D0D] dark:bg-[#ECECEC] text-white dark:text-[#0D0D0D] text-xs font-semibold hover:opacity-85 transition-opacity flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Return to Chat</span>
          </button>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Visitor Sessions Queue */}
        <aside
          aria-label="Visitor sessions queue"
          className="w-72 sm:w-80 shrink-0 border-r border-black/10 dark:border-white/10 bg-[#FAFAFA] dark:bg-[#1A1A1A] flex flex-col min-h-0"
        >
          {/* Search & Filter Strip */}
          <div className="p-3 border-b border-black/10 dark:border-white/10 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#5D5D5D] dark:text-[#B4B4B4] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search visitors or text..."
                aria-label="Search visitors or text"
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#262626] border border-black/10 dark:border-white/10 rounded-xl text-xs text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#676767] dark:placeholder-[#9B9B9B] focus:outline-none focus:border-[#FFAA08]"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-[#EFEFEF] dark:bg-[#262626] rounded-lg">
              {(['all', 'waiting', 'resolved'] as const).map((filterKey) => {
                const isActive = statusFilter === filterKey;
                const label =
                  filterKey === 'all'
                    ? 'All'
                    : filterKey === 'waiting'
                    ? `Needs Reply ${metrics.waitingCount > 0 ? `(${metrics.waitingCount})` : ''}`
                    : 'Resolved';
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setStatusFilter(filterKey)}
                    className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
              <div className="p-6 text-center text-xs text-[#5D5D5D] dark:text-[#B4B4B4]">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p className="font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                  No sessions found
                </p>
                <p className="mt-1 text-[11px] leading-relaxed">
                  {sessions.length === 0
                    ? 'When visitors ask questions in the public chat, they will show up here live.'
                    : 'No sessions match your search or filter.'}
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
                    onClick={() => setSelectedSessionId(sess.id)}
                    className={`w-full text-left p-3.5 transition-colors block cursor-pointer ${
                      isSelected
                        ? 'bg-white dark:bg-[#2A2A2A] shadow-xs'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#0D0D0D] dark:text-[#ECECEC] truncate">
                        {sess.alias}
                      </span>
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
                            ? 'text-[#FFAA08] font-semibold'
                            : sess.status === 'resolved'
                            ? 'opacity-60'
                            : 'text-emerald-500 font-medium'
                        }
                      >
                        {isWaiting ? '● Needs Reply' : sess.status === 'resolved' ? 'Resolved' : 'Active'}
                      </span>
                      {sess.isUserTyping ? (
                        <span className="text-[#FFAA08] italic">Typing...</span>
                      ) : (
                        <span className="tabular-nums font-mono">{sess.messages.length} msgs</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Main Panel: Transcript & Reply Composer */}
        <section
          aria-label="Conversation responder"
          className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#212121]"
        >
          {selectedSession ? (
            <>
              {/* Selected Session Header */}
              <div className="px-6 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-4 shrink-0 bg-white dark:bg-[#212121]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                    <span className="truncate">{selectedSession.alias}</span>
                    <span className="text-[#5D5D5D] dark:text-[#B4B4B4] font-normal" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs font-mono text-[#5D5D5D] dark:text-[#B4B4B4]">
                      {selectedSession.id}
                    </span>
                  </div>
                  <div className="text-xs text-[#5D5D5D] dark:text-[#B4B4B4] mt-0.5 flex items-center gap-2">
                    <span>{selectedSession.userAgent}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        selectedSession.status === 'waiting'
                          ? 'text-[#FFAA08] font-semibold'
                          : selectedSession.status === 'resolved'
                          ? 'opacity-60'
                          : 'text-emerald-500 font-medium'
                      }
                    >
                      {selectedSession.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onExitToPublicChat(selectedSession.id)}
                    className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Visitor Screen</span>
                  </button>

                  {selectedSession.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(selectedSession.id, 'resolved')}
                      className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Mark Resolved</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(selectedSession.id, 'waiting')}
                      className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#FFAA08]" />
                      <span>Reopen</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Message Transcript */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {selectedSession.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#5D5D5D] dark:text-[#B4B4B4] px-4">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                      Session connected
                    </p>
                    <p className="text-xs mt-1 max-w-sm leading-relaxed">
                      Waiting for visitor to type their prompt. You can also proactively send a message right now!
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
                        <div className="flex items-center gap-2 text-[11px] text-[#5D5D5D] dark:text-[#B4B4B4] mb-1 px-1">
                          <span className="font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                            {isUser ? selectedSession.alias : 'You (AaronGPT)'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatTimestamp(m.timestamp)}</span>
                          {!isUser && typeof m.responseTimeMs === 'number' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-emerald-500">
                                {(m.responseTimeMs / 1000).toFixed(1)}s
                              </span>
                            </>
                          )}
                        </div>

                        <div
                          className={`max-w-xl rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                            isUser
                              ? 'bg-[#F4F4F4] dark:bg-[#2F2F2F] text-[#0D0D0D] dark:text-[#ECECEC] border border-black/5 dark:border-white/5'
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

              {/* Quick Canned Replies & Reply Box */}
              <div className="p-4 border-t border-black/10 dark:border-white/10 bg-[#FAFAFA] dark:bg-[#1A1A1A] shrink-0 space-y-2.5">
                {/* Canned Quick Replies */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[11px] text-[#5D5D5D] dark:text-[#B4B4B4] flex items-center gap-1 shrink-0 mr-1 select-none">
                    <Sparkles className="w-3 h-3 text-[#FFAA08]" />
                    <span>Quick Replies:</span>
                  </span>
                  {DEFAULT_MACROS.map((macro) => (
                    <button
                      key={macro.id}
                      type="button"
                      onClick={() => handleDraftChange(macro.text)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#262626] border border-black/10 dark:border-white/10 text-xs text-[#0D0D0D] dark:text-[#ECECEC] hover:border-[#FFAA08] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                    >
                      {macro.label}
                    </button>
                  ))}
                </div>

                {/* Reply Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendManualReply();
                  }}
                  className="flex gap-2.5 items-end"
                >
                  <div className="flex-1">
                    <label htmlFor="aaron-manual-reply-input" className="sr-only">
                      Type manual response as AaronGPT
                    </label>
                    <textarea
                      id="aaron-manual-reply-input"
                      rows={2}
                      value={currentDraft}
                      onChange={(e) => handleDraftChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendManualReply();
                        }
                      }}
                      placeholder={`Reply as AaronGPT to ${selectedSession.alias}... (they see "Aaron is thinking..." live)`}
                      className="w-full rounded-2xl bg-white dark:bg-[#262626] border border-black/10 dark:border-white/10 focus:border-[#FFAA08] p-3 text-sm text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#676767] dark:placeholder-[#9B9B9B] focus:outline-none resize-none leading-relaxed shadow-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!currentDraft.trim() || isSending}
                    className="px-4 py-3 rounded-2xl bg-[#FFAA08] hover:bg-[#ffc043] disabled:opacity-30 disabled:pointer-events-none text-black text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4 stroke-[2.5]" />
                    <span>Send Reply</span>
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
                  className="w-16 h-16 object-contain mb-3 opacity-60"
                />
              )}
              <p className="text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                No conversation selected
              </p>
              <p className="text-xs mt-1 max-w-sm">
                When a visitor connects or asks a question, select their session on the left to start replying.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
