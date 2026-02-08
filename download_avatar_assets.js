const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://raw.githubusercontent.com/Abhay557/avatar/main';
const DEST_DIR = path.join(__dirname, 'client', 'public', 'avatar-maker');

const folders = {
    body: 5,
    eyes: 7,
    hair: 64,
    cloths: 64
};

if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

async function downloadAll() {
    console.log('Starting download of avatar assets...');
    
    for (const [folder, count] of Object.entries(folders)) {
        const folderPath = path.join(DEST_DIR, folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        
        console.log(`Downloading ${folder} (${count} images)...`);
        
        for (let i = 0; i < count; i++) {
            const fileName = `${i}.png`;
            const url = `${BASE_URL}/${folder}/${fileName}`;
            const dest = path.join(folderPath, fileName);
            
            if (fs.existsSync(dest)) {
                // console.log(`Skipping ${folder}/${fileName}, already exists.`);
                continue;
            }
            
            try {
                await downloadFile(url, dest);
                // process.stdout.write('.');
            } catch (err) {
                console.error(`\nError downloading ${folder}/${fileName}:`, err.message);
            }
        }
        console.log(`\n${folder} done.`);
    }
    console.log('All downloads completed!');
}

downloadAll();
