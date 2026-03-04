/**
 * Pure extraction functions — no Puppeteer, no I/O, fully unit-testable.
 * Extracted from scraper.js so the core data logic can be tested independently.
 */

// Maps JSON team names (from __NEXT_DATA__) to the short names Action Network
// renders in the DOM, where they differ.
export const DOM_ALIASES = {
  'Trail Blazers': 'Blazers',
};

/**
 * Given a set of name strings, expand with any DOM aliases.
 * Mutates and returns the array for chaining.
 * @param {string[]} names
 * @returns {string[]}
 */
export function addAliases(names) {
  for (const n of [...names]) {
    if (DOM_ALIASES[n]) names.push(DOM_ALIASES[n]);
  }
  return names;
}

/**
 * Build a bidirectional game-key → num_bets map from the
 * __NEXT_DATA__ scoreboardResponse.games array.
 *
 * Keys are "{awayShortName}_{homeShortName}" in both orderings so they
 * can be looked up regardless of which team the DOM labels away/home.
 *
 * @param {Array} games - __NEXT_DATA__.props.pageProps.scoreboardResponse.games
 * @returns {Record<string, number>}
 */
export function buildNumBetsMap(games) {
  if (!Array.isArray(games)) return {};
  const map = {};
  for (const g of games) {
    if (g.num_bets == null) continue;
    const t0 = g.teams?.[0];
    const t1 = g.teams?.[1];
    if (!t0 || !t1) continue;
    const names0 = addAliases([...new Set([t0.display_name, t0.short_name].filter(Boolean))]);
    const names1 = addAliases([...new Set([t1.display_name, t1.short_name].filter(Boolean))]);
    // Store both orderings for every name combination so lookup is order-agnostic
    for (const n0 of names0) {
      for (const n1 of names1) {
        map[`${n0}_${n1}`] = g.num_bets;
        map[`${n1}_${n0}`] = g.num_bets;
      }
    }
  }
  return map;
}
