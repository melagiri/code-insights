import { Hono } from 'hono';

const app = new Hono();

const NOT_IMPLEMENTED = {
  error: 'Not implemented',
  code: 'NOT_IMPLEMENTED',
  message: 'LLM analysis endpoints will be implemented in Phase 4.',
};

// Phase 4 will implement actual LLM calls.
// For now, all analysis routes return 501 so the SPA can render gracefully.

app.post('/session', (c) => c.json(NOT_IMPLEMENTED, 501));
app.post('/prompt-quality', (c) => c.json(NOT_IMPLEMENTED, 501));
app.post('/recurring', (c) => c.json(NOT_IMPLEMENTED, 501));

export default app;
