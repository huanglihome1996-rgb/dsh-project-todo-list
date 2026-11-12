import { readFile } from 'node:fs/promises';
// For development only; DSH itself validates the published index when loaded.
const data = JSON.parse(await readFile(new URL('./index.json', import.meta.url)));
if (data.format !== 1 || data.plugins?.length !== 1) throw new Error('Invalid market index format');
const plugin = data.plugins[0];
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
if (plugin.name !== pkg.name || plugin.versions[0].version !== pkg.version || plugin.versions[0].engines.dsh !== pkg.engines.dsh) throw new Error('Market index does not match package');
if (!/^[0-9a-f]{40}$/.test(plugin.versions[0].source.commit)) throw new Error('Unpinned market source');
console.log(`Validated ${plugin.name}@${pkg.version} index metadata`);
