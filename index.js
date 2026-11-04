const express = require('express');
const service = require('./service');

function createApp(api = service) {
  const app = express();
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/search/:name', async (req, res, next) => {
    try { res.json(await api.search(req.params.name)); } catch (err) { next(err); }
  });
  app.get('/recipe/:id', async (req, res, next) => {
    try { res.json(await api.get_recipe(req.params.id)); } catch (err) { next(err); }
  });
  app.use((err, req, res, next) => {
    const status = Number.isInteger(err.code) && err.code >= 400 && err.code <= 599
      ? err.code : 500;
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
  });
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}
module.exports = { createApp };
