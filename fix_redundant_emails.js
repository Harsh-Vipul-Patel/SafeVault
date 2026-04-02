const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'database_scripts');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));

let count = 0;
for (const file of files) {
    const fullPath = path.join(dir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace 'TXN_ALERT', 'EMAIL' with 'TXN_ALERT', 'IN_APP'
    // Specifically targeting the NOTIFICATION_LOG inserts
    const updated = content.replace(/(INSERT INTO NOTIFICATION_LOG.*?VALUES\s*\(.*?'TXN_ALERT',\s*)'EMAIL'/gs, "$1'IN_APP'");
    
    if (content !== updated) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        console.log(`Updated ${file}`);
        count++;
    }
}
console.log(`Successfully fixed redundant email configurations in ${count} SQL files.`);
