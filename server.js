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

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[socket-server] running on http://localhost:${PORT}`);
});
