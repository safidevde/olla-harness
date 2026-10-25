// Webview side of the chat. Talks to src/chatView.js through postMessage:
//   in:  load {entries}, entry {role, text, label?}, busy {value}
//   out: ready, ask {text}, stop
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const log = $('log'), input = $('input'), send = $('send'), thinking = $('thinking');
let busy = false;

// Minimal markdown: fenced code blocks, `inline code`, **bold**.
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const inline = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
// Even parts are prose, odd parts are code (an unclosed fence runs to the end).
const md = s => s.split(/```[^\n]*\n?([\s\S]*?)(?:```|$)/)
  .map((p, i) => (i % 2 ? `<pre><button class="copy">Copy</button><code>${esc(p.replace(/\n$/, ''))}</code></pre>` : inline(p)))
  .join('');

function add(e) {
  let d;
  if (e.role === 'tool') {
    d = document.createElement('details');
    d.className = e.warn ? 'tool warn' : 'tool';
    d.innerHTML = '<summary></summary><pre></pre>';
    d.firstChild.textContent = e.label;
    d.lastChild.textContent = e.text;
  } else {
    d = document.createElement('div');
    d.className = 'm ' + e.role;
    if (e.role === 'assistant') d.innerHTML = md(e.text);
    else d.textContent = e.text;
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

const grow = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };

function submit() {
  if (busy) return vscode.postMessage({ type: 'stop' });
  const text = input.value.trim();
  if (!text) return;
  vscode.postMessage({ type: 'ask', text });
  input.value = '';
  grow();
}

input.addEventListener('input', grow);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!busy) submit();
  }
});
send.addEventListener('click', submit);
document.addEventListener('click', e => {
  const t = e.target;
  if (t.classList.contains('chip')) { input.value = t.textContent; submit(); }
  if (t.classList.contains('copy')) {
    navigator.clipboard.writeText(t.nextSibling.textContent);
    t.textContent = 'Copied';
    setTimeout(() => (t.textContent = 'Copy'), 1200);
  }
});

window.addEventListener('message', ({ data: m }) => {
  if (m.type === 'load') { log.textContent = ''; m.entries.forEach(add); }
  if (m.type === 'entry') add(m);
  if (m.type === 'busy') {
    busy = m.value;
    send.textContent = busy ? 'Stop' : 'Send';
    thinking.hidden = !busy;
    if (!busy) input.focus();
  }
});

vscode.postMessage({ type: 'ready' });
input.focus();
