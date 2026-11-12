window.__ModuleLoader__.load({
  id: '@local/project-todo',
  factory(require) {
    const React = require('react');
    const { useEffect, useState } = React;
    const h = React.createElement;
    const styleId = '@local/project-todo/client.css';
    const css = `
.project-todo-panel{order:10;box-sizing:border-box;flex:0 0 auto!important;align-self:center;width:min(calc(100% - 32px),var(--dsh-composer-card-max-width,920px));min-height:50px;margin:10px auto 0;overflow:visible;border:1px solid var(--dsw-alias-border-l2,#e4e8f0);border-radius:12px;background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary,#252b38);font:inherit}
.project-todo-head{box-sizing:border-box;display:flex;align-items:center;gap:11px;min-height:49px;padding:9px 16px;background:var(--dsw-alias-bg-module-platform,#fff);border-radius:12px}.project-todo-heading{font-size:13px;font-weight:650;white-space:nowrap}.project-todo-count{border-radius:12px;padding:3px 10px;background:color-mix(in srgb,var(--dsw-alias-brand-normal,#6483d9) 10%,transparent);color:var(--dsw-alias-brand-normal,#526fc2);font-size:11px;white-space:nowrap}.project-todo-spacer{flex:1}.project-todo-control{border:0;background:none;color:var(--dsw-alias-label-secondary,#66758c);cursor:pointer;font:inherit;font-size:12px;padding:6px 8px;border-radius:7px;white-space:nowrap}.project-todo-control:hover,.project-todo-control:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f0f2f7);outline:none}.project-todo-control:disabled{opacity:.5;cursor:default}.project-todo-body{padding:13px 16px 14px;border-top:1px solid var(--dsw-alias-border-l3,#e9ecf1)}.project-todo-hint{margin:0 0 7px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8994a6)}.project-todo-list{margin:0;padding:0;list-style:none;max-height:min(255px,38vh);overflow-y:auto}.project-todo-list li+li{margin-top:6px}.project-todo-item{box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;min-height:66px;padding:10px 13px;border:1px solid var(--dsw-alias-border-l3,#e8ebf0);border-radius:10px;background:var(--dsw-alias-bg-module-platform,#fff);color:inherit;text-align:left;cursor:pointer;font:inherit}.project-todo-item:hover,.project-todo-item:focus-visible{border-color:var(--dsw-alias-brand-normal,#6483d9);background:var(--dsw-alias-interactive-bg-hover,#f6f8fc);outline:none}.project-todo-item.is-active{border-color:var(--dsw-alias-brand-normal,#6483d9)}.project-todo-item:disabled{opacity:.65;cursor:wait}.project-todo-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#9ca8ba)}.project-todo-dot.is-progress{background:var(--dsw-alias-brand-normal,#6483d9)}.project-todo-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.project-todo-text strong{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.project-todo-summary{font-size:11px;color:var(--dsw-alias-label-tertiary,#8490a2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.project-todo-badge{flex:none;padding:4px 10px;border-radius:14px;background:var(--dsw-alias-bg-base,#f1f3f6);font-size:11px;color:var(--dsw-alias-label-secondary,#67758a)}.project-todo-badge.is-progress{color:var(--dsw-alias-brand-normal,#526fc2);background:color-mix(in srgb,var(--dsw-alias-brand-normal,#6483d9) 12%,transparent)}.project-todo-arrow{flex:none;font-size:16px;color:var(--dsw-alias-label-tertiary,#8590a2)}.project-todo-footer{margin:10px 1px 0;color:var(--dsw-alias-label-tertiary,#8490a2);font-size:11px}.project-todo-state,.project-todo-error{margin:0;padding:10px 16px 13px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8590a2)}.project-todo-error{color:var(--dsw-alias-status-danger,#bd4040)}.project-todo-error button{border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer}@media(max-width:650px){.project-todo-panel{width:calc(100% - 18px)}.project-todo-head{padding-inline:10px;gap:5px}.project-todo-body{padding:10px}.project-todo-item{padding:8px}.project-todo-badge{padding:3px 6px}}
`;
    function ProjectTodoStyle() {
      useEffect(() => {
        if (document.querySelector('style[data-plugin-css="' + styleId + '"]')) return;
        const style = document.createElement('style');
        style.dataset.pluginCss = styleId;
        style.textContent = css;
        document.head.appendChild(style);
        return () => style.remove();
      }, []);
      return null;
    }
    function ProjectTodoPanel({ projectPath, sessionId, onChoose, fetchImpl = fetch }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [refreshing, setRefreshing] = useState(false);
      const [activating, setActivating] = useState('');
      const [activeId, setActiveId] = useState('');
      const [expanded, setExpanded] = useState(false);
      const [version, setVersion] = useState(0);
      useEffect(() => {
        if (!projectPath) { setData(null); setError(''); return; }
        const controller = new AbortController();
        setData(null); setLoading(true); setError('');
        fetchImpl('/api/project-todo?projectPath=' + encodeURIComponent(projectPath), { signal: controller.signal })
          .then(async response => {
            if (!response.ok) throw new Error('无法加载项目待办（' + response.status + '）');
            return response.json();
          })
          .then(result => { if (!controller.signal.aborted) setData(result); })
          .catch(cause => { if (!controller.signal.aborted) setError(cause.message || '无法加载项目待办'); })
          .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
      }, [projectPath, version, fetchImpl]);
      if (!projectPath) return null;
      const todos = Array.isArray(data?.todos) ? data.todos : [];
      const pending = todos.filter(todo => !['done', 'dismissed', 'completed'].includes(todo.status));
      const visible = expanded ? pending : pending.slice(0, 1);
      async function refresh() {
        setRefreshing(true); setError('');
        try {
          const response = await fetchImpl('/api/project-todo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectPath }),
          });
          if (!response.ok) throw new Error('刷新项目待办失败（' + response.status + '）');
          setData(await response.json());
        } catch (cause) { setError(cause.message || '刷新项目待办失败'); }
        finally { setRefreshing(false); }
      }
      async function chooseTodo(todo) {
        if (activating) return;
        setActivating(todo.id); setError('');
        try {
          const response = await fetchImpl('/api/project-todo/activate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath, id: todo.id, sessionId }),
          });
          if (!response.ok) throw new Error('激活待办失败（' + response.status + '）');
          setActiveId(todo.id);
          onChoose?.(todo.recommendedPrompt || todo.title);
        } catch (cause) { setError(cause.message || '激活待办失败，请稍后重试'); }
        finally { setActivating(''); }
      }
      return h('section', { className: 'project-todo-panel', 'aria-label': '项目待办', 'data-project-todo': '' },
        h(ProjectTodoStyle),
        h('header', { className: 'project-todo-head' },
          h('span', { className: 'project-todo-heading' }, '◉  项目待办'),
          h('span', { className: 'project-todo-count' }, pending.length + ' 项待办'),
          h('span', { className: 'project-todo-spacer' }),
          pending.length > 1 && h('button', { type: 'button', className: 'project-todo-control', 'aria-expanded': expanded, onClick: () => setExpanded(value => !value) }, expanded ? '收起待办  ▴' : '查看待办  ▾'),
          h('button', { type: 'button', className: 'project-todo-control', onClick: refresh, disabled: refreshing || !!activating, 'aria-label': '刷新项目待办' }, refreshing ? '刷新中…' : '⟳')),
        error && h('p', { className: 'project-todo-error', role: 'alert' }, error, ' ', h('button', { type: 'button', onClick: () => setVersion(v => v + 1) }, '重试')),
        loading && !data && h('p', { className: 'project-todo-state', role: 'status' }, '正在加载项目待办…'),
        !loading && !error && pending.length === 0 && h('p', { className: 'project-todo-state' }, '暂无待处理项目待办'),
        pending.length > 0 && h('div', { className: 'project-todo-body' },
          h('p', { className: 'project-todo-hint' }, expanded ? '我的下一步待办' : '推荐先处理'),
          h('ul', { className: 'project-todo-list' }, visible.map(todo => {
            const inProgress = todo.progress === 'in_progress';
            return h('li', { key: todo.id }, h('button', {
              type: 'button', className: 'project-todo-item' + (activeId === todo.id ? ' is-active' : ''),
              title: todo.summary || todo.title, onClick: () => chooseTodo(todo), disabled: !!activating
            },
            h('span', { className: 'project-todo-dot' + (inProgress ? ' is-progress' : ''), 'aria-hidden': true }),
            h('span', { className: 'project-todo-text' },
              h('strong', null, todo.title || '未命名待办'),
              h('span', { className: 'project-todo-summary' }, (todo.source || todo.summary || '项目待办') + ' · 点击填入详细任务描述')),
            h('span', { className: 'project-todo-badge' + (inProgress ? ' is-progress' : '') }, inProgress ? '进行中' : '未开始'),
            h('span', { className: 'project-todo-arrow', 'aria-hidden': true }, activating === todo.id ? '…' : '↗')));
          })),
          h('p', { className: 'project-todo-footer' }, expanded ? '点击待办仅填入会话框，不会自动发送' : pending.length > 1 ? '展开后可查看其余 ' + (pending.length - 1) + ' 项 · 点击任务仅填入会话框，不会发送' : '点击任务仅填入会话框，不会自动发送')));
    }
    function ProjectTodoDock({ sessionId, useWorkspaces, useSessions, onChoose }) {
      const workspaces = useWorkspaces(value => value);
      const session = useSessions(value => value.byId?.[sessionId]);
      const workspace = workspaces?.items?.find(item => item.sessionIds?.includes(sessionId));
      if (session?.blank !== true) return null;
      return h(ProjectTodoPanel, { projectPath: workspace?.path || session.cwd, sessionId, onChoose });
    }
    const inject = ['slots', 'sessions', 'workspaces', 'conversation'];
    function apply(ctx) {
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock', id: 'project-todo', order: 30,
        inject: sessionId => ({ sessionId, onChoose: prompt => {
          const scope = ctx.sessions.scope(sessionId);
          const input = scope?.get('conversation')?.input.for(scope);
          input?.actions.setDraft(prompt);
          input?.focus();
        } }),
      }, ProjectTodoDock));
    }
    return { inject, apply };
  },
});
