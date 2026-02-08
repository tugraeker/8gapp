const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper for single row
const get = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows[0];
};

// Helper for all rows
const all = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows;
};

// Helper for execution (returns result object)
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

const initDatabase = async () => {
  try {
    // Tables
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
      user_id INTEGER PRIMARY KEY,
      total_points INTEGER DEFAULT 0,
      spendable_points INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER,
      to_user_id INTEGER,
      amount INTEGER,
      reason TEXT,
      type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(from_user_id) REFERENCES users(id),
      FOREIGN KEY(to_user_id) REFERENCES users(id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER,
      content TEXT,
      group_type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sender_id) REFERENCES users(id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT,
      category TEXT,
      cost INTEGER,
      asset_id TEXT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      item_id INTEGER,
      is_equipped BOOLEAN DEFAULT FALSE,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(item_id) REFERENCES items(id)
    )`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS rosettes (
      id SERIAL PRIMARY KEY,
      name TEXT,
      description TEXT,
      icon TEXT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_rosettes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      rosette_id INTEGER,
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(rosette_id) REFERENCES rosettes(id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_wardrobe (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT,
      config TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      message TEXT,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    await pool.query(`CREATE TABLE IF NOT EXISTS teacher_notes (
      id SERIAL PRIMARY KEY,
      student_id INTEGER,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(student_id) REFERENCES users(id)
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

    const rosettesCount = await get("SELECT count(*) as count FROM rosettes");
    if (parseInt(rosettesCount.count) === 0) {
        for (const r of ROSETTES) {
            await pool.query("INSERT INTO rosettes (name, description, icon) VALUES ($1, $2, $3)", [r.name, r.description, r.icon]);
        }
        console.log("Rosettes seeded");
    }

    // Seed Items
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

    const itemsCount = await get("SELECT count(*) as count FROM items");
    if (parseInt(itemsCount.count) === 0) {
      for (const it of ITEMS) {
        await pool.query("INSERT INTO items (name, category, cost, asset_id) VALUES ($1, $2, $3, $4)", [it.name, it.category, it.cost, it.asset_id]);
      }
      console.log("Shop items seeded");
    }

    // Seed Teacher
    const teacherUsername = 'ogretmen_8g';
    const teacherPassword = '8G_Ogretmen2025!';

    const teacher = await get("SELECT * FROM users WHERE username = $1", [teacherUsername]);
    if (!teacher) {
      const hash = bcrypt.hashSync(teacherPassword, 10);
      await pool.query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, $3, $4)", 
        [teacherUsername, hash, 'teacher', 'Öğretmen']);
      console.log(`Teacher account created: ${teacherUsername}`);
    }

    // Seed Students
    for (const name of STUDENTS) {
      const { username, passwordPlain } = generateCredentials(name);
      const student = await get("SELECT * FROM users WHERE name = $1", [name]);
      
      if (!student) {
        const hash = bcrypt.hashSync(passwordPlain, 10);
        const res = await pool.query("INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'student', $3) RETURNING id", 
          [username, hash, name]);
        const newUserId = res.rows[0].id;
        
        await pool.query("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [newUserId]);
        console.log(`Student created: ${name} (${username} / ${passwordPlain})`);
      }
    }

    console.log("Database initialized");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
};

module.exports = {
  pool,
  get,
  all,
  run,
  initDatabase
};
