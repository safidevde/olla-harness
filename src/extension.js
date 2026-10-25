const vscode = require('vscode');
const { ChatView } = require('./chatView');

function activate(context) {
  const view = new ChatView(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ollaHarness.chat', view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('ollaHarness.reset', () => view.newChat()),
    vscode.commands.registerCommand('ollaHarness.history', () => view.history()),
  );
}

module.exports = { activate };
