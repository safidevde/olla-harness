// One non-streaming /api/chat call to Ollama.
const { cfg } = require('./util');
const { TOOLS } = require('./tools');
const { systemPrompt } = require('./prompt');

async function chat(messages, signal) {
  const url = cfg().get('url');
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model: cfg().get('model'),
      // `label` is display-only (see agent.js), Ollama doesn't need it
      messages: [{ role: 'system', content: systemPrompt() }, ...messages.map(({ label, ...m }) => m)],
      tools: TOOLS,
      stream: false,
      options: { num_ctx: 16384 }, // Ollama's default context is too small for tool results
    }),
  }).catch(e => {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') throw e;
    throw new Error(`Can't reach Ollama at ${url}. Is it running? (${e.cause?.code || e.message})`);
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return (await res.json()).message;
}

module.exports = { chat };
