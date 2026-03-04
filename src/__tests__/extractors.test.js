import { describe, it, expect } from 'vitest';
import { buildNumBetsMap } from '../extractors.js';
import { SAMPLE_NEXT_DATA_GAMES } from './fixtures/next-data-sample.js';

describe('buildNumBetsMap', () => {
  it('returns bidirectional keys for each game', () => {
    const map = buildNumBetsMap(SAMPLE_NEXT_DATA_GAMES);
    expect(map['Celtics_Lakers']).toBe(12049);
    expect(map['Lakers_Celtics']).toBe(12049);
  });

  it('skips games with null num_bets', () => {
    const map = buildNumBetsMap(SAMPLE_NEXT_DATA_GAMES);
    expect(map['Heat_Bulls']).toBeUndefined();
    expect(map['Bulls_Heat']).toBeUndefined();
  });

  it('applies DOM_ALIASES (Trail Blazers → Blazers) alongside original name', () => {
    const map = buildNumBetsMap(SAMPLE_NEXT_DATA_GAMES);
    // Aliased short name
    expect(map['Blazers_Warriors']).toBe(8432);
    expect(map['Warriors_Blazers']).toBe(8432);
    // Original short name still present
    expect(map['Trail Blazers_Warriors']).toBe(8432);
    expect(map['Warriors_Trail Blazers']).toBe(8432);
  });

  it('handles null team entries gracefully without throwing', () => {
    const games = [{ num_bets: 100, teams: [null, null] }];
    expect(() => buildNumBetsMap(games)).not.toThrow();
  });

  it('returns empty map for empty games array', () => {
    expect(buildNumBetsMap([])).toEqual({});
  });

  it('handles games with missing teams array', () => {
    const games = [{ num_bets: 500 }];
    expect(() => buildNumBetsMap(games)).not.toThrow();
    expect(buildNumBetsMap(games)).toEqual({});
  });
});
