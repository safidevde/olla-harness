// The sidebar chat: connects the webview (media/) to the agent and the saved chats.
const vscode = require('vscode');
const fs = require('fs');
const { runAgent, RETRY_PROMPT } = require('./agent');
const { SessionStore } = require('./sessions');
const { pickSession } = require('./history');
const { parseToolCalls, looksLikeToolCall } = require('./parse');
const { TOOL_NAMES } = require('./tools');
const { clip } = require('./util');

// What the webview shows for one stored message, so live and restored chats render the same.
function toEntries(m) {
  if (m.role === 'user') return m.content === RETRY_PROMPT ? [] : [{ role: 'user', text: m.content }];
  if (m.role === 'tool') return [{ role: 'tool', label: m.label || m.tool_name, text: clip(m.content, 2000) }];
  const native = m.tool_calls?.length;
  if (!native && parseToolCalls(m.content, TOOL_NAMES).length) return []; // tool call JSON in content
  if (!native && looksLikeToolCall(m.content, TOOL_NAMES))
    return [{ role: 'tool', warn: true, label: 'Invalid tool call JSON, asked the model to retry', text: clip(m.content, 2000) }];
  const text = m.content || (native ? '' : '(empty reply)');
  return text ? [{ role: 'assistant', text }] : [];
}

function renderHtml(webview, media) {
  const vars = {
    csp: webview.cspSource,
    nonce: crypto.randomUUID().replace(/-/g, ''),
    css: webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.css')),
    js: webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.js')),
    folder: (vscode.workspace.workspaceFolders?.[0]?.name || 'this folder').replace(/[&<>"]/g, ''),
  };
  return fs.readFileSync(vscode.Uri.joinPath(media, 'chat.html').fsPath, 'utf8').replace(/{{(\w+)}}/g, (_, k) => vars[k]);
}

class ChatView {
  busy = false;

  constructor(context) {
    this.extensionUri = context.extensionUri;
    this.store = new SessionStore(context.workspaceState);
  }

  resolveWebviewView(view) {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = renderHtml(view.webview, media);
    view.webview.onDidReceiveMessage(m => {
      if (m.type === 'ready') this.show();
      if (m.type === 'ask') this.ask(m.text);
      if (m.type === 'stop') this.abort?.abort();
    });
  }

  post(msg) {
    this.view?.webview.postMessage(msg);
  }

  // Re-render the whole current chat.
  show() {
    if (!this.view) return;
    const s = this.store.current;
    this.view.description = s.messages.length ? s.title : '';
    this.post({ type: 'load', entries: s.messages.flatMap(toEntries) });
  }

  idle() {
    if (this.busy) vscode.window.showInformationMessage('The agent is still working. Press Stop first.');
    return !this.busy;
  }

  newChat() {
    if (!this.idle()) return;
    this.store.create();
    this.show();
  }

  async history() {
    if (!this.idle()) return;
    const session = await pickSession(this.store);
    if (session) this.store.open(session);
    this.show(); // also covers deleting the open chat
  }

  setBusy(value) {
    this.busy = value;
    this.post({ type: 'busy', value });
  }

  async ask(text) {
    if (this.busy || !text.trim()) return;
    const s = this.store.current;
    const onMessage = m => {
      this.store.save();
      toEntries(m).forEach(e => this.post({ type: 'entry', ...e }));
    };
    if (!s.messages.length) this.view.description = s.title = text.trim().slice(0, 60);
    s.messages.push({ role: 'user', content: text });
    onMessage(s.messages.at(-1));
    this.setBusy(true);
    this.abort = new AbortController();
    try {
      await runAgent(s.messages, { signal: this.abort.signal, onMessage });
    } catch (e) {
      this.post({ type: 'entry', role: 'error', text: e.name === 'AbortError' ? 'Stopped.' : e.message });
    } finally {
      this.setBusy(false);
    }
  }
}

module.exports = { ChatView };
