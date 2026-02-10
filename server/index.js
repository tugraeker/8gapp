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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room: user_${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
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

// Haftalık Görevleri Başlat
const initWeeklyMissions = async () => {
  // Haftanın başlangıcını bul (Pazartesi)
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff)).toISOString().split('T')[0];

  try {
    const existing = await db.get("SELECT count(*) as count FROM weekly_missions WHERE created_at = ?", [monday]);
    if (parseInt(existing.count) === 0) {
      const missions = [
        { title: "Okul Yolunda", description: "Bu hafta en az 3 gün okula gel!", points: 10, type: "attendance_weekly" },
        { title: "Sınıfın Sesi", description: "Bu hafta grup sohbetine 5 mesaj yaz!", points: 5, type: "chat_weekly" },
        { title: "Bilgi Avcısı", description: "Bu hafta en az 1 oylamaya katıl!", points: 5, type: "poll_weekly" }
      ];
      for (const m of missions) {
        await db.run("INSERT INTO weekly_missions (title, description, points_reward, type, created_at) VALUES (?, ?, ?, ?, ?)", 
          [m.title, m.description, m.points, m.type, monday]);
      }
    }
  } catch (err) {
    console.error("Haftalık Görev Başlatma Hatası:", err.message);
  }
};

// Görev Tamamlama Kontrolü (Haftalık)
const checkMissionCompletion = async (userId, type) => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff)).toISOString().split('T')[0];

  try {
    const mission = await db.get("SELECT id, points_reward FROM weekly_missions WHERE type = ? AND created_at = ?", [type, monday]);
    if (mission) {
      const userMission = await db.get("SELECT status FROM user_missions WHERE user_id = ? AND mission_id = ?", [userId, mission.id]);
      if (!userMission || userMission.status === 'pending') {
        // Burada basitçe tamamlıyoruz, ancak tipine göre sayaç da eklenebilir. 
        // Şimdilik basit tutalım: ilk eylemde tamamlanır.
        await db.run("INSERT INTO user_missions (user_id, mission_id, status, completed_at) VALUES (?, ?, 'completed', CURRENT_TIMESTAMP)", [userId, mission.id]);
        
        await db.run("INSERT OR IGNORE INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [userId]);
        await db.run("UPDATE points SET total_points = total_points + ?, spendable_points = spendable_points + ? WHERE user_id = ?", [mission.points_reward, mission.points_reward, userId]);
        
        const updated = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [userId]);
        io.emit('points_updated', { student_id: userId, total_points: updated.total_points, spendable_points: updated.spendable_points, amount: mission.points_reward });
        io.to(`user_${userId}`).emit('notification', { message: `Haftalık Görev Tamamlandı: ${mission.points_reward} puan kazandın!` });
      }
    }
  } catch (err) {
    console.error("Görev Tamamlama Hatası:", err.message);
  }
};

// Initialize Database and then start missions
db.initDatabase().then(() => {
  initWeeklyMissions();
});

// --- Attendance Reset Task (Every day at 04:00 AM) ---
let attendanceCron;
if (process.env.NODE_ENV !== 'test') {
  attendanceCron = cron.schedule('0 4 * * *', async () => {
    console.log('--- YOKLAMA SIFIRLAMA BAŞLATILDI ---');
    try {
      await db.run("UPDATE attendance SET status = 'present', updated_at = CURRENT_TIMESTAMP");
      console.log('Yoklama başarıyla sıfırlandı.');
    } catch (err) {
      console.error('Yoklama sıfırlama hatası:', err);
    }
  });
}

// --- Utils ---

// Profanity Filter (Improved list)
const badWords = [
  'küfür', 'aptal', 'salak', 'mal', 'gerizekalı', 'amk', 'aq', 'oç', 
  'piç', 'yavşak', 'it', 'köpek', 'şerefsiz', 'haysiyetsiz'
];

const hasProfanity = (text) => {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return badWords.some(word => lowerText.includes(word));
};

// Avatar parse işlemleri (Tutarlı dönüş için)
const parseAvatar = (cfg) => {
  try {
    if (!cfg) return {};
    const parsed = (typeof cfg === 'string') ? JSON.parse(cfg) : cfg;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
};

// Generic Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  const errMsg = err.message || (typeof err === 'string' ? err : null);
  const finalMsg = errMsg || 'Sunucu tarafında beklenmedik bir hata oluştu';
  
  console.error(`[Error] ${req.method} ${req.url}:`, finalMsg);
  if (err.stack) console.error(err.stack);
  
  // Don't leak internal error details in production-like environment
  const responseMessage = (process.env.NODE_ENV === 'production') 
    ? 'Bir hata oluştu. Lütfen tekrar deneyin.' 
    : finalMsg;
    
  res.status(err.status || 500).json({ 
    error: responseMessage,
    ...(process.env.NODE_ENV === 'test' && { detail: err.toString(), stack: err.stack })
  });
};

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Yetkisiz erişim' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Geçersiz oturum' });
    req.user = user;
    next();
  });
};

// --- Auth Routes ---

app.post('/api/login', async (req, res, next) => {
  console.log('[Login Route Hit]', req.body);
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir' });
  }

  const normalizedUsername = String(username).toLowerCase().trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  
  try {
      console.log(`[Login Attempt] Original: "${username}", Normalized: "${normalizedUsername}"`);
      
      // Hem kullanıcı adına hem de isme göre ara
      let user = await db.get("SELECT * FROM users WHERE LOWER(username) = ?", [normalizedUsername]);
      
      if (!user) {
        // İsim bazlı arama için boşlukları temizle ve karşılaştır
        const allUsers = await db.all("SELECT * FROM users");
        user = allUsers.find(u => {
          const normalizedDBName = u.name.toLowerCase().trim()
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
            .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
          return normalizedDBName === normalizedUsername;
        });
      }

      if (!user) {
        console.log(`[Login Fail] User not found: "${normalizedUsername}"`);
        return res.status(400).json({ error: 'Kullanıcı bulunamadı' });
      }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log(`[Login Fail] Invalid password for: "${normalizedUsername}"`);
      return res.status(400).json({ error: 'Hatalı şifre' });
    }

    let pointsObj = { total_points: 0, spendable_points: 0 };
    let levelObj = { level: 1, name: "Çaylak", next: 250, min: 0 };
    if (user.role === 'student') {
      const p = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [user.id]);
      if (p) {
        pointsObj = { total_points: p.total_points, spendable_points: p.spendable_points };
        levelObj = calculateLevel(p.total_points);
      }
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET_KEY);
    console.log(`[Login Success] User: ${user.username}, Role: ${user.role}`);
 
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          name: user.name, 
          avatar_config: parseAvatar(user.avatar_config),
          points: pointsObj,
          level: levelObj
        } 
      });
  } catch (err) {
    console.error(`[Login Exception] for ${normalizedUsername}:`, err);
    next(err);
  }
});

app.get('/api/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await db.get("SELECT id, username, role, name, avatar_config, birth_date, first_login FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      
    if (user.role === 'student') {
        const points = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [user.id]);
        user.points = {
          total_points: points ? points.total_points : 0,
          spendable_points: points ? points.spendable_points : 0
        };
        user.level = calculateLevel(user.points.total_points);
    }
    
    user.avatar_config = parseAvatar(user.avatar_config);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

app.post('/api/me/birthday', authenticateToken, async (req, res, next) => {
    const { birth_date } = req.body;
    if (!birth_date) return res.status(400).json({ error: 'Doğum tarihi gereklidir' });
    try {
      await db.run("UPDATE users SET birth_date = ?, first_login = 0 WHERE id = ?", [birth_date, req.user.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
});

app.post('/api/me/avatar', authenticateToken, async (req, res, next) => {
    const { avatar_config } = req.body;
    try {
      const cfg = avatar_config || {};
      await db.run("UPDATE users SET avatar_config = ? WHERE id = ?", [JSON.stringify(cfg), req.user.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
});

app.post('/api/me/password', authenticateToken, async (req, res, next) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Mevcut ve yeni şifre gereklidir' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır' });
    }
    try {
      const user = await db.get("SELECT password FROM users WHERE id = ?", [req.user.id]);
      const valid = await bcrypt.compare(current_password, user.password);
      if (!valid) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
      
      const hash = await bcrypt.hash(new_password, 10);
      await db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.user.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
});

// --- Shop Routes ---

// Get All Items
app.get('/api/items', authenticateToken, async (req, res, next) => {
    try {
      const rows = await db.all("SELECT * FROM items");
      res.json(rows);
    } catch (err) {
      next(err);
    }
});

// Get User Inventory
app.get('/api/inventory', authenticateToken, async (req, res, next) => {
    try {
      const rows = await db.all(`
          SELECT ui.*, i.name, i.category, i.cost, i.asset_id 
          FROM user_items ui 
          JOIN items i ON ui.item_id = i.id 
          WHERE ui.user_id = ?`, 
          [req.user.id]);
      res.json(rows);
    } catch (err) {
      next(err);
    }
});

// Get Inventory for specific user (teacher only)
app.get('/api/users/:id/inventory', authenticateToken, async (req, res, next) => {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
    const { id } = req.params;
    try {
      const rows = await db.all(`
          SELECT ui.*, i.name, i.category, i.cost, i.asset_id 
          FROM user_items ui 
          JOIN items i ON ui.item_id = i.id 
          WHERE ui.user_id = ?`, 
          [id]);
      res.json(rows);
    } catch (err) {
      next(err);
    }
});

// Buy Item
app.post('/api/items/buy', authenticateToken, async (req, res, next) => {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ error: 'Ürün ID gereklidir' });
    
    try {
      const item = await db.get("SELECT * FROM items WHERE id = ?", [item_id]);
      if (!item) return res.status(404).json({ error: 'Ürün bulunamadı' });

      // Clothing is free
      if (item.category === 'clothing') {
          const owned = await db.get("SELECT * FROM user_items WHERE user_id = ? AND item_id = ?", [req.user.id, item_id]);
          if (owned) return res.status(400).json({ error: 'Bu ürüne zaten sahipsin' });
          
          await db.run("INSERT INTO user_items (user_id, item_id) VALUES (?, ?)", [req.user.id, item_id]);
          return res.json({ success: true, message: 'Ücretsiz eklendi' });
      }

      // Other categories (e.g., frame) require points
      const pointsRow = await db.get("SELECT spendable_points FROM points WHERE user_id = ?", [req.user.id]);
      if (!pointsRow || pointsRow.spendable_points < item.cost) {
          return res.status(400).json({ error: 'Yetersiz puan' });
      }
      
      const owned = await db.get("SELECT * FROM user_items WHERE user_id = ? AND item_id = ?", [req.user.id, item_id]);
      if (owned) return res.status(400).json({ error: 'Bu ürüne zaten sahipsin' });

      // Transaction-like sequence
      await db.run("UPDATE points SET spendable_points = spendable_points - ? WHERE user_id = ?", [item.cost, req.user.id]);
      await db.run("INSERT INTO user_items (user_id, item_id) VALUES (?, ?)", [req.user.id, item_id]);
      await db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES (?, ?, ?, ?, 'shop')", 
          [req.user.id, null, -item.cost, `Satın alma: ${item.name}`]);
      
      // Get updated points for socket
      const updatedPoints = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [req.user.id]);
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
      next(err);
    }
});

// Add spendable points only (bonus)
app.post('/api/spendable/add', authenticateToken, async (req, res, next) => {
  const { user_id, amount, reason } = req.body;
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  if (!user_id) return res.status(400).json({ error: 'Öğrenci ID gereklidir' });
  
  const amt = parseInt(String(amount || 0), 10);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Geçersiz miktar' });
  
  try {
    await db.run("UPDATE points SET spendable_points = spendable_points + ? WHERE user_id = ?", [amt, user_id]);
    await db.run("INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES (?, ?, ?, ?, 'bonus')", 
      [req.user.id, user_id, amt, reason || 'Bonus / Pomodoro']);
    
    // Get updated points for socket
    const updatedPoints = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [user_id]);
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
    next(err);
  }
});

// Create Item (teacher only)
app.post('/api/items', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { name, category, cost, asset_id } = req.body;
  if (!name || !category || cost === undefined || !asset_id) {
    return res.status(400).json({ error: 'Tüm alanlar (ad, kategori, maliyet, asset_id) gereklidir' });
  }
  
  try {
    const result = await db.run("INSERT INTO items (name, category, cost, asset_id) VALUES (?, ?, ?, ?)", [name, category, cost, asset_id]);
    res.json({ id: result.id, name, category, cost, asset_id });
  } catch (err) {
    next(err);
  }
});

// Update Item (teacher only)
app.put('/api/items/:id', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { id } = req.params;
  const { name, category, cost, asset_id } = req.body;
  if (!name || !category || cost === undefined || !asset_id) {
    return res.status(400).json({ error: 'Tüm alanlar (ad, kategori, maliyet, asset_id) gereklidir' });
  }

  try {
    await db.run("UPDATE items SET name = ?, category = ?, cost = ?, asset_id = ? WHERE id = ?", [name, category, cost, asset_id, id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Delete Item (teacher only)
app.delete('/api/items/:id', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { id } = req.params;
  try {
    await db.run("DELETE FROM items WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Leaderboard Routes ---
app.get('/api/leaderboard', authenticateToken, async (req, res, next) => {
    try {
      const rows = await db.all(`
          SELECT u.id, u.name, u.username, u.avatar_config, p.total_points 
          FROM users u 
          JOIN points p ON u.id = p.user_id 
          WHERE u.role = 'student' 
          ORDER BY p.total_points DESC`);
          
      const leaderboard = rows.map(r => ({
          ...r,
          avatar_config: parseAvatar(r.avatar_config)
      }));
      res.json(leaderboard);
    } catch (err) {
      next(err);
    }
});

// Weekly Top Student (last 7 days net academic points)
app.get('/api/leaderboard/weeklyTop', authenticateToken, async (req, res, next) => {
    try {
      const row = await db.get(`
          SELECT u.id, u.name, u.username, u.avatar_config, COALESCE(SUM(t.amount), 0) as weekly_points
          FROM users u
          LEFT JOIN transactions t 
            ON t.to_user_id = u.id 
           AND t.type = 'academic' 
           AND t.created_at >= DATETIME('now', '-7 days')
          WHERE u.role = 'student'
          GROUP BY u.id, u.name, u.username, u.avatar_config
          ORDER BY weekly_points DESC
          LIMIT 1
      `);
      
      if (!row) return res.json(null);
      res.json({ 
          id: row.id, 
          name: row.name, 
          username: row.username, 
          avatar_config: parseAvatar(row.avatar_config), 
          weekly_points: row.weekly_points 
      });
    } catch (err) {
      next(err);
    }
});

// --- Teacher Routes ---

// Create Student
app.post('/api/students', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
  
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Öğrenci adı gereklidir' });
  
  try {
    // Generate random username/password with collision check
    let username;
    let isUnique = false;
    while (!isUnique) {
        username = name.toLowerCase().replace(/\s/g, '').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c') + Math.floor(Math.random() * 1000);
        const existing = await db.get("SELECT id FROM users WHERE username = ?", [username]);
        if (!existing) isUnique = true;
    }
    
    const password = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, 'student', ?)", [username, hash, name]);
    const userId = result.id;
    
    // Init points
    await db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [userId]);
    
    res.json({ id: userId, username, password, name });
  } catch (err) {
    next(err);
  }
});

// Get All Students
app.get('/api/students', authenticateToken, async (req, res, next) => {
  try {
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
    
    const students = rows.map(r => {
      return {
        ...r,
        points: {
          total_points: r.total_points,
          spendable_points: r.spendable_points
        },
        avatar_config: parseAvatar(r.avatar_config)
      };
    });

    res.json(students);
  } catch (err) {
    next(err);
  }
});

// Give Points (only teacher can give points)
app.post('/api/points', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  
  const { student_id, amount, reason } = req.body; 
  if (!student_id || amount === undefined) return res.status(400).json({ error: 'Eksik bilgi' });
  const parsedAmount = parseInt(amount) || 0;

  const givePoints = async (uid, amt, rsn) => {
    // 1. Puan satırı var mı kontrol et, yoksa 0 ile oluştur (SQLite OR IGNORE)
    await db.run(`
      INSERT OR IGNORE INTO points (user_id, total_points, spendable_points) 
      VALUES (?, 0, 0)`, [uid]);

    // 2. PUANI GÜNCELLE
    // Negatif puan durumunda hem toplam hem harcanabilir puan düşmeli
    await db.run(`
      UPDATE points 
      SET total_points = total_points + ?, 
          spendable_points = spendable_points + ? 
      WHERE user_id = ?`, [amt, amt, uid]);
    
    const updated = await db.get("SELECT total_points, spendable_points FROM points WHERE user_id = ?", [uid]);

    // Harcanabilir puanın 0'ın altına düşmemesini sağlayalım (opsiyonel ama güvenli)
    if (updated.spendable_points < 0) {
      await db.run("UPDATE points SET spendable_points = 0 WHERE user_id = ?", [uid]);
      updated.spendable_points = 0;
    }

    // 3. Log kaydı
    await db.run(
      "INSERT INTO transactions (from_user_id, to_user_id, amount, reason, type) VALUES (?, ?, ?, ?, 'academic')",
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
  };

  try {
    if (student_id === 'all') {
      console.log(`[Toplu Puan] Miktar: ${parsedAmount}, Sebep: ${reason}`);
      const rows = await db.all(`
        SELECT u.id, u.name
        FROM users u
        WHERE u.role = 'student'
        AND NOT EXISTS (
          SELECT 1 FROM attendance a 
          WHERE a.student_id = u.id 
          AND a.status = 'absent'
        )
      `);
      
      console.log(`[Toplu Puan] Hedef öğrenci sayısı: ${rows.length}`);
      
      for (const row of rows) {
        try {
          await givePoints(row.id, parsedAmount, reason);
          console.log(`[Toplu Puan] Başarılı: ${row.name}`);
        } catch (err) {
          console.error(`[Toplu Puan] Hata (${row.name}):`, err.message);
        }
      }
      res.json({ success: true, message: `Toplu puan verildi (${rows.length} öğrenci)` });
    } else {
      const finalPoints = await givePoints(student_id, parsedAmount, reason);
      res.json({ success: true, points: finalPoints });
    }
  } catch (err) {
    next(err);
  }
});

// All users (for selection in point-giving UI)
app.get('/api/users', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Yetkisiz erişim' });
  }
  try {
    const rows = await db.all("SELECT id, name, username, role FROM users ORDER BY role, name");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Transactions log with filters and optional CSV export
app.get('/api/transactions', authenticateToken, async (req, res, next) => {
  const { type, from_user_id, to_user_id, start, end, export: exportFmt } = req.query;
  const conditions = [];
  const params = [];

  // Security: Students can only see transactions where they are the recipient or sender
  if (req.user.role === 'student') {
    conditions.push(`(t.from_user_id = ? OR t.to_user_id = ?)`);
    params.push(req.user.id, req.user.id);
  } else if (from_user_id) {
    conditions.push(`t.from_user_id = ?`);
    params.push(from_user_id);
  } else if (to_user_id) {
    conditions.push(`t.to_user_id = ?`);
    params.push(to_user_id);
  }

  if (type) { conditions.push(`t.type = ?`); params.push(type); }
  if (start) { conditions.push(`t.created_at >= ?`); params.push(start); }
  if (end) { conditions.push(`t.created_at <= ?`); params.push(end); }
  
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
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""').replace(/\n/g, ' ');
        return `"${str}"`;
      };
      
      const lines = rows.map(r => [
        r.id, 
        escapeCsv(r.created_at), 
        escapeCsv(r.type), 
        r.from_user_id, 
        escapeCsv(r.from_name), 
        r.to_user_id, 
        escapeCsv(r.to_name), 
        r.amount, 
        escapeCsv(r.reason)
      ].join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      res.send([header.map(h => `"${h}"`).join(','), ...lines].join('\n'));
    } else {
      res.json(rows);
    }
  } catch (err) {
    next(err);
  }
});

// --- Chat Routes ---
app.get('/api/messages', authenticateToken, async (req, res, next) => {
    const { group_type } = req.query; // 'class' or 'students'
    
    if (!group_type) {
      return res.status(400).json({ error: 'Grup türü gereklidir' });
    }
    
    try {
      const rows = await db.all(`SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE group_type = ? ORDER BY created_at ASC LIMIT 50`, 
          [group_type]);
      res.json(rows);
    } catch (err) {
      next(err);
    }
});

app.post('/api/messages', authenticateToken, async (req, res, next) => {
    const { content, group_type } = req.body;
    
    if (!content || !group_type) {
      return res.status(400).json({ error: 'Mesaj içeriği ve grup türü gereklidir' });
    }
    
    if (hasProfanity(content)) {
        return res.status(400).json({ error: 'Uygunsuz içerik tespit edildi' });
    }
    
    try {
      const result = await db.run("INSERT INTO messages (sender_id, content, group_type) VALUES (?, ?, ?)", 
          [req.user.id, content, group_type]);
      
      const message = {
          id: result.id,
          sender_id: req.user.id,
          sender_name: req.user.name,
          content,
          group_type,
          created_at: new Date()
      };
      
      io.emit('new_message', message);
      
      // Görev kontrolü
      if (req.user.role === 'student') {
        await checkMissionCompletion(req.user.id, 'chat_weekly');
      }
      
      res.json(message);
    } catch (err) {
      next(err);
    }
});

// --- Notifications (Announcements) ---
app.post('/api/notifications', authenticateToken, async (req, res, next) => {
  const { message, user_id } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Mesaj içeriği gereklidir' });
  }

  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Yetkisiz erişim' });
  }
  
  try {
    if (user_id) {
      const result = await db.run("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [user_id, message]);
      const id = result.id;
      io.to(`user_${user_id}`).emit('notification', { id, message }); // Use specific room
      res.json({ success: true, id });
    } else {
      const rows = await db.all("SELECT id FROM users WHERE role = 'student'");
      for (const r of rows) {
        await db.run("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [r.id, message]);
        io.to(`user_${r.id}`).emit('notification', { message }); // Send to each room
      }
      res.json({ success: true });
    }
  } catch (err) {
    next(err);
  }
});

app.get('/api/notifications', authenticateToken, async (req, res, next) => {
  try {
    const rows = await db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.user.id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get('/api/users/:id/notifications', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { id } = req.params;
  try {
    const rows = await db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/notifications/read', authenticateToken, async (req, res, next) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Bildirim ID gereklidir' });
  try {
    await db.run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Attendance Routes ---
app.get('/api/attendance', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  try {
    const rows = await db.all("SELECT * FROM attendance");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/attendance/start', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  try {
    // Mevcut tüm öğrencileri yoklamaya ekle veya durumlarını 'present' yap
    const students = await db.all("SELECT id FROM users WHERE role = 'student'");
    for (const s of students) {
      await db.run("INSERT OR IGNORE INTO attendance (student_id, status, updated_at) VALUES (?, 'present', CURRENT_TIMESTAMP)", [s.id]);
      await db.run("UPDATE attendance SET status = 'present', updated_at = CURRENT_TIMESTAMP WHERE student_id = ?", [s.id]);
      // Görev kontrolü
      await checkMissionCompletion(s.id, 'attendance_weekly');
    }
    io.emit('attendance_started');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/attendance/toggle', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { student_id, status } = req.body;
  if (!student_id || !status) return res.status(400).json({ error: 'Öğrenci ID ve durum gereklidir' });
  
  try {
    // SQLite compatible UPSERT (using INSERT OR REPLACE or manual check)
    // We'll use INSERT OR IGNORE followed by UPDATE for better compatibility
    await db.run("INSERT OR IGNORE INTO attendance (student_id, status, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [student_id, status]);
    await db.run("UPDATE attendance SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?", [status, student_id]);
    
    // Eğer 'present' yapıldıysa görev kontrolü
    if (status === 'present') {
      await checkMissionCompletion(student_id, 'attendance_weekly');
    }
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Weekly Points for current user ---
app.get('/api/me/weeklyPoints', authenticateToken, async (req, res, next) => {
  try {
    const row = await db.get(`
      SELECT COALESCE(SUM(amount),0) as weekly_points
      FROM transactions
      WHERE to_user_id = ? AND created_at >= datetime('now', '-7 days')
    `, [req.user.id]);
    res.json({ weekly_points: row.weekly_points });
  } catch (err) {
    next(err);
  }
});

// --- Wardrobe (Saved Avatar Combos) ---
app.get('/api/me/wardrobe', authenticateToken, async (req, res, next) => {
  try {
    const rows = await db.all("SELECT id, name, config, created_at FROM user_wardrobe WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json(rows.map(r => ({ ...r, config: (() => { try { return JSON.parse(r.config || '{}'); } catch { return {}; } })() })));
  } catch (err) {
    next(err);
  }
});

app.post('/api/me/wardrobe', authenticateToken, async (req, res, next) => {
  const { name, config } = req.body;
  const nm = String(name || '').trim();
  if (!nm) return res.status(400).json({ error: 'İsim gerekli' });
  const cfgStr = JSON.stringify(config || {});
  
  try {
    const result = await db.run("INSERT INTO user_wardrobe (user_id, name, config) VALUES (?, ?, ?)", [req.user.id, nm, cfgStr]);
    res.json({ id: result.id, name: nm, config, created_at: new Date() });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/me/wardrobe/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM user_wardrobe WHERE id = ? AND user_id = ?", [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/me/wardrobe/:id/apply', authenticateToken, async (req, res, next) => {
  const { id } = req.params;
  try {
    const row = await db.get("SELECT config FROM user_wardrobe WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Bulunamadı' });
    await db.run("UPDATE users SET avatar_config = ? WHERE id = ?", [row.config, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/me/weeklyPointsDetailed', authenticateToken, async (req, res, next) => {
  try {
    const rows = await db.all(`
      SELECT date(created_at) as day, COALESCE(SUM(amount),0) as points
      FROM transactions
      WHERE to_user_id = ? AND created_at >= datetime('now', '-6 days')
      GROUP BY day
      ORDER BY day ASC
    `, [req.user.id]);
    
    // Fill missing days
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0,10);
      
      const found = rows.find(r => {
          const rDate = new Date(r.day).toISOString().slice(0,10);
          return rDate === dayStr;
      });
      result.push({ day: dayStr, points: found ? parseInt(found.points) : 0 });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- Rosette Routes ---
app.get('/api/rosettes', authenticateToken, async (req, res, next) => {
    try {
      const rows = await db.all("SELECT * FROM rosettes");
      res.json(rows);
    } catch (err) {
      next(err);
    }
});

app.get('/api/users/:id/rosettes', authenticateToken, async (req, res, next) => {
    const { id } = req.params;
    try {
      const rows = await db.all(`
          SELECT ur.*, r.name, r.description, r.icon 
          FROM user_rosettes ur 
          JOIN rosettes r ON ur.rosette_id = r.id 
          WHERE ur.user_id = ?`, 
          [id]);
      res.json(rows);
    } catch (err) {
      next(err);
    }
});

app.post('/api/rosettes/assign', authenticateToken, async (req, res, next) => {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
    const { student_id, rosette_id } = req.body;
    if (!student_id || !rosette_id) return res.status(400).json({ error: 'Öğrenci ve rozet ID gereklidir' });
    
    try {
      // Önce öğrenci ve rozet var mı kontrol et
      const student = await db.get("SELECT id FROM users WHERE id = ? AND role = 'student'", [student_id]);
      if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı' });
      
      const rosette = await db.get("SELECT id FROM rosettes WHERE id = ?", [rosette_id]);
      if (!rosette) return res.status(404).json({ error: 'Rozet bulunamadı' });

      await db.run("INSERT OR IGNORE INTO user_rosettes (user_id, rosette_id) VALUES (?, ?)", [student_id, rosette_id]);
      io.emit('rosette_awarded', { student_id, rosette_id });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
});

// --- Yeni Özellikler: Duyuru ve Günlük Çark ---

// Duyuruları Getir
app.get('/api/announcements', authenticateToken, async (req, res, next) => {
  try {
    const rows = await db.all("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Duyuru Ekle (Sadece Öğretmen/Admin)
app.post('/api/announcements', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Başlık ve içerik gereklidir' });
  
  try {
    const result = await db.run("INSERT INTO announcements (title, content) VALUES (?, ?)", [title, content]);
    res.json({ id: result.id, title, content, created_at: new Date() });
  } catch (err) {
    next(err);
  }
});

// Haftalık Görevleri Getir
app.get('/api/missions', authenticateToken, async (req, res, next) => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff)).toISOString().split('T')[0];
  
  try {
    const missions = await db.all(`
      SELECT m.*, COALESCE(um.status, 'pending') as status
      FROM weekly_missions m
      LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
      WHERE m.created_at = ?
    `, [req.user.id, monday]);
    res.json(missions);
  } catch (err) {
    next(err);
  }
});

// --- Oylama Sistemi ---

// Aktif Oylamaları Getir
app.get('/api/polls', authenticateToken, async (req, res, next) => {
  try {
    const rows = await db.all(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM poll_votes pv WHERE pv.poll_id = p.id) as total_votes,
        (SELECT option_index FROM poll_votes pv WHERE pv.poll_id = p.id AND pv.user_id = ?) as user_vote
      FROM polls p
      WHERE expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    // Oyların dağılımını hesapla
    const polls = await Promise.all(rows.map(async (p) => {
      const votes = await db.all("SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index", [p.id]);
      const results = {};
      votes.forEach(v => {
        results[v.option_index] = parseInt(v.count);
      });
      return { ...p, results };
    }));
    
    res.json(polls);
  } catch (err) {
    next(err);
  }
});

// Oylama Oluştur (Sadece Öğretmen/Admin)
app.post('/api/polls', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { question, options, expires_in_hours } = req.body;
  
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Soru ve en az iki seçenek gereklidir' });
  }

  // Seçeneklerin boş olmadığını kontrol et
  if (options.some(opt => !opt || String(opt).trim() === '')) {
    return res.status(400).json({ error: 'Seçenekler boş olamaz' });
  }

  const expires_at = expires_in_hours ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString() : null;
  
  try {
    const result = await db.run("INSERT INTO polls (question, options, expires_at) VALUES (?, ?, ?)", 
      [question, JSON.stringify(options), expires_at]);
    const poll = { id: result.id, question, options, expires_at, created_at: new Date(), total_votes: 0 };
    io.emit('new_poll', poll);
    res.json(poll);
  } catch (err) {
    next(err);
  }
});

// Oy Ver
app.post('/api/polls/:id/vote', authenticateToken, async (req, res, next) => {
  const { id } = req.params;
  const { option_index } = req.body;
  if (option_index === undefined) return res.status(400).json({ error: 'Seçenek belirtilmedi' });
  
  try {
    const poll = await db.get("SELECT expires_at FROM polls WHERE id = ?", [id]);
    if (!poll) return res.status(404).json({ error: 'Oylama bulunamadı' });
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Oylama süresi dolmuş' });
    }
    
    await db.run("INSERT OR IGNORE INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)", [id, req.user.id, option_index]);
    await db.run("UPDATE poll_votes SET option_index = ?, voted_at = CURRENT_TIMESTAMP WHERE poll_id = ? AND user_id = ?", [option_index, id, req.user.id]);
    
    // Güncel sonuçları gönder
    const votes = await db.all("SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index", [id]);
    const results = {};
    votes.forEach(v => {
      results[v.option_index] = parseInt(v.count);
    });
    
    io.emit('poll_updated', { poll_id: id, results, total_votes: votes.reduce((a, b) => a + parseInt(b.count), 0) });
    
    // Görev kontrolü
    if (req.user.role === 'student') {
      await checkMissionCompletion(req.user.id, 'poll_weekly');
    }
    
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Teacher Notes (Notebook) Routes ---

app.get('/api/users/:id/notes', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { id } = req.params;
  try {
    const rows = await db.all("SELECT * FROM teacher_notes WHERE student_id = ? ORDER BY created_at DESC", [id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/users/:id/notes', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { id } = req.params;
  const { note } = req.body;
  if (!note || note.trim() === '') return res.status(400).json({ error: 'Not içeriği boş olamaz' });
  
  try {
    const result = await db.run("INSERT INTO teacher_notes (student_id, note) VALUES (?, ?)", [id, note]);
    res.json({ id: result.id, student_id: id, note, created_at: new Date() });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/notes/:id', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim' });
  const { id } = req.params;
  try {
    await db.run("DELETE FROM teacher_notes WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Add error handler middleware at the end
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = { app, server };
