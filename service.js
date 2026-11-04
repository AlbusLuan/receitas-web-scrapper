const scrapper = require('./tools/scrapper');
const request = require('./tools/request');

module.exports = {
  async search(searchStr) {
    if (!searchStr.trim()) throw { code: 400, message: 'Search name is required' };
    return scrapper.parseRecipesList(await request.searchRecipes(searchStr));
  },
  async get_recipe(id) {
    if (!/^\d+(?:-[\p{L}\p{N}_-]+)?$/u.test(id)) {
      throw { code: 400, message: 'Invalid recipe id' };
    }
    return scrapper.parseRecipe(await request.getRecipeByID(id));
  },
};
