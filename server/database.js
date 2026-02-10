const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Promisify database methods
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error(`[DB Error] get: ${sql}`, err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error(`[DB Error] all: ${sql}`, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error(`[DB Error] run: ${sql}`, err);
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
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
    console.log("Initializing database (SQLite)...");
    
    // Tabloları Sırayla Oluştur
    await run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'student',
      name TEXT,
      avatar_config TEXT DEFAULT '{}',
      birth_date TEXT,
      first_login BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("Users table ready.");

    await run(`CREATE TABLE IF NOT EXISTS points (
      user_id INTEGER PRIMARY KEY,
      total_points INTEGER DEFAULT 0,
      spendable_points INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER,
      to_user_id INTEGER,
      amount INTEGER,
      reason TEXT,
      type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      sender_id INTEGER, 
      content TEXT, 
      group_type TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      name TEXT UNIQUE, 
      category TEXT, 
      cost INTEGER, 
      asset_id TEXT UNIQUE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS user_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER, 
      item_id INTEGER, 
      is_equipped BOOLEAN DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS rosettes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      name TEXT UNIQUE, 
      description TEXT, 
      icon TEXT
    )`);

    await run(`CREATE TABLE IF NOT EXISTS user_rosettes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER, 
      rosette_id INTEGER, 
      awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (rosette_id) REFERENCES rosettes(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS user_wardrobe (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER, 
      name TEXT, 
      config TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER, 
      message TEXT, 
      read BOOLEAN DEFAULT 0, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS teacher_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      student_id INTEGER, 
      note TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      title TEXT, 
      content TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS daily_spins (
      user_id INTEGER PRIMARY KEY, 
      last_spin_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    
    await run(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER UNIQUE,
      status TEXT DEFAULT 'present',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS daily_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      points_reward INTEGER,
      type TEXT,
      created_at DATE DEFAULT (DATE('now'))
    )`);

    await run(`CREATE TABLE IF NOT EXISTS user_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      mission_id INTEGER,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      UNIQUE(user_id, mission_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (mission_id) REFERENCES daily_missions(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT,
      options TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )`);

    await run(`CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER,
      user_id INTEGER,
      option_index INTEGER,
      voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, user_id),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Create Indexes for Performance
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_group_type ON messages(group_type)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_items_user_id ON user_items(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_rosettes_user_id ON user_rosettes(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, "read")`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transactions_to_user_id ON transactions(to_user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transactions_from_user_id ON transactions(from_user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_teacher_notes_student_id ON teacher_notes(student_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_missions_user_id ON user_missions(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id)`);

    // Seed Rosettes
    const rosettesCheck = await get("SELECT count(*) as count FROM rosettes");
    if (rosettesCheck.count === 0) {
        const ROSETTES = [
            { name: "Kitap Kurdu", description: "Çok kitap okuyan öğrenci", icon: "📚" },
            { name: "Yardımsever", description: "Arkadaşlarına yardım eden", icon: "🤝" },
            { name: "Temizlik Elçisi", description: "Sınıf temizliğine önem veren", icon: "🧹" },
            { name: "Yıldız Öğrenci", description: "Örnek davranış sergileyen", icon: "⭐" },
            { name: "Ödev Şampiyonu", description: "Ödevlerini düzenli yapan", icon: "📝" }
        ];
        for (const r of ROSETTES) {
            await run("INSERT INTO rosettes (name, description, icon) VALUES (?, ?, ?)", [r.name, r.description, r.icon]);
        }
    }

    // Seed Teacher
    const teacher = await get("SELECT * FROM users WHERE username = ?", ['ogretmen_8g']);
    if (!teacher) {
      const hash = await bcrypt.hash('8G_Ogretmen2025!', 10);
      await run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ['ogretmen_8g', hash, 'teacher', 'Öğretmen']);
    }

    // Seed Students
    const studentCheck = await get("SELECT count(*) as count FROM users WHERE role = 'student'");
    if (studentCheck.count === 0) {
      console.log("Seeding students...");
      for (const studentName of STUDENTS) {
        const { username, passwordPlain } = generateCredentials(studentName);
        const hash = await bcrypt.hash(passwordPlain, 10);
        
        const result = await run(
          "INSERT INTO users (username, password, role, name) VALUES (?, ?, 'student', ?)",
          [username, hash, studentName]
        );
        const userId = result.id;
        
        await run("INSERT INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [userId]);
        await run("INSERT INTO attendance (student_id, status) VALUES (?, 'present')", [userId]);
        
        console.log(`Student Created: ${studentName} | Username: ${username} | Password: ${passwordPlain}`);
      }
    }

    console.log("Database initialization complete.");
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
};

module.exports = {
  get,
  all,
  run,
  initDatabase
};