import { session } from './session';

const endpoint = '/__sessions';

/**
 * Moves completed days of session files out of the origin private file
 * system into the project's month zips, through the dev server's
 * `/__sessions` endpoint. Runs once at page load. Today's files stay, the
 * running session among them. A day is the UTC date in the file name.
 * Header-only files, left by reloads that logged nothing, are dropped.
 * A day is removed from the private store only after the endpoint confirmed
 * file count and bytes. Outcome goes to the console; a failure also alerts,
 * because the private store is evictable and the day would otherwise sit
 * there unnoticed.
 */
export async function archiveSessions (): Promise<void> {

  let alive = false;
  try {
    const r = await fetch(endpoint);
    alive = r.ok && (r.headers.get('content-type') || '').includes('json');
  } catch { /* no server at all */ }
  if (!alive) {
    console.log('Sessions: no archive endpoint');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const byDay = new Map<string, string[]>();
  for (const s of await session.list()) {
    const day = s.name.slice(8, 18);
    if (s.current || day >= today) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), s.name]);
  }

  const zipped: string[] = [];
  for (const [day, names] of [...byDay].sort()) {
    try {
      const files: { name: string, text: string }[] = [];
      for (const name of names) {
        const text = await (await session.open(name)).text();
        if (text.split('\n').filter(Boolean).length <= 1) {
          await session.remove(name);
          continue;
        }
        files.push({ name, text });
      }
      if (!files.length) continue;
      const bytes = files.reduce((n, f) => n + new Blob([f.text]).size, 0);
      const r = await fetch(`${endpoint}/${day}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files }) });
      const reply = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(reply.error || `HTTP ${r.status}`);
      if (reply.files !== files.length || reply.bytes !== bytes) throw new Error(`endpoint confirmed ${reply.files} files, ${reply.bytes} bytes; sent ${files.length}, ${bytes}`);
      for (const f of files) await session.remove(f.name);
      zipped.push(day.slice(5));
    } catch (e) {
      const text = `Sessions for ${day.slice(5)} not zipped: ${(e as Error).message}`;
      console.error(text);
      alert(text);
    }
  }

  console.log(zipped.length ? `Sessions for ${zipped.join(', ')} zipped` : 'No sessions zipped');
}
