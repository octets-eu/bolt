import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { sessionArchive } from './vite-plugin-sessions';

/** Short hash of HEAD, with "+dirty" when the working tree differs from it. */
function commit (): string {
  const git = (args: string) => execSync(`git ${args}`, { cwd: import.meta.dirname, encoding: 'utf8' }).trim();
  return git('rev-parse --short HEAD') + (git('status --porcelain') ? '+dirty' : '');
}

/**
 * `__COMMIT__` for the session header: the code that wrote the file. Set by
 * a script in the page's head, so the hash is read at every page load in
 * the dev server, not once at its start; a build fixes it at build time.
 */
const commitStamp: Plugin = {
  name: 'commit-stamp',
  transformIndexHtml: () => [{ tag: 'script', children: `var __COMMIT__ = ${JSON.stringify(commit())};`, injectTo: 'head-prepend' }],
};

// Same certificate files the webpack dev server used; see research/setup.md.
// Port 8080 is kept on purpose: Web Bluetooth permissions are granted per origin.
const certDir = resolve(import.meta.dirname, '../../Certificates/macos');

export default defineConfig({
  // completed days of session logs land in <workspace>/sessions as one zip per month
  plugins: [commitStamp, sessionArchive(resolve(import.meta.dirname, '../../sessions'))],
  server: {
    host: true,
    port: 8080,
    strictPort: true,
    https: {
      key: readFileSync(resolve(certDir, 'private.key')),
      cert: readFileSync(resolve(certDir, 'private.crt')),
    },
  },
  preview: {
    port: 8080,
    strictPort: true,
  },
});
