import { useEffect, useRef } from 'react';
import { useAudio } from '../audio/context';

const WIDTH = 1440;
/** Matches the 720x470 cover panel, so the character cells stay square. */
const HEIGHT = 940;
const CELL = 12;
const COLS = Math.floor(WIDTH / CELL);
const ROWS = Math.floor(HEIGHT / CELL);
/**
 * The vignette that thins the scan towards the edges. Derived from the grid
 * rather than hardcoded, so changing CELL or HEIGHT cannot silently decentre it.
 * At the original 120x85 grid these resolve to the tuned (65, 48) and 55.
 */
const CENTER_COL = COLS * 0.54;
const CENTER_ROW = ROWS * 0.56;
const VIGNETTE = Math.hypot(COLS / 2, ROWS / 2) * 0.75;
const RAMP = ' .,*:;!^~+-=/?()[]{}&#$%@';

const GLITCH_LABELS = ['///ERR', 'LOST', '----'];

/**
 * Whether to hold the ambient motion still.
 *
 * The drifting boxes and the flickering captions run whether or not anything
 * is playing, which is precisely the never-asked-for motion the preference
 * exists to refuse. The scan itself is left alone: it moves only while the
 * person is playing a recording they chose to play, and it is the thing they
 * pressed the button to see.
 *
 * Read live rather than once, so changing the setting takes effect without a
 * reload — the loops consult it every frame and it costs nothing to ask.
 */
const stillness = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const holdStill = () => Boolean(stillness?.matches);

interface Cell {
  x: number;
  y: number;
  index: number;
  character: string;
  mask: number;
  /** When this cell last rolled. The pace itself comes from the amplitude. */
  lastRoll: number;
}

export function ASCIIStillLife({
  src,
  alt,
  labels,
}: {
  src: string;
  alt: string;
  labels: string[];
}) {
  const { sessionRef, levelRef } = useAudio();
  // Held in a ref so the animation loop can read the newest set without restarting.
  const labelSetRef = useRef(labels);
  useEffect(() => {
    labelSetRef.current = labels;
  }, [labels]);

  const imageRef = useRef<HTMLImageElement>(null);
  const sampleRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef<SVGSVGElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  // Drifting boxes, their OCR captions, and the treble-reactive stroke.
  useEffect(() => {
    const rectangles = boxesRef.current?.querySelectorAll('rect');
    const captions = labelsRef.current?.querySelectorAll('span');
    if (!rectangles) return;

    const boxes = [
      { x: 280, y: 340, width: 250, height: 200, vx: 47, vy: 29 },
      { x: 530, y: 400, width: 210, height: 165, vx: -34, vy: 53 },
      { x: 750, y: 340, width: 270, height: 210, vx: 61, vy: -38 },
    ];
    const placeholders = ['OBJ_01', 'ID??', 'SCANNING...'];
    const nextFlicker = [0, 0, 0];
    const boxFrequencies = new Uint8Array(128);

    let animation = 0;
    let previous: number | undefined;
    let previousAmplitude = 0;
    let smoothedAmp = 0;
    let previousScale = 1;
    let glitchUntil = 0;
    let glitchText = '///ERR';
    let lastTransient = -Infinity;

    function move(now: number) {
      const delta = previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.1);
      previous = now;

      const { active, amplitude } = levelRef.current;
      const session = sessionRef.current;
      let treble = 0;
      let peakBin = 0;

      if (active && session) {
        session.analyser.getByteFrequencyData(boxFrequencies);
        const binHz = session.context.sampleRate / session.analyser.fftSize;
        const start = Math.max(1, Math.ceil(4000 / binHz));
        const end = Math.min(boxFrequencies.length - 1, Math.floor(12000 / binHz));
        if (end >= start) {
          let sum = 0;
          for (let bin = start; bin <= end; bin++) sum += (boxFrequencies[bin] / 255) ** 2;
          treble = Math.min(1, Math.sqrt(sum / (end - start + 1)));
        }
        for (let bin = 1; bin < boxFrequencies.length; bin++) {
          if (boxFrequencies[bin] > boxFrequencies[peakBin]) peakBin = bin;
        }
      } else {
        boxFrequencies.fill(0);
      }

      const peakHz =
        active && session && boxFrequencies[peakBin] > 0
          ? Math.round((peakBin * session.context.sampleRate) / session.analyser.fftSize)
          : 0;

      // A sharp attack knocks the captions out for a moment.
      if (active && amplitude > 0.35 && amplitude - previousAmplitude > 0.12 && now - lastTransient > 250) {
        glitchUntil = now + 200;
        lastTransient = now;
        glitchText = GLITCH_LABELS[Math.floor(Math.random() * GLITCH_LABELS.length)];
      }
      previousAmplitude = amplitude;

      smoothedAmp += (amplitude - smoothedAmp) * 0.08;
      // Floor chosen so the boxes read as deliberate framing marks in silence;
      // they still open to the same size at full voice.
      const scale = 0.75 + 1.25 * Math.max(0, Math.min(1, smoothedAmp));
      // Offset each top-left corner so resizing preserves the box's own centre.
      boxes.forEach(box => {
        box.x -= (box.width * (scale - previousScale)) / 2;
        box.y -= (box.height * (scale - previousScale)) / 2;
      });
      previousScale = scale;

      const still = holdStill();
      boxes.forEach((box, index) => {
        const speed = index === 0 ? 0.2 + amplitude * 4.8 : 1;
        const width = box.width * scale;
        const height = box.height * scale;
        if (!still) {
          box.x += box.vx * delta * speed;
          box.y += box.vy * delta * speed;
        }

        const maxX = WIDTH - width;
        const maxY = HEIGHT - height;
        if (box.x < 0 || box.x > maxX) {
          box.x = Math.max(0, Math.min(maxX, box.x));
          box.vx = box.x === 0 ? Math.abs(box.vx) : -Math.abs(box.vx);
        }
        if (box.y < 0 || box.y > maxY) {
          box.y = Math.max(0, Math.min(maxY, box.y));
          box.vy = box.y === 0 ? Math.abs(box.vy) : -Math.abs(box.vy);
        }

        const x = Math.max(0, Math.min(maxX, box.x));
        const y = Math.max(0, Math.min(maxY, box.y));
        const rectangle = rectangles![index];
        rectangle.setAttribute('x', String(x));
        rectangle.setAttribute('y', String(y));
        rectangle.setAttribute('width', String(width));
        rectangle.setAttribute('height', String(height));
        if (index === 2) {
          rectangle.setAttribute('stroke-width', String(1 + treble));
          rectangle.setAttribute('opacity', String(0.3 + 0.7 * treble));
        }

        const caption = captions?.[index];
        if (!caption) return;
        caption.style.left = `${(x / WIDTH) * 100}%`;
        caption.style.top = `${(y / HEIGHT) * 100}%`;
        if (!still && now >= nextFlicker[index]) {
          const set = labelSetRef.current;
          let pick = set[Math.floor(Math.random() * set.length)];
          for (let tries = 0; tries < 6 && placeholders.some((text, other) => other !== index && text === pick); tries++) {
            pick = set[Math.floor(Math.random() * set.length)];
          }
          placeholders[index] = pick;
          nextFlicker[index] = now + 400 + Math.random() * 300;
        }
        // The middle box is the telemetry readout; the others flicker through labels.
        caption.textContent =
          !still && now < glitchUntil
            ? glitchText
            : index === 1 && active
              ? `AMP:${amplitude.toFixed(2)} FREQ:${peakHz}Hz`
              : placeholders[index];
      });

      animation = requestAnimationFrame(move);
    }

    animation = requestAnimationFrame(move);
    return () => cancelAnimationFrame(animation);
  }, [levelRef, sessionRef]);

  // Sample the plate into a character grid, then reveal it in step with the audio.
  useEffect(() => {
    const image = imageRef.current;
    const sample = sampleRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!image || !sample || !canvas || !stage) return;

    const source = sample.getContext('2d', { willReadFrequently: true });
    const ctx = canvas.getContext('2d');
    if (!source || !ctx) return;

    let cells: Cell[] = [];
    let animation = 0;
    let pending = 0;
    let disposed = false;
    const coverageWaveform = new Float32Array(256);
    const coverageFrequencies = new Uint8Array(128);
    let subjectCenterX = WIDTH / 2;
    let subjectCenterY = HEIGHT / 2;

    /** Painted only if the plate is missing or taints the sampling canvas. */
    function fallback() {
      if (!source) return;
      source.fillStyle = '#080705';
      source.fillRect(0, 0, WIDTH, HEIGHT);
      const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
        source.fillStyle = color;
        source.beginPath();
        source.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        source.fill();
      };
      source.fillStyle = '#30291b';
      source.fillRect(90, 780, 1260, 130);
      ellipse(705, 765, 490, 83, '#57513b');
      ellipse(705, 744, 467, 64, '#252519');
      for (let i = 0; i < 18; i++) {
        ellipse(445 + Math.sin(i * 2.7) * 210, 310 + Math.cos(i * 1.8) * 95, 65, 42, i % 2 ? '#51451b' : '#6e6029');
      }
      for (let i = 0; i < 65; i++) {
        const h = Math.sin(i * 127.1) * 43758.5453;
        const f = h - Math.floor(h);
        ellipse(380 + Math.sin(i * 2.4) * 155, 410 + f * 305, 27, 30, `rgb(${95 + f * 45},${86 + f * 38},35)`);
        ellipse(872 + Math.sin(i * 2.8) * 125, 405 + f * 330, 26, 29, `rgb(${46 + f * 24},${28 + f * 15},${22 + f * 14})`);
      }
      ellipse(666, 623, 104, 111, '#ac792f');
      ellipse(796, 711, 97, 67, '#c09645');
      ellipse(799, 699, 53, 27, '#654019');
    }

    function prepare() {
      if (!source || disposed) return;
      source.clearRect(0, 0, WIDTH, HEIGHT);
      try {
        if (!image || !image.naturalWidth) throw new Error('Image unavailable');
        const ratio = stage!.clientWidth / stage!.clientHeight;
        const imageRatio = image.naturalWidth / image.naturalHeight;
        let sw = image.naturalWidth;
        let sh = image.naturalHeight;
        if (imageRatio > ratio) sw = sh * ratio;
        else sh = sw / ratio;
        source.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, 0, 0, WIDTH, HEIGHT);
        source.getImageData(0, 0, 1, 1);
      } catch {
        // Reset the bitmap in case a remote image tainted the sampling canvas.
        sample!.width = WIDTH;
        fallback();
      }

      const pixels = source.getImageData(0, 0, WIDTH, HEIGHT).data;
      const now = performance.now();
      cells = [];
      let totalLight = 0;
      let weightedX = 0;
      let weightedY = 0;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          let r = 0;
          let g = 0;
          let b = 0;
          for (let dy = 0; dy < CELL; dy++) {
            for (let dx = 0; dx < CELL; dx++) {
              const p = ((row * CELL + dy) * WIDTH + col * CELL + dx) * 4;
              r += pixels[p];
              g += pixels[p + 1];
              b += pixels[p + 2];
            }
          }
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / (CELL * CELL);
          if (lum < 30) continue;

          totalLight += lum;
          weightedX += (col * CELL + CELL / 2) * lum;
          weightedY += (row * CELL + CELL / 2) * lum;

          const raw = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
          const hash = raw - Math.floor(raw);
          const distance = Math.hypot(col - CENTER_COL, row - CENTER_ROW) / VIGNETTE;
          const index = Math.min(RAMP.length - 1, Math.floor((lum / 255) * (RAMP.length - 1)));
          cells.push({
            mask: hash + 0.5 * distance,
            lastRoll: now,
            x: col * CELL,
            y: row * CELL,
            index,
            character: RAMP[index],
          });
        }
      }

      subjectCenterX = totalLight > 0 ? weightedX / totalLight : WIDTH / 2;
      subjectCenterY = totalLight > 0 ? weightedY / totalLight : HEIGHT / 2;
    }

    /** Resampling is expensive, so coalesce resize bursts into one frame. */
    function schedulePrepare() {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(prepare);
    }

    function frame(now: number) {
      if (!ctx || disposed) return;
      const { active, amplitude } = levelRef.current;
      const session = sessionRef.current;

      let coverage = 0;
      if (active && session) {
        session.analyser.getFloatTimeDomainData(coverageWaveform);
        session.analyser.getByteFrequencyData(coverageFrequencies);
        let sum = 0;
        for (const value of coverageWaveform) sum += value * value;
        const rms = Math.sqrt(sum / coverageWaveform.length);
        coverage = Math.min(1, Math.max(0, rms - 0.002) * 5);
      } else {
        coverageFrequencies.fill(0);
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      if (coverage > 0) {
        const radiusX = WIDTH * 0.65 * Math.sqrt(coverage);
        const threshold = coverage * 1.25;
        const rollInterval = 400 - amplitude * 370;
        ctx.font = `${12 + 4 * Math.max(0, (amplitude - 0.35) / 0.65)}px monospace`;
        ctx.textBaseline = 'alphabetic';

        for (const cell of cells) {
          if (cell.mask > threshold) continue;
          const horizontalDistance = Math.abs(cell.x + CELL / 2 - subjectCenterX);
          if (horizontalDistance >= radiusX) continue;

          const bin = Math.min(
            coverageFrequencies.length - 1,
            Math.floor(((cell.x + CELL / 2) / WIDTH) * coverageFrequencies.length),
          );
          const bandAmplitude = coverageFrequencies[bin] / 255;
          const centerEnvelope = Math.sqrt(1 - (horizontalDistance / radiusX) ** 2);
          const visibleRows = Math.floor(ROWS * coverage * bandAmplitude * centerEnvelope);
          if (visibleRows === 0 || Math.abs(cell.y + CELL / 2 - subjectCenterY) >= (visibleRows * CELL) / 2) continue;

          if (!holdStill() && now - cell.lastRoll >= rollInterval) {
            const offset = Math.floor(Math.random() * 7) - 3;
            cell.character = RAMP[Math.max(1, Math.min(RAMP.length - 1, cell.index + offset))];
            cell.lastRoll = now;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(cell.x, cell.y, CELL, CELL);
          ctx.fillStyle = '#000000';
          ctx.fillText(cell.character, cell.x, cell.y + 10);
        }
      }

      animation = requestAnimationFrame(frame);
    }

    image.addEventListener('load', schedulePrepare);
    image.addEventListener('error', schedulePrepare);
    if (image.complete) prepare();

    const observer = new ResizeObserver(schedulePrepare);
    observer.observe(stage);
    animation = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      cancelAnimationFrame(pending);
      observer.disconnect();
      image.removeEventListener('load', schedulePrepare);
      image.removeEventListener('error', schedulePrepare);
    };
  }, [levelRef, sessionRef, src]);

  return (
    <div ref={stageRef} className="plate-stage" aria-label={alt}>
      <img ref={imageRef} src={src} alt="" className="plate-image" />
      <canvas ref={sampleRef} width={WIDTH} height={HEIGHT} className="plate-sample" aria-hidden="true" />
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="plate-ascii" aria-hidden="true" />
      <svg
        ref={boxesRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="plate-boxes"
      >
        <rect x={280} y={340} width={250} height={200} fill="none" stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={530} y={400} width={210} height={165} fill="none" stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={750} y={340} width={270} height={210} fill="none" stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div ref={labelsRef} aria-hidden="true" className="plate-captions">
        <span>OBJ_01</span>
        <span>ID??</span>
        <span>SCANNING...</span>
      </div>
    </div>
  );
}
