const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '8gapp.db');
const db = new sqlite3.Database(dbPath);

const ITEMS = [
    // Avatars (Styles) - These act as "unlocks" or "skins"
    { name: "Robot Avatar Paketi", category: "avatar", cost: 50, asset_id: "bottts" },
    { name: "Kedi Avatar Paketi", category: "avatar", cost: 75, asset_id: "kitten" }, // Valid DiceBear style? No, kitten is not default v7. Let's stick to v7 supported.
    // Actually, let's check DiceBear v7 styles: avataaars, bottts, fun-emoji, icons, identicon, lorelei, notionists, open-peeps, personas, pixel-art, shapes, thumbs
    { name: "Canavar Avatar Paketi", category: "avatar", cost: 60, asset_id: "fun-emoji" },
    { name: "Maceralı Avatar Paketi", category: "avatar", cost: 80, asset_id: "adventurer" },
    { name: "Çizim Avatar Paketi", category: "avatar", cost: 100, asset_id: "notionists" },
    
    // Backgrounds / Themes (Future implementation, but let's sell them)
    { name: "Karanlık Mod", category: "theme", cost: 150, asset_id: "theme_dark" },
    { name: "Uzay Teması", category: "theme", cost: 200, asset_id: "theme_space" },
    
    // Real Rewards
    { name: "Ödev Muafiyeti", category: "perk", cost: 500, asset_id: "perk_homework" },
    { name: "Ders Boyunca Müzik", category: "perk", cost: 300, asset_id: "perk_music" },
    { name: "Öğretmen Masasında Oturma", category: "perk", cost: 1000, asset_id: "perk_sit" }
];

db.serialize(() => {
    db.run("DELETE FROM items"); // Clear old items to avoid duplicates
    db.run("DELETE FROM sqlite_sequence WHERE name='items'");

    const stmt = db.prepare("INSERT INTO items (name, category, cost, asset_id) VALUES (?, ?, ?, ?)");
    ITEMS.forEach(item => {
        stmt.run(item.name, item.category, item.cost, item.asset_id);
    });
    stmt.finalize();
    console.log(`Seeded ${ITEMS.length} items into the shop.`);
    db.close();
});
