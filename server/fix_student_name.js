const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '8gapp.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.get("SELECT id, name FROM users WHERE name = ?", ['Aslı Nas'], (err, row) => {
    if (err) {
      console.error('Error querying user:', err);
      return db.close();
    }
    if (!row) {
      console.log('User "Aslı Nas" not found. Nothing to update.');
      return db.close();
    }
    db.run("UPDATE users SET name = ? WHERE id = ?", ['Aslı Kurnazoğlu', row.id], (err2) => {
      if (err2) {
        console.error('Error updating user:', err2);
      } else {
        console.log('Updated user name to "Aslı Kurnazoğlu" for id:', row.id);
      }
      db.close();
    });
  });
});

