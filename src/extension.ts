import * as vscode from 'vscode';
import { SolutionTreeProvider } from './tree/SolutionTreeProvider';
import { ProjectNode, SolutionNode, TreeNode } from './tree/nodes';
import { VbProject } from './solution/VbprojParser';
import { build } from './build/BuildService';
import { clearMSBuildCache } from './build/MSBuildLocator';
import { run } from './run/RunService';
import { debug } from './debug/DebugService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const initialSln = await findWorkspaceSolution();
  const provider = new SolutionTreeProvider(initialSln);

  const treeView = vscode.window.createTreeView('vbSolutionExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('vbsln.openSolution', () => openSolution(provider)),
    vscode.commands.registerCommand('vbsln.refresh', () => provider.reload()),

    vscode.commands.registerCommand('vbsln.build', async (node?: TreeNode) => {
      const solution = resolveSolution(provider, node);
      if (solution) {
        await build(solution.path, solution.name, 'Build');
      }
    }),
    vscode.commands.registerCommand('vbsln.rebuild', async (node?: TreeNode) => {
      const solution = resolveSolution(provider, node);
      if (solution) {
        await build(solution.path, solution.name, 'Rebuild');
      }
    }),
    vscode.commands.registerCommand('vbsln.buildProject', async (node?: TreeNode) => {
      const project = await resolveProject(provider, node);
      if (project) {
        await build(project.path, project.name, 'Build');
      }
    }),
    vscode.commands.registerCommand('vbsln.run', async (node?: TreeNode) => {
      const project = await resolveProject(provider, node);
      if (project) {
        await run(project);
      }
    }),
    vscode.commands.registerCommand('vbsln.debug', async (node?: TreeNode) => {
      const project = await resolveProject(provider, node);
      if (project) {
        await debug(project);
      }
    }),
    vscode.commands.registerCommand('vbsln.openFile', (uri: vscode.Uri) => {
      void vscode.window.showTextDocument(uri);
    })
  );

  // Re-detect MSBuild when its setting changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('vbsln.msbuildPath')) {
        clearMSBuildCache();
      }
    })
  );

  // Reload the tree when .sln or .vbproj files change on disk.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{sln,vbproj}');
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(() => provider.reload()),
    watcher.onDidCreate(() => provider.reload()),
    watcher.onDidDelete(() => provider.reload())
  );
}

export function deactivate(): void {
  // Nothing to clean up; subscriptions are disposed by VS Code.
}

/** Find the first .sln file in the workspace, prompting if several exist. */
async function findWorkspaceSolution(): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles('**/*.sln', '**/node_modules/**', 50);
  if (files.length === 0) {
    return undefined;
  }
  if (files.length === 1) {
    return files[0].fsPath;
  }
  // Multiple solutions: pick the shallowest path by default.
  files.sort((a, b) => a.fsPath.split(/[\\/]/).length - b.fsPath.split(/[\\/]/).length);
  return files[0].fsPath;
}

/** Let the user pick / browse for a .sln file and load it. */
async function openSolution(provider: SolutionTreeProvider): Promise<void> {
  const found = await vscode.workspace.findFiles('**/*.sln', '**/node_modules/**', 50);
  const items: vscode.QuickPickItem[] = found.map((f) => ({
    label: vscode.workspace.asRelativePath(f),
    description: f.fsPath,
  }));
  const browse: vscode.QuickPickItem = { label: '$(folder-opened) Browse...', description: '' };
  const picked = await vscode.window.showQuickPick([browse, ...items], {
    placeHolder: 'Select a solution (.sln) to open',
  });
  if (!picked) {
    return;
  }
  if (picked === browse) {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Solution files': ['sln'] },
    });
    if (uris && uris.length > 0) {
      provider.setSolution(uris[0].fsPath);
    }
    return;
  }
  provider.setSolution(picked.description);
}

/** Resolve the solution path from a node arg or the loaded solution. */
function resolveSolution(
  provider: SolutionTreeProvider,
  node?: TreeNode
): { path: string; name: string } | undefined {
  if (node instanceof SolutionNode) {
    return { path: node.solution.path, name: node.solution.name };
  }
  const current = provider.getCurrentSolution();
  if (!current) {
    void vscode.window.showWarningMessage('No solution is currently open.');
    return undefined;
  }
  return { path: current.path, name: current.name };
}

/** Resolve a project from a node arg, or prompt the user to pick one. */
async function resolveProject(
  provider: SolutionTreeProvider,
  node?: TreeNode
): Promise<VbProject | undefined> {
  if (node instanceof ProjectNode) {
    return node.project;
  }
  const projects = provider.getProjects();
  if (projects.length === 0) {
    void vscode.window.showWarningMessage('No VB.NET projects are loaded.');
    return undefined;
  }
  if (projects.length === 1) {
    return projects[0];
  }
  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({ label: p.name, description: p.outputType, project: p })),
    { placeHolder: 'Select a project' }
  );
  return picked?.project;
}
