import { useEffect, useRef } from 'react';
import { useAudio } from '../audio/context';

/**
 * One bar per analyser bin, and deliberately not all of them.
 *
 * The shared analyser has an fftSize of 256, so it offers 128 bins spanning
 * half the sample rate — 0 to 24kHz on most hardware. Handing
 * `getByteFrequencyData` an array shorter than `frequencyBinCount` is defined
 * behaviour: it fills what it is given and drops the rest, so these 64 bars are
 * the bottom half of the spectrum, roughly 0 to 12kHz. That is where a voice
 * is. Taking all 128 would spend half the rail drawing the octaves above a
 * human being, which read as permanently flat.
 */
const BARS = 64;

/**
 * Thin bars in the rail's own colour, driven by the one shared analyser. The
 * colour is read from `currentColor` so it follows the month's theme without
 * the canvas needing to know anything about palettes.
 */
export function Waveform() {
  const { sessionRef, levelRef } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const data = new Uint8Array(BARS);
    let width = 0;
    let height = 0;
    let ratio = 0;
    let ink = '#f2ead8';
    let tick = 0;

    let frame = requestAnimationFrame(function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      // Resizing resets the transform, so only touch it when it actually changed.
      if (w !== width || h !== height || dpr !== ratio) {
        width = w;
        height = h;
        ratio = dpr;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      // Reading computed style forces a recalc, so sample it rarely.
      if (tick++ % 20 === 0) ink = getComputedStyle(canvas).color || ink;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ink;
      const session = sessionRef.current;
      if (session && levelRef.current.active) {
        session.analyser.getByteFrequencyData(data);
        const step = w / BARS;
        for (let i = 0; i < BARS; i++) {
          const bar = Math.max(1, (data[i] / 255) * h);
          ctx.fillRect(i * step, (h - bar) / 2, Math.max(1, step - 3), bar);
        }
      } else {
        ctx.fillRect(0, Math.floor(h / 2), w, 1);
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [levelRef, sessionRef]);

  return <canvas ref={canvasRef} className="rail-wave" aria-label="Audio level" />;
}
