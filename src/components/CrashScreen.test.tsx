import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './CrashScreen';

function Throws({ when }: { when: boolean }): React.ReactNode {
  if (when) throw new Error('the plate could not be sampled');
  return <p>the calendar</p>;
}

/** React logs a caught error itself, which is noise rather than a failure. */
function quietly<T>(body: () => T): T {
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    return body();
  } finally {
    said.mockRestore();
  }
}

describe('when a screen throws while rendering', () => {
  it('stays out of the way when nothing has gone wrong', () => {
    render(
      <ErrorBoundary>
        <Throws when={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('the calendar')).toBeTruthy();
  });

  /**
   * The white page is the thing being replaced. On a journal, a document that
   * renders nothing does not read as a bug — it reads as the journal being
   * gone, which is the one conclusion that must never be reached by accident.
   */
  it('says the recordings are still here before it says anything else', () => {
    quietly(() =>
      render(
        <ErrorBoundary>
          <Throws when />
        </ErrorBoundary>,
      ),
    );
    const said = screen.getByRole('alert').textContent ?? '';
    expect(said).toMatch(/still on this device/i);
    expect(said).toMatch(/reloading is safe/i);
    expect(screen.getByRole('button', { name: 'RELOAD' })).toBeTruthy();
  });

  it("shows the fault's own words, which are the only thing worth reporting", () => {
    quietly(() =>
      render(
        <ErrorBoundary>
          <Throws when />
        </ErrorBoundary>,
      ),
    );
    expect(screen.getByText('the plate could not be sampled')).toBeTruthy();
  });

  it('keeps the fault on the device, since a stack here can carry a day', () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sent = vi.fn();
    vi.stubGlobal('fetch', sent);
    try {
      render(
        <ErrorBoundary>
          <Throws when />
        </ErrorBoundary>,
      );
      expect(sent).not.toHaveBeenCalled();
      expect(said.mock.calls.some(args => String(args[0]).startsWith('CLIENT_CRASH:'))).toBe(true);
    } finally {
      said.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
