import { activateTodo, evaluateTodo, getActiveTodosForSession, getProjectTodos, refreshProjectTodos, setTodoStatus } from './store.mjs';
import { createAiClassifier } from './ai.mjs';
import { judgeCompletion } from './completion.mjs';
import { resolve } from 'node:path';

export const inject = ['connection', 'llm', 'agentDefaultModel', 'sessions'];
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const errorReply = error => reply({ error: error?.message ?? '项目待办操作失败' }, /不是目录|请选择|无效|找不到/.test(error?.message ?? '') ? 400 : 500);

export function apply(ctx, config = {}) {
  const options = { name: config.name, aliases: config.aliases, classify: createAiClassifier(ctx, config) };
  const evaluating = new Set();
  const pending = new Set();
  async function inspectSession(session) {
    if (evaluating.has(session.id)) { pending.add(session.id); return; }
    evaluating.add(session.id);
    try {
      const active = await getActiveTodosForSession(session.id);
      if (!active.length) return;
      const recent = session.deriveMessages().slice(-12).map(message => ({
        role: message.role,
        text: (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(' ').slice(0, 3500)
      })).filter(message => (message.role === 'user' || message.role === 'assistant') && message.text);
      for (const { projectPath, todo } of active) {
        const result = await judgeCompletion(ctx, todo, recent, config);
        await evaluateTodo(projectPath, todo.id, session.id, result);
      }
    } catch (error) { ctx.logger.warn(`project-todo completion: ${error?.message ?? error}`); }
    finally {
      evaluating.delete(session.id);
      if (pending.delete(session.id)) void inspectSession(session);
    }
  }
  ctx.on('session/event', (session, event) => {
    // Each turn/end closes one response, not necessarily the entire conversation.
    // Only a normally completed turn can establish task completion; blocked/error turns remain open.
    if (event.type === 'turn/end' && (event.data?.reason === 'completed' || event.data?.reason?.kind === 'completed')) void inspectSession(session);
  });
  ctx.connection.fetch.register({
    path: '/api/project-todo/activate', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const body = await request.json();
        if (typeof body?.projectPath !== 'string' || typeof body?.id !== 'string' || typeof body?.sessionId !== 'string') return reply({ error: '待办或会话参数无效' }, 400);
        const session = ctx.sessions.get(body.sessionId);
        if (!session || typeof session.header?.cwd !== 'string' || resolve(session.header.cwd).toLowerCase() !== resolve(body.projectPath).toLowerCase()) return reply({ error: '会话与项目不匹配' }, 400);
        return reply(await activateTodo(body.projectPath, body.id, body.sessionId));
      } catch (error) { return errorReply(error); }
    }
  });
  ctx.connection.fetch.register({
    path: '/api/project-todo', methods: ['GET', 'POST', 'PATCH'], requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.method === 'GET') {
          const path = new URL(request.url).searchParams.get('projectPath');
          if (!path) return reply({ error: '缺少 projectPath' }, 400);
          return reply(await getProjectTodos(path, options));
        }
        const body = await request.json();
        if (typeof body?.projectPath !== 'string' || !body.projectPath.trim()) return reply({ error: '缺少 projectPath' }, 400);
        if (request.method === 'POST') {
          void refreshProjectTodos(body.projectPath, options).catch(error => ctx.logger.warn(`project-todo refresh: ${error?.message ?? error}`));
          return reply(await getProjectTodos(body.projectPath, options));
        }
        if (request.method === 'PATCH') {
          if (typeof body.id !== 'string' || body.id.length > 80) return reply({ error: '无效待办 ID' }, 400);
          return reply(await setTodoStatus(body.projectPath, body.id, body.status));
        }
        return reply({ error: '不支持的方法' }, 405);
      } catch (error) { ctx.logger.warn(`project-todo: ${error?.message ?? error}`); return errorReply(error); }
    }
  });
}
