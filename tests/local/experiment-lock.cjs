const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function withStudyLock(directory, pageId, callback) {
    const lock = path.join(directory, 'inference.lock');
    const archive = path.join(directory, 'archive/inference-locks');
    fs.mkdirSync(archive, { recursive: true });
    const nonce = randomUUID();
    let descriptor;
    try { descriptor = fs.openSync(lock, 'wx'); }
    catch (error) {
        if (error.code === 'EEXIST') throw Error('Another inference run or an unresolved interrupted run holds the study lock. Inspect its ledger before continuing.');
        throw error;
    }
    try { fs.writeFileSync(descriptor, JSON.stringify({ nonce, pageId, pid: process.pid, created: new Date().toISOString() })); }
    finally { fs.closeSync(descriptor); }
    try { return await callback(); }
    finally {
        const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
        if (owner.nonce !== nonce) throw Error('Study lock ownership changed; preserve it for inspection.');
        // Preserve lock records instead of deleting them. Interrupted locks are
        // deliberately never auto-cleared, preventing an uncertain paid retry.
        fs.renameSync(lock, path.join(archive, nonce + '.json'));
    }
}
module.exports = { withStudyLock };
