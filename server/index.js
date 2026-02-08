require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  }
});

app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: true
}));
app.use(express.json());

const SECRET_KEY = '8gapp-secret-key'; // In prod, use env var

// Initialize Database
db.initDatabase();

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- Auth Routes ---

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await db.get("SELECT * FROM users WHERE username = $1", [username]);
    if (!user) return res.status(400).send('User not found');

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) return res.status(400).send('Invalid password');

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET_KEY);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name, avatar_config: JSON.parse(user.avatar_config) } });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get("SELECT id, username, role, name, avatar_config, birth_date, first_login FROM users WHERE id = $1", [req.user.id]);
    if (!user) return res.status(404).send('User not found');
    
    // Get points if student
    if (user.role === 'student') {
        const points = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [user.id]);
        user.points = points || { total_points: 0, spendable_points: 0 };
    }
    
    try {
      const parsed = JSON.parse(user.avatar_config || '{}');
      user.avatar_config = Object.keys(parsed).length === 0 ? null : parsed;
    } catch {
      user.avatar_config = null;
    }
    res.json(user);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/me/birthday', authenticateToken, async (req, res) => {
    const { birth_date } = req.body;
    try {
      await db.run("UPDATE users SET birth_date = $1, first_login = FALSE WHERE id = $2", [birth_date, req.user.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).send(err.message);
    }
});

app.post('/api/me/avatar', authenticateToken, async (req, res) => {
    const { avatar_config } = req.body;
    try {
      const cfg = avatar_config || {};
      await db.run("UPDATE users SET avatar_config = $1 WHERE id = $2", [JSON.stringify(cfg), req.user.id]);
      res.json({ success: true });
    } catch (e) {
      return res.status(400).json({ error: 'Geçersiz avatar yapılandırması' });
    }
});

// --- Shop Routes ---

// Get All Items
app.get('/api/items', authenticateToken, async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM items");
      res.json(rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// Get User Inventory
app.get('/api/inventory', authenticateToken, async (req, res) => {
    try {
      const rows = await db.all(`
          SELECT ui.*, i.name, i.category, i.cost, i.asset_id 
          FROM user_items ui 
          JOIN items i ON ui.item_id = i.id 
          WHERE ui.user_id = $1`, 
          [req.user.id]);
      res.json(rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// Get Inventory for specific user (teacher only)
app.get('/api/users/:id/inventory', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { id } = req.params;
    try {
      const rows = await db.all(`
          SELECT ui.*, i.name, i.category, i.cost, i.asset_id 
          FROM user_items ui 
          JOIN items i ON ui.item_id = i.id 
          WHERE ui.user_id = $1`, 
          [id]);
      res.json(rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// Buy Item
app.post('/api/items/buy', authenticateToken, async (req, res) => {
    const { item_id } = req.body;
    
    try {
      const item = await db.get("SELECT * FROM items WHERE id = $1", [item_id]);
      if (!item) return res.status(404).send('Item not found');

      // Clothing is free
      if (item.category === 'clothing') {
          const owned = await db.get("SELECT * FROM user_items WHERE user_id = $1 AND item_id = $2", [req.user.id, item_id]);
          if (owned) return res.status(400).json({ error: 'Zaten sahipsin' });
          
          await db.run("INSERT INTO user_items (user_id, item_id) VALUES ($1, $2)", [req.user.id, item_id]);
          return res.json({ success: true, message: 'Ücretsiz eklendi' });
      }

      // Other categories (e.g., frame) require points
      const pointsRow = await db.get("SELECT spendable_points FROM points WHERE user_id = $1", [req.user.id]);
      if (!pointsRow || pointsRow.spendable_points < item.cost) {
          return res.status(400).json({ error: 'Yetersiz puan' });
      }
      
      const owned = await db.get("SELECT * FROM user_items WHERE user_id = $1 AND item_id = $2", [req.user.id, item_id]);
      if (owned) return res.status(400).json({ error: 'Zaten sahipsin' });

      // Transaction-like sequence
      await db.run("UPDATE points SET spendable_points = spendable_points - $1 WHERE user_id = $2", [item.cost, req.user.id]);
      await db.run("INSERT INTO user_items (user_id, item_id) VALUES ($1, $2)", [req.user.id, item_id]);
      await db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES ($1, $2, $3, $4, 'shop')", 
          [req.user.id, null, -item.cost, `Satın alma: ${item.name}`]);
      
      res.json({ success: true, message: 'Satın alındı' });
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// Add spendable points only (bonus)
app.post('/api/spendable/add', authenticateToken, async (req, res) => {
  const { user_id, amount, reason } = req.body;
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const amt = parseInt(String(amount || 0), 10);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Geçersiz miktar' });
  
  try {
    await db.run("UPDATE points SET spendable_points = spendable_points + $1 WHERE user_id = $2", [amt, user_id]);
    await db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES ($1, $2, $3, $4, 'bonus')", 
      [req.user.id, user_id, amt, reason || 'Bonus / Pomodoro']);
    res.json({ success: true, amount: amt });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Create Item (teacher only)
app.post('/api/items', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { name, category, cost, asset_id } = req.body;
  try {
    const result = await db.run("INSERT INTO items (name, category, cost, asset_id) VALUES ($1, $2, $3, $4) RETURNING id", [name, category, cost, asset_id]);
    res.json({ id: result.rows[0].id, name, category, cost, asset_id });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Update Item (teacher only)
app.put('/api/items/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { id } = req.params;
  const { name, category, cost, asset_id } = req.body;
  try {
    await db.run("UPDATE items SET name = $1, category = $2, cost = $3, asset_id = $4 WHERE id = $5", [name, category, cost, asset_id, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete Item (teacher only)
app.delete('/api/items/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { id } = req.params;
  try {
    await db.run("DELETE FROM items WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Leaderboard Routes ---
app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    try {
      const rows = await db.all(`
          SELECT u.id, u.name, u.username, u.avatar_config, p.total_points 
          FROM users u 
          JOIN points p ON u.id = p.user_id 
          WHERE u.role = 'student' 
          ORDER BY p.total_points DESC`);
          
      const leaderboard = rows.map(r => ({
          ...r,
          avatar_config: JSON.parse(r.avatar_config)
      }));
      res.json(leaderboard);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// Weekly Top Student (last 7 days net academic points)
app.get('/api/leaderboard/weeklyTop', authenticateToken, async (req, res) => {
    try {
      const row = await db.get(`
          SELECT u.id, u.name, u.username, u.avatar_config, COALESCE(SUM(t.amount), 0) as weekly_points
          FROM users u
          LEFT JOIN transactions t 
            ON t.to_user_id = u.id 
           AND t.type = 'academic' 
           AND t.created_at >= NOW() - INTERVAL '7 days'
          WHERE u.role = 'student'
          GROUP BY u.id
          ORDER BY weekly_points DESC
          LIMIT 1
      `);
      
      if (!row) return res.json(null);
      let parsed = {};
      try {
          parsed = JSON.parse(row.avatar_config || '{}');
      } catch {
          parsed = {};
      }
      res.json({ 
          id: row.id, 
          name: row.name, 
          username: row.username, 
          avatar_config: Object.keys(parsed).length === 0 ? null : parsed, 
          weekly_points: row.weekly_points 
      });
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// --- Teacher Routes ---

// Create Student
app.post('/api/students', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  
  const { name } = req.body;
  // Generate random username/password
  const username = name.toLowerCase().replace(/\s/g, '') + Math.floor(Math.random() * 1000);
  const password = Math.random().toString(36).slice(-8);
  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = await db.run("INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'student', $3) RETURNING id", [username, hash, name]);
    const userId = result.rows[0].id;
    
    // Init points
    await db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [userId]);
    
    res.json({ id: userId, username, password, name });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get All Students
app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT u.id, u.name, u.username, u.avatar_config, u.birth_date, p.total_points, p.spendable_points 
      FROM users u 
      LEFT JOIN points p ON u.id = p.user_id 
      WHERE u.role = 'student'`);
      
    const students = rows.map(r => {
      let parsed = {};
      try {
        parsed = JSON.parse(r.avatar_config || '{}');
      } catch {
        parsed = {};
      }
      return {...r, avatar_config: Object.keys(parsed).length === 0 ? null : parsed};
    });
    res.json(students);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Give Points (any authenticated user can give points)
app.post('/api/points', authenticateToken, async (req, res) => {
  const { student_id, amount, reason } = req.body; 

  const parseAmount = (val) => {
    const s = String(val).trim();
    const matched = s.match(/^([+-]?)(\d+)$/);
    if (!matched) return NaN;
    const sign = matched[1] === '-' ? -1 : 1;
    return sign * parseInt(matched[2], 10);
  };

  const givePoints = async (uid, amt, rsn) => {
      let totalChange = 0;
      let spendableChange = 0;

      if (amt > 0) {
          totalChange = amt;
          spendableChange = amt;
      } else {
          totalChange = amt; 
          spendableChange = 0;
      }
      
      // Ensure points row exists
      const row = await db.get("SELECT * FROM points WHERE user_id = $1", [uid]);
      if (!row) {
        await db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [uid]);
      }
      
      await db.run(`UPDATE points SET total_points = total_points + $1, spendable_points = spendable_points + $2 WHERE user_id = $3`, 
          [totalChange, spendableChange, uid]);

      // Log transaction
      await db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES ($1, $2, $3, $4, 'academic')", 
          [req.user.id, uid, amt, rsn]);
          
      // Emit socket event
      io.emit('points_updated', { student_id: uid, amount: amt });
  };

  const parsedAmount = parseAmount(amount);
  if (Number.isNaN(parsedAmount)) {
    return res.status(400).json({ error: 'Geçersiz puan formatı' });
  }

  try {
    if (student_id === 'all') {
        const rows = await db.all("SELECT id FROM users WHERE role = 'student'");
        for (const row of rows) {
          await givePoints(row.id, parsedAmount, reason);
        }
        res.json({ success: true, message: 'Tüm öğrencilere puan verildi', amount: parsedAmount });
    } else {
        await givePoints(student_id, parsedAmount, reason);
        const row = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [student_id]);
        res.json({ success: true, amount: parsedAmount, points: row || { total_points: 0, spendable_points: 0 } });
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// All users (for selection in point-giving UI)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all("SELECT id, name, username, role FROM users ORDER BY role, name");
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Transactions log with filters and optional CSV export
app.get('/api/transactions', authenticateToken, async (req, res) => {
  const { type, from_user_id, to_user_id, start, end, export: exportFmt } = req.query;
  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (type) { conditions.push(`type = $${pIdx++}`); params.push(type); }
  if (from_user_id) { conditions.push(`from_user_id = $${pIdx++}`); params.push(from_user_id); }
  if (to_user_id) { conditions.push(`to_user_id = $${pIdx++}`); params.push(to_user_id); }
  if (start) { conditions.push(`created_at >= $${pIdx++}`); params.push(start); }
  if (end) { conditions.push(`created_at <= $${pIdx++}`); params.push(end); }
  
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT t.*, fu.name as from_name, tu.name as to_name 
    FROM transactions t 
    LEFT JOIN users fu ON fu.id = t.from_user_id 
    LEFT JOIN users tu ON tu.id = t.to_user_id
    ${where}
    ORDER BY t.created_at DESC
    LIMIT 500
  `;
  
  try {
    const rows = await db.all(sql, params);
    if (exportFmt === 'csv') {
      const header = ['id','created_at','type','from_user_id','from_name','to_user_id','to_name','amount','reason'];
      const lines = rows.map(r => [
        r.id, r.created_at, r.type, r.from_user_id, r.from_name || '', r.to_user_id, r.to_name || '', r.amount, (r.reason || '').replace(/\n/g, ' ')
      ].join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send([header.join(','), ...lines].join('\n'));
    } else {
      res.json(rows);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Chat Routes ---
app.get('/api/messages', authenticateToken, async (req, res) => {
    const { group_type } = req.query; // 'class' or 'students'
    
    try {
      const rows = await db.all(`SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE group_type = $1 ORDER BY created_at ASC LIMIT 50`, 
          [group_type]);
      res.json(rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
    const { content, group_type } = req.body;
    
    // Profanity Filter (Simple list)
    const badWords = ['küfür', 'aptal', 'salak', 'mal']; // Example list
    const hasBadWord = badWords.some(word => content.toLowerCase().includes(word));
    
    if (hasBadWord) {
        return res.status(400).json({ error: 'Profanity detected' });
    }
    
    try {
      const result = await db.run("INSERT INTO messages (sender_id, content, group_type) VALUES ($1, $2, $3) RETURNING id", 
          [req.user.id, content, group_type]);
      
      const message = {
          id: result.rows[0].id,
          sender_id: req.user.id,
          sender_name: req.user.name,
          content,
          group_type,
          created_at: new Date()
      };
      
      io.emit('new_message', message);
      res.json(message);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

// --- Notifications (Announcements) ---
app.post('/api/notifications', authenticateToken, async (req, res) => {
  const { message, user_id } = req.body;
  
  try {
    if (user_id) {
      const result = await db.run("INSERT INTO notifications (user_id, message) VALUES ($1, $2) RETURNING id", [user_id, message]);
      const id = result.rows[0].id;
      io.emit('notification_new', { id, user_id, message });
      res.json({ success: true, id });
    } else {
      const rows = await db.all("SELECT id FROM users WHERE role = 'student'");
      for (const r of rows) {
        await db.run("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [r.id, message]);
      }
      io.emit('notification_broadcast', { message });
      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/users/:id/notifications', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { id } = req.params;
  try {
    const rows = await db.all("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/notifications/read', authenticateToken, async (req, res) => {
  const { id } = req.body;
  try {
    await db.run("UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Weekly Points for current user ---
app.get('/api/me/weeklyPoints', authenticateToken, async (req, res) => {
  try {
    const row = await db.get(`
      SELECT COALESCE(SUM(amount),0) as weekly_points
      FROM transactions
      WHERE to_user_id = $1 AND type = 'academic' AND created_at >= NOW() - INTERVAL '7 days'
    `, [req.user.id]);
    res.json({ weekly_points: row.weekly_points });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Wardrobe (Saved Avatar Combos) ---
app.get('/api/me/wardrobe', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all("SELECT id, name, config, created_at FROM user_wardrobe WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
    res.json(rows.map(r => ({ ...r, config: (() => { try { return JSON.parse(r.config || '{}'); } catch { return {}; } })() })));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/me/wardrobe', authenticateToken, async (req, res) => {
  const { name, config } = req.body;
  const nm = String(name || '').trim();
  if (!nm) return res.status(400).json({ error: 'İsim gerekli' });
  const cfgStr = JSON.stringify(config || {});
  
  try {
    const result = await db.run("INSERT INTO user_wardrobe (user_id, name, config) VALUES ($1, $2, $3) RETURNING id", [req.user.id, nm, cfgStr]);
    res.json({ id: result.rows[0].id, name: nm, config, created_at: new Date() });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.delete('/api/me/wardrobe/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM user_wardrobe WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/me/wardrobe/:id/apply', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await db.get("SELECT config FROM user_wardrobe WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Bulunamadı' });
    await db.run("UPDATE users SET avatar_config = $1 WHERE id = $2", [row.config, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/me/weeklyPointsDetailed', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT created_at::date as day, COALESCE(SUM(amount),0) as points
      FROM transactions
      WHERE to_user_id = $1 AND type = 'academic' AND created_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY day
      ORDER BY day ASC
    `, [req.user.id]);
    
    // Fill missing days
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0,10);
      
      // Need to handle timezone/formatting carefully.
      // Postgres DATE returns YYYY-MM-DD string often.
      // Ideally we match by string.
      const found = rows.find(r => {
          // r.day is a Date object if pg returns date type, or string?
          // pg returns Date object for 'date' type usually, or string depending on config.
          // Let's assume string or convert.
          const rDate = new Date(r.day).toISOString().slice(0,10);
          return rDate === dayStr;
      });
      result.push({ day: dayStr, points: found ? parseInt(found.points) : 0 });
    }
    res.json(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Security: Change password ---
app.post('/api/me/password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const user = await db.get("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (!user) return res.status(404).send('User not found');
    const valid = bcrypt.compareSync(current_password, user.password);
    if (!valid) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
    const hash = bcrypt.hashSync(new_password, 10);
    await db.run("UPDATE users SET password = $1 WHERE id = $2", [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Rosette Routes ---
app.get('/api/rosettes', authenticateToken, async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM rosettes");
      res.json(rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

app.get('/api/users/:id/rosettes', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await db.all(`
          SELECT ur.*, r.name, r.description, r.icon 
          FROM user_rosettes ur 
          JOIN rosettes r ON ur.rosette_id = r.id 
          WHERE ur.user_id = $1`, 
          [id]);
      res.json(rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
});

app.post('/api/rosettes/assign', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { student_id, rosette_id } = req.body;

    try {
      await db.run("INSERT INTO user_rosettes (user_id, rosette_id) VALUES ($1, $2)", [student_id, rosette_id]);
      io.emit('rosette_awarded', { student_id, rosette_id });
      res.json({ success: true });
    } catch (err) {
      res.status(500).send(err.message);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
