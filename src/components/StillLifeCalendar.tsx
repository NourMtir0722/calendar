import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_RECORD_SECONDS, useAudio } from '../audio/context';
import { dayNumber, formatClock, fromKey, todayKey, toKey, weekdayIndex, WEEKDAYS, type DateKey } from '../lib/date';
import {
  allEntries,
  deleteEntry,
  getEntry,
  getStorageNoticeSeen,
  markedDates,
  putEntry,
  putStorageNoticeSeen,
  type Entry,
} from '../lib/db';
import { buildBackup, NotABackup, readBackup } from '../lib/backup';
import { MONTHS } from '../lib/months';
import { CalendarSheet } from './CalendarSheet';
import { Waveform } from './Waveform';

/**
 * The most one day may hold.
 *
 * Decoding is the expensive half: an hour of audio expands into a PCM buffer
 * large enough to take the tab down with it, which is why a file is refused on
 * its size before it is ever decoded. It also keeps one careless drop from
 * spending a browser's whole storage quota on a single day.
 */
const MAX_CLIP_BYTES = 12 * 1024 * 1024;

export function StillLifeCalendar() {
  const { play, startRecording, stop, status, error, recordSeconds, dismissError } = useAudio();

  const [selected, setSelected] = useState<DateKey>(todayKey);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [entry, setEntry] = useState<Entry | undefined>(undefined);
  const [marked, setMarked] = useState<Set<DateKey>>(() => new Set());
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [installable, setInstallable] = useState<{ prompt: () => Promise<unknown> } | null>(null);
  const [installHint, setInstallHint] = useState('');
  /** A label while a backup is being written or read, shown where SAVING was. */
  const [working, setWorking] = useState('');
  /**
   * Whether the owner has been told this browser is the only copy. Starts true
   * so the notice cannot flash on load before the stored answer is read back.
   */
  const [toldOfStorage, setToldOfStorage] = useState(true);

  const loadRef = useRef(0);
  /**
   * An AudioContext built without a user gesture starts suspended, so a day only
   * plays itself when the user actually picked it, never on first paint.
   */
  const autoplayRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const persistRef = useRef(false);

  useEffect(() => {
    markedDates()
      .then(setMarked)
      .catch(() => setNotice('Saved entries could not be read. Private browsing may be blocking storage.'));
    getStorageNoticeSeen().then(setToldOfStorage).catch(() => undefined);
  }, []);

  useEffect(() => {
    const request = ++loadRef.current;
    const autoplay = autoplayRef.current;
    autoplayRef.current = false;
    // IndexedDB is the external system this effect synchronises with, and the
    // read is async: the rail has to show it is working before the await lands.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusy(true);
    getEntry(selected)
      .then(found => {
        if (request !== loadRef.current) return;
        setEntry(found);
        setBusy(false);
        if (found && autoplay) void play(found.blob, found.source);
        else stop();
      })
      .catch(() => {
        if (request !== loadRef.current) return;
        setBusy(false);
        setNotice('That day could not be opened.');
      });
  }, [play, selected, stop]);

  const goToMonth = useCallback((year: number, month: number) => {
    setView({ year, month });
    const today = todayKey();
    const first = toKey(new Date(year, month, 1));
    setSelected(today.startsWith(first.slice(0, 8)) ? today : first);
  }, []);

  const shiftMonth = useCallback(
    (delta: number) => {
      const shifted = new Date(view.year, view.month + delta, 1);
      goToMonth(shifted.getFullYear(), shifted.getMonth());
    },
    [goToMonth, view.month, view.year],
  );

  const pickDay = useCallback(
    (date: DateKey) => {
      if (date === selected) {
        if (entry) void play(entry.blob, entry.source);
        return;
      }
      autoplayRef.current = true;
      setSelected(date);
    },
    [entry, play, selected],
  );

  /**
   * Chrome and friends fire this when the app is installable and expect it to
   * be captured; Safari never does, and its Add to Home Screen lives in the
   * share sheet instead. Both paths are offered, so neither browser leaves the
   * button doing nothing.
   */
  useEffect(() => {
    const onOffer = (event: Event) => {
      event.preventDefault();
      setInstallable(event as Event & { prompt: () => Promise<unknown> });
    };
    window.addEventListener('beforeinstallprompt', onOffer);
    return () => window.removeEventListener('beforeinstallprompt', onOffer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        shiftMonth(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        shiftMonth(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shiftMonth]);

  /**
   * Saves to this device, which is the only place there is.
   *
   * Browsers delete script-created storage on their own schedule — Safari after
   * seven days without a visit — so this is a journal with an expiry date its
   * owner was never told about. The backup file is the only answer to that,
   * which is why the notice fires on the first recording and why BACK UP sits
   * in the rail rather than buried in a menu.
   */
  const store = useCallback(async (next: Entry) => {
    try {
      await putEntry(next);
      setEntry(next);
      setMarked(previous => new Set(previous).add(next.date));
      setNotice('');
    } catch {
      setNotice('The entry could not be saved.');
    }
  }, []);

  const record = useCallback(() => {
    const date = selected;
    /**
     * Ask to be exempt from eviction, inside the gesture that starts a
     * recording rather than on load: browsers weigh this against engagement,
     * and a page that asks before the person has done anything is the case
     * they are designed to refuse. Chrome grants it silently, Firefox asks,
     * Safari is unreliable about it — so this improves the odds rather than
     * settling anything, which is why the address exists as well.
     */
    if (!persistRef.current) {
      persistRef.current = true;
      void navigator.storage?.persist?.().catch(() => undefined);
    }
    void startRecording(({ blob, mime, durationMs }) => {
      void store({ date, blob, mime, source: 'mic', title: 'Voice note', durationMs, createdAt: Date.now() });
    });
  }, [selected, startRecording, store]);

  const upload = useCallback(
    async (file: File) => {
      const date = selected;
      /**
       * Refused before it is decoded, not after it is saved. Decoding is the
       * expensive half — an hour of audio expands into a PCM buffer large
       * enough to take the tab down with it — and a file over this size can
       * never reach the address anyway, so accepting it would put a day in the
       * journal that the online copy is permanently unable to hold.
       */
      if (file.size > MAX_CLIP_BYTES) {
        // One decimal, because whole megabytes round a 12.4MB file down to the
        // very limit it just broke and the sentence contradicts itself. No
        // claim about how long that is in minutes either: an upload can be
        // anything from a 320kbps mix to a phone memo, and the two differ by
        // an hour at the same size.
        setNotice(`That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. The most a day can hold is 12MB.`);
        return;
      }
      // Play first: a clip that will not decode should never reach the journal.
      const durationMs = await play(file, 'file');
      if (durationMs <= 0) return;
      await store({
        date,
        blob: file,
        mime: file.type || 'audio/mpeg',
        source: 'file',
        title: file.name.replace(/\.[^.]+$/, ''),
        durationMs,
        createdAt: Date.now(),
      });
    },
    [play, selected, store],
  );

  const remove = useCallback(async () => {
    if (!entry) return;
    stop();
    try {
      await deleteEntry(entry.date);
      setEntry(undefined);
      setMarked(previous => {
        const next = new Set(previous);
        next.delete(entry.date);
        return next;
      });
    } catch {
      setNotice('The entry could not be removed.');
    }
  }, [entry, stop]);

  const recording = status === 'recording';
  const playing = status === 'playing';
  const selectedDate = fromKey(selected);
  const dayLabel = `${WEEKDAYS[weekdayIndex(selected)].short} ${dayNumber(selected)} ${MONTHS[
    selectedDate.getMonth()
  ].name.toUpperCase()} ${selectedDate.getFullYear()}`;

  const readout = recording
    ? `RECORDING ${formatClock(recordSeconds * 1000)} / ${formatClock(MAX_RECORD_SECONDS * 1000)}`
    : working
      ? working
      : status === 'requesting'
        ? 'ALLOW MIC'
        : status === 'decoding'
          ? 'WORKING…'
          : busy
            ? 'READING…'
            : entry
              ? `${entry.source === 'mic' ? 'VOICE' : entry.title.toUpperCase()} · ${formatClock(entry.durationMs)}`
              : 'NO ENTRY · RECORD OR UPLOAD';

  const days = (count: number) => `${count} ${count === 1 ? 'DAY' : 'DAYS'}`;

  const installApp = useCallback(async () => {
    if (installable) {
      await installable.prompt().catch(() => undefined);
      setInstallable(null);
      return;
    }
    // Safari has no programmatic path, so say where the control actually is.
    setInstallHint('Open the share menu in your browser, then Add to Home Screen.');
  }, [installable]);

  /**
   * Writes every recording to one file.
   *
   * The counterpart of the notice above: having told somebody this browser is
   * the only copy, the app has to offer them a second one. It is a file rather
   * than an account because a file needs nothing from anybody — no server, no
   * sign-in, no company still being there in five years — and it rides along
   * with whatever backup its owner already keeps.
   */
  const exportBackup = useCallback(async () => {
    setWorking('BACKING UP…');
    try {
      const entries = await allEntries();
      const file = await buildBackup(entries, (done, total) => setWorking(`BACKING UP ${done + 1}/${total}…`));
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `voice-calendar-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      // Revoked on a later turn: revoking synchronously can beat the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNotice(`Backed up ${entries.length} ${entries.length === 1 ? 'day' : 'days'}. Keep the file somewhere you will find it again.`);
    } catch {
      setNotice('The backup could not be written.');
    } finally {
      setWorking('');
    }
  }, []);

  /**
   * Reads a backup back in.
   *
   * Days already on this device are left alone rather than overwritten. A
   * restore is nearly always somebody recovering onto an empty calendar, but
   * the case that matters is the other one — restoring an old file onto a
   * calendar that has moved on — and there the file is the stale copy. Losing
   * this morning's recording to a backup taken last year is the one outcome a
   * restore must not have.
   */
  const importBackup = useCallback(async (file: File) => {
    setWorking('RESTORING…');
    try {
      const restored = await readBackup(file);
      const existing = await markedDates();
      let added = 0;
      for (const entry of restored) {
        if (existing.has(entry.date)) continue;
        await putEntry(entry);
        added++;
      }
      setMarked(await markedDates());
      setEntry(await getEntry(selected));
      const skipped = restored.length - added;
      setNotice(
        added
          ? `Restored ${added} ${added === 1 ? 'day' : 'days'}.${skipped ? ` ${skipped} already on this device ${skipped === 1 ? 'was' : 'were'} left alone.` : ''}`
          : 'Every day in that backup is already on this device.',
      );
    } catch (cause) {
      setNotice(cause instanceof NotABackup ? cause.message : 'That backup could not be read.');
    } finally {
      setWorking('');
    }
  }, [selected]);

  /** Acknowledges the notice that this browser is the only copy. */
  const dismissStorageNotice = useCallback(async () => {
    setToldOfStorage(true);
    await putStorageNoticeSeen().catch(() => undefined);
  }, []);

  return (
    <CalendarSheet
      view={view}
      selected={selected}
      marked={marked}
      onPick={pickDay}
      onShift={shiftMonth}
      leftRail={
        <>
          <p className="rail-day">{dayLabel}</p>
          {error || notice ? (
            <p
              className="rail-state is-alert"
              role="alert"
              onClick={() => {
                dismissError();
                setNotice('');
              }}
            >
              {error || notice}
            </p>
          ) : (
            <p className="rail-state" role="status">
              {readout}
            </p>
          )}

          <div className="rail-actions">
            <button
              type="button"
              className={recording ? 'is-live' : undefined}
              onClick={record}
              aria-label={recording ? 'Stop and save the recording' : `Record a voice note for ${dayLabel}`}
            >
              {recording ? 'STOP' : 'REC'}
            </button>
            <button
              type="button"
              disabled={recording}
              onClick={() => inputRef.current?.click()}
              aria-label={`Upload an audio file for ${dayLabel}`}
            >
              UPLOAD
            </button>
            <button
              type="button"
              className={playing ? 'is-live' : undefined}
              disabled={!entry || recording}
              onClick={() => (playing ? stop() : entry && void play(entry.blob, entry.source))}
              aria-label={playing ? 'Stop playback' : 'Play this day'}
            >
              {playing ? 'STOP' : 'PLAY'}
            </button>
            <button
              type="button"
              disabled={!entry || recording}
              onClick={() => void remove()}
              aria-label="Delete this entry"
            >
              DELETE
            </button>
          </div>

          {(recording || playing) && (
            <div className="rail-live" aria-label="Active audio">
              <p className="rail-heading" role="status">
                {recording ? 'RECORDING' : 'PLAYING'}
              </p>
              <Waveform />
              {recording && <p className="rail-counter">{formatClock(recordSeconds * 1000)}</p>}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            hidden
            aria-label="Upload day audio"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
        </>
      }
      rightRail={
        <>
          <p className="rail-day">THIS CALENDAR</p>
          <p className="rail-state">
            {days(marked.size)} · {working ? working : 'ON THIS DEVICE'}
          </p>

          {/*
            Said once, when the first recording is made, because that is the
            moment there is something to lose. There is no copy anywhere else
            and no account that could hand it back, so a browser clearing its
            storage ends the journal — and Safari does that after seven days
            without a visit. Somebody should hear that from the app rather than
            discover it.
          */}
          {marked.size > 0 && !toldOfStorage && (
            <div className="rail-live rail-keep">
              <p className="rail-heading">KEPT IN THIS BROWSER</p>
              <p className="rail-note">
                Your recordings are saved on this device and nowhere else. Nothing is uploaded and
                nobody else can reach them &mdash; but clearing this browser&rsquo;s data deletes
                them, and Safari does that on its own after a week away. Save a backup file, and add
                the calendar to your home screen, which stops the forgetting.
              </p>
              <div className="rail-actions">
                <button type="button" className="rail-small" onClick={() => void dismissStorageNotice()}>
                  GOT IT
                </button>
              </div>
            </div>
          )}

          <div className="rail-actions">
            <button
              type="button"
              disabled={!marked.size || recording || Boolean(working)}
              onClick={() => void exportBackup()}
              aria-label="Save a backup file of every recording"
            >
              BACK UP
            </button>
            <button
              type="button"
              disabled={recording || Boolean(working)}
              onClick={() => importRef.current?.click()}
              aria-label="Restore recordings from a backup file"
            >
              RESTORE
            </button>
            <button
              type="button"
              disabled={recording}
              onClick={() => void installApp()}
              aria-label="Add this calendar to your home screen"
            >
              INSTALL
            </button>
          </div>

          <p className="rail-note">
            A backup is one file holding every recording. Keep it wherever you keep things you would
            not want to lose &mdash; it is the only way back if this browser forgets.
          </p>
          {installHint && <p className="rail-note">{installHint}</p>}

          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Choose a backup file"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importBackup(file);
            }}
          />
        </>
      }
    />
  );
}
