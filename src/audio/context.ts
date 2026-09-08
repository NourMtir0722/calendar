import { createContext, useContext, type RefObject } from 'react';

export const MAX_RECORD_SECONDS = 120;

export type AudioStatus = 'idle' | 'requesting' | 'recording' | 'decoding' | 'playing';
export type AudioMode = 'mic' | 'file' | null;

export interface AudioSession {
  context: AudioContext;
  analyser: AnalyserNode;
  /** Analyser output is routed through this so the mic can be metered silently. */
  monitor: GainNode;
  source?: AudioBufferSourceNode;
  input?: MediaStreamAudioSourceNode;
  stream?: MediaStream;
  recorder?: MediaRecorder;
}

export interface LevelState {
  active: boolean;
  amplitude: number;
}

export interface Capture {
  blob: Blob;
  mime: string;
  durationMs: number;
}

export interface AudioApi {
  sessionRef: RefObject<AudioSession | null>;
  levelRef: RefObject<LevelState>;
  status: AudioStatus;
  mode: AudioMode;
  error: string;
  /** Seconds elapsed in the take currently being recorded. */
  recordSeconds: number;
  loop: boolean;
  setLoop: (loop: boolean) => void;
  startRecording: (onCapture: (capture: Capture) => void) => Promise<void>;
  stopRecording: () => void;
  /** Decodes and plays a clip; resolves with its duration in ms (0 if it failed). */
  play: (blob: Blob, mode: Exclude<AudioMode, null>) => Promise<number>;
  stop: () => void;
  dismissError: () => void;
}

export const AudioContextValue = createContext<AudioApi | null>(null);

export function useAudio(): AudioApi {
  const api = useContext(AudioContextValue);
  if (!api) throw new Error('useAudio must be used inside <AudioProvider>.');
  return api;
}
