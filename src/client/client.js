window.__ModuleLoader__.load({
  id: '@local/project-todo',
  factory(require) {
    const React = require('react');
    const { useEffect, useState } = React;
    const h = React.createElement;
    const styleId = '@local/project-todo/client.css';
    const css = `
.project-todo-panel{order:10;box-sizing:border-box;width:min(calc(100% - 32px),var(--dsh-composer-card-max-width,920px));max-height:min(280px,38vh);margin:10px auto 0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#dedee2);border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-module-platform,#fff));color:var(--dsw-alias-label-primary,#24242a);box-shadow:var(--dsw-elevation-panel,0 4px 18px #00000012);font:inherit}
.project-todo-header{display:flex;align-items:center;gap:9px;min-height:42px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l3,#eeeeef);font-size:13px}.project-todo-heading{font-weight:650;letter-spacing:.01em;white-space:nowrap}.project-todo-identity{max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#62636b);font-size:12px}.project-todo-count{margin-left:auto;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#777984);font-size:12px}.project-todo-refresh{cursor:pointer;border:0;border-radius:7px;padding:5px 8px;background:transparent;color:var(--dsw-alias-label-secondary,#62636b);font:inherit;font-size:12px}.project-todo-refresh:hover,.project-todo-refresh:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f2f2f4);outline:none}.project-todo-refresh:disabled{opacity:.55;cursor:default}.project-todo-list{list-style:none;margin:0;padding:6px 7px 8px;max-height:226px;overflow-y:auto}.project-todo-list li{margin:0}.project-todo-item{position:relative;width:100%;display:flex;align-items:flex-start;gap:10px;cursor:pointer;border:1px solid transparent;border-radius:9px;padding:9px 8px;text-align:left;background:transparent;color:inherit;font:inherit;transition:background .15s,border-color .15s}.project-todo-item:hover,.project-todo-item:focus-visible{border-color:var(--dsw-alias-border-l2,#dedee2);background:var(--dsw-alias-interactive-bg-hover,#f2f2f4);outline:none}.project-todo-item.is-active{border-color:var(--dsw-alias-brand-normal,#5279ff);background:color-mix(in srgb,var(--dsw-alias-brand-normal,#5279ff) 8%,transparent)}.project-todo-item:disabled{cursor:wait;opacity:.72}.project-todo-dot{flex:none;width:7px;height:7px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8d8d95)}.project-todo-dot.is-progress{background:var(--dsw-alias-brand-normal,#5279ff);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-normal,#5279ff) 14%,transparent)}.project-todo-text{display:flex;flex:1;flex-direction:column;gap:4px;min-width:0;font-size:13px}.project-todo-title{display:flex;align-items:center;gap:7px;min-width:0}.project-todo-text strong{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:550}.project-todo-summary{overflow:hidden;color:var(--dsw-alias-label-secondary,#62636b);font-size:11px;line-height:1.35;white-space:nowrap;text-overflow:ellipsis}.project-todo-evidence{overflow:hidden;color:var(--dsw-alias-label-tertiary,#777984);font-size:11px;line-height:1.3;white-space:nowrap;text-overflow:ellipsis}.project-todo-badge{flex:none;border-radius:999px;padding:2px 6px;background:var(--dsw-alias-fill-l3,#f1f1f3);color:var(--dsw-alias-label-secondary,#62636b);font-size:10px;line-height:1.3;white-space:nowrap}.project-todo-badge.is-progress{background:color-mix(in srgb,var(--dsw-alias-brand-normal,#5279ff) 13%,transparent);color:var(--dsw-alias-brand-normal,#4167db)}.project-todo-arrow{flex:none;margin-top:3px;color:var(--dsw-alias-label-tertiary,#777984)}.project-todo-state,.project-todo-error{margin:0;padding:12px 14px 14px;color:var(--dsw-alias-label-tertiary,#777984);font-size:12px}.project-todo-error{color:#b33d3d}.project-todo-error button{border:0;cursor:pointer;background:none;color:inherit;text-decoration:underline;font:inherit}@media(max-width:560px){.project-todo-panel{width:calc(100% - 20px);max-height:42vh}.project-todo-header{padding-inline:11px}.project-todo-identity{display:none}.project-todo-list{max-height:34vh}.project-todo-title{gap:5px}.project-todo-badge{font-size:9px}.project-todo-summary,.project-todo-evidence{max-width:60vw}}
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

    function evidenceText(evidence) {
      if (Array.isArray(evidence)) return evidence.filter(Boolean).join(' · ');
      return evidence || '';
    }

    function ProjectTodoPanel({ projectPath, sessionId, onChoose, fetchImpl = fetch }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [refreshing, setRefreshing] = useState(false);
      const [activating, setActivating] = useState('');
      const [activeId, setActiveId] = useState('');
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
      const pending = todos.filter(todo => todo.status === 'open' || (!todo.status && todo.status !== 'done' && todo.status !== 'dismissed' && todo.status !== 'completed'));
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
        setActivating(todo.id); setActiveId(''); setError('');
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
        h('header', { className: 'project-todo-header' },
          h('span', { className: 'project-todo-heading' }, '项目待办'),
          data?.identity?.name && h('span', { className: 'project-todo-identity', title: data.identity.name }, data.identity.name),
          h('span', { className: 'project-todo-count' }, pending.length + ' 项待处理'),
          h('button', { type: 'button', className: 'project-todo-refresh', onClick: refresh, disabled: refreshing || !!activating, 'aria-label': '刷新项目待办' }, refreshing ? '刷新中…' : '刷新')),
        error && h('p', { className: 'project-todo-error', role: 'alert' }, error, ' ', h('button', { type: 'button', onClick: () => setVersion(v => v + 1) }, '重试')),
        loading && !data && h('p', { className: 'project-todo-state', role: 'status' }, '正在加载项目待办…'),
        !loading && !error && pending.length === 0 && h('p', { className: 'project-todo-state' }, '暂无待处理项目待办'),
        pending.length > 0 && h('ul', { className: 'project-todo-list' }, pending.map(todo => {
          const inProgress = todo.progress === 'in_progress';
          const evidence = evidenceText(todo.evidence);
          return h('li', { key: todo.id },
            h('button', { type: 'button', className: 'project-todo-item' + (activeId === todo.id ? ' is-active' : ''), title: todo.summary || todo.title, onClick: () => chooseTodo(todo), disabled: !!activating },
              h('span', { className: 'project-todo-dot' + (inProgress ? ' is-progress' : ''), 'aria-hidden': true }),
              h('span', { className: 'project-todo-text' },
                h('span', { className: 'project-todo-title' }, h('strong', null, todo.title || '未命名待办'), h('span', { className: 'project-todo-badge' + (inProgress ? ' is-progress' : '') }, inProgress ? '进行中' : '未开始')),
                todo.summary && h('span', { className: 'project-todo-summary' }, todo.summary),
                evidence && h('span', { className: 'project-todo-evidence' }, '依据：' + evidence)),
              h('span', { className: 'project-todo-arrow', 'aria-hidden': true }, activating === todo.id ? '…' : '↗')));
        })));
    }
    function ProjectTodoDock({ sessionId, useWorkspaces, useSessions, onChoose }) {
      const workspaces = useWorkspaces(value => value);
      const session = useSessions(value => value.byId?.[sessionId]);
      const workspace = workspaces?.items?.find(item => item.sessionIds?.includes(sessionId));
      // DSH marks a newly created, not-yet-started conversation as blank.
      // Unmount on the first submitted turn; never show the list in existing chats.
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
