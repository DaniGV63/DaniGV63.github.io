import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** True when `urlPath` (e.g. "/cv/file.pdf") exists under public/ at build time. */
export function publicFileExists(urlPath: string): boolean {
  return existsSync(join(process.cwd(), 'public', urlPath));
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}
