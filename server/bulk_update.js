const db = require('./database');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function updatePasswords() {
    const filePath = path.join(__dirname, '..', 'kullanici_bilgileri.txt');
    const content = fs.readFileSync(filePath, 'utf8');
    
    const lines = content.split('\n');
    let currentUser = null;
    let currentPassword = null;
    
    const updates = [];
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('Kullanıcı Adı:')) {
            currentUser = line.replace('Kullanıcı Adı:', '').trim();
        } else if (line.startsWith('Şifre:')) {
            currentPassword = line.replace('Şifre:', '').trim();
            if (currentUser && currentPassword) {
                updates.push({ username: currentUser, password: currentPassword });
                currentUser = null;
                currentPassword = null;
            }
        }
    }
    
    console.log(`Found ${updates.length} users to update.`);
    
    for (const update of updates) {
        let dbUsername = update.username;
        
        // Fix potential typos in DB
        if (dbUsername === 'kayra.i̇') {
            const typoUser = await db.get("SELECT * FROM users WHERE username = 'kayyra.i̇'");
            if (typoUser) {
                console.log('Fixing typo: kayyra.i̇ -> kayra.i̇');
                await db.run("UPDATE users SET username = 'kayra.i̇' WHERE username = 'kayyra.i̇'");
            }
        }

        if (dbUsername === 'i̇nci.y') {
            const userWithComma = await db.get("SELECT * FROM users WHERE username = 'i̇nci.y,'");
            if (userWithComma) {
                console.log('Fixing username for i̇nci.y (removing comma)');
                await db.run("UPDATE users SET username = 'i̇nci.y' WHERE username = 'i̇nci.y,'");
            }
        }

        const hash = await bcrypt.hash(update.password, 10);
        const result = await db.run("UPDATE users SET password = $1 WHERE username = $2", [hash, dbUsername]);
        
        if (result.changes > 0) {
            console.log(`Updated password for ${dbUsername}`);
        } else {
            // Try normalized search if exact match fails
            const normalized = dbUsername.toLowerCase().trim()
                .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
                .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
            
            // This is just a fallback, the file usernames should mostly match
            console.warn(`Could not find user ${dbUsername}. Try checking DB manually.`);
        }
    }
    
    console.log('Bulk update complete.');
    process.exit(0);
}

updatePasswords().catch(err => {
    console.error(err);
    process.exit(1);
});
