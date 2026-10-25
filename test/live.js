// Live agent test against a real Ollama: `npm run test:live [case-name...]`.
// Each case runs runAgent in a fresh temp folder with a fake vscode that auto-approves.
// Transcripts are written to test/out/<case>.json.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let ws, approvals;
const vscode = {
  workspace: {
    get workspaceFolders() { return [{ name: path.basename(ws), uri: { fsPath: ws } }]; },
    getConfiguration: () => ({ get: k => ({ url: process.env.OLLAMA_URL || 'http://localhost:11434', model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b' })[k] }),
    findFiles: async pattern => fs.readdirSync(pattern.base, { recursive: true })
      .map(f => path.join(pattern.base, f))
      .filter(f => fs.statSync(f).isFile() && !/node_modules|\.git/.test(f))
      .map(fsPath => ({ fsPath })),
  },
  window: {
    activeTextEditor: undefined,
    showWarningMessage: async msg => { approvals.push(msg); return 'Allow'; },
    showTextDocument() {},
  },
  Uri: { file: fsPath => ({ fsPath }) },
  RelativePattern: class { constructor(base) { this.base = base; } },
};
const load = Module._load;
Module._load = (req, ...a) => (req === 'vscode' ? vscode : load(req, ...a));
const { runAgent } = require('../src/agent');

const file = p => fs.readFileSync(path.join(ws, p), 'utf8');
const sh = cmd => execSync(cmd, { cwd: ws, encoding: 'utf8', stdio: 'pipe' });
const lastText = msgs => msgs.filter(m => m.role === 'assistant').at(-1)?.content || '';
const toolsUsed = msgs => msgs.filter(m => m.role === 'tool').map(m => m.tool_name);

// Each case: files to seed, prompt(s), and a check that throws (or returns a string) on failure.
const CASES = {
  time: {
    ask: 'What time is it right now? Answer with just the time.',
    check: msgs => {
      const h = new Date().getHours(), text = lastText(msgs);
      if (!new RegExp(`\\b0?${h % 12 || 12}|\\b${h}`).test(text)) return `hour ${h} not in "${text}"`;
    },
  },
  folder: {
    ask: 'Which folder are we working in? Give the full path.',
    check: msgs => { if (!lastText(msgs).includes(path.basename(ws))) return `path missing in "${lastText(msgs)}"`; },
  },
  'shell-script': {
    seed: { 'notes.txt': 'x' },
    ask: 'write a shell script list_files.sh that lists the files in the current directory',
    check: () => {
      const out = sh('sh list_files.sh');
      if (!out.includes('notes.txt')) return `script output: ${out}`;
    },
  },
  'read-answer': {
    seed: { 'package.json': JSON.stringify({ name: 'zebra-billing', version: '4.2.7' }, null, 2) },
    ask: 'What version is this package?',
    check: msgs => { if (!lastText(msgs).includes('4.2.7')) return `got "${lastText(msgs)}"`; },
  },
  'fix-bug': {
    seed: {
      'sum.js': 'function sum(xs) {\n  let t = 0;\n  for (let i = 1; i < xs.length; i++) t += xs[i];\n  return t;\n}\nmodule.exports = sum;\n',
      'check.js': "const assert = require('assert');\nassert.strictEqual(require('./sum')([1, 2, 3]), 6);\nconsole.log('ok');\n",
    },
    ask: 'node check.js fails. Find and fix the bug in sum.js.',
    check: () => { if (!sh('node check.js').includes('ok')) return 'check.js still fails'; },
  },
  'write-and-run': {
    ask: 'Create hello.py that prints the first 5 square numbers, one per line, run it, and tell me the output.',
    check: msgs => {
      const out = sh('python3 hello.py');
      if (!/^(0\s+)?1\s+4\s+9\s+16\s/.test(out)) return `hello.py printed: ${out}`;
      if (!toolsUsed(msgs).includes('run_command')) return 'never ran the script';
    },
  },
  'count-files': {
    seed: { 'a.txt': 'a', 'b.txt': 'b', 'src/c.txt': 'c', 'src/d.txt': 'd' },
    ask: 'How many .txt files are in this project, including subfolders?',
    check: msgs => { if (!/\b4\b|four/i.test(lastText(msgs))) return `got "${lastText(msgs)}"`; },
  },
  quotes: {
    ask: 'Create greet.sh that prints exactly: She said "hi" and left a \\ backslash',
    check: () => {
      const out = sh('sh greet.sh').trim();
      if (out !== 'She said "hi" and left a \\ backslash') return `printed: ${out}`;
    },
  },
  history: {
    ask: ['My name is Rania and my favourite number is 37. Just say ok.', 'What is my favourite number?'],
    check: msgs => { if (!lastText(msgs).includes('37')) return `got "${lastText(msgs)}"`; },
  },
};

async function runCase(name, c) {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), `olla-${name}-`));
  approvals = [];
  for (const [p, content] of Object.entries(c.seed || {})) {
    fs.mkdirSync(path.dirname(path.join(ws, p)), { recursive: true });
    fs.writeFileSync(path.join(ws, p), content);
  }
  const msgs = [];
  const t0 = Date.now();
  let error;
  try {
    for (const ask of [].concat(c.ask)) {
      msgs.push({ role: 'user', content: ask });
      await runAgent(msgs, { signal: AbortSignal.timeout(300000), onMessage() {} });
    }
    error = c.check(msgs);
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `${name}.json`), JSON.stringify({ ws, approvals, error, msgs }, null, 2));
  const steps = msgs.filter(m => m.role === 'assistant').length;
  console.log(`${error ? 'FAIL' : 'pass'}  ${name.padEnd(14)} ${secs.padStart(4)}s  ${steps} steps  [${toolsUsed(msgs).join(', ')}]${error ? `\n      ${error}` : ''}`);
  return !error;
}

(async () => {
  const only = process.argv.slice(2);
  const names = Object.keys(CASES).filter(n => !only.length || only.includes(n));
  let passed = 0;
  for (const n of names) passed += await runCase(n, CASES[n]);
  console.log(`\n${passed}/${names.length} passed`);
  process.exit(passed === names.length ? 0 : 1);
})();
