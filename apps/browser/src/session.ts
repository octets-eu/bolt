import { Bolt, LogEntry, PacketSummary } from '@bolt/core';
import { ISessionHeader, TMessage, IEventMessage, PROTOCOL_VERSION } from '@bolt/protocol';

type Action = PacketSummary & { name: string };
type Event  = { msg?: PacketSummary, sensordata?: unknown };

/** Plain JSON view of a low-level action, for the file. */
function plainAction (a: Action) {
  return { id: a.id, name: a.name, device: a.device, command: a.command, target: a.target, payload: a.payload };
}

/** Plain JSON view of an event payload: packet fields and sensor data only. */
function plainEvent (e: Event) {
  const out: { msg?: object, sensordata?: unknown } = {};
  if (e && e.msg) {
    const m = e.msg;
    out.msg = { id: m.id, device: m.device, command: m.command, target: m.target, payload: m.payload };
  }
  if (e && e.sensordata !== undefined) out.sensordata = e.sensordata;
  return out;
}

/**
 * The session log and the session clock. Every message is appended to
 * `sessions/session-<id>.jsonl` in the origin private filesystem, by a worker,
 * as it happens: a Bolt's log entries once it is attached, camera positions
 * and notes from the views. Export copies that file into a directory the
 * user picked once. Earlier sessions stay in the private filesystem.
 */
class SessionLog {

  /** Wall clock at t = 0. */
  readonly startedAt = new Date();

  readonly header: ISessionHeader;
  readonly fileName: string;
  public count = 0;
  public lastExport: string | null = null;

  private worker: Worker;
  private ready: Promise<void>;
  private pending: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private replies = new Map<number, (msg: any) => void>();
  private nextId = 1;
  private origin = performance.now();

  constructor () {
    const startedAt = this.startedAt.toISOString();
    this.header = { kind: 'session', v: PROTOCOL_VERSION, id: startedAt.replace(/[:.]/g, '-'), startedAt, commit: __COMMIT__ };
    this.fileName = `session-${this.header.id}.jsonl`;
    this.worker = new Worker(new URL('./session.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent): void => {
      const r = this.replies.get(e.data.id);
      if (r) {
        this.replies.delete(e.data.id);
        r(e.data);
      } else if (e.data.type === 'error') console.warn('session worker', e.data.error);
    };
    this.ready = this.call({ type: 'open', name: this.fileName, header: JSON.stringify(this.header) + '\n' }).then((): void => undefined);
    window.addEventListener('pagehide', () => this.flush());
  }

  /** Session-relative milliseconds, monotonic. */
  now (): number {
    return Math.round((performance.now() - this.origin) * 10) / 10;
  }

  /** One line into the file. */
  append (msg: TMessage): void {
    this.pending.push(JSON.stringify(msg) + '\n');
    this.count++;
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 250);
  }

  /** A note from a view or a script, e.g. "exported ..." or a camera click. */
  note (bolt: string, name: 'info' | 'error', text: string): IEventMessage {
    const msg: IEventMessage = { v: PROTOCOL_VERSION, t: this.now(), bolt, kind: 'event', name, data: text };
    this.append(msg);
    return msg;
  }

  /** A Bolt's log entries become event messages in the file. */
  attach (bolt: Bolt): () => void {
    return bolt.events.on('log', (entry: LogEntry) => {
      const base: Omit<IEventMessage, 'name' | 'data'> = { v: PROTOCOL_VERSION, t: this.now(), bolt: bolt.name, kind: 'event' };
      switch (entry.type) {
        case 'info':
          this.append({ ...base, name: 'info',  data: entry.subtype });
          break;
        case 'warn':
          this.append({ ...base, name: 'error', data: entry.subtype });
          break;
        case 'action':
          this.append({ ...base, name: 'action', data: plainAction(entry.data as Action) });
          break;
        case 'event':
          this.append({ ...base, name: entry.subtype, data: plainEvent(entry.data as Event) });
          break;
      }
    });
  }

  private call (msg: object): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.replies.set(id, (reply): void => {
        if (reply.type === 'error') reject(new Error(reply.error));
        else resolve(reply);
      });
      this.worker.postMessage({ ...msg, id });
    });
  }

  private flush () {
    this.flushTimer = null;
    if (!this.pending.length) return;
    const text = this.pending.join('');
    this.pending = [];
    this.ready.then(() => this.worker.postMessage({ type: 'append', text }));
  }

  /** The whole session file as text, header first. */
  async toJsonl (): Promise<string> {
    this.flush();
    await this.ready;
    const reply = await this.call({ type: 'read' });
    return reply.text as string;
  }

  /** All messages of this session, parsed. */
  async messages (): Promise<TMessage[]> {
    const text = await this.toJsonl();
    return text.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter((o: any) => o.kind !== 'session');
  }

  // ---- stored sessions (earlier runs, in the private filesystem) ----

  private async sessionsDir (): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('sessions', { create: true });
  }

  /** Names of stored session files, newest first, the running one included. */
  async list (): Promise<{ name: string, size: number, current: boolean }[]> {
    const dir = await this.sessionsDir();
    const out: { name: string, size: number, current: boolean }[] = [];
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file' || !name.endsWith('.jsonl')) continue;
      const current = name === this.fileName;
      const size = current ? 0 : (await (handle as FileSystemFileHandle).getFile()).size;
      out.push({ name, size, current });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }

  /** A stored session as a File. The running session is read through the worker instead. */
  async open (name: string): Promise<File> {
    if (name === this.fileName) return new File([await this.toJsonl()], name, { type: 'application/jsonl' });
    const dir = await this.sessionsDir();
    return (await dir.getFileHandle(name)).getFile();
  }

  async remove (name: string): Promise<void> {
    if (name === this.fileName) return;
    const dir = await this.sessionsDir();
    await dir.removeEntry(name);
  }

  // ---- export to a real directory ----

  /** Directory picked once and remembered in IndexedDB (handles cannot live anywhere else). */
  private async directory (): Promise<FileSystemDirectoryHandle> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('bolt-settings', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('settings');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = () => new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const r = db.transaction('settings').objectStore('settings').get('exportDir');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const put = (h: FileSystemDirectoryHandle) => new Promise<void>((resolve, reject) => {
      const t = db.transaction('settings', 'readwrite');
      t.objectStore('settings').put(h, 'exportDir');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    let handle = await get();
    if (handle) {
      const q = await (handle as any).queryPermission({ mode: 'readwrite' });
      const p = q === 'granted' ? q : await (handle as any).requestPermission({ mode: 'readwrite' });
      if (p === 'granted') return handle;
    }
    handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'bolt-sessions' });
    await put(handle!);
    return handle!;
  }

  /** Copy a session file (the running one by default) into the export directory. Needs a user gesture. */
  async export (name = this.fileName): Promise<{ name: string, bytes: number }> {
    const dir = await this.directory();
    const text = name === this.fileName ? await this.toJsonl() : await (await this.open(name)).text();
    const file = await dir.getFileHandle(name, { create: true });
    const w = await file.createWritable();
    await w.write(text);
    await w.close();
    this.lastExport = name;
    this.note('*', 'info', `exported ${name}`);
    return { name, bytes: text.length };
  }

}

export const session = new SessionLog();
