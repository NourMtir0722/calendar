import { vi } from 'vitest';

/**
 * A microphone that can be told what to do.
 *
 * Whether a recording is audible is not a question these tests can answer. What
 * they can answer is everything the app does around it: that a take reaches the
 * journal and the address, that stopping flushes the last chunk before the
 * tracks are released, and — the part most worth having — that each way a
 * browser can refuse the microphone is turned into a sentence saying what to do
 * about it, rather than the DOMException's own "Permission denied".
 */
export class StubMediaRecorder {
  static latest: StubMediaRecorder | null = null;

  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** What the take will contain when it is stopped. */
  captured = 'a recorded take';

  constructor() {
    StubMediaRecorder.latest = this;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([this.captured], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

export interface Microphone {
  /** Tracks the app stopped, which is how it lets go of the device. */
  stopped: number;
  recorder(): StubMediaRecorder;
}

/** A microphone that works. */
export function installMicrophone(): Microphone {
  const state: Microphone = {
    stopped: 0,
    recorder: () => {
      if (!StubMediaRecorder.latest) throw new Error('nothing has recorded yet');
      return StubMediaRecorder.latest;
    },
  };
  StubMediaRecorder.latest = null;

  vi.stubGlobal('MediaRecorder', StubMediaRecorder);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [
          {
            stop() {
              state.stopped++;
            },
          },
        ],
      })),
    },
  });
  return state;
}

/** A microphone the browser will not give up, for the stated reason. */
export function refuseMicrophone(name: string): void {
  vi.stubGlobal('MediaRecorder', StubMediaRecorder);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        throw new DOMException('Permission denied', name);
      }),
    },
  });
}

/** A browser with no recording support at all, which is Safari on older iOS. */
export function noRecordingSupport(): void {
  vi.stubGlobal('MediaRecorder', undefined);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
}
