import { getProjectTodos, refreshProjectTodos, setTodoStatus } from './store.mjs';
import { createAiClassifier } from './ai.mjs';

export const inject = ['connection', 'llm', 'agentDefaultModel'];
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const errorReply = error => reply({ error: error?.message ?? '项目待办操作失败' }, /不是目录|请选择|无效|找不到/.test(error?.message ?? '') ? 400 : 500);

export function apply(ctx, config = {}) {
  const options = { name: config.name, aliases: config.aliases, classify: createAiClassifier(ctx, config) };
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
        if (request.method === 'POST') return reply(await refreshProjectTodos(body.projectPath, options));
        if (request.method === 'PATCH') {
          if (typeof body.id !== 'string' || body.id.length > 80) return reply({ error: '无效待办 ID' }, 400);
          return reply(await setTodoStatus(body.projectPath, body.id, body.status));
        }
        return reply({ error: '不支持的方法' }, 405);
      } catch (error) { ctx.logger.warn(`project-todo: ${error?.message ?? error}`); return errorReply(error); }
    }
  });
}
