require('dotenv').config();
const express = require('express');
const http    = require('http');
const cors    = require('cors');
const { Server } = require('socket.io');

const PORT         = process.env.PORT || 3001;
const EMIT_SECRET  = process.env.EMIT_SECRET || 'pratham-internal-secret';

const app    = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log('[ws] connected:', socket.id);

  // Mobile client joins the room for the project they are viewing
  socket.on('join:project', (projectId) => {
    if (projectId) {
      socket.join(`project:${projectId}`);
      console.log(`[ws] ${socket.id} → project:${projectId}`);
    }
  });

  socket.on('leave:project', (projectId) => {
    if (projectId) {
      socket.leave(`project:${projectId}`);
    }
  });

  // Org-wide room (optional — for notifications that span projects)
  socket.on('join:org', (orgId) => {
    if (orgId) socket.join(`org:${orgId}`);
  });

  socket.on('disconnect', (reason) => {
    console.log('[ws] disconnected:', socket.id, reason);
  });
});

// ── Internal emit endpoint (called by Next.js API routes) ─────────────────────
// POST /emit  { secret, room, event, payload }
app.post('/emit', (req, res) => {
  const { secret, room, event, payload } = req.body;

  if (secret !== EMIT_SECRET) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!room || !event) {
    return res.status(400).json({ message: 'room and event are required' });
  }

  io.to(room).emit(event, payload || {});
  console.log(`[emit] ${room} → ${event}`, payload);
  res.json({ ok: true });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', connections: io.engine.clientsCount }));

// ── Keep-alive ping (prevents Render free tier from sleeping) ─────────────────
// Render spins down after 15 min of inactivity — ping every 14 min to stay awake.
// RENDER_EXTERNAL_URL is set automatically by Render in production.
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes

setInterval(() => {
  http.get(`${SELF_URL}/health`, (res) => {
    console.log(`[keep-alive] ping → ${res.statusCode}`);
  }).on('error', (err) => {
    console.warn('[keep-alive] ping failed:', err.message);
  });
}, PING_INTERVAL);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[socket-server] running on http://localhost:${PORT}`);
  console.log(`[keep-alive] pinging ${SELF_URL}/health every 14 minutes`);
});
