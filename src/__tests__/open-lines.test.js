import { describe, it, expect } from 'vitest';
import { parseOpenLine, applyOpenLinesToGame } from '../extractors.js';

// ---------------------------------------------------------------------------
// Group A — parseOpenLine
// ---------------------------------------------------------------------------
describe('parseOpenLine', () => {
  it('A1: parses positive spread "+7.5" → 7.5', () => {
    expect(parseOpenLine('+7.5')).toBe(7.5);
  });

  it('A2: parses negative spread "-7.5" → -7.5', () => {
    expect(parseOpenLine('-7.5')).toBe(-7.5);
  });

  it('A3: parses positive moneyline "+295" → 295', () => {
    expect(parseOpenLine('+295')).toBe(295);
  });

  it('A4: parses negative moneyline "-375" → -375', () => {
    expect(parseOpenLine('-375')).toBe(-375);
  });

  it('A5: parses unsigned total "230.5" → 230.5', () => {
    expect(parseOpenLine('230.5')).toBe(230.5);
  });

  it('A6: returns null for null input', () => {
    expect(parseOpenLine(null)).toBeNull();
  });

  it('A7: returns null for empty string', () => {
    expect(parseOpenLine('')).toBeNull();
  });

  it('A8: returns null for undefined', () => {
    expect(parseOpenLine(undefined)).toBeNull();
  });

  it('A9: parses over-prefixed total "o226.5" → 226.5', () => {
    expect(parseOpenLine('o226.5')).toBe(226.5);
  });

  it('A10: parses under-prefixed total "u226.5" → 226.5', () => {
    expect(parseOpenLine('u226.5')).toBe(226.5);
  });
});

// ---------------------------------------------------------------------------
// Group B — applyOpenLinesToGame
// ---------------------------------------------------------------------------

function makeGame() {
  return {
    spread_open_away: null,
    spread_open_home: null,
    total_open_away: null,
    total_open_home: null,
    ml_open_away: null,
    ml_open_home: null,
  };
}

describe('applyOpenLinesToGame', () => {
  it('B1: Spread market sets spread_open_away and spread_open_home', () => {
    const game = makeGame();
    applyOpenLinesToGame(game, '+7.5', '-7.5', 'Spread');
    expect(game.spread_open_away).toBe(7.5);
    expect(game.spread_open_home).toBe(-7.5);
  });

  it('B2: Total market sets total_open_away and total_open_home', () => {
    const game = makeGame();
    applyOpenLinesToGame(game, '230.5', '230.5', 'Total');
    expect(game.total_open_away).toBe(230.5);
    expect(game.total_open_home).toBe(230.5);
  });

  it('B3: Moneyline market sets ml_open_away and ml_open_home', () => {
    const game = makeGame();
    applyOpenLinesToGame(game, '+295', '-375', 'Moneyline');
    expect(game.ml_open_away).toBe(295);
    expect(game.ml_open_home).toBe(-375);
  });

  it('B4: Spread with null inputs sets fields to null without throwing', () => {
    const game = makeGame();
    expect(() => applyOpenLinesToGame(game, null, null, 'Spread')).not.toThrow();
    expect(game.spread_open_away).toBeNull();
    expect(game.spread_open_home).toBeNull();
  });

  it('B5: Total with one null input sets only the available field', () => {
    const game = makeGame();
    applyOpenLinesToGame(game, null, '47.5', 'Total');
    expect(game.total_open_away).toBeNull();
    expect(game.total_open_home).toBe(47.5);
  });

  it('B6: Moneyline with null inputs sets fields to null without throwing', () => {
    const game = makeGame();
    expect(() => applyOpenLinesToGame(game, null, null, 'Moneyline')).not.toThrow();
    expect(game.ml_open_away).toBeNull();
    expect(game.ml_open_home).toBeNull();
  });

  it('B7: Spread market does not write total or ml open fields', () => {
    const game = makeGame();
    applyOpenLinesToGame(game, '+7.5', '-7.5', 'Spread');
    expect(game.total_open_away).toBeNull();
    expect(game.total_open_home).toBeNull();
    expect(game.ml_open_away).toBeNull();
    expect(game.ml_open_home).toBeNull();
  });

  it('B8: Total market does not write spread or ml open fields', () => {
    const game = makeGame();
    applyOpenLinesToGame(game, '47.5', '47.5', 'Total');
    expect(game.spread_open_away).toBeNull();
    expect(game.spread_open_home).toBeNull();
    expect(game.ml_open_away).toBeNull();
    expect(game.ml_open_home).toBeNull();
  });

  it('B9: Unknown market type writes no fields and does not throw', () => {
    const game = makeGame();
    expect(() => applyOpenLinesToGame(game, '+7.5', '-7.5', 'FirstHalf')).not.toThrow();
    expect(game.spread_open_away).toBeNull();
    expect(game.spread_open_home).toBeNull();
    expect(game.total_open_away).toBeNull();
    expect(game.total_open_home).toBeNull();
    expect(game.ml_open_away).toBeNull();
    expect(game.ml_open_home).toBeNull();
  });
});
