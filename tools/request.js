const constants = require('../constants');

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'receitas-web-scrapper/1.0', Accept: 'text/html' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (response.body) await response.body.cancel();
        if (!location) throw failure(502, 'Invalid upstream redirect');
        const target = new URL(location, url);
        if (target.origin !== new URL(constants.tg_base_url).origin) {
          throw failure(502, 'Unexpected upstream redirect');
        }
        url = target.href;
        continue;
      }
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        throw failure(response.status === 404 ? 404 : 502,
          response.status === 404 ? 'recipe not found' : 'TudoGostoso request failed');
      }
      if (!(response.headers.get('content-type') || '').includes('text/html')) {
        if (response.body) await response.body.cancel();
        throw failure(502, 'Unexpected upstream content type');
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) {
          controller.abort();
          throw failure(502, 'Upstream response too large');
        }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    throw failure(502, 'Too many upstream redirects');
  } catch (err) {
    if (Number.isInteger(err.code)) throw err;
    throw failure(controller.signal.aborted ? 504 : 502,
      controller.signal.aborted ? 'TudoGostoso request timed out' : 'Could not reach TudoGostoso');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  searchRecipes(searchStr) {
    const url = new URL('/busca', constants.tg_base_url);
    url.searchParams.set('q', searchStr);
    return request(url.href);
  },
  getRecipeByID(id) {
    return request(`${constants.tg_base_url}/receita/${encodeURIComponent(id)}.html`);
  },
};
