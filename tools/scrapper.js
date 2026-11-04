/* eslint-disable prefer-destructuring */
/* eslint-disable no-cond-assign */
const jsdom = require('jsdom');

const { JSDOM } = jsdom;
const constants = require('../constants');

const text = (element) => element?.textContent.replace(/\s+/g, ' ').trim() || '';

// Selectors observed on live TudoGostoso pages on 2026-11-04.
function parseCurrentRecipe(doc) {
  const root = doc.querySelector('.recipe-ingredients');
  if (!root) return null;
  const groups = root.querySelectorAll(':scope > section');
  const ingredients = [...(groups.length ? groups : [root])].map((group) => ({
    title: text(group.querySelector('.recipe-ingredients-subtitle')) || 'default',
    items: [...group.querySelectorAll('.recipe-ingredients-item-label')].map(text),
  }));
  const instructions = [];
  for (const step of doc.querySelectorAll('.recipe-steps-item')) {
    const title = text(step.querySelector('.recipe-steps-title'));
    if (title || !instructions.length) instructions.push({ title: title || 'default', items: [] });
    const item = text(step.querySelector('.recipe-steps-text'));
    if (item) instructions[instructions.length - 1].items.push(item);
  }
  const additional = [...doc.querySelectorAll('.recipe-advice-content p')].map(text).filter(Boolean);
  if (additional.length) instructions.push({ title: 'Informações Adicionais', items: additional });
  const stats = extractStats(doc);
  const duration = text(doc.querySelector('.recipe-info-item'));
  const hours = duration.match(/(\d+)\s*h/);
  const minutes = duration.match(/(\d+)\s*min/);
  if (hours || minutes) stats.prepare_time_minutes = Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0);
  const portions = text(root.querySelector('h2')).match(/\((\d+)\s*porç/);
  if (portions) stats.portion_output = Number(portions[1]);
  const title = text(doc.querySelector('h1'));
  if (!title || !ingredients.some((s) => s.items.length) ||
      !doc.querySelector('.recipe-steps-text')) {
    throw { code: 502, message: 'Incomplete TudoGostoso recipe HTML' };
  }
  return { title, stats, ingredients, instructions };
}

function extractRecipeID(link) {
  const regex = /\/receita\/(\S+).html/gm;
  let m; let recipeId;
  while ((m = regex.exec(link)) !== null) {
    if (m.index === regex.lastIndex) {
      regex.lastIndex += 1;
    }

    if (m.length > 1) {
      recipeId = m[1];
    }
  }
  return recipeId;
}

function parseItems(title, element, identifier) {
  const section = { title, items: [] };
  let items = element.querySelectorAll(identifier);
  if (items.length === 0) {
    items = element.nextElementSibling?.querySelectorAll(identifier) || [];
  }
  items.forEach((item) => {
    if (item != null) { section.items = section.items.concat(item.textContent); }
  });
  return section;
}

function extractIngredients(doc) {
  const ingredients = doc.querySelectorAll('div.ingredients-card');
  let ingredientSections = [];
  let section = {};
  ingredients.forEach((ingredient) => {
    let title = 'default';

    const subtitles = ingredient.querySelectorAll('.card-subtitle');
    if (subtitles.length === 0) {
      section = parseItems(title, ingredient, 'span.p-ingredient');
      ingredientSections = ingredientSections.concat(section);
    }
    if (subtitles.length > 0) {
      subtitles.forEach((subElement) => {
        const titleElement = subElement;
        if (titleElement != null) {
          title = titleElement.textContent;
        }
        section = parseItems(title, subElement, 'span.p-ingredient');
        ingredientSections = ingredientSections.concat(section);
      });
    }
  });
  return ingredientSections;
}

function extractInstructions(doc) {
  const instructions = doc.querySelectorAll('div.instructions');
  let instructionsSections = [];
  instructions.forEach((instruction) => {
    let title = 'default';
    let section;

    const subtitles = instruction.querySelectorAll('.card-subtitle');
    if (subtitles.length === 0) {
      section = parseItems(title, instruction, 'ol li span');
      instructionsSections = instructionsSections.concat(section);
    }
    if (subtitles.length > 0) {
      subtitles.forEach((subElement) => {
        const titleElement = subElement;
        if (titleElement != null) {
          title = subElement.textContent;
        }
        let selector = 'ol li span';
        if (title === 'Informações Adicionais') {
          selector = 'ul li span';
        }
        section = parseItems(title, subElement, selector);
        instructionsSections = instructionsSections.concat(section);
      });
    }
  });
  return instructionsSections;
}

function extractStats(doc) {
  const ret = {};

  const regex = /(\D)/gm; // remove any non-digit
  const subst = '';

  const prepareTimeElement = doc.querySelector('time.dt-duration');
  if (prepareTimeElement != null) {
    ret.prepare_time_minutes = Number(prepareTimeElement.textContent.replace(regex, subst));
  }

  const portionOutputElement = doc.querySelector('data.p-yield');
  if (portionOutputElement != null) {
    ret.portion_output = Number(portionOutputElement.textContent.replace(regex, subst));
  }

  const favoritesElement = doc.querySelector('div.like data.num');
  if (favoritesElement != null) {
    ret.favorites = Number(favoritesElement.textContent.replace(regex, subst));
  }

  return ret;
}

function extractTitle(doc) {
  return doc.querySelector('div.recipe-title h1')?.textContent.replace(/\n/g, '').trim();
}

module.exports = {
  parseRecipesList(str) {
    const dom = new JSDOM(str);
    const doc = dom.window.document;

    const listing = doc.querySelector('.news-card-listing');
    const currentLinks = listing?.querySelectorAll('a.news-card-link[href*="/receita/"]');
    if (currentLinks?.length) {
      const results = [...currentLinks].map((link) => ({
        title: link.getAttribute('aria-label')?.trim() || text(link),
        id: extractRecipeID(link.href),
      })).filter((recipe) => recipe.id && recipe.title);
      if (!results.length) throw { code: 502, message: 'Could not extract recipes' };
      return results.slice(0, constants.max_recipes_returned);
    }
    if (listing && /Nenhum resultado/i.test(text(listing))) {
      throw constants.errors.recipes_search_not_found;
    }

    if (doc.querySelectorAll('.no-results').length > 0) {
      return new Promise((resolve, reject) => {
        reject(constants.errors.recipes_search_not_found);
      });
    }

    const recipes = doc.querySelectorAll('.recipe-card');
    const maxRecipes = constants.max_recipes_returned;
    let retRecipes = [];
    for (let i = 0; i < Math.min(maxRecipes, recipes.length); i += 1) {
      const titles = recipes[i].querySelectorAll('.title');
      const links = recipes[i].querySelectorAll('.link');

      if (titles.length > 0 && links.length > 0 && extractRecipeID(links[0].href)) {
        const title = titles[0].textContent;
        const link = links[0].href;

        retRecipes = retRecipes.concat({
          title: title.replace(/\n/g, ''),
          id: extractRecipeID(link),
        });
      }
    }
    if (recipes.length === 0) {
      throw { code: 502, message: 'Unrecognized TudoGostoso search HTML' };
    }
    if (retRecipes.length === 0) throw { code: 502, message: 'Could not extract recipes' };
    return retRecipes;
  },
  parseRecipe(str) {
    const dom = new JSDOM(str);
    const doc = dom.window.document;

    const current = parseCurrentRecipe(doc);
    if (current) return current;

    if (doc.body.innerHTML.includes('redirected')) {
      return new Promise((resolve, reject) => { reject(constants.errors.get_recipe_not_found); });
    }

    const title = extractTitle(doc);
    const ingredients = extractIngredients(doc);
    const instructions = extractInstructions(doc);
    if (!title || !ingredients.some((s) => s.items.length) || !instructions.some((s) => s.items.length)) {
      throw { code: 502, message: 'Unrecognized TudoGostoso recipe HTML' };
    }
    return {
      title,
      stats: extractStats(doc),
      ingredients,
      instructions,
    };
  },
};
