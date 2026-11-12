import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { LOCAL_DATA_DIR, scanProject } from './scanner.mjs';

const fileFor = projectPath => join(LOCAL_DATA_DIR, `${createHash('sha256').update(resolve(projectPath).toLowerCase()).digest('hex')}.json`);
async function load(path) {
  try { const value = JSON.parse(await readFile(fileFor(path), 'utf8')); return value?.version === 2 ? value : null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, value) {
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  const filename = fileFor(path);
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...value, version: 2 }, null, 2), { flag: 'wx' });
  await rename(temporary, filename);
  return value;
}
export async function getProjectTodos(path, options = {}) {
  const projectPath = resolve(path);
  return await load(projectPath) ?? refreshProjectTodos(projectPath, options);
}
export async function refreshProjectTodos(path, options = {}) {
  const projectPath = resolve(path);
  const old = await load(projectPath);
  const next = await scanProject(projectPath, options);
  const status = new Map(old?.todos?.map(todo => [todo.id, todo.status]) ?? []);
  next.todos = next.todos.map(todo => ({ ...todo, status: status.get(todo.id) ?? todo.status }));
  return save(projectPath, next);
}
export async function setTodoStatus(path, id, status) {
  if (!['open', 'done', 'dismissed'].includes(status)) throw new Error('无效待办状态');
  const projectPath = resolve(path);
  const data = await getProjectTodos(projectPath);
  const todo = data.todos.find(item => item.id === id);
  if (!todo) throw new Error('找不到待办');
  todo.status = status;
  return save(projectPath, data);
}
