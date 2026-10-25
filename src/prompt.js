// System prompt, rebuilt on every request so time, folder and open file are current.
const vscode = require('vscode');
const fs = require('fs');
const { root } = require('./util');

function systemPrompt() {
  const dir = root();
  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  let files = '';
  try { files = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 60).map(d => d.name + (d.isDirectory() ? '/' : '')).join(', '); } catch {}
  return `You are a coding agent inside VS Code on ${process.platform}.
Current time: ${new Date().toString()}
Current folder (workspace root, all relative paths and commands start here): ${dir || '(none open)'}
${files ? `Top-level entries: ${files}\n` : ''}${active ? `The user has this file open: ${active}\n` : ''}If the answer is already above (like the time or the folder), answer directly without tools.
Use the tools to look at files, change them and run commands. Read a file before editing it, and always write the complete file content.
Code shown in your reply is NOT saved. The only way to change a file is to call write_file.
After you write a script or change code, run it to check it works, and fix it if it fails.
Call one tool at a time. When the task is done, reply in plain text with a short summary.`;
}

module.exports = { systemPrompt };
