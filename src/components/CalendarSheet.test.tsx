import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AudioProvider } from '../audio/AudioProvider';
import { monthGrid, todayKey } from '../lib/date';
import { CalendarSheet } from './CalendarSheet';

function sheet(over: Partial<Parameters<typeof CalendarSheet>[0]> = {}) {
  const onPick = vi.fn();
  const onShift = vi.fn();
  const view = { year: 2026, month: 8 };
  render(
    <AudioProvider>
      <CalendarSheet
        view={view}
        selected="2026-09-08"
        marked={new Set<string>()}
        onPick={onPick}
        onShift={onShift}
        leftRail={<p>left rail</p>}
        rightRail={<p>right rail</p>}
        {...over}
      />
    </AudioProvider>,
  );
  return { onPick, onShift };
}

/** The date circles, which are the buttons carrying a `<time>`. */
const dayButtons = () => screen.getAllByRole('button').filter(node => node.querySelector('time'));

describe('the printed sheet', () => {
  it('draws one circle per day of the month and no more', () => {
    sheet();
    expect(dayButtons()).toHaveLength(30);
  });

  it('keeps six rows whatever the month, so a short month never gets taller cells', () => {
    // February 2026 needs five; the grid is padded to six regardless, and the
    // padding is not clickable.
    sheet({ view: { year: 2026, month: 1 }, selected: '2026-02-01' });
    expect(dayButtons()).toHaveLength(28);
    expect(monthGrid(2026, 1)).toHaveLength(42);
  });

  it('puts every day in the column its weekday belongs to', () => {
    sheet();
    // September 2026 begins on a Tuesday, so the 1st sits in column two.
    const first = dayButtons()[0];
    expect(first.querySelector('time')?.getAttribute('datetime')).toBe('2026-09-01');
    expect(first.getAttribute('style')).toContain('grid-column: 2');
  });

  it('counts what is filled against what is there', () => {
    sheet({ marked: new Set(['2026-09-02', '2026-09-05']) });
    expect(screen.getByText('2 OF 30 DAYS RECORDED')).toBeTruthy();
  });

  it('names how many days of the month hold a recording', () => {
    sheet({ marked: new Set(['2026-09-02']), countNoun: 'DAYS' });
    expect(screen.getByText('1 OF 30 DAYS')).toBeTruthy();
  });

  it('says which day is today, so a screen reader is not left counting', () => {
    const today = todayKey();
    const [year, month] = today.split('-').map(Number);
    sheet({ view: { year, month: month - 1 }, selected: today });
    expect(screen.getAllByRole('button', { name: /, today/ })).toHaveLength(1);
  });

  it('says what each day holds', () => {
    sheet({ marked: new Set(['2026-09-02']) });
    expect(screen.getByRole('button', { name: 'September 2, has a recording' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'September 3, empty' })).toBeTruthy();
  });

  it('says a day is sealed, and only for a day that is actually there', () => {
    sheet({
      marked: new Set(['2026-09-02', '2026-09-20']),
      sealed: date => date === '2026-09-20',
    });
    expect(screen.getByRole('button', { name: 'September 20, sealed until this date' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'September 2, has a recording' })).toBeTruthy();
    // A day with nothing in it is never dressed as sealed.
    expect(screen.getByRole('button', { name: 'September 21, empty' })).toBeTruthy();
  });

  it('marks the selected day for anything reading the page aloud', () => {
    sheet({ selected: '2026-09-08' });
    const pressed = screen.getAllByRole('button').filter(node => node.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe('08');
  });

  it('hands a picked day back as its key, not as its position', async () => {
    const { onPick } = sheet();
    await userEvent.click(screen.getByRole('button', { name: 'September 17, empty' }));
    expect(onPick).toHaveBeenCalledWith('2026-09-17');
  });

  it('pages by one month in each direction', async () => {
    const { onShift } = sheet();
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onShift.mock.calls).toEqual([[-1], [1]]);
  });

  it('wears the month it is showing, in its own colour', () => {
    sheet();
    const scene = screen.getByLabelText('September 2026 calendar');
    // September is the first of the oxblood block.
    expect(scene.getAttribute('style')).toContain('#5e1622');
    expect(screen.getByText('PLATE IX')).toBeTruthy();
    expect(screen.getByText('GRAPES AND PEACH ON PEWTER')).toBeTruthy();
  });

  it('carries both margins and the imprint', () => {
    sheet();
    expect(screen.getByText('left rail')).toBeTruthy();
    expect(screen.getByText('right rail')).toBeTruthy();
    // Printed in the foot of the page rather than inside either rail.
    const imprint = screen.getByRole('link', { name: '@noormtir on X' });
    expect(imprint.getAttribute('href')).toBe('https://x.com/noormtir');
    expect(imprint.getAttribute('target')).toBe('_blank');
    expect(imprint.getAttribute('rel')).toBe('noreferrer');
  });

  it('rolls the year rather than stopping at either end of it', () => {
    sheet({ view: { year: 2027, month: 0 }, selected: '2027-01-01' });
    expect(screen.getByLabelText('January 2027 calendar')).toBeTruthy();
    expect(screen.getByText('JAN')).toBeTruthy();
    expect(screen.getByLabelText('2027')).toBeTruthy();
  });
});
