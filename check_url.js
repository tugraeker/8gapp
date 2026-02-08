const https = require('https');

const urls = [
    'https://raw.githubusercontent.com/Abhay557/avatar/main/body/0.png',
    'https://raw.githubusercontent.com/Abhay557/avatar/master/body/0.png',
    'https://raw.githubusercontent.com/Abhay557/avatar/main/avatar-maker/body/0.png'
];

urls.forEach(url => {
    https.get(url, (res) => {
        console.log(`${url}: ${res.statusCode}`);
    });
});
