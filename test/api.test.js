const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createApp } = require('../index');
const scraper = require('../tools/scrapper');
const request = require('../tools/request');
const service = require('../service');
const fixture = (name) => fs.readFileSync(`${__dirname}/fixtures/${name}.html`, 'utf8');

test('live HTML snapshots: search, empty results and recipes with sections', async () => {
  const list = scraper.parseRecipesList(fixture('search'));
  assert.equal(list.length, 10);
  assert.ok(list.some((r) => r.id === '23-bolo-de-cenoura'));
  assert.throws(() => scraper.parseRecipesList(fixture('empty')), { code: 400 });
  for (const name of ['valid', 'recipe']) {
    const recipe = scraper.parseRecipe(fixture(name));
    assert.equal(recipe.ingredients.length, 2);
    assert.ok(recipe.instructions[0].items.length > 0);
    assert.equal(recipe.stats.prepare_time_minutes, 40);
    assert.ok(recipe.stats.portion_output > 0);
    assert.equal(recipe.stats.favorites, undefined);
  }
  assert.equal(scraper.parseRecipe(fixture('valid')).title, 'Bolo de cenoura');
  assert.equal(scraper.parseRecipe(fixture('recipe')).stats.portion_output, 10);
});

test('legacy HTML: fewer than ten results, missing sibling and unknown HTML', async () => {
  const list = scraper.parseRecipesList('<div class="recipe-card"><b class="title">Bolo</b><a class="link" href="/receita/23-bolo.html"></a></div>');
  assert.equal(list.length, 1);
  assert.throws(() => scraper.parseRecipesList('<html>Blocked</html>'), { code: 502 });
  assert.throws(() => scraper.parseRecipe('<html>Blocked</html>'), { code: 502 });
  const recipe = scraper.parseRecipe('<div class="recipe-title"><h1>Bolo</h1></div><div class="ingredients-card"><span class="p-ingredient">ovo</span></div><div class="ingredients-card"><b class="card-subtitle">Extra</b></div><div class="instructions"><b class="card-subtitle">Massa</b><ol><li><span>Misture</span></li></ol></div>');
  assert.deepEqual(recipe.ingredients[1].items, []);
  assert.equal(recipe.instructions.length, 1);
});

test('HTTP requests encode queries, follow redirects and propagate failures', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let seen;
  global.fetch = async (url) => {
    seen = new URL(url);
    return new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } });
  };
  assert.equal(await request.searchRecipes('bolo & pão'), '<html>ok</html>');
  assert.equal(seen.searchParams.get('q'), 'bolo & pão');
  let calls = 0;
  global.fetch = async () => ++calls === 1
    ? new Response(null, { status: 302, headers: { location: '/receita/23-bolo.html' } })
    : new Response('ok', { headers: { 'content-type': 'text/html' } });
  assert.equal(await request.getRecipeByID('23'), 'ok');
  global.fetch = async () => new Response(null, { status: 404 });
  await assert.rejects(service.get_recipe('23'), { code: 404 });
  global.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(service.search('bolo'), { code: 502 });
  global.fetch = async () => { throw new TypeError('network'); };
  await assert.rejects(request.searchRecipes('bolo'), { code: 502 });
  global.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
  await assert.rejects(request.searchRecipes('bolo'), { code: 502 });
  global.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://example.com' } });
  await assert.rejects(request.searchRecipes('bolo'), { code: 502 });
  await assert.rejects(service.get_recipe('../other'), { code: 400 });
  await assert.rejects(service.search(' '), { code: 400 });
});

test('Express endpoints preserve JSON and handle known and unexpected errors', async (t) => {
  const server = createApp({
    search: async (name) => {
      if (name === 'empty') throw { code: 400, message: 'no recipes found' };
      if (name === 'broken') throw new Error('private detail');
      return [{ title: name, id: '23-bolo' }];
    },
    get_recipe: async () => { throw { code: 404, message: 'recipe not found' }; },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${url}/search/bolo`)).json(), [{ title: 'bolo', id: '23-bolo' }]);
  assert.equal((await fetch(`${url}/search/empty`)).status, 400);
  const broken = await fetch(`${url}/search/broken`);
  assert.equal(broken.status, 500);
  assert.deepEqual(await broken.json(), { error: 'Internal server error' });
  assert.equal((await fetch(`${url}/recipe/23`)).status, 404);
});

test('upstream timeout and redirect limit are bounded', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  global.fetch = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const pending = request.searchRecipes('bolo');
  const rejection = assert.rejects(pending, { code: 504 });
  t.mock.timers.tick(15000);
  await rejection;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: '/busca?q=bolo' } });
  };
  await assert.rejects(request.searchRecipes('bolo'), { code: 502 });
  assert.equal(calls, 6);
});
