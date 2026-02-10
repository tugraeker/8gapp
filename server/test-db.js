const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/8gapp'
});
client.connect()
  .then(() => {
    console.log('Connected successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    process.exit(1);
  });