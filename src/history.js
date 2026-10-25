// Quick pick listing saved chats, with a delete button on each. Resolves to the chosen chat or undefined.
const vscode = require('vscode');

function pickSession(store) {
  const del = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Delete chat' };
  const qp = vscode.window.createQuickPick();
  const refresh = () => (qp.items = store.recent().map(s => ({
    label: s.title,
    description: new Date(s.time).toLocaleString(),
    detail: `${s.messages.filter(m => m.role === 'user').length} messages`,
    buttons: [del],
    session: s,
  })));
  refresh();
  qp.placeholder = store.all.length ? 'Open a previous chat' : 'No saved chats yet';
  qp.onDidTriggerItemButton(({ item }) => { store.remove(item.session); refresh(); });
  return new Promise(resolve => {
    qp.onDidAccept(() => { resolve(qp.selectedItems[0]?.session); qp.hide(); });
    qp.onDidHide(() => { resolve(); qp.dispose(); });
    qp.show();
  });
}

module.exports = { pickSession };
