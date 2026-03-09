const { exec } = require('child_process');
const path = require('path');
require('dotenv').config();

const user = process.env.DB_USER;
const pass = process.env.DB_PASSWORD;
const conn = process.env.DB_CONNECTION_STRING || process.env.DB_CONNECT_STRING;

if (!user || !pass || !conn) {
    console.error('Missing DB env variables.'); process.exit(1);
}

const scriptFile = process.argv[2] || 'db_seed.sql';
const scriptPath = path.join(__dirname, '..', scriptFile);
const cwd = path.join(__dirname, '..');

console.log(`Running ${scriptFile} against ${conn} as ${user}...`);

exec(`sqlplus -S ${user}/${pass}@${conn} @${scriptFile}`, { cwd }, (error, stdout, stderr) => {
    if (error) {
        console.error('Execution Error:', error.message);
        console.log('Output:', stdout);
        process.exit(1);
    }
    if (stderr) console.error('STDERR:', stderr);
    console.log('OUTPUT:\n' + stdout);
    console.log('Done.');
});
