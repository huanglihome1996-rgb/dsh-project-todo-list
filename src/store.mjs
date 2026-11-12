import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { LOCAL_DATA_DIR, scanProject } from './scanner.mjs';

const fileFor = projectPath => join(LOCAL_DATA_DIR, `${createHash('sha256').update(resolve(projectPath).toLowerCase()).digest('hex')}.json`);
async function load(path) {
  try { const value = JSON.parse(await readFile(fileFor(path), 'utf8')); return value?.version === 3 ? value : null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, value) {
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  const filename = fileFor(path);
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...value, version: 3 }, null, 2), { flag: 'wx' });
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
  const previous = new Map(old?.todos?.map(todo => [todo.id, todo]) ?? []);
  next.todos = next.todos.map(todo => {
    const prior = previous.get(todo.id);
    return { ...todo, status: prior?.status ?? todo.status,
      progress: prior?.progress === 'in_progress' ? 'in_progress' : todo.progress,
      activeSessionId: prior?.activeSessionId, completion: prior?.completion };
  });
  return save(projectPath, next);
}
export async function activateTodo(path, id, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 180) throw new Error('无效会话 ID');
  const projectPath = resolve(path);
  const data = await getProjectTodos(projectPath);
  const todo = data.todos.find(item => item.id === id && item.status === 'open');
  if (!todo) throw new Error('找不到待办');
  if (todo.activeSessionId && todo.activeSessionId !== sessionId) throw new Error('此待办正在另一个会话中处理');
  todo.activeSessionId = sessionId;
  todo.progress = 'in_progress';
  todo.activatedAt = new Date().toISOString();
  return save(projectPath, data);
}

export async function evaluateTodo(path, id, sessionId, evaluation) {
  const projectPath = resolve(path);
  const data = await load(projectPath);
  const todo = data?.todos?.find(item => item.id === id && item.activeSessionId === sessionId && item.status === 'open');
  if (!todo) return null;
  todo.completion = { ...evaluation, checkedAt: new Date().toISOString() };
  if (evaluation.result === 'done') { todo.status = 'done'; todo.activeSessionId = undefined; }
  else todo.progress = 'in_progress';
  return save(projectPath, data);
}

export async function getActiveTodosForSession(sessionId) {
  let files;
  try { files = await readdir(LOCAL_DATA_DIR); } catch { return []; }
  const active = [];
  for (const filename of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
    try {
      const data = JSON.parse(await readFile(join(LOCAL_DATA_DIR, filename), 'utf8'));
      if (data.version !== 3) continue;
      for (const todo of data.todos ?? []) if (todo.activeSessionId === sessionId && todo.status === 'open') active.push({ projectPath: data.projectPath, todo });
    } catch {}
  }
  return active;
}

export async function setTodoStatus(path, id, status) {
  if (!['open', 'done', 'dismissed'].includes(status)) throw new Error('无效待办状态');
  const projectPath = resolve(path);
  const data = await getProjectTodos(projectPath);
  const todo = data.todos.find(item => item.id === id);
  if (!todo) throw new Error('找不到待办');
  todo.status = status;
  if (status !== 'open') todo.activeSessionId = undefined;
  return save(projectPath, data);
}
