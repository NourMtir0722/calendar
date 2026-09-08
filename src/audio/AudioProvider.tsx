import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AudioContextValue,
  MAX_RECORD_SECONDS,
  type AudioApi,
  type AudioMode,
  type AudioSession,
  type AudioStatus,
  type Capture,
  type LevelState,
} from './context';

export function AudioProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AudioStatus>('idle');
  const [mode, setMode] = useState<AudioMode>(null);
  const [error, setError] = useState('');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [loop, setLoopState] = useState(true);

  const sessionRef = useRef<AudioSession | null>(null);
  const levelRef = useRef<LevelState>({ active: false, amplitude: 0 });
  const loopRef = useRef(loop);
  const captureRef = useRef<((capture: Capture) => void) | null>(null);
  /** Bumped by every teardown so stale async work can detect it lost the session. */
  const requestRef = useRef(0);
  const tickRef = useRef<number | undefined>(undefined);
  const limitRef = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    window.clearInterval(tickRef.current);
    window.clearTimeout(limitRef.current);
    tickRef.current = undefined;
    limitRef.current = undefined;
  }, []);

  const release = useCallback(() => {
    ++requestRef.current;
    clearTimers();
    levelRef.current = { active: false, amplitude: 0 };
    const session = sessionRef.current;
    if (!session) return;
    if (session.recorder) {
      session.recorder.ondataavailable = null;
      session.recorder.onstop = null;
      session.recorder.onerror = null;
      if (session.recorder.state !== 'inactive') session.recorder.stop();
      session.recorder = undefined;
    }
    session.stream?.getTracks().forEach(track => track.stop());
    session.stream = undefined;
    if (session.input) {
      session.input.disconnect();
      session.input = undefined;
    }
    if (session.source) {
      session.source.onended = null;
      session.source.stop();
      session.source.disconnect();
      session.source = undefined;
    }
  }, [clearTimers]);

  const fail = useCallback(
    (request: number, cause: unknown) => {
      if (request !== requestRef.current) return;
      release();
      setMode(null);
      setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'Audio could not be started.');
    },
    [release],
  );

  /** Creates the graph on first use. An AudioContext needs a user gesture to start. */
  const ensureSession = useCallback(async () => {
    if (!sessionRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      const monitor = context.createGain();
      monitor.gain.value = 1;
      analyser.connect(monitor);
      monitor.connect(context.destination);
      sessionRef.current = { context, analyser, monitor };
    }
    const session = sessionRef.current;
    await session.context.resume();
    return session;
  }, []);

  const playInto = useCallback(
    async (session: AudioSession, blob: Blob, request: number): Promise<number> => {
      setStatus('decoding');
      // Neutral about where the clip came from. A take that captured nothing is
      // now refused in `onstop`, before it is ever stored or played, so the two
      // callers that still reach this are an empty file someone chose to upload
      // and an empty day someone was sent — and neither of them recorded it.
      if (!blob.size) throw new Error('There is no audio in that clip.');
      const buffer = await session.context.decodeAudioData(await blob.arrayBuffer());
      if (request !== requestRef.current || sessionRef.current !== session) return 0;
      await session.context.resume();
      if (request !== requestRef.current || sessionRef.current !== session) return 0;

      const source = session.context.createBufferSource();
      source.buffer = buffer;
      source.loop = loopRef.current;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      source.connect(session.analyser);
      source.onended = () => {
        if (request !== requestRef.current || sessionRef.current !== session) return;
        release();
        setStatus('idle');
      };
      session.monitor.gain.value = 1;
      session.source = source;
      source.start();
      levelRef.current.active = true;
      setStatus('playing');
      return buffer.duration * 1000;
    },
    [release],
  );

  const play = useCallback(
    async (blob: Blob, nextMode: Exclude<AudioMode, null>) => {
      release();
      const request = requestRef.current;
      setMode(nextMode);
      setError('');
      setRecordSeconds(0);
      setStatus('decoding');
      try {
        const session = await ensureSession();
        if (request !== requestRef.current) return 0;
        return await playInto(session, blob, request);
      } catch (cause) {
        fail(request, cause);
        return 0;
      }
    },
    [ensureSession, fail, playInto, release],
  );

  const stopRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session?.recorder || session.recorder.state !== 'recording') return;
    clearTimers();
    // Tracks are stopped in `onstop`, after the last chunk has been flushed.
    session.recorder.stop();
    setStatus('decoding');
  }, [clearTimers]);

  /**
   * getUserMedia rejects with a DOMException whose message is written for a
   * developer: denying the microphone prompt produces the words "Permission
   * denied" and nothing else. That is the first thing a new person meets — they
   * tap REC, answer the browser's question wrongly once, and are told neither
   * what happened nor how to undo it, which on a phone is several screens deep
   * in settings. Each of these says what to do instead.
   */
  const microphoneError = (cause: unknown): Error => {
    const name = cause instanceof DOMException ? cause.name : '';
    if (name === 'NotAllowedError') {
      return new Error(
        'This browser is not allowing the microphone. Allow it for this site in your browser or phone settings, then try again — or upload an audio file instead.',
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return new Error('No microphone was found. You can upload an audio file instead.');
    }
    if (name === 'NotReadableError') {
      return new Error('The microphone is being used by something else. Close whatever has it and try again.');
    }
    if (name === 'SecurityError') {
      return new Error('Recording needs a secure (https) connection.');
    }
    if (cause instanceof Error && cause.message) return cause;
    return new Error('The microphone could not be started.');
  };

  const startRecording = useCallback(
    async (onCapture: (capture: Capture) => void) => {
      if (sessionRef.current?.recorder?.state === 'recording') {
        stopRecording();
        return;
      }
      release();
      const request = requestRef.current;
      captureRef.current = onCapture;
      setMode('mic');
      setError('');
      setRecordSeconds(0);
      setStatus('requesting');

      try {
        const session = await ensureSession();
        if (request !== requestRef.current) return;
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
          throw new Error('Recording is not supported in this browser. Please upload an audio file instead.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (request !== requestRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        session.stream = stream;

        // Meter the live mic through the analyser, muted at the monitor so the
        // room never feeds back into itself.
        session.monitor.gain.value = 0;
        const input = session.context.createMediaStreamSource(stream);
        input.connect(session.analyser);
        session.input = input;
        levelRef.current.active = true;

        const recorder = new MediaRecorder(stream);
        session.recorder = recorder;
        const chunks: Blob[] = [];
        const started = performance.now();

        recorder.ondataavailable = event => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onerror = () => fail(request, new Error('Recording failed. Please try again.'));
        recorder.onstop = () => {
          if (request !== requestRef.current) return;
          clearTimers();
          const durationMs = performance.now() - started;
          stream.getTracks().forEach(track => track.stop());
          session.stream = undefined;
          session.recorder = undefined;
          input.disconnect();
          session.input = undefined;
          levelRef.current.active = false;
          session.monitor.gain.value = 1;

          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          /**
           * A take that captured nothing is refused here, before the caller is
           * handed it.
           *
           * `playInto` has always turned an empty blob away, but it runs after
           * the capture has gone out — so the day was written to the journal
           * first and the refusal arrived second, as a sentence saying "record
           * again" over a grid where that day was already filled. What it held
           * was 28 bytes of IV and tag around nothing, published to the address
           * like any other day and playing as the same error every time it was
           * opened. A recorder can yield no data for ordinary reasons: a take
           * stopped in the same moment it started, or a device that produced no
           * chunk before the stop landed.
           */
          if (!blob.size) {
            captureRef.current = null;
            fail(request, new Error('No audio was captured. Please record again.'));
            return;
          }
          captureRef.current?.({ blob, mime: blob.type, durationMs });
          captureRef.current = null;
          void playInto(session, blob, request).catch(cause => fail(request, cause));
        };

        recorder.start();
        setStatus('recording');
        tickRef.current = window.setInterval(() => {
          setRecordSeconds(Math.min(MAX_RECORD_SECONDS, (performance.now() - started) / 1000));
        }, 100);
        limitRef.current = window.setTimeout(stopRecording, MAX_RECORD_SECONDS * 1000);
      } catch (cause) {
        fail(request, microphoneError(cause));
      }
    },
    [clearTimers, ensureSession, fail, playInto, release, stopRecording],
  );

  const stop = useCallback(() => {
    release();
    setMode(null);
    setStatus('idle');
    setRecordSeconds(0);
  }, [release]);

  const setLoop = useCallback((next: boolean) => {
    loopRef.current = next;
    setLoopState(next);
    const source = sessionRef.current?.source;
    // A playing AudioBufferSourceNode only changes its looping by assignment;
    // there is no React-side representation of a node already in the graph.
    // oxlint-disable-next-line react/immutability
    if (source) source.loop = next;
  }, []);

  const dismissError = useCallback(() => setError(''), []);

  // Single amplitude loop for the whole app; the illustration reads levelRef.
  useEffect(() => {
    const waveform = new Uint8Array(256);
    let animation = requestAnimationFrame(function analyse() {
      const session = sessionRef.current;
      const level = levelRef.current;
      if (session && level.active) {
        session.analyser.getByteTimeDomainData(waveform);
        let sum = 0;
        for (const value of waveform) sum += ((value - 128) / 128) ** 2;
        level.amplitude = Math.min(1, Math.sqrt(sum / waveform.length) * 3);
      } else {
        level.amplitude = 0;
      }
      animation = requestAnimationFrame(analyse);
    });
    return () => {
      cancelAnimationFrame(animation);
      release();
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.context.close().catch(() => {});
    };
  }, [release]);

  const value = useMemo<AudioApi>(
    () => ({
      sessionRef,
      levelRef,
      status,
      mode,
      error,
      recordSeconds,
      loop,
      setLoop,
      startRecording,
      stopRecording,
      play,
      stop,
      dismissError,
    }),
    [dismissError, error, loop, mode, play, recordSeconds, setLoop, startRecording, status, stop, stopRecording],
  );

  return <AudioContextValue.Provider value={value}>{children}</AudioContextValue.Provider>;
}
