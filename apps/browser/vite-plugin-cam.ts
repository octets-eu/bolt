import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { connect } from 'node:net';

/**
 * The camera forwarder (agent/Rig/cam.py) for the page. Dev server only. The
 * forwarder speaks one text line per TCP connection and admits loopback and
 * the colima net, so the page reaches it through this endpoint and an SSH
 * tunnel to the rig: `ssh -N -L 7020:127.0.0.1:7020 rig@<M1>`.
 *
 *   GET /__cam/ping|status|off   -> the forwarder's text reply
 *   GET /__cam/on?id=<n>         -> `on <n>`; id 2 ultrawide (default), 0 main
 *   GET /__cam/frame             -> image/jpeg, header x-cam-age the frame's age in ms;
 *                                   502 with the text when the stream is off or the rig is away
 */
export function camForwarder (host = process.env.CAM_HOST ?? '127.0.0.1', port = Number(process.env.CAM_PORT ?? 7020)): Plugin {

  const ask = (line: string) => new Promise<{ text: string, bytes: Buffer }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const s = connect(port, host, () => s.write(line + '\n'));
    s.setTimeout(5000, () => { s.destroy(); reject(new Error(`camera: no reply to ${line}`)); });
    s.on('data', (c: Buffer) => chunks.push(c));
    s.on('error', reject);
    s.on('end', () => {
      const buf = Buffer.concat(chunks);
      const nl = buf.indexOf(10);
      resolve({ text: buf.subarray(0, nl < 0 ? buf.length : nl).toString(), bytes: nl < 0 ? Buffer.alloc(0) : buf.subarray(nl + 1) });
    });
  });

  const text = (res: ServerResponse, status: number, body: string) => {
    res.statusCode = status;
    res.setHeader('content-type', 'text/plain');
    res.setHeader('cache-control', 'no-store');
    res.end(body);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://x');
    const cmd = url.pathname.replace(/^\/|\/$/g, '');
    if (!['ping', 'status', 'on', 'off', 'frame'].includes(cmd)) return text(res, 404, 'not found');
    const line = cmd === 'on' ? `on ${url.searchParams.get('id') ?? '2'}` : cmd;
    let reply;
    try { reply = await ask(line); }
    catch (e) { return text(res, 502, (e as Error).message); }
    if (cmd !== 'frame') return text(res, 200, reply.text);
    const m = /^frame (\d+) (\d+)$/.exec(reply.text);
    if (!m || reply.bytes.length !== Number(m[1])) return text(res, 502, reply.text || 'no frame');
    res.statusCode = 200;
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-cam-age', m[2]!);
    res.end(reply.bytes);
  };

  return {
    name: 'cam-forwarder',
    configureServer (server) {
      server.middlewares.use('/__cam', (req, res) => {
        handle(req, res).catch(e => text(res, 500, String(e)));
      });
    },
  };
}
