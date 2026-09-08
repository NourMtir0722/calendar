import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MONTHS, monthPlate } from './months';

describe('the twelve plates', () => {
  it('are twelve, in calendar order', () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0].name).toBe('January');
    expect(MONTHS[11].name).toBe('December');
  });

  it('number themselves I to XII', () => {
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    expect(MONTHS.map(month => month.plate)).toEqual(roman);
  });

  it('each point at a painting that is actually in the repository', () => {
    // Hotlinking these tainted the sampling canvas, which is why they live
    // here; a renamed file would put the fallback still life on screen with
    // nothing to say why.
    for (const month of MONTHS) {
      expect(month.src).toMatch(/^\/plates\/\d{2}-[a-z]+\.jpg$/);
      expect(existsSync(fileURLToPath(new URL(`../../public${month.src}`, import.meta.url))), month.src).toBe(true);
    }
  });

  it('name their file after their own position and month', () => {
    MONTHS.forEach((month, index) => {
      expect(month.src).toBe(`/plates/${String(index + 1).padStart(2, '0')}-${month.name.toLowerCase()}.jpg`);
    });
  });

  it('carry alt text that describes the picture rather than naming the month', () => {
    for (const month of MONTHS) {
      expect(month.alt.length).toBeGreaterThan(60);
      expect(month.alt).toMatch(/^Still life of /);
    }
  });

  it('abbreviate to three letters, uniquely', () => {
    expect(new Set(MONTHS.map(month => month.short)).size).toBe(12);
    for (const month of MONTHS) expect(month.short).toMatch(/^[A-Z]{3}$/);
  });

  it('give the scanner something to guess with, ending in the shared machine labels', () => {
    for (const month of MONTHS) {
      expect(month.labels.length).toBeGreaterThanOrEqual(8);
      expect(month.labels).toContain('SCANNING...');
      expect(month.labels).toContain('NO_MATCH');
    }
  });
});

describe('looking a month up', () => {
  it('wraps in both directions, because paging rolls the year', () => {
    expect(monthPlate(0)).toBe(MONTHS[0]);
    expect(monthPlate(11)).toBe(MONTHS[11]);
    expect(monthPlate(12)).toBe(MONTHS[0]);
    expect(monthPlate(-1)).toBe(MONTHS[11]);
    expect(monthPlate(-13)).toBe(MONTHS[11]);
    for (let month = -40; month <= 40; month++) expect(MONTHS).toContain(monthPlate(month));
  });
});
