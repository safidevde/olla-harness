// Tools the model can call, and what each one does. To add a tool: add it to TOOLS and a case to runTool.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { root, clip } = require('./util');

const tool = (name, description, props) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(Object.keys(props).map(k => [k, { type: 'string', description: props[k] }])),
      required: Object.keys(props),
    },
  },
});

const TOOLS = [
  tool('read_file', 'Read a text file.', { path: 'Path relative to the workspace root' }),
  tool('write_file', 'Create or overwrite a file with the complete new content.', { path: 'Path relative to the workspace root', content: 'Full file content' }),
  tool('list_files', 'List files under a directory, recursively.', { path: 'Directory relative to the workspace root, "." for root' }),
  tool('run_command', 'Run a shell command in the workspace root and return its output.', { command: 'Shell command' }),
];
const TOOL_NAMES = TOOLS.map(t => t.function.name);

const approve = async msg => (await vscode.window.showWarningMessage(msg, { modal: true }, 'Allow')) === 'Allow';

async function runTool(name, args) {
  const dir = root();
  if (!dir) return 'Error: no folder is open in VS Code.';
  const p = path.resolve(dir, args.path || '.');
  try {
    switch (name) {
      case 'read_file':
        return clip(fs.readFileSync(p, 'utf8'), 20000);
      case 'write_file':
        if (!(await approve(`Agent wants to write ${path.relative(dir, p)} (${(args.content || '').length} chars).`))) return 'User denied the write.';
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, args.content || '');
        vscode.window.showTextDocument(vscode.Uri.file(p), { preview: false, preserveFocus: true });
        return `Wrote ${p}`;
      case 'list_files': {
        const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(p, '**/*'), '**/{node_modules,.git}/**', 300);
        return uris.map(u => path.relative(dir, u.fsPath)).sort().join('\n') || '(empty)';
      }
      case 'run_command':
        if (!(await approve(`Agent wants to run:\n\n${args.command}`))) return 'User denied the command.';
        return await new Promise(res =>
          exec(args.command, { cwd: dir, timeout: 60000, maxBuffer: 1 << 20 }, (err, out, errOut) =>
            res(clip(`${out}${errOut}${err ? `\n[exit ${err.code ?? err.signal}]` : ''}`, 8000) || '(no output)')));
      default:
        return `Error: unknown tool ${name}`;
    }
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

module.exports = { TOOLS, TOOL_NAMES, runTool };
