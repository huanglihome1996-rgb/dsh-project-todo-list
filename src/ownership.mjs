import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

/** Reverse-search version documents written by this Git identity, then map
 * their declared owner back to the user's project-specific display name. */
export async function discoverOwnedDocuments(root, files, identities) {
  const emails = identities.filter(value => typeof value === 'string' && value.includes('@'));
  if (!emails.length) return { aliases: [], paths: [] };
  const owned = new Set();
  for (const email of emails.slice(0, 2)) {
    try {
      const { stdout } = await exec('git', ['-C', root, 'log', 'origin/main', '--max-count=250', '--format=', `--author=${email}`, '--name-only', '--', 'docs/modules'], {
        timeout: 3500, windowsHide: true, maxBuffer: 512 * 1024
      });
      for (const path of stdout.split(/\r?\n/)) if (path.startsWith('docs/modules/') && /\.v\d+.*\.md$/i.test(path)) owned.add(path.trim());
    } catch {}
  }
  const aliases = new Set();
  const counts = new Map();
  for (const file of files) {
    if (!owned.has(file.path)) continue;
    const name = /^owner:\s*["']?([^\r\n"']+)/mi.exec(file.text)?.[1]?.trim();
    if (name && !/待指定|unassigned|unknown/i.test(name) && !/[\/、及和与,，;]/.test(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  for (const [name, count] of counts) if (count >= 2 && count === max) aliases.add(name);
  return { aliases: [...aliases].slice(0, 5), paths: [...owned].slice(0, 80) };
}
