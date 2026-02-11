const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Promisify database methods for PG
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error(`[DB Error] query: ${text}`, err);
    throw err;
  }
};

const get = async (text, params) => {
  const res = await query(text, params);
  return res.rows[0];
};

const all = async (text, params) => {
  const res = await query(text, params);
  return res.rows;
};

const run = async (text, params) => {
  const res = await query(text, params);
  return { 
    id: res.rows[0]?.id || null, 
    changes: res.rowCount 
  };
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

function parseCredentialsFile() {
  try {
    const filePath = path.join(__dirname, '..', 'kullanici_bilgileri.txt');
    if (!fs.existsSync(filePath)) return null;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const credentials = {};
    
    let currentName = null;
    let currentUsername = null;
    let currentPassword = null;
    
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('Öğrenci:')) {
        currentName = line.replace('Öğrenci:', '').trim();
      } else if (line.startsWith('Kullanıcı Adı:')) {
        currentUsername = line.replace('Kullanıcı Adı:', '').trim();
      } else if (line.startsWith('Şifre:')) {
        currentPassword = line.replace('Şifre:', '').trim();
        if (currentName && currentUsername && currentPassword) {
          credentials[currentName] = { username: currentUsername, password: currentPassword };
          currentName = null;
          currentUsername = null;
          currentPassword = null;
        }
      }
    }
    return credentials;
  } catch (err) {
    console.error("Error parsing credentials file:", err);
    return null;
  }
}

const initDatabase = async () => {
  try {
    console.log("Initializing database (PostgreSQL)...");
    
    // Create Tables
    await query(`CREATE TABLE IF NOT EXISTS users (
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

    await query(`CREATE TABLE IF NOT EXISTS points (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_points INTEGER DEFAULT 0,
      spendable_points INTEGER DEFAULT 0
    )`);

    await query(`CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER,
      reason TEXT,
      type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY, 
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      content TEXT, 
      group_type TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY, 
      name TEXT UNIQUE, 
      category TEXT, 
      cost INTEGER, 
      asset_id TEXT UNIQUE
    )`);

    await query(`CREATE TABLE IF NOT EXISTS user_items (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, 
      is_equipped BOOLEAN DEFAULT FALSE
    )`);

    await query(`CREATE TABLE IF NOT EXISTS rosettes (
      id SERIAL PRIMARY KEY, 
      name TEXT UNIQUE, 
      description TEXT, 
      icon TEXT
    )`);

    await query(`CREATE TABLE IF NOT EXISTS user_rosettes (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      rosette_id INTEGER REFERENCES rosettes(id) ON DELETE CASCADE, 
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS user_wardrobe (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      name TEXT, 
      config TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, 
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      message TEXT, 
      read BOOLEAN DEFAULT FALSE, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS teacher_notes (
      id SERIAL PRIMARY KEY, 
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
      note TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY, 
      title TEXT, 
      content TEXT, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'present',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS weekly_missions (
      id SERIAL PRIMARY KEY,
      title TEXT,
      description TEXT,
      points_reward INTEGER,
      type TEXT,
      created_at DATE DEFAULT CURRENT_DATE
    )`);

    await query(`CREATE TABLE IF NOT EXISTS user_missions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES weekly_missions(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      completed_at TIMESTAMP,
      UNIQUE(user_id, mission_id)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      question TEXT,
      options TEXT, -- JSON string
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS poll_votes (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      option_index INTEGER,
      voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, user_id)
    )`);

    // Seed Rosettes
    const rosettesCheck = await get("SELECT count(*) as count FROM rosettes");
    if (parseInt(rosettesCheck.count) === 0) {
        const ROSETTES = [
            { name: "Kitap Kurdu", description: "Çok kitap okuyan öğrenci", icon: "📚" },
            { name: "Yardımsever", description: "Arkadaşlarına yardım eden", icon: "🤝" },
            { name: "Temizlik Elçisi", description: "Sınıf temizliğine önem veren", icon: "🧹" },
            { name: "Yıldız Öğrenci", description: "Örnek davranış sergileyen", icon: "⭐" },
            { name: "Ödev Şampiyonu", description: "Ödevlerini düzenli yapan", icon: "📝" }
        ];
        for (const r of ROSETTES) {
            await query("INSERT INTO rosettes (name, description, icon) VALUES ($1, $2, $3)", [r.name, r.description, r.icon]);
        }
    }

    // Seed Teacher
    const teacher = await get("SELECT * FROM users WHERE username = $1", ['ogretmen_8g']);
    if (!teacher) {
      const hash = await bcrypt.hash('8G_Ogretmen2025!', 10);
      await query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, $3, $4)", ['ogretmen_8g', hash, 'teacher', 'Öğretmen']);
    }

    // Sync Credentials and Seed Students
    const fileCredentials = parseCredentialsFile();
    if (fileCredentials) {
      console.log(`Syncing credentials for ${Object.keys(fileCredentials).length} students...`);
      for (const studentName of STUDENTS) {
        if (fileCredentials[studentName]) {
          const creds = fileCredentials[studentName];
          const hash = await bcrypt.hash(creds.password, 10);
          
          // Check if user exists
          let user = await get("SELECT id FROM users WHERE name = $1", [studentName]);
          if (!user) {
            user = await get("SELECT id FROM users WHERE username = $1", [creds.username]);
          }

          if (user) {
            // Update existing user
            await query("UPDATE users SET password = $1, username = $2 WHERE id = $3", [hash, creds.username, user.id]);
          } else {
            // Create new student
            const res = await query(
              "INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'student', $3) RETURNING id",
              [creds.username, hash, studentName]
            );
            const userId = res.rows[0].id;
            await query("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [userId]);
            await query("INSERT INTO attendance (student_id, status) VALUES ($1, 'present')", [userId]);
          }
        }
      }
    }

    console.log("Database initialization complete (PostgreSQL).");
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
};

module.exports = {
  get,
  all,
  run,
  query,
  initDatabase,
  pool
};
