import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { LOCAL_DATA_DIR, scanProject } from './scanner.mjs';

const fileFor = projectPath => join(LOCAL_DATA_DIR, `${createHash('sha256').update(resolve(projectPath).toLowerCase()).digest('hex')}.json`);
export const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const inflight = new Map();
const progress = new Map();
const failures = new Map();
const mutations = new Map();
async function serialize(path, action) {
  const key = fileFor(path);
  const previous = mutations.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(action);
  mutations.set(key, run);
  try { return await run; } finally { if (mutations.get(key) === run) mutations.delete(key); }
}
async function load(path) {
  try {
    const value = JSON.parse(await readFile(fileFor(path), 'utf8'));
    // Version 5 adds hierarchical feature/version extraction. Earlier results
    // remain a migration source for status, but are not considered current.
    return [3, 4, 5].includes(value?.version) ? value : null;
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, value) {
  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  const filename = fileFor(path);
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...value, version: 5 }, null, 2), { flag: 'wx' });
  await rename(temporary, filename);
  return value;
}
function view(path, cached) {
  const key = fileFor(path);
  const partial = progress.get(key);
  const data = cached ?? { projectPath: path, projectName: path.split(/[\\/]/).at(-1), todos: [], scannedAt: null };
  const previous = new Map(data.todos.map(todo => [todo.id, todo]));
  const verified = partial?.map(todo => ({ ...todo,
    status: previous.get(todo.id)?.status ?? todo.status,
    progress: previous.get(todo.id)?.progress === 'in_progress' ? 'in_progress' : todo.progress,
    activeSessionId: previous.get(todo.id)?.activeSessionId })) ?? [];
  // Old-version results are retained only for state migration, not shown as
  // current tasks until the revised version/feature analysis verifies them.
  const visible = data.version === 5 ? data.todos : data.todos.filter(todo => todo.activeSessionId && todo.status === 'open');
  const todos = partial ? [...verified, ...visible.filter(todo => !partial.some(item => item.id === todo.id))] : [...visible];
  const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
  todos.sort((a, b) => (ranks[a.priority] ?? 4) - (ranks[b.priority] ?? 4));
  return { ...data, todos, refreshing: inflight.has(key), ...(failures.has(key) ? { refreshError: failures.get(key) } : {}) };
}
export async function getProjectTodos(path, options = {}) {
  const projectPath = resolve(path);
  const cached = await load(projectPath);
  const stale = cached?.version !== 5 || !Number.isFinite(Date.parse(cached.scannedAt)) || Date.now() - Date.parse(cached.scannedAt) >= REFRESH_INTERVAL_MS;
  if (stale && !inflight.has(fileFor(projectPath)) && (!failures.has(fileFor(projectPath)) || options.force)) {
    void refreshProjectTodos(projectPath, options).catch(error => failures.set(fileFor(projectPath), error.message));
  }
  return view(projectPath, cached);
}
export async function refreshProjectTodos(path, options = {}) {
  const projectPath = resolve(path);
  const key = fileFor(projectPath);
  if (inflight.has(key)) return inflight.get(key);
  failures.delete(key);
  const run = Promise.resolve().then(async () => {
    const onPartial = async todos => { progress.set(key, todos); };
    const next = await scanProject(projectPath, { ...options, onPartial });
    return serialize(projectPath, async () => {
      const current = await load(projectPath);
      const previous = new Map(current?.todos?.map(todo => [todo.id, todo]) ?? []);
      next.todos = next.todos.map(todo => {
        const prior = previous.get(todo.id);
        return { ...todo, status: prior?.status ?? todo.status,
          progress: prior?.progress === 'in_progress' ? 'in_progress' : todo.progress,
          activeSessionId: prior?.activeSessionId, completion: prior?.completion };
      });
      for (const prior of previous.values()) {
        if (prior.activeSessionId && prior.status === 'open' && !next.todos.some(todo => todo.id === prior.id)) next.todos.push(prior);
      }
      const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
      next.todos.sort((a, b) => (ranks[a.priority] ?? 4) - (ranks[b.priority] ?? 4));
      return save(projectPath, next);
    });
  });
  inflight.set(key, run);
  try { return await run; }
  catch (error) { failures.set(key, error.message); throw error; }
  finally { inflight.delete(key); progress.delete(key); }
}
export async function activateTodo(path, id, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 180) throw new Error('无效会话 ID');
  const projectPath = resolve(path);
  await getProjectTodos(projectPath);
  return serialize(projectPath, async () => {
    const data = await load(projectPath);
    const todo = data?.todos?.find(item => item.id === id && item.status === 'open');
    if (!todo) throw new Error('找不到待办');
    if (todo.activeSessionId && todo.activeSessionId !== sessionId) throw new Error('此待办正在另一个会话中处理');
    todo.activeSessionId = sessionId;
    todo.progress = 'in_progress';
    todo.activatedAt = new Date().toISOString();
    return save(projectPath, data);
  });
}

export async function evaluateTodo(path, id, sessionId, evaluation) {
  const projectPath = resolve(path);
  return serialize(projectPath, async () => {
    const data = await load(projectPath);
    const todo = data?.todos?.find(item => item.id === id && item.activeSessionId === sessionId && item.status === 'open');
    if (!todo) return null;
    todo.completion = { ...evaluation, checkedAt: new Date().toISOString() };
    if (evaluation.result === 'done') { todo.status = 'done'; todo.activeSessionId = undefined; }
    else todo.progress = 'in_progress';
    return save(projectPath, data);
  });
}

export async function getActiveTodosForSession(sessionId) {
  let files;
  try { files = await readdir(LOCAL_DATA_DIR); } catch { return []; }
  const active = [];
  for (const filename of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
    try {
      const data = JSON.parse(await readFile(join(LOCAL_DATA_DIR, filename), 'utf8'));
      if (![3, 4, 5].includes(data.version)) continue;
      for (const todo of data.todos ?? []) if (todo.activeSessionId === sessionId && todo.status === 'open') active.push({ projectPath: data.projectPath, todo });
    } catch {}
  }
  return active;
}

export async function setTodoStatus(path, id, status) {
  if (!['open', 'done', 'dismissed'].includes(status)) throw new Error('无效待办状态');
  const projectPath = resolve(path);
  await getProjectTodos(projectPath);
  return serialize(projectPath, async () => {
    const data = await load(projectPath);
    const todo = data?.todos?.find(item => item.id === id);
    if (!todo) throw new Error('找不到待办');
    todo.status = status;
    if (status !== 'open') todo.activeSessionId = undefined;
    return save(projectPath, data);
  });
}
