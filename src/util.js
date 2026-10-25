const vscode = require('vscode');

const root = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
const cfg = () => vscode.workspace.getConfiguration('ollaHarness');
const clip = (s, n) => (s.length > n ? s.slice(0, n) + `\n…[${s.length - n} more chars]` : s);

module.exports = { root, cfg, clip };
