const crypto = require('crypto');
const targetHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';

const passwords = ['password', 'MEET2005', 'meet2005', 'Admin@123', 'root', 'ravi', 'ravi.verma'];

passwords.forEach(pw => {
    const hash = crypto.createHash('sha256').update(pw).digest('hex');
    console.log(`Password: ${pw}, Hash: ${hash}`);
    if (hash === targetHash) {
        console.log(`MATCH FOUND: ${pw}`);
    }
});
