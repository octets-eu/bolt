import { session } from './session';

/**
 * How this page load came about and whether the Bolts showed up after it,
 * as one `reload` note in the session file 12 s after the load (two
 * attempts of the advertisement watch): `by` is "vite" when the vite client
 * announced a full reload, "page" for any other unload before it, "new"
 * for a fresh tab; `sinceS` the seconds since the previous load in this
 * tab; `bolts` how many Bolts had advertised and entered the list. Reason:
 * since 2026-10-02 a reloaded page sometimes gets no advertisement for
 * minutes while the next reload sees both Bolts at once; the notes tell
 * the trigger and the timing against the outcome.
 */
const MARK = 'reload', LOADED = 'loadedAt';
const by = sessionStorage.getItem(MARK) ?? 'new';
const before = Number(sessionStorage.getItem(LOADED));
const sinceS = before ? Math.round((Date.now() - before) / 100) / 10 : null;
sessionStorage.removeItem(MARK);
sessionStorage.setItem(LOADED, String(Date.now()));

import.meta.hot?.on('vite:beforeFullReload', () => sessionStorage.setItem(MARK, 'vite'));
window.addEventListener('pagehide', () => { if (!sessionStorage.getItem(MARK)) sessionStorage.setItem(MARK, 'page'); });

setTimeout(() => session.note('*', 'info', `reload ${JSON.stringify({ by, sinceS, bolts: window.Bolts.count() })}`), 12000);
