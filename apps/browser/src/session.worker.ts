/**
 * Appends session lines to a file in the origin private filesystem.
 * Runs in a worker because synchronous access handles, the only true append
 * the browser offers, exist there only.
 */

// The sync access handle lives in the WebWorker lib, which does not mix with the DOM lib; declare what is used.
interface ISyncAccessHandle {
  getSize (): number;
  write (buffer: BufferSource, options?: { at?: number }): number;
  read (buffer: BufferSource, options?: { at?: number }): number;
  flush (): void;
  close (): void;
}

let handle: ISyncAccessHandle | null = null;
let size = 0;
const encoder = new TextEncoder();

async function open (name: string, header: string) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('sessions', { create: true });
  const file = await dir.getFileHandle(name, { create: true });
  const h = await (file as any).createSyncAccessHandle();
  handle = h;
  size = h.getSize();
  if (size === 0) append(header);
}

function append (text: string) {
  if (!handle) return;
  const bytes = encoder.encode(text);
  handle.write(bytes, { at: size });
  size += bytes.byteLength;
  handle.flush();
}

function readAll (): string {
  if (!handle) return '';
  const buffer = new Uint8Array(size);
  handle.read(buffer, { at: 0 });
  return new TextDecoder().decode(buffer);
}

addEventListener('message', async (e: MessageEvent) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'open':
        await open(msg.name, msg.header);
        postMessage({ type: 'opened', id: msg.id, size });
        break;
      case 'append':
        append(msg.text);
        break;
      case 'read':
        postMessage({ type: 'read', id: msg.id, text: readAll(), size });
        break;
      case 'close':
        handle?.close();
        handle = null;
        postMessage({ type: 'closed', id: msg.id });
        break;
    }
  } catch (error) {
    postMessage({ type: 'error', id: msg.id, error: String(error) });
  }
});
