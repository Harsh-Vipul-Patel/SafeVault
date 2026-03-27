require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=============================================');
console.log('🔄 Starting Safe Vault Database Auto-Setup...');
console.log('=============================================');

const user = process.env.DB_USER;
const pass = process.env.DB_PASSWORD;
const conn = process.env.DB_CONNECTION_STRING;

// The master SQL script is located in the root directory
const masterScript = path.join(__dirname, '../run_all.sql');

if (!fs.existsSync(masterScript)) {
    console.error('❌ Error: Could not find run_all.sql in the root directory.');
    process.exit(1);
}

try {
    console.log(`🔌 Securing connection to Oracle Terminal (sqlplus)...`);
    console.log(`👤 User: ${user}`);
    console.log(`🔗 Target: ${conn}`);
    console.log('⏳ Executing SQL commands (this may take a minute)...\n');

    // Connect and execute the script natively via SQL*Plus
    // CWD is set to parent so @@ relative paths in run_all.sql resolve properly
    execSync(`sqlplus -S ${user}/${pass}@${conn} @"${masterScript}"`, {
        cwd: path.join(__dirname, '../'),
        stdio: 'inherit'
    });

    console.log('\n✅ Database Setup Completed Successfully!\n');
} catch (error) {
    console.error('\n❌ Database Setup Failed.');
    console.error('Please ensure:');
    console.error(' 1. Oracle Database is running.');
    console.error(' 2. Oracle \'sqlplus\' utility is installed and added to your system PATH.');
    console.error(' 3. Your .env database credentials are correct.');
    process.exit(1);
}
