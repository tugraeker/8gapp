const db = require('./database');

async function fix() {
    try {
        const row = await db.get("SELECT id, name FROM users WHERE name = $1", ['Aslı Nas']);
        if (!row) {
            console.log('User "Aslı Nas" not found. Nothing to update.');
            process.exit(0);
        }
        
        await db.run("UPDATE users SET name = $1 WHERE id = $2", ['Aslı Kurnazoğlu', row.id]);
        console.log('Updated user name to "Aslı Kurnazoğlu" for id:', row.id);
        process.exit(0);
    } catch (err) {
        console.error('Error querying/updating user:', err);
        process.exit(1);
    }
}

fix();
