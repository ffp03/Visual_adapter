const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const mode = process.argv[2] || 'test';
function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', timeout: 420000, windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
if (!fs.existsSync(python)) throw Error('Create project .venv first: python -m venv --without-pip .venv (standard library only)');
if (mode === 'test') {
    run(python, ['-m', 'unittest', 'discover', '-s', 'tests/local', '-p', 'test_*.py']);
    run(process.execPath, ['tests/local/preservation-core-test.cjs']);
    run(process.execPath, ['--test', 'tests/local/analysis-sample-test.cjs']);
    run(process.execPath, ['--test', 'tests/local/revised-holdout-replay-test.cjs']);
    run(process.execPath, ['--test', 'tests/local/revised-testing-gate-test.cjs']);
    run(process.execPath, ['--test', 'tests/local/procedure-admission-test.cjs']);
    run(process.execPath, ['tests/local/control-flow.cjs']);
    run(process.execPath, ['tests/local/panel-flow.cjs']);
    run(process.execPath, ['tests/local/scoring.cjs']);
    run(process.execPath, ['tests/local/provenance.cjs']);
    run(process.execPath, ['--test', 'tests/local/codex-local.cjs']);
    run(process.execPath, ['--test', 'tests/local/experiment-lock-test.cjs']);
} else if (mode === 'benchmark') {
    run(python, ['tests/local/corpus.py']);
    run(process.execPath, ['--expose-gc', 'tests/local/benchmark.cjs', ...process.argv.slice(3)]);
} else throw Error('Use test or benchmark. Public collection is an explicit separate command.');
