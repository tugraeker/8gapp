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

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).send(err.message);
    if (!user) return res.status(400).send('User not found');

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) return res.status(400).send('Invalid password');

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET_KEY);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name, avatar_config: JSON.parse(user.avatar_config) } });
  });
});

app.get('/api/me', authenticateToken, (req, res) => {
  db.get("SELECT id, username, role, name, avatar_config, birth_date, first_login FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).send('User not found');
    
    // Get points if student
    if (user.role === 'student') {
        db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [user.id], (err, points) => {
            user.points = points || { total_points: 0, spendable_points: 0 };
            try {
              const parsed = JSON.parse(user.avatar_config || '{}');
              user.avatar_config = Object.keys(parsed).length === 0 ? null : parsed;
            } catch {
              user.avatar_config = null;
            }
            res.json(user);
        });
    } else {
        try {
          const parsed = JSON.parse(user.avatar_config || '{}');
          user.avatar_config = Object.keys(parsed).length === 0 ? null : parsed;
        } catch {
          user.avatar_config = null;
        }
        res.json(user);
    }
  });
});

app.post('/api/me/birthday', authenticateToken, (req, res) => {
    const { birth_date } = req.body;
    db.run("UPDATE users SET birth_date = ?, first_login = 0 WHERE id = ?", [birth_date, req.user.id], (err) => {
        if (err) return res.status(500).send(err.message);
        res.json({ success: true });
    });
});

app.post('/api/me/avatar', authenticateToken, (req, res) => {
    const { avatar_config } = req.body;
    try {
      const cfg = avatar_config || {};
      db.run("UPDATE users SET avatar_config = ? WHERE id = ?", [JSON.stringify(cfg), req.user.id], (err) => {
        if (err) return res.status(500).send(err.message);
        res.json({ success: true });
      });
    } catch (e) {
      return res.status(400).json({ error: 'Geçersiz avatar yapılandırması' });
    }
});

// --- Shop Routes ---

// Get All Items
app.get('/api/items', authenticateToken, (req, res) => {
    db.all("SELECT * FROM items", (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// Get User Inventory
app.get('/api/inventory', authenticateToken, (req, res) => {
    db.all(`
        SELECT ui.*, i.name, i.category, i.cost, i.asset_id 
        FROM user_items ui 
        JOIN items i ON ui.item_id = i.id 
        WHERE ui.user_id = ?`, 
        [req.user.id], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// Get Inventory for specific user (teacher only)
app.get('/api/users/:id/inventory', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { id } = req.params;
    db.all(`
        SELECT ui.*, i.name, i.category, i.cost, i.asset_id 
        FROM user_items ui 
        JOIN items i ON ui.item_id = i.id 
        WHERE ui.user_id = ?`, 
        [id], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// Buy Item
app.post('/api/items/buy', authenticateToken, (req, res) => {
    const { item_id } = req.body;
    
    db.get("SELECT * FROM items WHERE id = ?", [item_id], (err, item) => {
        if (err || !item) return res.status(404).send('Item not found');

        // Clothing is free
        if (item.category === 'clothing') {
            db.get("SELECT * FROM user_items WHERE user_id = ? AND item_id = ?", [req.user.id, item_id], (errOwned, owned) => {
                if (errOwned) return res.status(500).send(errOwned.message);
                if (owned) return res.status(400).json({ error: 'Zaten sahipsin' });
                db.run("INSERT INTO user_items (user_id, item_id) VALUES (?, ?)", [req.user.id, item_id], (errInsert) => {
                    if (errInsert) return res.status(500).send(errInsert.message);
                    res.json({ success: true, message: 'Ücretsiz eklendi' });
                });
            });
            return;
        }

        // Other categories (e.g., frame) require points
        db.get("SELECT spendable_points FROM points WHERE user_id = ?", [req.user.id], (errPts, pointsRow) => {
            if (errPts) return res.status(500).send(errPts.message);
            if (!pointsRow || pointsRow.spendable_points < item.cost) {
                return res.status(400).json({ error: 'Yetersiz puan' });
            }
            db.get("SELECT * FROM user_items WHERE user_id = ? AND item_id = ?", [req.user.id, item_id], (errOwned, owned) => {
                if (errOwned) return res.status(500).send(errOwned.message);
                if (owned) return res.status(400).json({ error: 'Zaten sahipsin' });
                db.serialize(() => {
                    db.run("UPDATE points SET spendable_points = spendable_points - ? WHERE user_id = ?", [item.cost, req.user.id]);
                    db.run("INSERT INTO user_items (user_id, item_id) VALUES (?, ?)", [req.user.id, item_id]);
                    db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES (?, ?, ?, ?, 'shop')", 
                        [req.user.id, null, -item.cost, `Satın alma: ${item.name}`]);
                    res.json({ success: true, message: 'Satın alındı' });
                });
            });
        });
    });
});

// Add spendable points only (bonus)
app.post('/api/spendable/add', authenticateToken, (req, res) => {
  const { user_id, amount, reason } = req.body;
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const amt = parseInt(String(amount || 0), 10);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Geçersiz miktar' });
  db.serialize(() => {
    db.run("UPDATE points SET spendable_points = spendable_points + ? WHERE user_id = ?", [amt, user_id], (err) => {
      if (err) return res.status(500).send(err.message);
      db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES (?, ?, ?, ?, 'bonus')", 
        [req.user.id, user_id, amt, reason || 'Bonus / Pomodoro']);
      res.json({ success: true, amount: amt });
    });
  });
});

// Create Item (teacher only)
app.post('/api/items', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { name, category, cost, asset_id } = req.body;
  db.run("INSERT INTO items (name, category, cost, asset_id) VALUES (?, ?, ?, ?)", [name, category, cost, asset_id], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ id: this.lastID, name, category, cost, asset_id });
  });
});

// Update Item (teacher only)
app.put('/api/items/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { id } = req.params;
  const { name, category, cost, asset_id } = req.body;
  db.run("UPDATE items SET name = ?, category = ?, cost = ?, asset_id = ? WHERE id = ?", [name, category, cost, asset_id, id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// Delete Item (teacher only)
app.delete('/api/items/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { id } = req.params;
  db.run("DELETE FROM items WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});
// --- Leaderboard Routes ---
app.get('/api/leaderboard', authenticateToken, (req, res) => {
    db.all(`
        SELECT u.id, u.name, u.username, u.avatar_config, p.total_points 
        FROM users u 
        JOIN points p ON u.id = p.user_id 
        WHERE u.role = 'student' 
        ORDER BY p.total_points DESC`, 
        (err, rows) => {
        if (err) return res.status(500).send(err.message);
        const leaderboard = rows.map(r => ({
            ...r,
            avatar_config: JSON.parse(r.avatar_config)
        }));
        res.json(leaderboard);
    });
});

// Weekly Top Student (last 7 days net academic points)
app.get('/api/leaderboard/weeklyTop', authenticateToken, (req, res) => {
    db.get(`
        SELECT u.id, u.name, u.username, u.avatar_config, COALESCE(SUM(t.amount), 0) as weekly_points
        FROM users u
        LEFT JOIN transactions t 
          ON t.to_user_id = u.id 
         AND t.type = 'academic' 
         AND t.created_at >= datetime('now','-7 day')
        WHERE u.role = 'student'
        GROUP BY u.id
        ORDER BY weekly_points DESC
        LIMIT 1
    `, (err, row) => {
        if (err) return res.status(500).send(err.message);
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
    });
});

// --- Teacher Routes ---

// Create Student
app.post('/api/students', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  
  const { name } = req.body;
  // Generate random username/password
  const username = name.toLowerCase().replace(/\s/g, '') + Math.floor(Math.random() * 1000);
  const password = Math.random().toString(36).slice(-8);
  const hash = bcrypt.hashSync(password, 10);

  db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, 'student', ?)", [username, hash, name], function(err) {
    if (err) return res.status(500).send(err.message);
    const userId = this.lastID;
    
    // Init points
    db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [userId]);
    
    res.json({ id: userId, username, password, name });
  });
});

// Get All Students
app.get('/api/students', authenticateToken, (req, res) => {
  // Allow students to see list for leaderboard/chat too? Maybe restricted info.
  // For teacher, detailed info.
  db.all(`
    SELECT u.id, u.name, u.username, u.avatar_config, u.birth_date, p.total_points, p.spendable_points 
    FROM users u 
    LEFT JOIN points p ON u.id = p.user_id 
    WHERE u.role = 'student'`, 
    (err, rows) => {
      if (err) return res.status(500).send(err.message);
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
    }
  );
});

// Give Points (any authenticated user can give points)
app.post('/api/points', authenticateToken, (req, res) => {
  const { student_id, amount, reason } = req.body; // student_id can be 'all' or specific id

  const parseAmount = (val) => {
    const s = String(val).trim();
    const matched = s.match(/^([+-]?)(\d+)$/);
    if (!matched) return NaN;
    const sign = matched[1] === '-' ? -1 : 1;
    return sign * parseInt(matched[2], 10);
  };

  const givePoints = (uid, amt, rsn) => {
    db.serialize(() => {
        let totalChange = 0;
        let spendableChange = 0;

        if (amt > 0) {
            totalChange = amt;
            spendableChange = amt;
        } else {
            // Negative point: Affects Total (Academic), but NOT Spendable (Shop)
            totalChange = amt; 
            spendableChange = 0;
        }
        
        // Ensure points row exists
        db.get("SELECT * FROM points WHERE user_id = ?", [uid], (err, row) => {
          if (err) return;
          if (!row) {
            db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [uid]);
          }
          db.run(`UPDATE points SET total_points = total_points + ?, spendable_points = spendable_points + ? WHERE user_id = ?`, 
              [totalChange, spendableChange, uid]);
        });

        // Log transaction
        db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES (?, ?, ?, ?, 'academic')", 
            [req.user.id, uid, amt, rsn]);
            
        // Emit socket event
        io.emit('points_updated', { student_id: uid, amount: amt });
    });
  };

  const parsedAmount = parseAmount(amount);
  if (Number.isNaN(parsedAmount)) {
    return res.status(400).json({ error: 'Geçersiz puan formatı' });
  }

  if (student_id === 'all') {
      db.all("SELECT id FROM users WHERE role = 'student'", (err, rows) => {
          rows.forEach(row => givePoints(row.id, parsedAmount, reason));
          res.json({ success: true, message: 'Tüm öğrencilere puan verildi', amount: parsedAmount });
      });
  } else {
      givePoints(student_id, parsedAmount, reason);
      // Return updated snapshot
      db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [student_id], (err, row) => {
        res.json({ success: true, amount: parsedAmount, points: row || { total_points: 0, spendable_points: 0 } });
      });
  }
});

// All users (for selection in point-giving UI)
app.get('/api/users', authenticateToken, (req, res) => {
  db.all("SELECT id, name, username, role FROM users ORDER BY role, name", (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Transactions log with filters and optional CSV export
app.get('/api/transactions', authenticateToken, (req, res) => {
  const { type, from_user_id, to_user_id, start, end, export: exportFmt } = req.query;
  const conditions = [];
  const params = [];
  if (type) { conditions.push("type = ?"); params.push(type); }
  if (from_user_id) { conditions.push("from_user_id = ?"); params.push(from_user_id); }
  if (to_user_id) { conditions.push("to_user_id = ?"); params.push(to_user_id); }
  if (start) { conditions.push("created_at >= ?"); params.push(start); }
  if (end) { conditions.push("created_at <= ?"); params.push(end); }
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
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).send(err.message);
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
  });
});
// --- Chat Routes ---
app.get('/api/messages', authenticateToken, (req, res) => {
    const { group_type } = req.query; // 'class' or 'students'
    
    // Filter bad words simple implementation
    // Ideally done on insert, but let's check retrieval too or insert.
    
    db.all(`SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE group_type = ? ORDER BY created_at ASC LIMIT 50`, 
        [group_type], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

app.post('/api/messages', authenticateToken, (req, res) => {
    const { content, group_type } = req.body;
    
    // Profanity Filter (Simple list)
    const badWords = ['küfür', 'aptal', 'salak', 'mal']; // Example list
    const hasBadWord = badWords.some(word => content.toLowerCase().includes(word));
    
    if (hasBadWord) {
        return res.status(400).json({ error: 'Profanity detected' });
    }
    
    db.run("INSERT INTO messages (sender_id, content, group_type) VALUES (?, ?, ?)", 
        [req.user.id, content, group_type], function(err) {
        if (err) return res.status(500).send(err.message);
        
        const message = {
            id: this.lastID,
            sender_id: req.user.id,
            sender_name: req.user.name,
            content,
            group_type,
            created_at: new Date()
        };
        
        io.emit('new_message', message);
        res.json(message);
    });
});

// --- Notifications (Announcements) ---
// Create notification (teacher/admin by default)
app.post('/api/notifications', authenticateToken, (req, res) => {
  const { message, user_id } = req.body; // if user_id null -> broadcast to all students
  // Allow any role to create class communication per request; could restrict later
  const targetSql = user_id ? "INSERT INTO notifications (user_id, message) VALUES (?, ?)" : null;
  if (targetSql) {
    db.run(targetSql, [user_id, message], function(err) {
      if (err) return res.status(500).send(err.message);
      io.emit('notification_new', { id: this.lastID, user_id, message });
      res.json({ success: true, id: this.lastID });
    });
  } else {
    db.all("SELECT id FROM users WHERE role = 'student'", (err, rows) => {
      if (err) return res.status(500).send(err.message);
      const stmt = db.prepare("INSERT INTO notifications (user_id, message) VALUES (?, ?)");
      rows.forEach(r => stmt.run(r.id, message));
      stmt.finalize((err2) => {
        if (err2) return res.status(500).send(err2.message);
        io.emit('notification_broadcast', { message });
        res.json({ success: true });
      });
    });
  }
});

// Fetch notifications for current user
app.get('/api/notifications', authenticateToken, (req, res) => {
  db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.user.id], (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Fetch notifications for specific user (teacher only)
app.get('/api/users/:id/notifications', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { id } = req.params;
  db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [id], (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Mark notification as read
app.post('/api/notifications/read', authenticateToken, (req, res) => {
  const { id } = req.body;
  db.run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [id, req.user.id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// --- Weekly Points for current user ---
app.get('/api/me/weeklyPoints', authenticateToken, (req, res) => {
  db.get(`
    SELECT COALESCE(SUM(amount),0) as weekly_points
    FROM transactions
    WHERE to_user_id = ? AND type = 'academic' AND created_at >= datetime('now','-7 day')
  `, [req.user.id], (err, row) => {
    if (err) return res.status(500).send(err.message);
    res.json({ weekly_points: row.weekly_points });
  });
});

// --- Wardrobe (Saved Avatar Combos) ---
// List wardrobe items for current user
app.get('/api/me/wardrobe', authenticateToken, (req, res) => {
  db.all("SELECT id, name, config, created_at FROM user_wardrobe WHERE user_id = ? ORDER BY created_at DESC", [req.user.id], (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows.map(r => ({ ...r, config: (() => { try { return JSON.parse(r.config || '{}'); } catch { return {}; } })() })));
  });
});

// Save new outfit
app.post('/api/me/wardrobe', authenticateToken, (req, res) => {
  const { name, config } = req.body;
  const nm = String(name || '').trim();
  if (!nm) return res.status(400).json({ error: 'İsim gerekli' });
  const cfgStr = JSON.stringify(config || {});
  db.run("INSERT INTO user_wardrobe (user_id, name, config) VALUES (?, ?, ?)", [req.user.id, nm, cfgStr], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ id: this.lastID, name: nm, config, created_at: new Date() });
  });
});

// Delete outfit
app.delete('/api/me/wardrobe/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM user_wardrobe WHERE id = ? AND user_id = ?", [id, req.user.id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// Apply outfit (update avatar_config to saved config)
app.post('/api/me/wardrobe/:id/apply', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.get("SELECT config FROM user_wardrobe WHERE id = ? AND user_id = ?", [id, req.user.id], (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).json({ error: 'Bulunamadı' });
    db.run("UPDATE users SET avatar_config = ? WHERE id = ?", [row.config, req.user.id], (err2) => {
      if (err2) return res.status(500).send(err2.message);
      res.json({ success: true });
    });
  });
});

app.get('/api/me/weeklyPointsDetailed', authenticateToken, (req, res) => {
  db.all(`
    SELECT date(created_at) as day, COALESCE(SUM(amount),0) as points
    FROM transactions
    WHERE to_user_id = ? AND type = 'academic' AND created_at >= date('now','-6 day')
    GROUP BY day
    ORDER BY day ASC
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).send(err.message);
    // Fill missing days
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0,10);
      const found = rows.find(r => r.day === dayStr);
      result.push({ day: dayStr, points: found ? found.points : 0 });
    }
    res.json(result);
  });
});

// --- Security: Change password ---
app.post('/api/me/password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  db.get("SELECT * FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).send('User not found');
    const valid = bcrypt.compareSync(current_password, user.password);
    if (!valid) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
    const hash = bcrypt.hashSync(new_password, 10);
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.user.id], (err2) => {
      if (err2) return res.status(500).send(err2.message);
      res.json({ success: true });
    });
  });
});
// --- Rosette Routes ---

// Get All Rosettes
app.get('/api/rosettes', authenticateToken, (req, res) => {
    db.all("SELECT * FROM rosettes", (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// Get User Rosettes
app.get('/api/users/:id/rosettes', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.all(`
        SELECT ur.*, r.name, r.description, r.icon 
        FROM user_rosettes ur 
        JOIN rosettes r ON ur.rosette_id = r.id 
        WHERE ur.user_id = ?`, 
        [id], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        res.json(rows);
    });
});

// Assign Rosette
app.post('/api/rosettes/assign', authenticateToken, (req, res) => {
    if (req.user.role !== 'teacher') return res.sendStatus(403);
    const { student_id, rosette_id } = req.body;

    db.run("INSERT INTO user_rosettes (user_id, rosette_id) VALUES (?, ?)", 
        [student_id, rosette_id], function(err) {
        if (err) return res.status(500).send(err.message);
        
        // Notify/Socket
        io.emit('rosette_awarded', { student_id, rosette_id });
        res.json({ success: true });
    });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
