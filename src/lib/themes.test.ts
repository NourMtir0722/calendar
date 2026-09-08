import { describe, expect, it } from 'vitest';
import { THEMES, themeForMonth } from './themes';

/** WCAG 2.1 relative luminance, from a `#rrggbb` string. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('the contrast the README claims', () => {
  it('clears 4.5:1 for paper on ground, in both directions', () => {
    for (const theme of THEMES) {
      expect(contrast(theme.paper, theme.ground), `${theme.name} paper on ground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 3:1 for the accent on the ground, which is large type', () => {
    for (const theme of THEMES) {
      expect(contrast(theme.accent, theme.ground), `${theme.name} accent on ground`).toBeGreaterThanOrEqual(3);
    }
  });

  it('clears 3:1 for paper on the weekend colour', () => {
    for (const theme of THEMES) {
      expect(contrast(theme.paper, theme.warm), `${theme.name} paper on warm`).toBeGreaterThanOrEqual(3);
    }
  });

  it('states every colour as a six-digit hex, since the check above assumes it', () => {
    for (const theme of THEMES) {
      for (const value of [theme.ground, theme.paper, theme.accent, theme.warm]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('which palette a month wears', () => {
  it('runs black, then violet, then wine, four months each', () => {
    expect([0, 1, 2, 3].map(month => themeForMonth(month).id)).toEqual(['ink', 'ink', 'ink', 'ink']);
    expect([4, 5, 6, 7].map(month => themeForMonth(month).id)).toEqual(['violet', 'violet', 'violet', 'violet']);
    expect([8, 9, 10, 11].map(month => themeForMonth(month).id)).toEqual([
      'oxblood',
      'oxblood',
      'oxblood',
      'oxblood',
    ]);
  });

  it('wraps rather than falling off either end, because the year is unbounded', () => {
    // Paging past December or January rolls the year, so the month arriving
    // here is whatever arithmetic produced, not a number between 0 and 11.
    expect(themeForMonth(12).id).toBe('ink');
    expect(themeForMonth(-1).id).toBe('oxblood');
    expect(themeForMonth(-12).id).toBe('ink');
    expect(themeForMonth(37).id).toBe('ink');
    for (let month = -60; month <= 60; month++) {
      expect(THEMES).toContain(themeForMonth(month));
    }
  });

  it('declares each block starting where the one before it ends', () => {
    expect(THEMES.map(theme => theme.from)).toEqual([0, 4, 8]);
    expect(new Set(THEMES.map(theme => theme.id)).size).toBe(THEMES.length);
  });
});
