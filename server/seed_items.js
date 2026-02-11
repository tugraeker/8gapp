const db = require('./database');

const ITEMS = [
    // Avatars (Styles) - These act as "unlocks" or "skins"
    { name: "Robot Avatar Paketi", category: "avatar", cost: 50, asset_id: "bottts" },
    { name: "Kedi Avatar Paketi", category: "avatar", cost: 75, asset_id: "kitten" }, 
    { name: "Canavar Avatar Paketi", category: "avatar", cost: 60, asset_id: "fun-emoji" },
    { name: "Maceralı Avatar Paketi", category: "avatar", cost: 80, asset_id: "adventurer" },
    { name: "Çizim Avatar Paketi", category: "avatar", cost: 100, asset_id: "notionists" },
    
    // Backgrounds / Themes
    { name: "Karanlık Mod", category: "theme", cost: 150, asset_id: "theme_dark" },
    { name: "Uzay Teması", category: "theme", cost: 200, asset_id: "theme_space" },
    
    // Real Rewards
    { name: "Ödev Muafiyeti", category: "perk", cost: 500, asset_id: "perk_homework" },
    { name: "Ders Boyunca Müzik", category: "perk", cost: 300, asset_id: "perk_music" },
    { name: "Öğretmen Masasında Oturma", category: "perk", cost: 1000, asset_id: "perk_sit" }
];

async function seed() {
    try {
        await db.run("TRUNCATE items RESTART IDENTITY CASCADE"); 

        for (const item of ITEMS) {
            await db.run("INSERT INTO items (name, category, cost, asset_id) VALUES ($1, $2, $3, $4)", 
                [item.name, item.category, item.cost, item.asset_id]);
        }
        
        console.log(`Seeded ${ITEMS.length} items into the shop.`);
        process.exit(0);
    } catch (err) {
        console.error("Seeding error:", err);
        process.exit(1);
    }
}

seed();
