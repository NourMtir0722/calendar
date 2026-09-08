import { type CSSProperties, type ReactNode } from 'react';
import { compareToToday, dayNumber, monthGrid, WEEKDAYS, type DateKey } from '../lib/date';
import { monthPlate } from '../lib/months';
import { themeForMonth } from '../lib/themes';
import { ASCIIStillLife } from './ASCIIStillLife';

const ROWS = 6;

/** The maker's mark, printed in the foot of the right margin. */
const SIGNATURE = 'noormtir';

/**
 * The page itself: two margins and a printed edition between them. Colour comes
 * from the month, not from a control.
 */
export function CalendarSheet({
  view,
  selected,
  marked,
  sealed,
  onPick,
  onShift,
  countNoun = 'DAYS RECORDED',
  leftRail,
  rightRail,
}: {
  view: { year: number; month: number };
  selected: DateKey;
  marked: Set<DateKey>;
  /** True for a day that exists but is not open yet. */
  sealed?: (date: DateKey) => boolean;
  onPick: (date: DateKey) => void;
  onShift: (delta: number) => void;
  /** How many days of this month hold a recording. */
  countNoun?: string;
  leftRail: ReactNode;
  rightRail: ReactNode;
}) {
  const plate = monthPlate(view.month);
  const theme = themeForMonth(view.month);
  const cells = monthGrid(view.year, view.month, ROWS);
  const filled = cells.filter(date => date && marked.has(date)).length;
  const days = cells.filter(Boolean).length;

  return (
    <main
      className="calendar-scene"
      aria-label={`${plate.name} ${view.year} calendar`}
      style={
        {
          ['--ground']: theme.ground,
          ['--paper']: theme.paper,
          ['--accent']: theme.accent,
          ['--warm']: theme.warm,
        } as CSSProperties
      }
    >
      <aside className="rail">{leftRail}</aside>

      <div className="calendar-edition">
        <figure className="cover-panel" aria-label={plate.alt}>
          <ASCIIStillLife src={plate.src} alt={plate.alt} labels={plate.labels} />
          <div key={`${view.year}-${view.month}`} className="plate-wipe" aria-hidden="true" />
          <div className="cover-topline">
            <span>PLATE {plate.plate}</span>
            <span className="cover-subject">{plate.subject}</span>
          </div>
        </figure>

        <section className="month-panel" aria-label={`${plate.name} ${view.year}`}>
          <aside className="month-spine">
            <h2>{plate.short}</h2>
            <div className="spine-year" aria-label={String(view.year)}>
              <span>{String(view.year).slice(2, 3)}</span>
              <span>{String(view.year).slice(3, 4)}</span>
            </div>
          </aside>

          <div className="month-content">
            <div className="month-topline">
              <button type="button" className="month-step" onClick={() => onShift(-1)} aria-label="Previous month">
                <span aria-hidden="true">&lsaquo;</span> PREV
              </button>
              <span className="month-count">
                {filled} OF {days} {countNoun}
              </span>
              <button type="button" className="month-step" onClick={() => onShift(1)} aria-label="Next month">
                NEXT <span aria-hidden="true">&rsaquo;</span>
              </button>
            </div>

            <div className="weekday-row">
              {WEEKDAYS.map(weekday => (
                <div className="weekday-badge" key={weekday.short}>
                  <abbr title={weekday.full}>{weekday.short}</abbr>
                </div>
              ))}
            </div>

            <div className="date-grid">
              {cells.map((date, position) => {
                const column = position % 7;
                const row = Math.floor(position / 7);
                if (!date) return <div key={`pad-${position}`} aria-hidden="true" />;
                const when = compareToToday(date);
                const has = marked.has(date);
                const locked = has && Boolean(sealed?.(date));
                return (
                  <button
                    key={date}
                    type="button"
                    className={`date-circle${has && !locked ? ' is-filled' : ''}${locked ? ' is-sealed' : ''}${
                      column > 4 ? ' is-weekend' : ''
                    }${when === 0 ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`}
                    style={{ gridColumn: column + 1, gridRow: row + 1 }}
                    aria-pressed={date === selected}
                    aria-label={`${plate.name} ${dayNumber(date)}${when === 0 ? ', today' : ''}${
                      locked ? ', sealed until this date' : has ? ', has a recording' : ', empty'
                    }`}
                    onClick={() => onPick(date)}
                  >
                    <time dateTime={date}>{String(dayNumber(date)).padStart(2, '0')}</time>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <aside className="rail rail-right">
        {rightRail}
        {/* Opens in a new tab so leaving never tears down the AudioContext mid-recording. */}
        <a
          className="rail-signature"
          href={`https://x.com/${SIGNATURE}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`@${SIGNATURE} on X`}
        >
          @{SIGNATURE}
        </a>
      </aside>
    </main>
  );
}
