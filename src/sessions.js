// Saved chats, kept per workspace in VS Code's workspaceState.
const MAX_SESSIONS = 50;

const newSession = () => ({ id: crypto.randomUUID(), title: 'New chat', time: Date.now(), messages: [] });

class SessionStore {
  constructor(state) {
    this.state = state;
    this.all = state.get('sessions', []);
    this.current = this.all.find(s => s.id === state.get('current')) || newSession();
  }

  // An empty chat isn't stored until its first message.
  save() {
    const s = this.current;
    s.time = Date.now();
    if (s.messages.length && !this.all.includes(s)) this.all.unshift(s);
    this.all = this.all.slice(0, MAX_SESSIONS); // ponytail: whole list rewritten on every save, fine at 50 chats
    this.state.update('sessions', this.all);
    this.state.update('current', s.id);
  }

  open(session) {
    this.current = session;
    this.save();
  }

  create() {
    this.open(newSession());
  }

  remove(session) {
    this.all = this.all.filter(s => s !== session);
    this.open(this.current === session ? newSession() : this.current);
  }

  recent() {
    return [...this.all].sort((a, b) => b.time - a.time);
  }
}

module.exports = { SessionStore };
