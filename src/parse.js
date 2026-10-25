// Small models (qwen2.5-coder) often put tool calls as JSON in `content`
// instead of `tool_calls`, sometimes several in a row. Pull out every
// top-level JSON object that names a known tool.
function parseToolCalls(text, names) {
  const calls = [];
  for (const raw of jsonObjects(text || '')) {
    try {
      const o = JSON.parse(raw);
      let args = o.arguments ?? o.parameters ?? {};
      if (typeof args === 'string') args = JSON.parse(args);
      if (names.includes(o.name)) calls.push({ name: o.name, arguments: args });
    } catch {}
  }
  return calls;
}

// Balanced-brace scan that skips braces inside JSON strings.
function* jsonObjects(text) {
  let depth = 0, start = -1, inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"' && depth > 0) inStr = true;
    else if (ch === '{' && depth++ === 0) start = i;
    else if (ch === '}' && depth > 0 && --depth === 0) yield text.slice(start, i + 1);
  }
}

// The model meant to call a tool, even if the JSON is broken (e.g. an unescaped quote in file content).
const looksLikeToolCall = (text, names) => new RegExp(`"name"\\s*:\\s*"(${names.join('|')})"`).test(text || '');

module.exports = { parseToolCalls, looksLikeToolCall };

if (require.main === module) {
  const assert = require('assert');
  const names = ['run_command', 'read_file', 'write_file'];
  assert.deepStrictEqual(parseToolCalls('{"name": "run_command", "arguments": {"command": "ls"}}', names),
    [{ name: 'run_command', arguments: { command: 'ls' } }]);
  assert.deepStrictEqual(parseToolCalls('```json\n{"name":"read_file","parameters":"{\\"path\\":\\"a.js\\"}"}\n```', names),
    [{ name: 'read_file', arguments: { path: 'a.js' } }]);
  assert.deepStrictEqual(parseToolCalls('{"name":"write_file","arguments":{"path":"a.c","content":"int main(){ return \\"}\\"; }"}}\n{"name":"run_command","arguments":{"command":"cc a.c"}}', names),
    [{ name: 'write_file', arguments: { path: 'a.c', content: 'int main(){ return "}"; }' } },
     { name: 'run_command', arguments: { command: 'cc a.c' } }]);
  assert.deepStrictEqual(parseToolCalls('Use {"name":"other"} like this', names), []);
  assert.deepStrictEqual(parseToolCalls('Done, file written.', names), []);
  assert.deepStrictEqual(parseToolCalls('{broken', names), []);
  const badQuote = '{"name": "write_file", "arguments": {"path": "l.sh", "content": "dir=\\".\\\\"\\nls $dir"}}';
  assert.deepStrictEqual(parseToolCalls(badQuote, names), []);
  assert.ok(looksLikeToolCall(badQuote, names));
  assert.ok(!looksLikeToolCall('Done, file written.', names));
  console.log('parse ok');
}
