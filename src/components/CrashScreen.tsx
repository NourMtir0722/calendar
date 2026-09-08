import { Component, type ErrorInfo, type ReactNode } from 'react';

const REPORT = 'https://github.com/NourMtir0722/calendar/issues';

/**
 * What a crash looks like, instead of a white page.
 *
 * The first thing this has to say is not what went wrong. It is that the
 * recordings are still here — because the screen this replaces is a journal,
 * and a page that goes blank on somebody's own diary reads as the diary being
 * gone. Nothing in a render error touches IndexedDB, so the claim is true, and
 * saying it is the difference between a bug and a bereavement.
 *
 * The error's own words are shown rather than hidden. They are meaningless to
 * most people and worth everything in a report, and this is the only channel
 * there is: nothing is sent anywhere from here.
 */
function CrashScreen({ failure }: { failure: Error }) {
  return (
    <main className="crash" role="alert">
      <p className="crash-heading">SOMETHING BROKE</p>
      <h1 className="crash-title">This screen stopped working.</h1>
      <p className="crash-body">
        That is a fault in the app, not something you did. <strong>Your recordings are still on this
        device</strong> — nothing here deletes them, and reloading is safe. If you kept your
        calendar&rsquo;s address, that link still holds everything that had been saved online.
      </p>
      <div className="crash-actions">
        <button type="button" onClick={() => location.reload()}>
          RELOAD
        </button>
      </div>
      <p className="crash-note">
        What went wrong, in the app&rsquo;s own words. It means nothing to you and everything to a
        bug report, and nothing is sent anywhere unless you send it.
      </p>
      <pre className="crash-detail">{failure.message || String(failure)}</pre>
      <p className="crash-note">
        <a href={REPORT} target="_blank" rel="noreferrer">
          Report this
        </a>
      </p>
    </main>
  );
}

interface State {
  failure: Error | null;
}

/**
 * Catches what React throws while rendering. Without it a fault anywhere in
 * the tree unmounts the whole app and leaves an empty document, which is
 * indistinguishable from the site being broken or the journal being lost.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failure: null };

  static getDerivedStateFromError(failure: Error): State {
    return { failure };
  }

  componentDidCatch(failure: Error, info: ErrorInfo): void {
    // The only report there is. Nothing leaves the device: a stack from this
    // app can carry a day's title or a date, and this is a journal — so the
    // console is where it stops, and the screen tells its owner what to send.
    console.error('CLIENT_CRASH:', failure.message, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failure ? <CrashScreen failure={this.state.failure} /> : this.props.children;
  }
}
