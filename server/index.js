require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
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

const SECRET_KEY = process.env.JWT_SECRET || '8gapp-secret-key';

// Seviye hesaplama mantığı
const calculateLevel = (totalPoints) => {
  if (totalPoints < 250) return { level: 1, name: "Çaylak", next: 250, min: 0 };
  if (totalPoints < 750) return { level: 2, name: "Öğrenci", next: 750, min: 250 };
  if (totalPoints < 1500) return { level: 3, name: "Bilgin", next: 1500, min: 750 };
  if (totalPoints < 3000) return { level: 4, name: "Üstat", next: 3000, min: 1500 };
  return { level: 5, name: "Efsane", next: 99999, min: 3000 };
};

// Günlük Görevleri Başlat
const initDailyMissions = async () => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const existing = await db.get("SELECT count(*) FROM daily_missions WHERE created_at = $1", [today]);
    if (parseInt(existing.count) === 0) {
      const missions = [
        { title: "Güne Merhaba", description: "Bugün okula gelerek yoklamaya katıl!", points: 10, type: "attendance" },
        { title: "Şanslı Gün", description: "Günün şans çarkını çevir!", points: 5, type: "spin" },
        { title: "Sohbet Saati", description: "Grup sohbetine bir mesaj yaz!", points: 5, type: "chat" }
      ];
      for (const m of missions) {
        await db.run("INSERT INTO daily_missions (title, description, points_reward, type, created_at) VALUES ($1, $2, $3, $4, $5)", 
          [m.title, m.description, m.points, m.type, today]);
      }
    }
  } catch (err) {
    console.error("Görev Başlatma Hatası:", err.message);
  }
};

// Görev Tamamlama Kontrolü
const checkMissionCompletion = async (userId, type) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const mission = await db.get("SELECT id, points_reward FROM daily_missions WHERE type = $1 AND created_at = $2", [type, today]);
    if (mission) {
      const userMission = await db.get("SELECT status FROM user_missions WHERE user_id = $1 AND mission_id = $2", [userId, mission.id]);
      if (!userMission || userMission.status === 'pending') {
        await db.run("INSERT INTO user_missions (user_id, mission_id, status, completed_at) VALUES ($1, $2, 'completed', CURRENT_TIMESTAMP) ON CONFLICT (user_id, mission_id) DO UPDATE SET status = 'completed', completed_at = CURRENT_TIMESTAMP", [userId, mission.id]);
        
        // Ödülü Ver
        await db.run("UPDATE points SET total_points = total_points + $1, spendable_points = spendable_points + $1 WHERE user_id = $2", [mission.points_reward, userId]);
        
        const updated = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [userId]);
        io.emit('points_updated', { student_id: userId, total_points: updated.total_points, spendable_points: updated.spendable_points, amount: mission.points_reward });
        io.to(`user_${userId}`).emit('notification', { message: `Görev Tamamlandı: ${mission.points_reward} puan kazandın!` });
      }
    }
  } catch (err) {
    console.error("Görev Tamamlama Hatası:", err.message);
  }
};

// Initialize Database and then start missions
db.initDatabase().then(() => {
  initDailyMissions();
});

// --- Attendance Reset Task (Every 12 hours) ---
// Her 12 saatte bir çalışır ve yoklamayı sıfırlar (tüm öğrencileri 'present' yapar)
cron.schedule('0 */12 * * *', async () => {
  console.log('--- YOKLAMA SIFIRLAMA BAŞLATILDI ---');
  try {
    await db.run("UPDATE attendance SET status = 'present', updated_at = NOW()");
    console.log('Yoklama başarıyla sıfırlandı.');
  } catch (err) {
    console.error('Yoklama sıfırlama hatası:', err);
  }
});

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
  const normalizedUsername = String(username).toLowerCase().trim();
  
  try {
    const user = await db.get("SELECT * FROM users WHERE LOWER(username) = $1", [normalizedUsername]);
    if (!user) return res.status(400).send('User not found');

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).send('Invalid password');

    let pointsObj = { total_points: 0, spendable_points: 0 };
    let levelObj = { level: 1, name: "Çaylak", next: 250, min: 0 };
    if (user.role === 'student') {
      const p = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [user.id]);
      if (p) {
        pointsObj = { total_points: p.total_points, spendable_points: p.spendable_points };
        levelObj = calculateLevel(p.total_points);
      }
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET_KEY);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        name: user.name, 
        avatar_config: JSON.parse(user.avatar_config || '{}'),
        points: pointsObj,
        level: levelObj
      } 
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get("SELECT id, username, role, name, avatar_config, birth_date, first_login FROM users WHERE id = $1", [req.user.id]);
    if (!user) return res.status(404).send('User not found');
    
    if (user.role === 'student') {
        const points = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [user.id]);
        user.points = {
          total_points: points ? points.total_points : 0,
          spendable_points: points ? points.spendable_points : 0
        };
        user.level = calculateLevel(user.points.total_points);
    }
    
    // Avatar parse işlemleri...
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

app.post('/api/me/password', authenticateToken, async (req, res) => {
    const { current_password, new_password } = req.body;
    try {
      const user = await db.get("SELECT password FROM users WHERE id = $1", [req.user.id]);
      const valid = await bcrypt.compare(current_password, user.password);
      if (!valid) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
      
      const hash = await bcrypt.hash(new_password, 10);
      await db.run("UPDATE users SET password = $1 WHERE id = $2", [hash, req.user.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).send(err.message);
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
      
      // Get updated points for socket
      const updatedPoints = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [req.user.id]);
      if (updatedPoints) {
        io.emit('points_updated', { 
          student_id: req.user.id, 
          total_points: updatedPoints.total_points, 
          spendable_points: updatedPoints.spendable_points,
          amount: -item.cost 
        });
      }
      
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
    
    // Get updated points for socket
    const updatedPoints = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [user_id]);
    if (updatedPoints) {
      io.emit('points_updated', { 
        student_id: user_id, 
        total_points: updatedPoints.total_points, 
        spendable_points: updatedPoints.spendable_points,
        amount: amt 
      });
    }

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
          GROUP BY u.id, u.name, u.username, u.avatar_config
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
    // db.all kullanıyoruz, sadece 'all' değil!
    const rows = await db.all(`
      SELECT 
        u.id, u.name, u.username, u.avatar_config, u.birth_date, 
        COALESCE(p.total_points, 0) as total_points, 
        COALESCE(p.spendable_points, 0) as spendable_points
      FROM users u 
      LEFT JOIN points p ON u.id = p.user_id 
      WHERE u.role = 'student'
      ORDER BY u.name ASC
    `);
    
    // Değişkeni burada tanımlıyoruz
    const students = rows.map(r => {
      let avatarConfig = null;
      try {
        // avatar_config boşsa veya bozuksa patlamasın diye önlem
        avatarConfig = (typeof r.avatar_config === 'string' && r.avatar_config.trim() !== "") 
          ? JSON.parse(r.avatar_config) 
          : r.avatar_config;
      } catch (e) {
        avatarConfig = null;
      }
      return {
        ...r,
        points: {
          total_points: r.total_points,
          spendable_points: r.spendable_points
        },
        avatar_config: avatarConfig
      };
    });

    res.json(students);
  } catch (err) {
    console.error("ÖĞRENCİ LİSTESİ HATASI:", err.message);
    res.status(500).send(err.message);
  }
});

// Give Points (any authenticated user can give points)
app.post('/api/points', authenticateToken, async (req, res) => {
  const { student_id, amount, reason } = req.body; 
  const parsedAmount = parseInt(amount) || 0;

  const givePoints = async (uid, amt, rsn) => {
    try {
      // 1. Puan satırı var mı kontrol et, yoksa 0 ile oluştur (PostgreSQL ON CONFLICT)
      await db.run(`
        INSERT INTO points (user_id, total_points, spendable_points) 
        VALUES ($1, 0, 0) 
        ON CONFLICT (user_id) DO NOTHING`, [uid]);

      // 2. PUANI GÜNCELLE (db.run üzerinden dönen sonucu alıyoruz)
      // Sadece pozitif puanlar harcama puanını artırmalıdır (isteğe bağlı ama genellikle akademik puanlar pozitiftir)
      const updateQuery = `
        UPDATE points 
        SET total_points = total_points + $1, 
            spendable_points = spendable_points + $1 
        WHERE user_id = $2 
        RETURNING total_points, spendable_points`;
      
      const updateRes = await db.run(updateQuery, [amt, uid]);
      const updated = updateRes.rows[0];

      // 3. Log kaydı
      await db.run(
        "INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES ($1, $2, $3, $4, 'academic')",
        [req.user.id, uid, amt, rsn]
      );

      // 4. Socket ile anlık gönder
      io.emit('points_updated', { 
        student_id: uid, 
        total_points: updated.total_points, 
        spendable_points: updated.spendable_points,
        amount: amt 
      });

      return { ...updated, amount: amt };
    } catch (e) {
      console.error("Puan Verme Hatası:", e.message);
      throw e;
    }
  };

  try {
    if (student_id === 'all') {
      const rows = await db.all(`
        SELECT u.id 
        FROM users u
        LEFT JOIN attendance a ON u.id = a.student_id
        WHERE u.role = 'student' AND (a.status IS NULL OR a.status = 'present')
      `);
      for (const row of rows) {
        await givePoints(row.id, parsedAmount, reason);
      }
      res.json({ success: true, message: 'Toplu puan verildi (Sadece okulda olanlara)' });
    } else {
      const finalPoints = await givePoints(student_id, parsedAmount, reason);
      res.json({ success: true, points: finalPoints });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
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

  if (type) { conditions.push(`t.type = $${pIdx++}`); params.push(type); }
  if (from_user_id) { conditions.push(`t.from_user_id = $${pIdx++}`); params.push(from_user_id); }
  if (to_user_id) { conditions.push(`t.to_user_id = $${pIdx++}`); params.push(to_user_id); }
  if (start) { conditions.push(`t.created_at >= $${pIdx++}`); params.push(start); }
  if (end) { conditions.push(`t.created_at <= $${pIdx++}`); params.push(end); }
  
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
      
      // Görev kontrolü
      if (req.user.role === 'student') {
        await checkMissionCompletion(req.user.id, 'chat');
      }
      
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

// --- Attendance Routes ---
app.get('/api/attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  try {
    const rows = await db.all("SELECT * FROM attendance");
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/attendance/start', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  try {
    // Mevcut tüm öğrencileri yoklamaya ekle veya durumlarını 'present' yap
    const students = await db.all("SELECT id FROM users WHERE role = 'student'");
    for (const s of students) {
      await db.run(`
        INSERT INTO attendance (student_id, status, updated_at) 
        VALUES ($1, 'present', NOW())
        ON CONFLICT (student_id) DO UPDATE SET status = 'present', updated_at = NOW()
      `, [s.id]);
      // Görev kontrolü
      await checkMissionCompletion(s.id, 'attendance');
    }
    io.emit('attendance_started');
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/attendance/toggle', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { student_id, status } = req.body;
  try {
    await db.run("UPDATE attendance SET status = $1, updated_at = NOW() WHERE student_id = $2", [status, student_id]);
    
    // Eğer 'present' yapıldıysa görev kontrolü
    if (status === 'present') {
      await checkMissionCompletion(student_id, 'attendance');
    }
    
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
      WHERE to_user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
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
      WHERE to_user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '6 days'
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
  console.log(`Server running on port ${PORT}`);
});

// --- Yeni Özellikler: Duyuru ve Günlük Çark ---

// Duyuruları Getir
app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10");
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Duyuru Ekle (Sadece Öğretmen)
app.post('/api/announcements', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { title, content } = req.body;
  try {
    const result = await db.run("INSERT INTO announcements (title, content) VALUES ($1, $2) RETURNING id", [title, content]);
    res.json({ id: result.rows[0].id, title, content, created_at: new Date() });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Günlük Çark (Sadece Öğrenci)
app.post('/api/daily-spin', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') return res.sendStatus(403);
  
  try {
    const lastSpin = await db.get("SELECT last_spin_at FROM daily_spins WHERE user_id = $1", [req.user.id]);
    const now = new Date();
    
    if (lastSpin) {
      const lastDate = new Date(lastSpin.last_spin_at);
      const hoursDiff = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        const remaining = 24 - hoursDiff;
        return res.status(400).json({ 
          error: `Günde sadece bir kez çevirebilirsin.`,
          remaining_hours: Math.ceil(remaining)
        });
      }
    }

    // Olası ödüller: 5, 10, 20, 50 puan
    const rewards = [5, 5, 5, 5, 10, 10, 10, 20, 20, 50];
    const prize = rewards[Math.floor(Math.random() * rewards.length)];

    // Puanı ekle
    await db.run("UPDATE points SET spendable_points = spendable_points + $1 WHERE user_id = $2", [prize, req.user.id]);
    
    // Çevirme zamanını kaydet
    await db.run("INSERT INTO daily_spins (user_id, last_spin_at) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET last_spin_at = $2", [req.user.id, now]);
    
    // Görev kontrolü
    await checkMissionCompletion(req.user.id, 'spin');
    
    // Log kaydı
    await db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES ($1, $2, $3, $4, 'bonus')", 
      [req.user.id, req.user.id, prize, 'Günlük Çark Ödülü']);

    // Socket ile güncelle
    const updated = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = $1", [req.user.id]);
    io.emit('points_updated', { 
      student_id: req.user.id, 
      total_points: updated.total_points, 
      spendable_points: updated.spendable_points,
      amount: prize 
    });

    res.json({ success: true, prize, last_spin_at: now });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Günlük Görevleri Getir
app.get('/api/missions', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const missions = await db.all(`
      SELECT m.*, COALESCE(um.status, 'pending') as status
      FROM daily_missions m
      LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = $1
      WHERE m.created_at = $2
    `, [req.user.id, today]);
    res.json(missions);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Oylama Sistemi ---

// Aktif Oylamaları Getir
app.get('/api/polls', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM poll_votes pv WHERE pv.poll_id = p.id) as total_votes,
        (SELECT option_index FROM poll_votes pv WHERE pv.poll_id = p.id AND pv.user_id = $1) as user_vote
      FROM polls p
      WHERE expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    // Oyların dağılımını hesapla
    const polls = await Promise.all(rows.map(async (p) => {
      const votes = await db.all("SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = $1 GROUP BY option_index", [p.id]);
      const results = {};
      votes.forEach(v => {
        results[v.option_index] = parseInt(v.count);
      });
      return { ...p, results };
    }));
    
    res.json(polls);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Oylama Oluştur (Sadece Öğretmen)
app.post('/api/polls', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.sendStatus(403);
  const { question, options, expires_in_hours } = req.body;
  const expires_at = expires_in_hours ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000) : null;
  
  try {
    const result = await db.run("INSERT INTO polls (question, options, expires_at) VALUES ($1, $2, $3) RETURNING id", 
      [question, JSON.stringify(options), expires_at]);
    const poll = { id: result.rows[0].id, question, options, expires_at, created_at: new Date(), total_votes: 0 };
    io.emit('new_poll', poll);
    res.json(poll);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Oy Ver
app.post('/api/polls/:id/vote', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { option_index } = req.body;
  
  try {
    const poll = await db.get("SELECT expires_at FROM polls WHERE id = $1", [id]);
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Oylama süresi dolmuş' });
    }
    
    await db.run(`
      INSERT INTO poll_votes (poll_id, user_id, option_index) 
      VALUES ($1, $2, $3)
      ON CONFLICT (poll_id, user_id) DO UPDATE SET option_index = $3, voted_at = CURRENT_TIMESTAMP
    `, [id, req.user.id, option_index]);
    
    // Güncel sonuçları gönder
    const votes = await db.all("SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = $1 GROUP BY option_index", [id]);
    const results = {};
    votes.forEach(v => {
      results[v.option_index] = parseInt(v.count);
    });
    
    io.emit('poll_updated', { poll_id: id, results, total_votes: votes.reduce((a, b) => a + parseInt(b.count), 0) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
