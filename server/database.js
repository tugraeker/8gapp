const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let connectionString = process.env.DATABASE_URL;

// SSL Mode ayarı (Sadece production'da veya zorunluysa)
const sslConfig = (process.env.NODE_ENV === 'production' || (connectionString && connectionString.includes('sslmode=require'))) 
  ? { rejectUnauthorized: false } 
  : false;

const pool = new Pool({
  connectionString: connectionString,
  ssl: sslConfig
});

// Yardımcı Fonksiyonlar
const get = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res.rows[0];
  } catch (err) {
    console.error(`[DB Error] get: ${text}`, err);
    throw err;
  }
};

const all = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res.rows;
  } catch (err) {
    console.error(`[DB Error] all: ${text}`, err);
    throw err;
  }
};

const run = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error(`[DB Error] run: ${text}`, err);
    throw err;
  }
};

const STUDENTS = [
  "Utku Efe Taşkaya", "İnci Yanık", "Ayşe Mine Çekiç", "Aslı Kurnazoğlu", "Ali Kerem Tek",
  "Asya Holosorlu", "Taha Berk Eker", "Çağlar Geçici", "Giray Aras Türkan", "Çınar Çalık",
  "Azrahan Özdin", "Metehan Kurt", "Derin Derelioğlu", "Naz Ayza Aslantürk", "Ela Özbek",
  "Nehir Özmen", "Defne Tiren", "Fatih Yaman", "Furkan Şangal", "Görkem Ege Can",
  "Hasan Toprak Tümer", "Hasan Yağız Çirkona", "Kerim Erva Saçkesen", "Mehmet Emre Altıntaş",
  "Melisa Özden", "Selim Savcı", "Suden Gerçek", "Fatmanur Kabak", "Egemen Aydoğan",
  "Tuğra Eker", "Elif Belis Oğuz", "Feride Elif Böbek", "Ataberk Çağman", "Kayra İnce"
];

function generateCredentials(fullName) {
  const parts = fullName.split(' ');
  const firstName = parts[0].toLowerCase().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
  const lastNameInitial = parts[parts.length - 1][0].toLowerCase().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
  const username = `${firstName}.${lastNameInitial}`;
  const passwordPlain = `sifre${Math.floor(1000 + Math.random() * 9000)}`;
  return { username, passwordPlain };
}

// Veritabanı Başlatma Fonksiyonu
const initDatabase = async () => {
  try {
    console.log("Initializing database...");
    // Tabloları Sırayla Oluştur
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'student',
      name TEXT,
      avatar_config TEXT DEFAULT '{}',
      birth_date TEXT,
      first_login BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("Users table ready.");

    await pool.query(`CREATE TABLE IF NOT EXISTS points (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_points INTEGER DEFAULT 0,
      spendable_points INTEGER DEFAULT 0
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER,
      reason TEXT,
      type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Diğer Tablolar (Messages, Items vb.)
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY, 
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      content TEXT, 
      group_type TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY, 
      name TEXT UNIQUE, 
      category TEXT, 
      cost INTEGER, 
      asset_id TEXT UNIQUE
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_items (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, 
      is_equipped BOOLEAN DEFAULT FALSE
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rosettes (
      id SERIAL PRIMARY KEY, 
      name TEXT UNIQUE, 
      description TEXT, 
      icon TEXT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_rosettes (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      rosette_id INTEGER REFERENCES rosettes(id) ON DELETE CASCADE, 
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_wardrobe (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      name TEXT, 
      config TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      message TEXT, 
      read BOOLEAN DEFAULT FALSE, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS teacher_notes (
      id SERIAL PRIMARY KEY, 
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      note TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY, 
      title TEXT, 
      content TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS daily_spins (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, 
      last_spin_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Attendance Table
    await pool.query(`CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'present', -- 'present' (okulda), 'absent' (yok)
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migration: student_id'yi unique yap (eğer tablo zaten varsa)
    try {
      await pool.query(`ALTER TABLE attendance ADD CONSTRAINT attendance_student_id_key UNIQUE (student_id)`);
    } catch (e) {
      // Zaten varsa hata verir, görmezden gelebiliriz
    }

    // Daily Missions Table
    await pool.query(`CREATE TABLE IF NOT EXISTS daily_missions (
      id SERIAL PRIMARY KEY,
      title TEXT,
      description TEXT,
      points_reward INTEGER,
      type TEXT, -- 'spin', 'chat', 'attendance'
      created_at DATE DEFAULT CURRENT_DATE
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_missions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES daily_missions(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending', -- 'pending', 'completed'
      completed_at TIMESTAMP,
      UNIQUE(user_id, mission_id)
    )`);

    // Polls Table
    await pool.query(`CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      question TEXT,
      options JSONB, -- ['Option 1', 'Option 2']
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS poll_votes (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      option_index INTEGER,
      voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, user_id)
    )`);

    // Create Indexes for Performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_group_type ON messages(group_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_items_user_id ON user_items(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_rosettes_user_id ON user_rosettes(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, read)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_to_user_id ON transactions(to_user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_from_user_id ON transactions(from_user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_teacher_notes_student_id ON teacher_notes(student_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_missions_user_id ON user_missions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id)`);

    // Seed Rosettes
    const rosettesCheck = await get("SELECT count(*) FROM rosettes");
    if (parseInt(rosettesCheck.count) === 0) {
        const ROSETTES = [
            { name: "Kitap Kurdu", description: "Çok kitap okuyan öğrenci", icon: "📚" },
            { name: "Yardımsever", description: "Arkadaşlarına yardım eden", icon: "🤝" },
            { name: "Temizlik Elçisi", description: "Sınıf temizliğine önem veren", icon: "🧹" },
            { name: "Yıldız Öğrenci", description: "Örnek davranış sergileyen", icon: "⭐" },
            { name: "Ödev Şampiyonu", description: "Ödevlerini düzenli yapan", icon: "📝" }
        ];
        for (const r of ROSETTES) {
            await pool.query("INSERT INTO rosettes (name, description, icon) VALUES ($1, $2, $3)", [r.name, r.description, r.icon]);
        }
    }

    // Seed Teacher
    const teacher = await get("SELECT * FROM users WHERE username = $1", ['ogretmen_8g']);
    if (!teacher) {
      const hash = await bcrypt.hash('8G_Ogretmen2025!', 10);
      await pool.query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, $3, $4)", ['ogretmen_8g', hash, 'teacher', 'Öğretmen']);
    }

    // Seed Students
    for (const name of STUDENTS) {
      const student = await get("SELECT * FROM users WHERE name = $1", [name]);
      if (!student) {
        const { username, passwordPlain } = generateCredentials(name);
        const hash = await bcrypt.hash(passwordPlain, 10);
        const res = await pool.query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'student', $3) RETURNING id", [username, hash, name]);
        await pool.query("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [res.rows[0].id]);
        console.log(`Student created: ${name} (${username} / ${passwordPlain})`);
      } else {
        // Ensure points table entry exists for existing student
        const points = await get("SELECT * FROM points WHERE user_id = $1", [student.id]);
        if (!points) {
          await pool.query("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [student.id]);
        }
      }
    }

    console.log("Database initialized successfully!");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
};

// MODUL EXPORTS HER ZAMAN EN SONDA OLMALI
module.exports = {
  pool,
  get,
  all,
  run,
  initDatabase
};