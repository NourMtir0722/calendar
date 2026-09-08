# Security

Voice Calendar stores voice recordings in the browser that made them. This
document says exactly what that protects them from, what it does not, and how
to tell me if I have got it wrong.

## Reporting a vulnerability

Please report privately, through GitHub's **Report a vulnerability** button on
the Security tab of this repository, rather than by opening an issue.

I will acknowledge a report within a week. This is a personal project with no
bounty programme and no support contract; what I can promise is that a real
finding gets a fix and public credit, and that a finding I disagree with gets a
reasoned answer rather than silence.

## What the design actually guarantees

**Nothing is sent anywhere.** Recordings are written to IndexedDB in the
browser and stay there. There is no server, no account, no bucket and no
endpoint that accepts data — the deployment is static files. `connect-src` is
`'none'`, so a page that tried to send a recording somewhere would be stopped
by its own Content-Security-Policy before it reached the network.

That is a stronger guarantee than encrypting things in transit, because there
is no transit. It also means the failure modes are entirely local, and the rest
of this document is about those.

## What it does not guarantee

**A cleared browser is a finished journal.** Nobody can recover it — not me,
not a host, not anybody — because nobody else ever had a copy. Browsers are
allowed to evict script-created storage on their own schedule, and Safari
deletes it outright after seven days without a visit. Three things help, in
ascending order of how much they can be relied on: `navigator.storage.persist()`,
which is requested inside the tap that starts the first recording because
browsers weigh it against engagement; Add to Home Screen, which exempts the app
from Safari's rule outright and is the only dependable defence against it; and
the backup file, which is the one that does not depend on the browser's
goodwill at all. The app says this once, on the first recording, rather than
leaving it to be discovered.

**A backup file is a plaintext copy of your journal.** It is not encrypted, and
that is deliberate: a backup you cannot open without this app, on a device you
no longer have, is not a backup. It holds your recordings in plain base64, so
it deserves the same care as the recordings themselves. Anyone who reads the
file can hear everything in it.

**A compromised device is a compromised journal.** Recordings live unencrypted
in IndexedDB, as they must to be playable offline. Full-disk encryption and a
device passcode are the defence, and neither is something this app can supply.
Anyone with your unlocked device has your journal, the same way they have your
photos.

**A compromise of the app's origin is total.** Every recording this browser
holds is reachable by script running on this origin, so an injection would cost
the whole journal rather than a defacement. That is why the Content-Security-
Policy is what it is: `script-src 'self'` with no `unsafe-inline`, because the
build emits no inline script; `connect-src 'none'`; no third-party script or
CDN loaded anywhere; fonts and images served from this origin.

**There is no client telemetry, and that is a decision rather than an
omission.** A stack trace from this app can carry a day's title or a date, and
the premise is that none of it leaves the device. Errors are shown on a crash
screen that leads with the fact that the recordings are still in IndexedDB, and
logged to the console under `CLIENT_CRASH`. They go nowhere else.

## What the host can see

The site is static files served by Cloudflare. Fetching a page means Cloudflare
sees the request the way any host would — an IP address, a timestamp, a user
agent — and logs it at its edge. Nothing in this repository changes that, and
it is the same for any website. What it cannot see is a recording, a date, a
title, or whether you have ever recorded anything at all, because none of that
is ever sent.

There are no cookies, no analytics, no third-party requests, and no fonts or
images loaded from anywhere but this origin.

## Scope

What is in scope: anything that gets script onto the app's origin, anything
that reads the journal out of IndexedDB from another origin, anything that
makes the backup or restore mishandle a file in a way that loses or corrupts
recordings, and anything in the Content-Security-Policy or the response headers
that does not do what this document says it does.

What is out of scope: physical access to an unlocked device, browsers evicting
their own storage, and the fact that a backup file is readable by whoever holds
it — all three are named above as the trades they are.
