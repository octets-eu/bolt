import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Session archive endpoint. Dev server only: `configureServer` never runs in a build.
 *
 *   GET  /__sessions          -> { ok: true }, so the page knows the endpoint is there
 *   POST /__sessions/<day>    body { files: [{ name, text }] }
 *        -> { day, files, bytes } once the files are in <dir>/sessions-<yyyy-mm>.zip
 *           as <yyyy-mm>/<dd>/<name>. An entry with the same name is replaced.
 *
 * The zip is grown with the system `zip` command, so nothing is rewritten.
 */
export function sessionArchive (dir: string): Plugin {

  const json = (res: ServerResponse, status: number, body: object) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const body = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {

    const url = (req.url || '/').replace(/\/$/, '') || '/';

    if (req.method === 'GET' && url === '/') return json(res, 200, { ok: true });

    const day = req.method === 'POST' ? /^\/(\d{4}-\d{2})-(\d{2})$/.exec(url) : null;
    if (!day) return json(res, 404, { error: 'not found' });
    const [, month, dd] = day as unknown as [string, string, string];

    const files = JSON.parse(await body(req)).files as { name: string, text: string }[];
    if (!Array.isArray(files) || !files.length) return json(res, 400, { error: 'no files' });
    if (files.some(f => !/^session-[\w-]+\.jsonl$/.test(f.name) || typeof f.text !== 'string')) return json(res, 400, { error: 'bad file name or text' });

    const staging = mkdtempSync(join(tmpdir(), 'bolt-sessions-'));
    try {
      mkdirSync(join(staging, month, dd), { recursive: true });
      let bytes = 0;
      for (const f of files) { writeFileSync(join(staging, month, dd, f.name), f.text); bytes += Buffer.byteLength(f.text); }
      mkdirSync(dir, { recursive: true });
      const zip = spawnSync('zip', ['-q', '-g', join(dir, `sessions-${month}.zip`), ...files.map(f => join(month, dd, f.name))], { cwd: staging, encoding: 'utf8' });
      if (zip.status !== 0) return json(res, 500, { error: `zip exited ${zip.status}: ${(zip.stderr || zip.error?.message || '').trim()}` });
      return json(res, 200, { day: `${month}-${dd}`, files: files.length, bytes });
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  };

  return {
    name: 'bolt-session-archive',
    configureServer (server) {
      server.middlewares.use('/__sessions', (req, res) => {
        handle(req, res).catch((e: Error) => json(res, 500, { error: e.message }));
      });
    },
  };
}
