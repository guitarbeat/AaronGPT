import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSeedState,
  ensureSession,
  resetSession,
  addUserMessage,
  addAaronReply,
  setTypingIndicator,
  updateSessionStatus,
  computeDashboardMetrics,
  filterSessionsAndHistory,
} from './sessionStore';

test('seed state initializes empty with no demo sessions', () => {
  const state = createInitialSeedState();
  const sessions = Object.values(state.sessions);
  assert.equal(sessions.length, 0);

  const metrics = computeDashboardMetrics(sessions);
  assert.equal(metrics.totalSessions, 0);
  assert.equal(metrics.waitingCount, 0);
  assert.equal(metrics.totalMessages, 0);
});

test('assigns sequential Visitor #1, Visitor #2 names and preserves number across resetSession', () => {
  const state = createInitialSeedState();
  addUserMessage(state, 'sess-v1', 'First visitor question', 'm-v1-1', 1000);
  addUserMessage(state, 'sess-v2', 'Second visitor question', 'm-v2-1', 2000);

  assert.equal(state.sessions['sess-v1'].alias, 'Visitor #1');
  assert.equal(state.sessions['sess-v2'].alias, 'Visitor #2');

  // Resetting sess-v1 removes it from active sessions until they send a new message
  const removed = resetSession(state, 'sess-v1');
  assert.equal(removed, true);
  assert.equal('sess-v1' in state.sessions, false);

  // Sending a new message from sess-v1 reuses Visitor #1 without multiplying visitor numbers
  addUserMessage(state, 'sess-v1', 'Follow-up after new chat', 'm-v1-2', 3000);
  const restored = state.sessions['sess-v1'];
  assert.ok(restored);
  assert.equal(restored.alias, 'Visitor #1');
  assert.equal(restored.messages.length, 1);
});

test('addUserMessage creates or updates a session and transitions status to waiting', () => {
  const state = createInitialSeedState(1700000000000);
  const session = ensureSession(state, 'sess-custom-1', 'Visitor #999 (You)', 'TestBrowser', 1700000001000);
  assert.equal(session.alias, 'Visitor #1');
  assert.equal(session.status, 'active');
  assert.equal(session.messages.length, 0);

  const msg = addUserMessage(state, 'sess-custom-1', 'Can you help me debug my SQL query?', 'msg-custom-1', 1700000005000);
  assert.ok(msg);
  assert.equal(msg.sender, 'user');
  assert.equal(session.status, 'waiting');
  assert.equal(session.unreadCount, 1);
  assert.equal(session.title, 'Can you help me debug my SQL query?');

  // Idempotent duplicate check
  const duplicate = addUserMessage(state, 'sess-custom-1', 'Can you help me debug my SQL query?', 'msg-custom-1', 1700000006000);
  assert.equal(session.messages.length, 1);
  assert.equal(duplicate?.id, 'msg-custom-1');
});

test('addAaronReply clears waiting state, resets unreadCount, and calculates responseTimeMs', () => {
  const state = createInitialSeedState(1700000000000);
  ensureSession(state, 'sess-custom-2', 'Visitor #500', 'TestBrowser', 1700000000000);
  addUserMessage(state, 'sess-custom-2', 'Hello Aaron!', 'msg-u-500', 1700000010000);
  setTypingIndicator(state, 'sess-custom-2', 'aaron', true);
  assert.equal(state.sessions['sess-custom-2'].isAaronTyping, true);

  const reply = addAaronReply(
    state,
    'sess-custom-2',
    'Hey there! Yes, I am right here typing live.',
    'msg-a-500',
    1700000014500
  );

  assert.ok(reply);
  assert.equal(reply.sender, 'aaron');
  assert.equal(reply.responseTimeMs, 4500);
  assert.equal(state.sessions['sess-custom-2'].status, 'active');
  assert.equal(state.sessions['sess-custom-2'].unreadCount, 0);
  assert.equal(state.sessions['sess-custom-2'].isAaronTyping, false);
});

test('filterSessionsAndHistory filters by query, status, and sender accurately', () => {
  const state = createInitialSeedState();
  ensureSession(state, 'sess-t1', 'Visitor Alpha', 'Browser', 1000);
  addUserMessage(state, 'sess-t1', 'Need help with SQLite database', 'm1', 1000);
  addAaronReply(state, 'sess-t1', 'Here is SQLite documentation', 'm2', 2000);

  ensureSession(state, 'sess-t2', 'Visitor Beta', 'Browser', 3000);
  addUserMessage(state, 'sess-t2', 'Another pending question', 'm3', 3000);

  const allSessions = Object.values(state.sessions);

  const waitingResult = filterSessionsAndHistory(allSessions, { statusFilter: 'waiting' });
  assert.equal(waitingResult.filteredSessions.length, 1);
  assert.equal(waitingResult.filteredSessions[0].id, 'sess-t2');

  const queryResult = filterSessionsAndHistory(allSessions, { query: 'SQLite' });
  assert.equal(queryResult.filteredSessions.length, 1);
  assert.equal(queryResult.filteredSessions[0].id, 'sess-t1');

  const aaronLogs = filterSessionsAndHistory(allSessions, { senderFilter: 'aaron' });
  assert.equal(aaronLogs.flatLogs.length, 1);
  assert.equal(aaronLogs.flatLogs[0].sender, 'aaron');

  updateSessionStatus(state, 'sess-t2', 'resolved', 4000);
  assert.equal(state.sessions['sess-t2'].status, 'resolved');
});
