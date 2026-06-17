import * as vscode from 'vscode';
import * as fs from 'fs';
import { VbProject } from '../solution/VbprojParser';
import { build, getConfiguration } from '../build/BuildService';
import { getOutputDir, getOutputExe } from '../build/output';

const CSHARP_EXTENSION_ID = 'ms-dotnettools.csharp';

/** Build (if needed) and launch a .NET Framework debug session via the `clr` debugger. */
export async function debug(project: VbProject): Promise<void> {
  if (!project.isExecutable) {
    void vscode.window.showWarningMessage(
      `Project '${project.name}' is a ${project.outputType} and cannot be debugged directly.`
    );
    return;
  }

  // The `clr` debug type is contributed by the C# extension.
  const csharp = vscode.extensions.getExtension(CSHARP_EXTENSION_ID);
  if (!csharp) {
    void vscode.window.showErrorMessage(
      'The C# extension (ms-dotnettools.csharp) is required to debug .NET Framework apps. ' +
        'Please install it.'
    );
    return;
  }
  if (!csharp.isActive) {
    await csharp.activate();
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

  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.path));
  const debugConfig: vscode.DebugConfiguration = {
    type: 'clr',
    request: 'launch',
    name: `Debug ${project.name}`,
    program: exe,
    cwd: getOutputDir(project, configuration),
    console: 'integratedTerminal',
  };

  const ok = await vscode.debug.startDebugging(folder, debugConfig);
  if (!ok) {
    void vscode.window.showErrorMessage(`Failed to start debugging '${project.name}'.`);
  }
}
