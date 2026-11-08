export type SessionStatus = 'waiting' | 'active' | 'resolved';

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'aaron';
  text: string;
  timestamp: number;
  responseTimeMs?: number;
}

export interface ChatSession {
  id: string;
  alias: string;
  title: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  isConnected: boolean;
  isAaronTyping: boolean;
  isUserTyping: boolean;
  unreadCount: number;
  userAgent: string;
  messages: ChatMessage[];
}

export interface StoreState {
  sessions: Record<string, ChatSession>;
}

export interface CannedMacro {
  id: string;
  label: string;
  text: string;
}

export const DEFAULT_MACROS: CannedMacro[] = [
  {
    id: 'macro-1',
    label: 'Hold on, thinking...',
    text: 'Give me one second while I look closer at your question — I want to give you an exact answer rather than a generic guess.',
  },
  {
    id: 'macro-2',
    label: 'Reveal the secret',
    text: 'Plot twist: there is no neural network here. It is literally just me, Aaron, typing back to you in real time from my dashboard.',
  },
  {
    id: 'macro-3',
    label: 'Ask for context',
    text: 'Could you share a bit more detail on what you are trying to build or solve? That will help me tailor this specifically for you.',
  },
  {
    id: 'macro-4',
    label: 'Short & direct',
    text: 'Yes — go ahead and do it. It is much simpler than overthinking the edge cases right now.',
  },
];

let counter = 1000;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function createInitialSeedState(_now?: number): StoreState {
  return { sessions: {} };
}

export function deriveSessionTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New conversation';
  return cleaned.length > 44 ? `${cleaned.slice(0, 41)}...` : cleaned;
}

export function ensureSession(
  state: StoreState,
  sessionId: string,
  alias?: string,
  userAgent: string = 'Web Browser',
  now: number = Date.now()
): ChatSession {
  const existing = state.sessions[sessionId];
  if (existing) {
    existing.isConnected = true;
    return existing;
  }

  const count = Object.keys(state.sessions).length + 403;
  const newSession: ChatSession = {
    id: sessionId,
    alias: alias || `Visitor #${count}`,
    title: 'New conversation',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    isConnected: true,
    isAaronTyping: false,
    isUserTyping: false,
    unreadCount: 0,
    userAgent,
    messages: [],
  };

  state.sessions[sessionId] = newSession;
  return newSession;
}

export function addUserMessage(
  state: StoreState,
  sessionId: string,
  text: string,
  messageId?: string,
  now: number = Date.now()
): ChatMessage | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const session = ensureSession(state, sessionId, undefined, undefined, now);
  const id = messageId || nextId('msg-u');

  // Idempotency check
  const duplicate = session.messages.find((m) => m.id === id);
  if (duplicate) return duplicate;

  const message: ChatMessage = {
    id,
    sessionId,
    sender: 'user',
    text: trimmed,
    timestamp: now,
  };

  if (session.messages.length === 0 || session.title === 'New conversation') {
    session.title = deriveSessionTitle(trimmed);
  }

  session.messages.push(message);
  session.status = 'waiting';
  session.updatedAt = now;
  session.isUserTyping = false;
  session.unreadCount += 1;

  return message;
}

export function addAaronReply(
  state: StoreState,
  sessionId: string,
  text: string,
  messageId?: string,
  now: number = Date.now()
): ChatMessage | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const session = state.sessions[sessionId];
  if (!session) return null;

  const id = messageId || nextId('msg-a');
  const duplicate = session.messages.find((m) => m.id === id);
  if (duplicate) return duplicate;

  // Find last user message timestamp to compute response time
  let responseTimeMs: number | undefined;
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].sender === 'user') {
      responseTimeMs = Math.max(200, now - session.messages[i].timestamp);
      break;
    }
  }

  const message: ChatMessage = {
    id,
    sessionId,
    sender: 'aaron',
    text: trimmed,
    timestamp: now,
    responseTimeMs,
  };

  session.messages.push(message);
  session.status = 'active';
  session.updatedAt = now;
  session.isAaronTyping = false;
  session.unreadCount = 0;

  return message;
}

export function setTypingIndicator(
  state: StoreState,
  sessionId: string,
  actor: 'user' | 'aaron',
  isTyping: boolean
): ChatSession | null {
  const session = state.sessions[sessionId];
  if (!session) return null;

  if (actor === 'aaron') {
    session.isAaronTyping = isTyping;
  } else {
    session.isUserTyping = isTyping;
  }
  return session;
}

export function updateSessionStatus(
  state: StoreState,
  sessionId: string,
  status: SessionStatus,
  now: number = Date.now()
): ChatSession | null {
  const session = state.sessions[sessionId];
  if (!session) return null;

  session.status = status;
  if (status !== 'waiting') {
    session.unreadCount = 0;
  }
  session.updatedAt = now;
  return session;
}

export function markSessionRead(
  state: StoreState,
  sessionId: string
): ChatSession | null {
  const session = state.sessions[sessionId];
  if (!session) return null;
  session.unreadCount = 0;
  return session;
}

export interface DashboardMetrics {
  totalSessions: number;
  waitingCount: number;
  activeConnectedCount: number;
  totalMessages: number;
  avgResponseTimeSec: number;
}

export function computeDashboardMetrics(sessions: ChatSession[]): DashboardMetrics {
  let waitingCount = 0;
  let activeConnectedCount = 0;
  let totalMessages = 0;
  let responseTimeSum = 0;
  let responseTimeCount = 0;

  for (const s of sessions) {
    if (s.status === 'waiting') waitingCount += 1;
    if (s.isConnected) activeConnectedCount += 1;
    totalMessages += s.messages.length;
    for (const m of s.messages) {
      if (m.sender === 'aaron' && typeof m.responseTimeMs === 'number') {
        responseTimeSum += m.responseTimeMs;
        responseTimeCount += 1;
      }
    }
  }

  const avgResponseTimeSec =
    responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount / 100) / 10 : 0;

  return {
    totalSessions: sessions.length,
    waitingCount,
    activeConnectedCount,
    totalMessages,
    avgResponseTimeSec,
  };
}

export interface FlatHistoryLogItem {
  messageId: string;
  sessionId: string;
  sessionAlias: string;
  sessionTitle: string;
  sessionStatus: SessionStatus;
  sender: 'user' | 'aaron';
  text: string;
  timestamp: number;
  responseTimeMs?: number;
}

export function filterSessionsAndHistory(
  sessions: ChatSession[],
  options: {
    query?: string;
    statusFilter?: 'all' | SessionStatus;
    senderFilter?: 'all' | 'user' | 'aaron';
  }
): {
  filteredSessions: ChatSession[];
  flatLogs: FlatHistoryLogItem[];
} {
  const q = (options.query || '').trim().toLowerCase();
  const statusFilter = options.statusFilter || 'all';
  const senderFilter = options.senderFilter || 'all';

  const sortedSessions = [...sessions].sort((a, b) => {
    // Waiting first, then by updatedAt descending
    if (a.status === 'waiting' && b.status !== 'waiting') return -1;
    if (b.status === 'waiting' && a.status !== 'waiting') return 1;
    return b.updatedAt - a.updatedAt;
  });

  const filteredSessions = sortedSessions.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!q) return true;
    const inMeta =
      s.alias.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q);
    if (inMeta) return true;
    return s.messages.some((m) => m.text.toLowerCase().includes(q));
  });

  const flatLogs: FlatHistoryLogItem[] = [];
  for (const s of sortedSessions) {
    if (statusFilter !== 'all' && s.status !== statusFilter) continue;
    for (const m of s.messages) {
      if (senderFilter !== 'all' && m.sender !== senderFilter) continue;
      if (q) {
        const matches =
          m.text.toLowerCase().includes(q) ||
          s.alias.toLowerCase().includes(q) ||
          s.title.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q);
        if (!matches) continue;
      }
      flatLogs.push({
        messageId: m.id,
        sessionId: s.id,
        sessionAlias: s.alias,
        sessionTitle: s.title,
        sessionStatus: s.status,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        responseTimeMs: m.responseTimeMs,
      });
    }
  }

  flatLogs.sort((a, b) => b.timestamp - a.timestamp);

  return { filteredSessions, flatLogs };
}
