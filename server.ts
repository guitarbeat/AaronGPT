import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  createInitialSeedState,
  ensureSession,
  addUserMessage,
  addAaronReply,
  setTypingIndicator,
  updateSessionStatus,
  markSessionRead,
  SessionStatus,
} from './src/shared/sessionStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const state = createInitialSeedState();

interface ClientMeta {
  ws: WebSocket;
  sessionId?: string;
  role: 'user' | 'operator';
}

const clients = new Set<ClientMeta>();

function broadcastState(eventType: string = 'state:sync', extra: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    type: eventType,
    sessions: state.sessions,
    ...extra,
  });

  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(
    '/AaronGPT_Brand_Kit',
    express.static(path.resolve(__dirname, 'AaronGPT_Brand_Kit'))
  );

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    const meta: ClientMeta = { ws, role: 'user' };
    clients.add(meta);

    ws.send(
      JSON.stringify({
        type: 'state:init',
        sessions: state.sessions,
      })
    );

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw));
        switch (data.type) {
          case 'session:join': {
            const { sessionId, alias, userAgent, role } = data;
            if (role === 'operator') {
              meta.role = 'operator';
            }
            if (sessionId) {
              meta.sessionId = sessionId;
              ensureSession(state, sessionId, alias, userAgent);
              broadcastState('session:updated', { sessionId });
            }
            break;
          }
          case 'session:create': {
            const { sessionId, alias, userAgent } = data;
            if (sessionId) {
              meta.sessionId = sessionId;
              ensureSession(state, sessionId, alias, userAgent);
              broadcastState('session:created', { sessionId });
            }
            break;
          }
          case 'message:user': {
            const { sessionId, text, messageId, alias, userAgent } = data;
            if (sessionId && text) {
              ensureSession(state, sessionId, alias, userAgent);
              const message = addUserMessage(state, sessionId, text, messageId);
              if (message) {
                broadcastState('message:created', { sessionId, message });
              }
            }
            break;
          }
          case 'message:aaron': {
            const { sessionId, text, messageId } = data;
            if (sessionId && text) {
              const message = addAaronReply(state, sessionId, text, messageId);
              if (message) {
                broadcastState('message:created', { sessionId, message });
              }
            }
            break;
          }
          case 'typing:set': {
            const { sessionId, actor, isTyping } = data;
            if (sessionId && (actor === 'user' || actor === 'aaron')) {
              setTypingIndicator(state, sessionId, actor, Boolean(isTyping));
              broadcastState('typing:updated', { sessionId, actor, isTyping: Boolean(isTyping) });
            }
            break;
          }
          case 'session:status': {
            const { sessionId, status } = data;
            if (sessionId && status) {
              updateSessionStatus(state, sessionId, status as SessionStatus);
              broadcastState('session:updated', { sessionId });
            }
            break;
          }
          case 'session:read': {
            const { sessionId } = data;
            if (sessionId) {
              markSessionRead(state, sessionId);
              broadcastState('session:updated', { sessionId });
            }
            break;
          }
          default:
            break;
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      clients.delete(meta);
      if (meta.sessionId && state.sessions[meta.sessionId]) {
        // Check if any other client is still connected to this sessionId
        const stillConnected = Array.from(clients).some((c) => c.sessionId === meta.sessionId);
        if (!stillConnected) {
          state.sessions[meta.sessionId].isConnected = false;
          state.sessions[meta.sessionId].isUserTyping = false;
          broadcastState('session:updated', { sessionId: meta.sessionId });
        }
      }
    });
  });

  // REST API Endpoints for resilient sync & actions
  app.get('/api/state', (_req, res) => {
    res.json({ sessions: state.sessions });
  });

  app.post('/api/session/join', (req, res) => {
    const { sessionId, alias, userAgent } = req.body || {};
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    const session = ensureSession(state, sessionId, alias, userAgent);
    broadcastState('session:updated', { sessionId });
    res.json({ session, sessions: state.sessions });
  });

  app.post('/api/message/user', (req, res) => {
    const { sessionId, text, messageId, alias, userAgent } = req.body || {};
    if (!sessionId || !text || !String(text).trim()) {
      res.status(400).json({ error: 'sessionId and non-empty text are required' });
      return;
    }
    ensureSession(state, sessionId, alias, userAgent);
    const message = addUserMessage(state, sessionId, String(text), messageId);
    broadcastState('message:created', { sessionId, message });
    res.json({ message, sessions: state.sessions });
  });

  app.post('/api/message/aaron', (req, res) => {
    const { sessionId, text, messageId } = req.body || {};
    if (!sessionId || !text || !String(text).trim()) {
      res.status(400).json({ error: 'sessionId and non-empty text are required' });
      return;
    }
    const message = addAaronReply(state, sessionId, String(text), messageId);
    if (!message) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    broadcastState('message:created', { sessionId, message });
    res.json({ message, sessions: state.sessions });
  });

  app.post('/api/typing', (req, res) => {
    const { sessionId, actor, isTyping } = req.body || {};
    if (!sessionId || (actor !== 'user' && actor !== 'aaron')) {
      res.status(400).json({ error: 'Valid sessionId and actor are required' });
      return;
    }
    const session = setTypingIndicator(state, sessionId, actor, Boolean(isTyping));
    broadcastState('typing:updated', { sessionId, actor, isTyping: Boolean(isTyping) });
    res.json({ session, sessions: state.sessions });
  });

  app.post('/api/session/status', (req, res) => {
    const { sessionId, status } = req.body || {};
    if (!sessionId || !status) {
      res.status(400).json({ error: 'sessionId and status are required' });
      return;
    }
    const session = updateSessionStatus(state, sessionId, status as SessionStatus);
    broadcastState('session:updated', { sessionId });
    res.json({ session, sessions: state.sessions });
  });

  app.post('/api/session/read', (req, res) => {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    const session = markSessionRead(state, sessionId);
    broadcastState('session:updated', { sessionId });
    res.json({ session, sessions: state.sessions });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AaronGPT server listening on http://localhost:${PORT}`);
  });
}

startServer();
