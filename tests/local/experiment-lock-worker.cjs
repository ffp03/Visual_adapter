const fs = require('node:fs');
const path = require('node:path');
const { withStudyLock } = require('./experiment-lock.cjs');
const [directory, role] = process.argv.slice(2);
withStudyLock(directory, role, async () => {
    const ledger = path.join(directory, 'fake-calls.jsonl');
    const count = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').length : 0;
    if (count >= 1) throw Error('Fake experiment cap reached');
    fs.appendFileSync(ledger, JSON.stringify({ role }) + '\n');
    fs.writeFileSync(path.join(directory, 'entered.json'), JSON.stringify({ role }));
    const start = Date.now();
    while (!fs.existsSync(path.join(directory, 'release.signal'))) {
        if (Date.now() - start > 10000) throw Error('Test release signal timed out');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}).then(() => console.log('completed')).catch(error => { console.log(error.message); process.exitCode = 1; });
