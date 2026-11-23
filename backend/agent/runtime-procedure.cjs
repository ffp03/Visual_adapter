'use strict';
// The runtime (extension) induction uses exactly the procedure that was evaluated in freeze v6:
// the loop prompt plus the iteration-10 guidance, and the output-only check (G1 validity, declared
// match counts and non-empty output; G2-G6 advisory). The prompt hash is the v6 freeze's
// promptSha256, so a change to either part refuses at runtime instead of shipping an unevaluated
// procedure. The guidance is read with LF line ends (a CRLF checkout would otherwise change the
// hash); .gitattributes also keeps the file's bytes.
const fs = require('fs'), path = require('path'), { createHash } = require('node:crypto');
const { SYSTEM_PROMPT } = require('./loop.cjs');
const EVALUATED_PROMPT_SHA256 = '9126b73e8e0d4f9eee2462748e6d31fa85f911b009bfa8526de3fd694977e721';
const RUNTIME_CHECK = 'output';
const RUNTIME_PROMPT = SYSTEM_PROMPT + '\n' + fs.readFileSync(path.join(__dirname, 'evaluated-guidance.txt'), 'utf8').replace(/\r\n/g, '\n');
const runtimePromptMatches = () => createHash('sha256').update(RUNTIME_PROMPT).digest('hex') === EVALUATED_PROMPT_SHA256;
module.exports = { RUNTIME_PROMPT, RUNTIME_CHECK, EVALUATED_PROMPT_SHA256, runtimePromptMatches };
