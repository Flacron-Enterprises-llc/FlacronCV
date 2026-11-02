# FlacronCV form fill (local unpacked)

Provisional development target: **Chrome Manifest V3**, loaded unpacked. This is not a Chrome Web Store package. Real-site support is unfinished.

## What it does

After you review an `example-jobs.test` session in FlacronCV and start the fill from this popup, it writes `full_name`, `email`, `phone`, and `notes`. It never clicks submit.

## Load it

1. Open `chrome://extensions`.
2. Enable developer mode.
3. Load unpacked and choose this folder.
4. Point a host entry, or Chrome `--host-resolver-rules="MAP example-jobs.test 127.0.0.1"`, at a local server that serves `fixtures/example-jobs.html` as `http://example-jobs.test/` (any port on that host is allowed).
5. In FlacronCV, prepare and review the form, copy the session id and a current ID token, then click **Fill reviewed fields**.

Host permissions cover `example-jobs.test` (any port) plus the local API on `127.0.0.1:4101` / `localhost:4101` so the service worker can fetch a reviewed fill payload. Other job hosts and store publication stay unfinished.
