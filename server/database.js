const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '8gapp.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

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
  
  // Basic username: firstname.initial (e.g., ali.y)
  const username = `${firstName}.${lastNameInitial}`;
  const passwordPlain = `sifre${Math.floor(1000 + Math.random() * 9000)}`;
  
  return { username, passwordPlain };
}

db.serialize(() => {
  // Use a transaction or sequential execution
  
  // Tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'student', -- 'teacher', 'student'
    name TEXT,
    avatar_config TEXT DEFAULT '{}',
    birth_date TEXT,
    first_login BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS points (
    user_id INTEGER PRIMARY KEY,
    total_points INTEGER DEFAULT 0,
    spendable_points INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER,
    to_user_id INTEGER,
    amount INTEGER,
    reason TEXT,
    type TEXT, -- 'academic', 'shop', 'bonus'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(from_user_id) REFERENCES users(id),
    FOREIGN KEY(to_user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    content TEXT,
    group_type TEXT, -- 'class', 'students'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    cost INTEGER,
    asset_id TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    item_id INTEGER,
    is_equipped BOOLEAN DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(item_id) REFERENCES items(id)
  )`);
  
  // New Tables for requested features
  db.run(`CREATE TABLE IF NOT EXISTS rosettes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    icon TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_rosettes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    rosette_id INTEGER,
    awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(rosette_id) REFERENCES rosettes(id)
  )`);

  // Wardrobe: saved avatar combinations per user
  db.run(`CREATE TABLE IF NOT EXISTS user_wardrobe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Seed Rosettes
  const ROSETTES = [
      { name: "Kitap Kurdu", description: "Çok kitap okuyan öğrenci", icon: "📚" },
      { name: "Yardımsever", description: "Arkadaşlarına yardım eden", icon: "🤝" },
      { name: "Temizlik Elçisi", description: "Sınıf temizliğine önem veren", icon: "🧹" },
      { name: "Yıldız Öğrenci", description: "Örnek davranış sergileyen", icon: "⭐" },
      { name: "Ödev Şampiyonu", description: "Ödevlerini düzenli yapan", icon: "📝" },
      { name: "Sınıf Başkanı", description: "Sınıf düzenini sağlayan", icon: "👑" },
      { name: "Sporcu", description: "Sportif başarısı olan", icon: "⚽" },
      { name: "Sanatçı", description: "Sanatsal yeteneği olan", icon: "🎨" }
  ];

  db.get("SELECT count(*) as count FROM rosettes", (err, row) => {
      if (row && row.count === 0) {
          const stmt = db.prepare("INSERT INTO rosettes (name, description, icon) VALUES (?, ?, ?)");
          ROSETTES.forEach(r => {
              stmt.run(r.name, r.description, r.icon);
          });
          stmt.finalize();
          console.log("Rosettes seeded");
      }
  });

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS teacher_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id)
  )`);

  // Seed Items if empty
  const ITEMS = [
    { name: "Robot Avatar Paketi", category: "avatar", cost: 50, asset_id: "bottts" },
    { name: "Canavar Avatar Paketi", category: "avatar", cost: 60, asset_id: "fun-emoji" },
    { name: "Open-Peeps Paketi", category: "avatar", cost: 80, asset_id: "open-peeps" },
    { name: "Notionists Paketi", category: "avatar", cost: 100, asset_id: "notionists" },
    { name: "Karanlık Mod", category: "theme", cost: 150, asset_id: "theme_dark" },
    { name: "Uzay Teması", category: "theme", cost: 200, asset_id: "theme_space" },
    { name: "Ödev Muafiyeti", category: "perk", cost: 500, asset_id: "perk_homework" },
    { name: "Ders Boyunca Müzik", category: "perk", cost: 300, asset_id: "perk_music" },
    { name: "Öğretmen Masasında Oturma", category: "perk", cost: 1000, asset_id: "perk_sit" }
  ];
  db.get("SELECT count(*) as count FROM items", (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare("INSERT INTO items (name, category, cost, asset_id) VALUES (?, ?, ?, ?)");
      ITEMS.forEach(it => stmt.run(it.name, it.category, it.cost, it.asset_id));
      stmt.finalize();
      console.log("Shop items seeded");
    }
  });

  // Seeding
  const teacherUsername = 'ogretmen_8g';
  const teacherPassword = '8G_Ogretmen2025!';

  db.get("SELECT * FROM users WHERE username = ?", [teacherUsername], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync(teacherPassword, 10);
      db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", 
        [teacherUsername, hash, 'teacher', 'Öğretmen']);
      console.log(`Teacher account created: ${teacherUsername}`);
    }
  });

  STUDENTS.forEach(name => {
    const creds = generateCredentials(name);
    // Note: In a real app, we might want to ensure username uniqueness if duplicates exist.
    // For this list, we'll assume uniqueness or append numbers if collision (logic simplified here).
    
    db.get("SELECT * FROM users WHERE name = ?", [name], (err, row) => {
      if (!row) {
        // Check if username exists to avoid collision (simple check)
        db.get("SELECT * FROM users WHERE username = ?", [creds.username], (err, userRow) => {
            let finalUsername = creds.username;
            if (userRow) {
                finalUsername = finalUsername + Math.floor(Math.random() * 100);
            }
            
            const hash = bcrypt.hashSync(creds.passwordPlain, 10);
            db.run("INSERT INTO users (username, password, role, name, first_login) VALUES (?, ?, ?, ?, 1)", 
              [finalUsername, hash, 'student', name], function(err) {
                if (!err) {
                   // Create initial points record
                   db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [this.lastID]);
                   console.log(`Student created: ${name} (${finalUsername} / ${creds.passwordPlain})`);
                }
            });
        });
      }
    });
  });
});

module.exports = db;
