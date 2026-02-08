const db = require('./database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

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

async function generate() {
    try {
        console.log("Cleaning up existing users...");
        await db.run("DELETE FROM users");
        await db.run("DELETE FROM points");
        // Reset sequences
        await db.run("ALTER SEQUENCE users_id_seq RESTART WITH 1");
        await db.run("ALTER SEQUENCE points_id_seq RESTART WITH 1");

        // 1. Create Teacher
        const teacherUsername = 'ogretmen.8g';
        const teacherPassword = generatePassword();
        const teacherHash = bcrypt.hashSync(teacherPassword, 10);
        
        await db.run("INSERT INTO users (username, password, role, name) VALUES ($1, $2, 'teacher', 'Sınıf Öğretmeni')", 
            [teacherUsername, teacherHash]);

        credentialsList.push(`ÖĞRETMEN HESABI\nKullanıcı Adı: ${teacherUsername}\nŞifre: ${teacherPassword}\n----------------------------------------`);

        // 2. Create Students
        console.log("Creating student accounts...");
        
        for (const name of STUDENTS) {
            let username = generateUsername(name);
            const password = generatePassword();
            const hash = bcrypt.hashSync(password, 10);

            // Check for duplicates
            const row = await db.get("SELECT count(*) as count FROM users WHERE username = $1", [username]);
            if (row && parseInt(row.count) > 0) {
                username = username + Math.floor(Math.random() * 100);
            }

            const res = await db.run("INSERT INTO users (username, password, role, name, first_login, avatar_config) VALUES ($1, $2, 'student', $3, TRUE, '{}') RETURNING id", 
                [username, hash, name]);
            
            const userId = res.rows[0].id;
            await db.run("INSERT INTO points (user_id, total_points, spendable_points) VALUES ($1, 0, 0)", [userId]);
            credentialsList.push(`Öğrenci: ${name}\nKullanıcı Adı: ${username}\nŞifre: ${password}\n----------------------------------------`);
        }

        const fileContent = credentialsList.join('\n\n');
        const outputPath = path.resolve(__dirname, '../kullanici_bilgileri.txt');
        fs.writeFileSync(outputPath, fileContent, 'utf8');
        console.log(`Successfully generated credentials for ${STUDENTS.length} students + 1 teacher.`);
        console.log(`Credentials saved to: ${outputPath}`);
        
        process.exit(0);
    } catch (err) {
        console.error("Error in generation process:", err);
        process.exit(1);
    }
}

generate();
