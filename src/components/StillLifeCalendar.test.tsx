import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AudioProvider } from '../audio/AudioProvider';
import { getEntry, getStorageNoticeSeen, markedDates, putEntry, type Entry } from '../lib/db';
import { todayKey } from '../lib/date';
import { installMicrophone, noRecordingSupport, refuseMicrophone } from '../test/audio';
import { StillLifeCalendar } from './StillLifeCalendar';

function entry(date: string, over: Partial<Entry> = {}): Entry {
  return {
    date,
    blob: new Blob(['clip for ' + date], { type: 'audio/webm' }),
    mime: 'audio/webm',
    source: 'mic',
    title: 'Voice note',
    durationMs: 4000,
    createdAt: Date.now(),
    ...over,
  };
}

function show() {
  return render(
    <AudioProvider>
      <StillLifeCalendar />
    </AudioProvider>,
  );
}

/** Catches the file a download hands over, without a browser to receive it. */
function catchDownload() {
  const saved: { name: string; text: Promise<string> }[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    saved.push({ name: '', text: (blob as Blob).text() });
    return 'blob:stub';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (saved.length) saved[saved.length - 1].name = this.download;
  });
  return saved;
}

describe('recording a day', () => {
  it('keeps the take on this device, and nowhere else', async () => {
    const microphone = installMicrophone();
    show();

    await userEvent.click(await screen.findByRole('button', { name: /^Record a voice note/ }));
    await screen.findByRole('button', { name: 'Stop and save the recording' });
    microphone.recorder().captured = 'a morning';
    await userEvent.click(screen.getByRole('button', { name: 'Stop and save the recording' }));

    const today = todayKey();
    await waitFor(async () => expect(await getEntry(today)).toBeTruthy());
    expect((await getEntry(today))!.source).toBe('mic');
  });

  it('refuses a take that captured nothing, rather than filling the day with it', async () => {
    const microphone = installMicrophone();
    show();

    await userEvent.click(await screen.findByRole('button', { name: /^Record a voice note/ }));
    await screen.findByRole('button', { name: 'Stop and save the recording' });

    // What a microphone that yielded no data leaves behind.
    microphone.recorder().captured = '';
    await userEvent.click(screen.getByRole('button', { name: 'Stop and save the recording' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/no audio was captured/i);
    expect(await getEntry(todayKey())).toBeUndefined();
    expect([...(await markedDates())]).toEqual([]);
  });
});

describe('a browser that will not give up the microphone', () => {
  /**
   * `getUserMedia` rejects with a DOMException written for a developer: denying
   * the prompt produces the words "Permission denied" and nothing else. That is
   * the first thing a new person meets, and on a phone the way back is several
   * screens deep in settings.
   */
  it('says what a refusal means and what to do instead', async () => {
    refuseMicrophone('NotAllowedError');
    show();

    await userEvent.click(await screen.findByRole('button', { name: /^Record a voice note/ }));
    const said = (await screen.findByRole('alert')).textContent ?? '';
    expect(said).toMatch(/not allowing the microphone/i);
    expect(said).toMatch(/settings/i);
    expect(said).toMatch(/upload an audio file instead/i);
    expect(said).not.toMatch(/Permission denied/);
  });

  it('tells apart no microphone, a busy one, and an insecure connection', async () => {
    const cases: Array<[string, RegExp]> = [
      ['NotFoundError', /No microphone was found/i],
      ['OverconstrainedError', /No microphone was found/i],
      ['NotReadableError', /being used by something else/i],
      ['SecurityError', /secure \(https\) connection/i],
    ];
    for (const [name, message] of cases) {
      refuseMicrophone(name);
      const view = show();
      await userEvent.click(await screen.findByRole('button', { name: /^Record a voice note/ }));
      expect((await screen.findByRole('alert')).textContent).toMatch(message);
      view.unmount();
    }
  });

  it('points a browser that cannot record at the upload instead', async () => {
    noRecordingSupport();
    show();

    await userEvent.click(await screen.findByRole('button', { name: /^Record a voice note/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not supported in this browser/i);
  });
});

describe('uploading a file instead', () => {
  it('refuses one too large for a day before decoding it, and says how large it was', async () => {
    show();

    // Decoding is the expensive half: an hour of audio expands into a PCM
    // buffer large enough to take the tab down with it.
    const file = new File(['x'], 'long-mix.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(file, 'size', { value: 13 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('Upload day audio'), { target: { files: [file] } });

    expect((await screen.findByRole('alert')).textContent).toMatch(/That file is 13.0MB/);
    expect(await getEntry(todayKey())).toBeUndefined();
  });

  it('keeps a file that plays, under the name it came with', async () => {
    show();

    const file = new File(['some music'], 'quiet-morning.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Upload day audio'), { target: { files: [file] } });

    const today = todayKey();
    await waitFor(async () => expect(await getEntry(today)).toBeTruthy());
    const stored = (await getEntry(today))!;
    expect(stored.title).toBe('quiet-morning');
    expect(stored.source).toBe('file');
  });

  it('never lets a file that will not decode into the journal', async () => {
    show();

    // Empty bytes are what a broken file looks like to the decoder.
    const file = new File([], 'not-really-audio.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Upload day audio'), { target: { files: [file] } });

    await screen.findByRole('alert');
    expect(await getEntry(todayKey())).toBeUndefined();
  });
});

describe('deleting a day', () => {
  it('takes it off the device, which is everywhere it was', async () => {
    await putEntry(entry(todayKey()));
    show();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete this entry' }));
    await waitFor(async () => expect(await getEntry(todayKey())).toBeUndefined());
    expect([...(await markedDates())]).toEqual([]);
  });
});

/**
 * There is no copy anywhere else and no account that could hand one back, so a
 * browser clearing its storage ends the journal. That is not something to leave
 * somebody to find out.
 */
describe('telling somebody this browser is the only copy', () => {
  it('says so once there is something to lose', async () => {
    await putEntry(entry(todayKey()));
    show();

    const notice = await screen.findByText('KEPT IN THIS BROWSER');
    const panel = notice.closest('div')!;
    expect(panel.textContent).toMatch(/saved on this device and nowhere else/i);
    expect(panel.textContent).toMatch(/clearing this browser/i);
    expect(panel.textContent).toMatch(/save a backup file/i);
  });

  it('says nothing to a calendar with nothing in it yet', async () => {
    show();
    await screen.findByRole('button', { name: /^Record a voice note/ });
    expect(screen.queryByText('KEPT IN THIS BROWSER')).toBeNull();
  });

  it('is answered once rather than once per tab', async () => {
    await putEntry(entry(todayKey()));
    const first = show();

    await userEvent.click(await screen.findByRole('button', { name: 'GOT IT' }));
    await waitFor(async () => expect(await getStorageNoticeSeen()).toBe(true));
    expect(screen.queryByText('KEPT IN THIS BROWSER')).toBeNull();

    first.unmount();
    show();
    await screen.findByRole('button', { name: /^Record a voice note/ });
    await waitFor(() => expect(screen.queryByText('KEPT IN THIS BROWSER')).toBeNull());
  });
});

describe('the backup, which is the only way back', () => {
  it('writes every day into one file, named for the day it was taken', async () => {
    await putEntry(entry('2026-09-02'));
    await putEntry(entry('2026-09-08'));
    const saved = catchDownload();
    show();

    await userEvent.click(await screen.findByRole('button', { name: /Save a backup file/i }));
    await waitFor(() => expect(saved).toHaveLength(1));

    expect(saved[0].name).toMatch(/^voice-calendar-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(await saved[0].text) as { days: { date: string; audio: string }[] };
    expect(parsed.days.map(day => day.date)).toEqual(['2026-09-02', '2026-09-08']);
    // The audio is in the file, not a reference to something that has to still
    // exist for the file to be worth anything.
    expect(parsed.days.every(day => day.audio.length > 0)).toBe(true);
  });

  it('cannot be asked for by a calendar with nothing in it', async () => {
    show();
    expect((await screen.findByRole('button', { name: /Save a backup file/i })).hasAttribute('disabled')).toBe(true);
  });

  it('reads a backup back onto an empty device', async () => {
    await putEntry(entry('2026-09-02'));
    await putEntry(entry('2026-09-08'));
    const saved = catchDownload();
    const first = show();
    await userEvent.click(await screen.findByRole('button', { name: /Save a backup file/i }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const text = await saved[0].text;
    first.unmount();

    for (const date of await markedDates()) await import('../lib/db').then(db => db.deleteEntry(date));
    show();
    const file = new File([text], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Choose a backup file'), { target: { files: [file] } });

    await waitFor(async () => expect([...(await markedDates())].sort()).toEqual(['2026-09-02', '2026-09-08']));
    expect((await screen.findByRole('alert')).textContent).toMatch(/restored 2 days/i);
  });

  /**
   * The case that matters is not the empty device, it is the one that has moved
   * on: a backup taken last year, restored onto a calendar with this morning in
   * it. Losing that morning is the one outcome a restore must not have.
   */
  it('leaves a day already on the device alone rather than overwriting it', async () => {
    await putEntry(entry('2026-09-02', { title: 'The old one' }));
    const saved = catchDownload();
    const first = show();
    await userEvent.click(await screen.findByRole('button', { name: /Save a backup file/i }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const stale = await saved[0].text;
    first.unmount();

    await putEntry(entry('2026-09-02', { title: 'The one that is actually here' }));
    show();
    const file = new File([stale], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Choose a backup file'), { target: { files: [file] } });

    expect((await screen.findByRole('alert')).textContent).toMatch(/already on this device/i);
    expect((await getEntry('2026-09-02'))!.title).toBe('The one that is actually here');
  });

  it('says what is wrong with a file that is not a backup at all', async () => {
    show();
    const file = new File(['{"nope":true}'], 'holiday.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Choose a backup file'), { target: { files: [file] } });

    expect((await screen.findByRole('alert')).textContent).toMatch(/not a calendar backup/i);
  });
});
