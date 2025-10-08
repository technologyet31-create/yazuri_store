// Clean single-server implementation: REST API + WebSocket relay + file persistence
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const REALTIME_TOKEN = process.env.REALTIME_TOKEN || '';

// PostgreSQL connection config (read from env vars or DATABASE_URL)
const POSTGRES_URL = process.env.DATABASE_URL || null;
let pgPool = null;
let usingPostgres = false;

async function tryInitPostgres() {
  try {
    if (!POSTGRES_URL) {
      console.log('Postgres not configured; will use file-based fallback');
      return;
    }
    pgPool = new Pool({ connectionString: POSTGRES_URL });
    const client = await pgPool.connect();
    await client.query('SELECT 1'); // Test connection
    client.release();
    await ensureOrdersTablePostgres();
    usingPostgres = true;
    console.log('Connected to PostgreSQL, using SQL persistence');
  } catch (err) {
    console.warn('Postgres init failed, falling back to file persistence:', err.message || err);
    pgPool = null;
    usingPostgres = false;
  }
}

async function ensureOrdersTablePostgres() {
  if (!pgPool) return;
  const create = `
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      data JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `;
  await pgPool.query(create);
}

// health endpoint will be added after app is initialized

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function loadOrders() {
  if (usingPostgres && pgPool) {
    const res = await pgPool.query('SELECT id, data FROM orders ORDER BY created_at ASC');
    return res.rows.map(r => r.data);
  }
  try {
    ensureDataDir();
    if (!fs.existsSync(ORDERS_FILE)) {
      fs.writeFileSync(ORDERS_FILE, JSON.stringify([]), 'utf8');
      return [];
    }
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Failed to load orders:', err);
    return [];
  }
}

async function saveOrders(orders) {
  if (usingPostgres && pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM orders');
      for (const o of orders) {
        const id = String(o.id || uuidv4());
        await client.query('INSERT INTO orders (id, data) VALUES ($1, $2)', [id, o]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to save orders:', err);
    } finally {
      client.release();
    }
    return;
  }
  try {
    ensureDataDir();
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save orders:', err);
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// Simple token middleware for both REST and WebSocket query param
function checkTokenMiddleware(req, res, next) {
  if (!REALTIME_TOKEN) return next();
  const token = req.header('x-realtime-token') || req.query.token || '';
  if (token !== REALTIME_TOKEN) {
    return res.status(401).json({ error: 'invalid token' });
  }
  next();
}

app.use('/api', checkTokenMiddleware);

// CORS for convenience when serving pages from other host during development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-realtime-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// health endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, mysql: usingPostgres });
});

// REST API
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await loadOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'failed to load orders' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const orders = await loadOrders();
    const order = orders.find((o) => String(o.id) === String(req.params.id));
    if (!order) return res.status(404).json({ error: 'not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'failed to load order' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const incoming = req.body || {};
    const id = incoming.id || uuidv4();
    const now = new Date().toISOString();
    const order = Object.assign({}, incoming, { id, createdAt: now, updatedAt: now });
    const orders = await loadOrders();
    orders.push(order);
    await saveOrders(orders);
    broadcast({ type: 'orders:created', order, orders });
    res.status(201).json(order);
  } catch (err) {
    console.error('post order failed', err);
    res.status(500).json({ error: 'failed to create order' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const orders = await loadOrders();
    const idx = orders.findIndex((o) => String(o.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const existing = orders[idx];
    const updated = Object.assign({}, existing, req.body, { updatedAt: new Date().toISOString() });
    orders[idx] = updated;
    await saveOrders(orders);
    broadcast({ type: 'orders:updated', order: updated, orders });
    res.json(updated);
  } catch (err) {
    console.error('put order failed', err);
    res.status(500).json({ error: 'failed to update order' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const orders = await loadOrders();
    const idx = orders.findIndex((o) => String(o.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const removed = orders.splice(idx, 1)[0];
    await saveOrders(orders);
    broadcast({ type: 'orders:deleted', order: removed, orders });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete order failed', err);
    res.status(500).json({ error: 'failed to delete order' });
  }
});

// Serve static files (the client app)
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);

// WebSocket server for realtime broadcasts
const wss = new WebSocketServer({ server });

function wsVerifyToken(query) {
  if (!REALTIME_TOKEN) return true;
  const token = (query && query.token) || '';
  return token === REALTIME_TOKEN;
}

wss.on('connection', (ws, req) => {
  // simple token check using url query
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tokenOk = wsVerifyToken(Object.fromEntries(url.searchParams.entries()));
  if (!tokenOk) {
    try { ws.close(1008, 'invalid token'); } catch (e) {}
    return;
  }

  // send current orders on connect
  (async () => {
    try {
      const orders = await loadOrders();
      ws.send(JSON.stringify({ type: 'orders:sync', orders }));
    } catch (err) {
      console.error('ws send failed:', err);
    }
  })();

  ws.on('message', (raw) => {
    // relay JSON messages to other clients (but do not persist blindly)
    let msg = null;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      console.warn('received non-json ws message');
      return;
    }
    // Accept 'publish' messages that contain a full orders array and optionally save
    if (msg && msg.type === 'orders:publish' && Array.isArray(msg.orders)) {
      // optional save if client asks for server canonicality
      if (msg.save === true) {
        saveOrders(msg.orders).catch(err => console.error('saveOrders failed', err));
      }
      broadcast(msg, ws);
    } else {
      // broadcast other messages as-is
      broadcast(msg, ws);
    }
  });
});

function broadcast(obj, except) {
  const raw = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client !== except) {
      try { client.send(raw); } catch (e) { console.warn('broadcast failed', e); }
    }
  }
}

(async () => {
  await tryInitPostgres();
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    if (REALTIME_TOKEN) console.log('Realtime token auth is ENABLED');
  });
})();
