const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { withStudyLock } = require('./experiment-lock.cjs');
const root = path.resolve(__dirname, '../..');
function worker(directory, role) {
    const child = spawn(process.execPath, [path.join(__dirname, 'experiment-lock-worker.cjs'), directory, role], {
        windowsHide: true, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    return new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve({ code, output })); });
}
test('concurrent processes cannot duplicate a reservation or exceed the aggregate fake cap', async () => {
    const directory = fs.mkdtempSync(path.join(root, 'workspace/experiment-lock-'));
    const first = worker(directory, 'first');
    const start = Date.now();
    while (!fs.existsSync(path.join(directory, 'entered.json'))) {
        if (Date.now() - start > 10000) throw Error('First worker did not acquire its lock');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    try {
        const competing = await worker(directory, 'competing');
        assert.equal(competing.code, 1); assert.match(competing.output, /holds the study lock/);
        assert.equal(fs.readFileSync(path.join(directory, 'fake-calls.jsonl'), 'utf8').trim().split('\n').length, 1);
    } finally { fs.writeFileSync(path.join(directory, 'release.signal'), 'release'); }
    assert.equal((await first).code, 0);
    const afterCap = await worker(directory, 'after-cap');
    assert.equal(afterCap.code, 1); assert.match(afterCap.output, /cap reached/);
    assert.equal(fs.readdirSync(path.join(directory, 'archive/inference-locks')).length, 2);
});
test('an interrupted-run lock is preserved and prevents a new inference', async () => {
    const directory = fs.mkdtempSync(path.join(root, 'workspace/experiment-lock-stale-'));
    fs.writeFileSync(path.join(directory, 'inference.lock'), JSON.stringify({ nonce: 'unresolved' }));
    let calls = 0;
    await assert.rejects(withStudyLock(directory, 'new', async () => { calls++; }), /unresolved interrupted run/);
    assert.equal(calls, 0); assert.equal(fs.existsSync(path.join(directory, 'inference.lock')), true);
});
