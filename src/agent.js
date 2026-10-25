// The agent loop: ask the model, run the tools it calls, repeat until it answers in plain text.
const { chat } = require('./ollama');
const { TOOL_NAMES, runTool } = require('./tools');
const { parseToolCalls, looksLikeToolCall } = require('./parse');

const MAX_STEPS = 20;
const MAX_RETRIES = 2; // a model that repeats the same broken JSON won't fix it on try 10
const RETRY_PROMPT = 'Your last reply looks like a tool call but is not valid JSON, so nothing ran. '
  + 'Inside JSON strings escape every " as \\" and every backslash as \\\\. Send the tool call again.';

// Small models sometimes write tool calls as JSON in `content` instead of `tool_calls`.
const toolCalls = msg => (msg.tool_calls?.length ? msg.tool_calls.map(c => c.function) : parseToolCalls(msg.content, TOOL_NAMES));

// Appends every new message to `messages` and reports it through onMessage. Throws on abort.
async function runAgent(messages, { signal, onMessage }) {
  const add = m => { messages.push(m); onMessage(m); };
  let lastCall, retries = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    signal.throwIfAborted();
    const msg = await chat(messages, signal);
    add(msg);
    const calls = toolCalls(msg);
    if (!calls.length) {
      if (msg.tool_calls?.length || !looksLikeToolCall(msg.content, TOOL_NAMES)) return;
      if (retries++ === MAX_RETRIES) throw new Error('The model kept sending invalid tool call JSON. Try rephrasing the request, or a bigger model.');
      add({ role: 'user', content: RETRY_PROMPT });
      continue;
    }
    retries = 0;
    for (const c of calls) {
      signal.throwIfAborted();
      const args = c.arguments || {};
      let out = await runTool(c.name, args);
      // Small models loop: "fix" code in their reply text, rerun the same failing command, repeat.
      const key = JSON.stringify([c.name, args, out]);
      if (key === lastCall) out += '\n[Same call, same result as last time: nothing has changed. Code in your reply is not saved; call write_file to change a file.]';
      lastCall = key;
      add({ role: 'tool', tool_name: c.name, label: `${c.name} ${args.command || args.path || ''}`.trim(), content: out });
    }
  }
  throw new Error(`Stopped after ${MAX_STEPS} steps.`);
}

module.exports = { runAgent, RETRY_PROMPT };
