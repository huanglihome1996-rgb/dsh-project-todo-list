window.__ModuleLoader__.load({
  id: '@local/project-todo',
  factory(require) {
    const React = require('react');
    const { useEffect, useState } = React;
    const h = React.createElement;
    const styleId = '@local/project-todo/client.css';
    const css = `
.project-todo-panel{order:10;box-sizing:border-box;width:min(calc(100% - 32px),var(--dsh-composer-card-max-width,920px));max-height:min(250px,35vh);margin:8px auto 0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#dedee2);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-module-platform,#fff));color:var(--dsw-alias-label-primary,#24242a);box-shadow:var(--dsw-elevation-panel,0 3px 14px #00000012);font:inherit}
.project-todo-header{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:13px}.project-todo-heading{font-weight:600;white-space:nowrap}.project-todo-identity{color:var(--dsw-alias-label-secondary,#62636b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-todo-count{margin-left:auto;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#777984)}.project-todo-refresh{cursor:pointer;border:0;border-radius:6px;padding:4px 7px;background:transparent;color:var(--dsw-alias-label-secondary,#62636b)}.project-todo-refresh:hover,.project-todo-refresh:focus-visible,.project-todo-item:hover,.project-todo-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f2f2f4)}.project-todo-refresh:disabled{opacity:.55;cursor:default}.project-todo-list{list-style:none;margin:0;padding:0 7px 7px;max-height:193px;overflow-y:auto}.project-todo-list li{margin:0}.project-todo-item{width:100%;display:flex;align-items:center;gap:10px;cursor:pointer;border:0;border-radius:7px;padding:7px;text-align:left;background:transparent;color:inherit;font:inherit}.project-todo-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8d8d95)}.project-todo-text{display:flex;flex:1;flex-direction:column;gap:2px;min-width:0;font-size:13px}.project-todo-text strong,.project-todo-text small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.project-todo-text strong{font-weight:500}.project-todo-text small{color:var(--dsw-alias-label-tertiary,#777984);font-size:11px}.project-todo-arrow{color:var(--dsw-alias-label-tertiary,#777984)}.project-todo-state,.project-todo-error{margin:0;padding:3px 14px 12px;color:var(--dsw-alias-label-tertiary,#777984);font-size:12px}.project-todo-error{color:#b33d3d}.project-todo-error button{border:0;cursor:pointer;background:none;color:inherit;text-decoration:underline}`;
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

    function ProjectTodoPanel({ projectPath, onChoose, fetchImpl = fetch }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [refreshing, setRefreshing] = useState(false);
      const [version, setVersion] = useState(0);
      useEffect(() => {
        if (!projectPath) { setData(null); setError(''); return; }
        const controller = new AbortController();
        setData(null); setLoading(true); setError('');
        fetchImpl('/api/project-todo?projectPath=' + encodeURIComponent(projectPath), { signal: controller.signal })
          .then(async response => {
            if (!response.ok) throw new Error('Unable to load project todos (' + response.status + ')');
            return response.json();
          })
          .then(result => { if (!controller.signal.aborted) setData(result); })
          .catch(cause => { if (!controller.signal.aborted) setError(cause.message || 'Unable to load project todos'); })
          .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
      }, [projectPath, version, fetchImpl]);
      if (!projectPath) return null;
      const todos = Array.isArray(data?.todos) ? data.todos : [];
      const pending = todos.filter(todo => todo.status !== 'done' && todo.status !== 'dismissed' && todo.status !== 'completed');
      async function refresh() {
        setRefreshing(true); setError('');
        try {
          const response = await fetchImpl('/api/project-todo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectPath }),
          });
          if (!response.ok) throw new Error('Unable to refresh project todos (' + response.status + ')');
          setData(await response.json());
        } catch (cause) { setError(cause.message || 'Unable to refresh project todos'); }
        finally { setRefreshing(false); }
      }
      return h('section', { className: 'project-todo-panel', 'aria-label': 'Project todos', 'data-project-todo': '' },
        h(ProjectTodoStyle),
        h('header', { className: 'project-todo-header' },
          h('span', { className: 'project-todo-heading' }, 'Project todos'),
          data?.identity?.name && h('span', { className: 'project-todo-identity', title: data.identity.name }, data.identity.name),
          h('span', { className: 'project-todo-count' }, pending.length + ' remaining'),
          h('button', { type: 'button', className: 'project-todo-refresh', onClick: refresh, disabled: refreshing, 'aria-label': 'Refresh project todos' }, refreshing ? 'Refreshing…' : 'Refresh')),
        error && h('p', { className: 'project-todo-error', role: 'alert' }, error, ' ', h('button', { type: 'button', onClick: () => setVersion(v => v + 1) }, 'Retry')),
        loading && !data && h('p', { className: 'project-todo-state', role: 'status' }, 'Loading project todos…'),
        !loading && !error && pending.length === 0 && h('p', { className: 'project-todo-state' }, 'No open project todos found.'),
        pending.length > 0 && h('ul', { className: 'project-todo-list' }, pending.map(todo => h('li', { key: todo.id },
          h('button', { type: 'button', className: 'project-todo-item', title: todo.summary || todo.title, onClick: () => onChoose(todo.recommendedPrompt || todo.title) },
            h('span', { className: 'project-todo-dot', 'aria-hidden': true }),
            h('span', { className: 'project-todo-text' }, h('strong', null, todo.title), todo.summary && h('small', null, todo.summary)),
            h('span', { className: 'project-todo-arrow', 'aria-hidden': true }, '↗'))))));
    }
    function ProjectTodoDock({ sessionId, useWorkspaces, useSessions, onChoose }) {
      const workspaces = useWorkspaces(value => value);
      const session = useSessions(value => value.byId?.[sessionId]);
      const workspace = workspaces?.items?.find(item => item.sessionIds?.includes(sessionId));
      // DSH marks a newly created, not-yet-started conversation as blank.
      // Unmount on the first submitted turn; never show the list in existing chats.
      if (session?.blank !== true) return null;
      return h(ProjectTodoPanel, { projectPath: workspace?.path || session.cwd, onChoose });
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
