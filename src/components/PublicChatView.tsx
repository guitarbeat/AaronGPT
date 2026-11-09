import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, RotateCcw, Sun, Moon } from 'lucide-react';
import { ChatSession } from '../shared/sessionStore';

interface PublicChatViewProps {
  currentSession: ChatSession | undefined;
  userSessions: ChatSession[];
  currentSessionId: string;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onUserTyping: (isTyping: boolean) => void;
  onTriggerSecretAaron: () => void;
  waitingCount: number;
}

const EMBLEM_CLEAN = '/assets/aarongpt_emblem_clean.png';
const WORD_AARON_NIGHT = '/assets/aarongpt_word_aaron_night.png';
const WORD_AARON_DAY = '/assets/aarongpt_word_aaron_day.png';
const WORD_GPT = '/assets/aarongpt_word_gpt.png';
const UNDERLINE_CLEAN = '/assets/aarongpt_underline_clean.png';

const THEME_STORAGE_KEY = 'aarongpt_theme_mode';

export const PublicChatView: React.FC<PublicChatViewProps> = ({
  currentSession,
  theme: controlledTheme,
  onToggleTheme,
  onNewChat,
  onSendMessage,
  onUserTyping,
  onTriggerSecretAaron,
}) => {
  const [internalTheme, setInternalTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  const theme = controlledTheme ?? internalTheme;
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emblemError, setEmblemError] = useState(false);
  const [wordmarkError, setWordmarkError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const messages = currentSession?.messages || [];
  const isAaronTyping = Boolean(currentSession?.isAaronTyping);
  const isWaitingForAaron =
    messages.length > 0 && messages[messages.length - 1].sender === 'user';
  const hasMessages = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isAaronTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    onUserTyping(val.trim().length > 0);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onUserTyping(false);
    }, 2500);
  };

  const handleSend = async (textToSend?: string) => {
    const payload = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!payload || isSubmitting) return;

    setIsSubmitting(true);
    setInputText('');
    onUserTyping(false);
    try {
      await onSendMessage(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else {
      setInternalTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }
  };

  const aaronWordSrc = theme === 'dark' ? WORD_AARON_NIGHT : WORD_AARON_DAY;

  const renderComposer = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
      className="relative flex items-end gap-2 rounded-3xl bg-[#F4F4F4] dark:bg-[#2F2F2F] border border-black/10 dark:border-white/10 focus-within:border-black/25 dark:focus-within:border-white/25 transition-colors px-4 py-3 shadow-xs"
    >
      <label htmlFor="aarongpt-prompt-input" className="sr-only">
        Ask AaronGPT
      </label>
      <textarea
        id="aarongpt-prompt-input"
        rows={1}
        value={inputText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything"
        className="flex-1 max-h-36 resize-none bg-transparent text-base sm:text-[15px] text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#676767] dark:placeholder-[#9B9B9B] focus:outline-none leading-relaxed py-0.5"
      />
      <button
        type="submit"
        disabled={!inputText.trim() || isSubmitting}
        aria-label="Send message"
        className="w-8 h-8 rounded-full bg-[#0D0D0D] dark:bg-[#ECECEC] text-white dark:text-[#0D0D0D] hover:opacity-85 disabled:opacity-20 disabled:pointer-events-none transition-opacity flex items-center justify-center shrink-0 cursor-pointer"
      >
        <ArrowUp className="w-4 h-4 stroke-[2.5]" />
      </button>
    </form>
  );

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC] transition-colors duration-150">
      {/* Minimal Top Bar */}
      <header className="h-14 px-4 sm:px-5 flex items-center justify-between gap-4 shrink-0">
        {/* Top-left lockup: ONLY the word "Aaron" is clickable */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0 select-none">
          {!emblemError && (
            <img
              src={EMBLEM_CLEAN}
              alt="AaronGPT emblem"
              referrerPolicy="no-referrer"
              onError={() => setEmblemError(true)}
              className="w-7 h-7 object-contain shrink-0 pointer-events-none"
            />
          )}
          <div className="text-lg font-semibold tracking-tight flex items-baseline">
            <button
              type="button"
              onClick={onTriggerSecretAaron}
              title="Aaron"
              aria-label="Aaron"
              data-testid="secret-aaron-header-trigger"
              className="text-[#0D0D0D] dark:text-[#FFF1D9] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-[#FFAA08] rounded transition-opacity cursor-pointer font-bold"
            >
              Aaron
            </button>
            <span className="text-[#FFAA08] font-bold">GPT</span>
          </div>
        </div>

        {/* Right Controls: New Chat (when active) + Day/Night Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {hasMessages && (
            <button
              type="button"
              onClick={onNewChat}
              aria-label="New chat"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4] hover:text-[#0D0D0D] dark:hover:text-white hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New chat</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
            title={theme === 'dark' ? 'Switch to day theme' : 'Switch to night theme'}
            data-testid="theme-toggle-button"
            className="p-2 rounded-lg text-[#5D5D5D] dark:text-[#B4B4B4] hover:text-[#0D0D0D] dark:hover:text-white hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Viewport: Either Official Main Logo Lockup + Input OR Clean Message Stream */}
      {!hasMessages ? (
        <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
          <div className="w-full max-w-2xl flex flex-col items-center">
            {/* Official Main Logo reconstructed from clean high-res slices so ONLY "Aaron" is clickable */}
            <div className="mb-8 flex flex-col items-center select-none">
              {!emblemError && (
                <img
                  src={EMBLEM_CLEAN}
                  alt="AaronGPT mascot Proof"
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemError(true)}
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain pointer-events-none"
                />
              )}

              {!wordmarkError ? (
                <div className="flex flex-col items-center mt-0.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={onTriggerSecretAaron}
                      aria-label="Aaron"
                      title="Aaron"
                      data-testid="secret-aaron-hero-trigger"
                      className="cursor-pointer hover:opacity-85 focus-visible:outline-2 focus-visible:outline-[#FFAA08] rounded transition-opacity"
                    >
                      <img
                        src={aaronWordSrc}
                        alt="Aaron"
                        referrerPolicy="no-referrer"
                        onError={() => setWordmarkError(true)}
                        className="h-9 sm:h-11 w-auto object-contain block"
                      />
                    </button>
                    <img
                      src={WORD_GPT}
                      alt="GPT"
                      referrerPolicy="no-referrer"
                      onError={() => setWordmarkError(true)}
                      className="h-9 sm:h-11 w-auto object-contain pointer-events-none block"
                    />
                  </div>
                  <img
                    src={UNDERLINE_CLEAN}
                    alt=""
                    aria-hidden="true"
                    referrerPolicy="no-referrer"
                    className="h-2 sm:h-2.5 w-auto object-contain pointer-events-none mt-2"
                  />
                </div>
              ) : (
                <h1 className="font-pixel text-3xl sm:text-4xl tracking-tight flex items-baseline mt-2">
                  <button
                    type="button"
                    onClick={onTriggerSecretAaron}
                    aria-label="Aaron"
                    data-testid="secret-aaron-hero-trigger"
                    className="text-[#0D0D0D] dark:text-[#FFF1D9] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-[#FFAA08] rounded transition-opacity cursor-pointer"
                  >
                    Aaron
                  </button>
                  <span className="text-[#FFAA08]">GPT</span>
                </h1>
              )}
            </div>

            <div className="w-full">{renderComposer()}</div>
          </div>
        </main>
      ) : (
        <>
          <main className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-2xl mx-auto space-y-6 pb-6">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3.5 ${
                      isUser ? 'justify-end' : 'justify-start items-start'
                    }`}
                  >
                    {!isUser && (
                      <div
                        aria-hidden="true"
                        className="w-8 h-8 flex items-center justify-center shrink-0 mt-0.5 select-none"
                      >
                        {!emblemError ? (
                          <img
                            src={EMBLEM_CLEAN}
                            alt="Proof"
                            referrerPolicy="no-referrer"
                            onError={() => setEmblemError(true)}
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <span className="font-pixel text-xs text-[#FFAA08]">A</span>
                        )}
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-[#F4F4F4] dark:bg-[#2F2F2F] text-[#0D0D0D] dark:text-[#ECECEC] rounded-3xl px-4 py-2.5'
                          : 'text-[#0D0D0D] dark:text-[#ECECEC] py-1'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {/* Subtle "Aaron is thinking" animation when operator is typing a reply (or awaiting reply) */}
              {(isAaronTyping || isWaitingForAaron) && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="aaron-thinking-indicator"
                  className="flex gap-3.5 justify-start items-center"
                >
                  <div
                    aria-hidden="true"
                    className="w-8 h-8 flex items-center justify-center shrink-0 select-none"
                  >
                    {!emblemError ? (
                      <img
                        src={EMBLEM_CLEAN}
                        alt="Proof"
                        referrerPolicy="no-referrer"
                        onError={() => setEmblemError(true)}
                        className="w-full h-full object-contain pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)] dark:drop-shadow-none"
                      />
                    ) : (
                      <span className="font-pixel text-xs text-[#FFAA08]">A</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 py-1 text-sm text-[#5D5D5D] dark:text-[#B4B4B4]">
                    <span className="animate-thinking-text font-medium">
                      Aaron is thinking
                    </span>
                    <span className="inline-flex items-center gap-0.5 ml-0.5" aria-hidden="true">
                      <span className="w-1 h-1 rounded-full bg-[#5D5D5D] dark:bg-[#B4B4B4] animate-thinking-dot-1" />
                      <span className="w-1 h-1 rounded-full bg-[#5D5D5D] dark:bg-[#B4B4B4] animate-thinking-dot-2" />
                      <span className="w-1 h-1 rounded-full bg-[#5D5D5D] dark:bg-[#B4B4B4] animate-thinking-dot-3" />
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </main>

          <footer className="px-4 pb-6 pt-2 bg-white dark:bg-[#212121] shrink-0 transition-colors duration-150">
            <div className="max-w-2xl mx-auto">{renderComposer()}</div>
          </footer>
        </>
      )}
    </div>
  );
};
