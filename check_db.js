
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'server', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function checkMelisa() {
  try {
    const user = await get("SELECT * FROM users WHERE name LIKE '%Melisa%' OR username = 'melisa.o'");
    console.log('--- MELISA DB CHECK ---');
    if (user) {
      console.log('User found:');
      console.log('ID:', user.id);
      console.log('Name:', user.name);
      console.log('Username:', user.username);
      console.log('Password Hash:', user.password);
      
      const isMatch = await bcrypt.compare('sifre6919', user.password);
      console.log('Password "sifre6919" matches:', isMatch);
    } else {
      console.log('Melisa not found in database.');
    }
    db.close();
  } catch (err) {
    console.error('Error:', err);
    db.close();
  }
}

checkMelisa();
