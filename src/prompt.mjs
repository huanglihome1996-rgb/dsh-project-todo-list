export function buildTodoPrompt(todo, project = {}) {
  const source = todo.source ?? '项目文档';
  const branch = project.branch ? `当前 Git 分支：${project.branch}。先检查是否为此任务合适的分支；若不是，先向我提出分支方案并确认，不要自行切换到会影响其他工作的分支。` : '先检查当前 Git 分支和未提交改动，确定合适的工作分支；若分支策略不明确，先向我确认，不要自行覆盖他人工作。';
  const progress = todo.progress === 'in_progress' ? '进行中：先盘点已完成的部分和剩余工作，避免重复劳动。' : '未开始：先确认前置条件和验收标准。';
  return `请继续处理我在此项目中的待办：${todo.title}\n\n来源：${source}\n归属依据：${todo.ownerEvidence}\n下一步依据：${todo.actionEvidence}\n状态：${progress}\n${branch}\n\n请按以下步骤执行：\n1. 阅读来源文档、相关 Issue、项目规范和现有实现，核实任务范围与当前状态；给出可执行计划和验收标准。\n2. 在正确分支上完成必要的代码或文档变更，遵循现有架构，避免无关修改；运行相关测试、静态检查并修复问题。\n3. 完成后更新对应的需求/设计/计划/README/Issue 等项目文档中的任务进度与实现说明；若需操作远端 Issue 或提交/推送，请先确认授权与具体范围。\n4. 总结改动、测试结果、未解决事项，并明确说明待办是否真正完成；只有满足验收标准才建议标记完成。\n\n遇到阻塞、冲突、需求不清、存在多种会影响范围或安全性的方案时，不要擅自决定或绕过限制；列出事实、可选方案和推荐理由，先问我再继续。`;
}
