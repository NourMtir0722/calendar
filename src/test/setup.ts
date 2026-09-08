import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { deleteEntry, markedDates } from '../lib/db';

/**
 * What jsdom does not have, supplied only as far as the app actually reaches
 * for it — nothing here pretends to be a working audio stack.
 *
 * The plate and the level meter both ask for a 2D canvas context, get `null`
 * from jsdom, and leave their animation loops on the spot. That is the same
 * branch that runs in a browser where the plate is missing, which is why these
 * screens can be exercised without a rendering engine behind them.
 */
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Enough of an audio graph to be driven, and no more.
 *
 * Whether a clip is *audible* is not a question a test can answer without a
 * rendering engine, and nothing here pretends otherwise. What these screens do
 * around the audio is testable and worth testing: that picking a day loads it,
 * that a clip which will not decode never reaches the journal, and that a
 * failure arrives as a sentence rather than as silence.
 */
const node = () => ({
  connect() {},
  disconnect() {},
});

class StubAudioContext {
  state = 'running';
  sampleRate = 48_000;
  destination = node();
  createAnalyser() {
    return {
      ...node(),
      fftSize: 256,
      smoothingTimeConstant: 0,
      frequencyBinCount: 128,
      getByteTimeDomainData() {},
      getByteFrequencyData() {},
      getFloatTimeDomainData() {},
    };
  }
  createGain() {
    return { ...node(), gain: { value: 1 } };
  }
  createBufferSource() {
    return { ...node(), buffer: null, loop: false, loopStart: 0, loopEnd: 0, onended: null, start() {}, stop() {} };
  }
  createMediaStreamSource() {
    return node();
  }
  async decodeAudioData(data: ArrayBuffer) {
    // Empty bytes are what a failed recording looks like, and the app is
    // supposed to refuse them rather than store a day that plays nothing.
    if (!data.byteLength) throw new Error('Unable to decode audio data');
    return { duration: 4 };
  }
  async resume() {}
  async close() {}
}

/**
 * The database is emptied between tests rather than replaced.
 *
 * `db.ts` opens its connection once and holds it, so handing the page a new
 * IndexedDB would leave it talking to the old one — and resetting the module
 * registry to fix that would give React a second copy of itself, which breaks
 * hooks. Clearing through the module's own API avoids both.
 */
/**
 * Headroom, not a fix for anything.
 *
 * Testing Library allows a second for `waitFor` and every `findBy` to settle,
 * and what these screens do between a click and the assertion after it is not
 * nothing: reading and writing audio through fake-indexeddb, and base64-ing a
 * whole journal into a backup. That fits inside a second on a developer's
 * machine and has more room to spare on a shared CI runner than it needs,
 * which is the only reason this is here.
 *
 * It is deliberately not load-bearing. A test that needs more than a second
 * because it is waiting for something that will never happen is a broken test,
 * and raising this would only make it fail more slowly — see `settled` in
 * StillLifeCalendar.test.tsx for the one that actually was. The suite's own
 * timeout sits above this, so the failure that arrives is Testing Library's
 * account of what it was waiting for rather than a bare timeout.
 */
configure({ asyncUtilTimeout: 4000 });

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  /**
   * A journal is stored as `Blob`s, and `fake-indexeddb`'s structured clone
   * hands jsdom's `Blob` back as a plain object with no `arrayBuffer` on it —
   * so every day read back out is unreadable, for a reason that exists nowhere
   * but here. Node's `Blob` survives the same round trip, and is what the real
   * one behaves like.
   */
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('AudioContext', StubAudioContext);
  // jsdom has no canvas and says so, loudly, once per element. Answering with
  // the `null` it would have returned keeps the branch identical and the output
  // readable: the plate and the meter both leave their loops on a null context.
  HTMLCanvasElement.prototype.getContext = () => null;

  for (const date of await markedDates()) await deleteEntry(date);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
