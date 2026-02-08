const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '8gapp.db');
const db = new sqlite3.Database(dbPath);

const STUDENTS = [
  "Utku Efe Taşkaya", "İnci Yanık", "Ayşe Mine Çekiç", "Aslı Nas", "Ali Kerem Tek",
  "Asya Holosorlu", "Taha Berk Eker", "Çağlar Geçici", "Giray Aras Türkan", "Çınar Çalık",
  "Azrahan Özdin", "Metehan Kurt", "Derin Derelioğlu", "Naz Ayza Aslantürk", "Ela Özbek",
  "Nehir Özmen", "Defne Tiren", "Fatih Yaman", "Furkan Şangal", "Görkem Ege Can",
  "Hasan Toprak Tümer", "Hasan Yağız Çirkona", "Kerim Erva Saçkesen", "Mehmet Emre Altıntaş",
  "Melisa Özden", "Selim Savcı", "Suden Gerçek", "Fatmanur Kabak", "Egemen Aydoğan",
  "Tuğra Eker", "Elif Belis Oğuz", "Feride Elif Böbek", "Ataberk Çağman", "Kayra İnce"
];

function turkishToEnglish(text) {
    return text.replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
               .replace(/Ü/g, 'U').replace(/ü/g, 'u')
               .replace(/Ş/g, 'S').replace(/ş/g, 's')
               .replace(/İ/g, 'I').replace(/ı/g, 'i')
               .replace(/Ö/g, 'O').replace(/ö/g, 'o')
               .replace(/Ç/g, 'C').replace(/ç/g, 'c');
}

function generateUsername(fullName) {
    const parts = fullName.split(' ');
    const firstName = turkishToEnglish(parts[0]).toLowerCase();
    const lastName = turkishToEnglish(parts[parts.length - 1]).toLowerCase();
    return `${firstName}.${lastName}`;
}

function generatePassword() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit number
}

const credentialsList = [];

db.serialize(() => {
    console.log("Cleaning up existing users...");
    // Clear existing users to ensure clean slate
    db.run("DELETE FROM users");
    db.run("DELETE FROM points");
    // We keep transactions/messages/rosettes tables but they might have invalid foreign keys now. 
    // Ideally we should clear them too for a full reset, but let's stick to users/points for now.
    db.run("DELETE FROM sqlite_sequence WHERE name='users'"); // Reset ID counter

    // 1. Create Teacher
    const teacherUsername = 'ogretmen.8g';
    const teacherPassword = generatePassword();
    const teacherHash = bcrypt.hashSync(teacherPassword, 10);
    
    db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, 'teacher', 'Sınıf Öğretmeni')", 
        [teacherUsername, teacherHash], (err) => {
            if (err) console.error("Error creating teacher:", err);
    });

    credentialsList.push(`ÖĞRETMEN HESABI\nKullanıcı Adı: ${teacherUsername}\nŞifre: ${teacherPassword}\n----------------------------------------`);

    // 2. Create Students
    console.log("Creating student accounts...");
    
    // We use a promise wrapper for sequential execution to ensure file writing happens after all DB inserts
    const createStudent = (name) => {
        return new Promise((resolve, reject) => {
            let username = generateUsername(name);
            const password = generatePassword();
            const hash = bcrypt.hashSync(password, 10);

            // Check for duplicates
            db.get("SELECT count(*) as count FROM users WHERE username = ?", [username], (err, row) => {
                if (row && row.count > 0) {
                    username = username + Math.floor(Math.random() * 100);
                }

                db.run("INSERT INTO users (username, password, role, name, first_login, avatar_config) VALUES (?, ?, 'student', ?, 1, '{}')", 
                    [username, hash, name], function(err) {
                        if (err) {
                            console.error(`Error creating ${name}:`, err);
                            reject(err);
                        } else {
                            const userId = this.lastID;
                            db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES (?, 0, 0)", [userId]);
                            credentialsList.push(`Öğrenci: ${name}\nKullanıcı Adı: ${username}\nŞifre: ${password}\n----------------------------------------`);
                            resolve();
                        }
                    });
            });
        });
    };

    // Execute all student creations
    const promises = STUDENTS.map(name => createStudent(name));

    Promise.all(promises).then(() => {
        const fileContent = credentialsList.join('\n\n');
        const outputPath = path.resolve(__dirname, '../kullanici_bilgileri.txt');
        fs.writeFileSync(outputPath, fileContent, 'utf8');
        console.log(`Successfully generated credentials for ${STUDENTS.length} students + 1 teacher.`);
        console.log(`Credentials saved to: ${outputPath}`);
        db.close();
    }).catch(err => {
        console.error("Error in generation process:", err);
        db.close();
    });
});
