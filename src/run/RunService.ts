import * as vscode from 'vscode';
import * as fs from 'fs';
import { VbProject } from '../solution/VbprojParser';
import { build, getConfiguration } from '../build/BuildService';
import { getOutputDir, getOutputExe } from '../build/output';

/** Build (if needed) and run a project's executable in an integrated terminal. */
export async function run(project: VbProject): Promise<void> {
  if (!project.isExecutable) {
    void vscode.window.showWarningMessage(
      `Project '${project.name}' is a ${project.outputType} and cannot be run directly.`
    );
    return;
  }

  const exitCode = await build(project.path, project.name, 'Build');
  if (exitCode !== 0) {
    if (exitCode !== undefined) {
      void vscode.window.showErrorMessage(`Build failed for '${project.name}'.`);
    }
    return;
  }

  const configuration = getConfiguration();
  const exe = getOutputExe(project, configuration);
  if (!fs.existsSync(exe)) {
    void vscode.window.showErrorMessage(
      `Could not find the built executable at ${exe}. Check the project's OutputPath/AssemblyName.`
    );
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `Run ${project.name}`,
    cwd: getOutputDir(project, configuration),
  });
  terminal.show();
  terminal.sendText(quoteForShell(exe));
}

function quoteForShell(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}
