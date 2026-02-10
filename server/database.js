const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let connectionString = process.env.DATABASE_URL;

// SSL Mode uyarısını gidermek için sslmode=verify-full ekle veya güncelle
if (connectionString) {
  if (connectionString.includes('sslmode=')) {
    connectionString = connectionString.replace(/sslmode=[^&?]+/, 'sslmode=verify-full');
  } else {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=verify-full';
  }
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Yardımcı Fonksiyonlar
const get = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows[0];
};

const all = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows;
};

const run = async (text, params) => {
  return await pool.query(text, params);
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

    await pool.query(`CREATE TABLE IF NOT EXISTS points (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      total_points INTEGER DEFAULT 0,
      spendable_points INTEGER DEFAULT 0
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER REFERENCES users(id),
      to_user_id INTEGER REFERENCES users(id),
      amount INTEGER,
      reason TEXT,
      type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Diğer Tablolar (Messages, Items vb.)
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, sender_id INTEGER REFERENCES users(id), content TEXT, group_type TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, category TEXT, cost INTEGER, asset_id TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), item_id INTEGER REFERENCES items(id), is_equipped BOOLEAN DEFAULT FALSE)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rosettes (id SERIAL PRIMARY KEY, name TEXT, description TEXT, icon TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_rosettes (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), rosette_id INTEGER REFERENCES rosettes(id), awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_wardrobe (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), name TEXT, config TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), message TEXT, read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS teacher_notes (id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES users(id), note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, title TEXT, content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS daily_spins (user_id INTEGER PRIMARY KEY REFERENCES users(id), last_spin_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    
    // Attendance Table
    await pool.query(`CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER UNIQUE REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
      mission_id INTEGER REFERENCES daily_missions(id),
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
      poll_id INTEGER REFERENCES polls(id),
      user_id INTEGER REFERENCES users(id),
      option_index INTEGER,
      voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, user_id)
    )`);

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
      const hash = bcrypt.hashSync('8G_Ogretmen2025!', 10);
      await pool.query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, $3, $4)", ['ogretmen_8g', hash, 'teacher', 'Öğretmen']);
    }

    // Seed Students
    for (const name of STUDENTS) {
      const student = await get("SELECT * FROM users WHERE name = $1", [name]);
      if (!student) {
        const { username, passwordPlain } = generateCredentials(name);
        const hash = bcrypt.hashSync(passwordPlain, 10);
        const res = await pool.query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'student', $3) RETURNING id", [username, hash, name]);
        await pool.query("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [res.rows[0].id]);
        console.log(`Student created: ${name} (${username} / ${passwordPlain})`);
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