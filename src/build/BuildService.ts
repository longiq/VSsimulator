import * as vscode from 'vscode';
import { findMSBuild } from './MSBuildLocator';

export type BuildTarget = 'Build' | 'Rebuild';

/** Read the configured build configuration (Debug/Release). */
export function getConfiguration(): string {
  return vscode.workspace.getConfiguration('vbsln').get<string>('configuration', 'Debug');
}

function missingMSBuildMessage(): string {
  return (
    'Could not locate MSBuild.exe. Install Visual Studio or the Visual Studio Build Tools ' +
    '(with the MSBuild component), or set "vbsln.msbuildPath" in settings.'
  );
}

/**
 * Build a solution or project with MSBuild and wait for completion.
 *
 * @param targetPath absolute path to a .sln or .vbproj file
 * @param label friendly name used in the task UI
 * @param target Build or Rebuild
 * @returns the process exit code, or undefined if MSBuild was not found
 */
export async function build(
  targetPath: string,
  label: string,
  target: BuildTarget = 'Build'
): Promise<number | undefined> {
  const msbuild = await findMSBuild();
  if (!msbuild) {
    void vscode.window.showErrorMessage(missingMSBuildMessage());
    return undefined;
  }

  const configuration = getConfiguration();
  const execution = new vscode.ShellExecution(
    quote(msbuild),
    [
      quote(targetPath),
      `/t:${target}`,
      `/p:Configuration=${configuration}`,
      '/nologo',
      '/v:minimal',
    ],
    {}
  );

  const task = new vscode.Task(
    { type: 'vbsln', target, targetPath },
    vscode.TaskScope.Workspace,
    `${target} ${label}`,
    'vbsln',
    execution,
    ['$msCompile']
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };

  return runTaskAndWait(task);
}

/** Execute a task and resolve with its exit code once it ends. */
function runTaskAndWait(task: vscode.Task): Promise<number | undefined> {
  return new Promise((resolve) => {
    let started: vscode.TaskExecution | undefined;
    const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.execution === started) {
        disposable.dispose();
        resolve(e.exitCode);
      }
    });
    void vscode.tasks.executeTask(task).then(
      (execution) => {
        started = execution;
      },
      (err) => {
        disposable.dispose();
        void vscode.window.showErrorMessage(
          `Failed to start build: ${err instanceof Error ? err.message : String(err)}`
        );
        resolve(undefined);
      }
    );
  });
}

/** Wrap a path/value in double quotes so spaces survive the shell. */
function quote(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}
