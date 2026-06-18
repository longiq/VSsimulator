import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Solution } from '../solution/SolutionParser';
import { computeRootFolders } from './rootFolders';

let output: vscode.OutputChannel | undefined;
function log(message: string): void {
  if (!output) {
    output = vscode.window.createOutputChannel('VB Solution');
  }
  output.appendLine(`[workspace] ${message}`);
}

/**
 * Ensure the directories that make up a solution are part of the VS Code
 * workspace, so that AI assistants (Copilot/Codex/Claude), search and
 * go-to-definition can see the whole codebase.
 *
 * The extension only parses the solution in memory, so a `.sln` opened from
 * outside the current folder is invisible to anything that indexes via
 * `vscode.workspace.workspaceFolders`. To fix that we build a multi-root
 * `.code-workspace` (kept in the extension's global storage so it never litters
 * the user's project) and open it. This only happens when the current window
 * does not already cover every needed directory, which both avoids needless
 * reloads and prevents an infinite reopen loop.
 */
export async function ensureSolutionWorkspace(
  context: vscode.ExtensionContext,
  solution: Solution
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('vbsln')
    .get<boolean>('addSolutionToWorkspace', true);
  if (!enabled) {
    return;
  }

  const dirs = computeRootFolders(solution);
  if (dirs.length === 0) {
    return;
  }

  if (currentWorkspaceCovers(dirs)) {
    log(`Workspace already covers ${solution.name}; nothing to do.`);
    return;
  }

  const workspaceUri = generateWorkspaceFile(context, solution, dirs);

  // Already running inside the workspace we just (re)generated – stop here so we
  // never reload in a loop.
  if (vscode.workspace.workspaceFile?.fsPath === workspaceUri.fsPath) {
    return;
  }

  log(`Opening multi-root workspace for ${solution.name}: ${workspaceUri.fsPath}`);
  await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
    forceReuseWindow: true,
  });
}

/** True when every directory is already inside an open workspace folder. */
function currentWorkspaceCovers(dirs: string[]): boolean {
  return dirs.every((dir) => vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir)) !== undefined);
}

/**
 * Write (or overwrite) a deterministic `.code-workspace` file for this solution
 * in the extension's global storage and return its URI. The file name is keyed
 * by the solution path so reopening the same solution reuses the same workspace.
 */
function generateWorkspaceFile(
  context: vscode.ExtensionContext,
  solution: Solution,
  dirs: string[]
): vscode.Uri {
  const storageDir = path.join(context.globalStorageUri.fsPath, 'workspaces');
  fs.mkdirSync(storageDir, { recursive: true });

  const hash = crypto.createHash('sha1').update(solution.path).digest('hex').slice(0, 8);
  const fileName = `${sanitize(solution.name)}-${hash}.code-workspace`;
  const filePath = path.join(storageDir, fileName);

  const solutionDir = path.dirname(solution.path);
  const folders = dirs.map((dir) => ({
    path: dir,
    name: dir === solutionDir ? solution.name : labelFor(solution, dir),
  }));

  const contents = {
    folders,
    settings: {},
  };
  fs.writeFileSync(filePath, JSON.stringify(contents, null, 2), 'utf8');
  return vscode.Uri.file(filePath);
}

/** Friendly label for a folder: the project name when it maps to one. */
function labelFor(solution: Solution, dir: string): string {
  const project = solution.projects.find((p) => path.dirname(p.absolutePath) === dir);
  return project?.name ?? path.basename(dir);
}

/** Strip characters that are awkward in file names. */
function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, '_');
}
