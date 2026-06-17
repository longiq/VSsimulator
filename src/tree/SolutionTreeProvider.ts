import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseSolution, Solution } from '../solution/SolutionParser';
import { parseVbproj, VbProject } from '../solution/VbprojParser';
import { ProjectNode, SolutionNode, TreeNode } from './nodes';

/** Provides the data for the VB Solution Explorer tree view. */
export class SolutionTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private root: SolutionNode | undefined;
  private solution: Solution | undefined;
  /** Loaded projects keyed by absolute project path. */
  private readonly projectsByPath = new Map<string, VbProject>();

  constructor(private solutionPath: string | undefined) {
    this.reload();
  }

  /** Point the tree at a different .sln file and reload. */
  setSolution(solutionPath: string | undefined): void {
    this.solutionPath = solutionPath;
    this.reload();
  }

  /** Re-read the .sln and project files from disk. */
  reload(): void {
    this.projectsByPath.clear();
    this.root = undefined;
    this.solution = undefined;

    if (this.solutionPath && fs.existsSync(this.solutionPath)) {
      try {
        const solution = parseSolution(this.solutionPath);
        this.solution = solution;
        const projectNodes: ProjectNode[] = [];
        for (const sp of solution.projects) {
          if (!fs.existsSync(sp.absolutePath)) {
            continue;
          }
          // Only VB projects can be fully parsed; others are listed by name.
          try {
            const vbproj = parseVbproj(sp.absolutePath);
            this.projectsByPath.set(sp.absolutePath, vbproj);
            projectNodes.push(new ProjectNode(vbproj));
          } catch (err) {
            console.error(`Failed to parse project ${sp.absolutePath}:`, err);
          }
        }
        this.root = new SolutionNode(solution, projectNodes);
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Failed to open solution: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    void vscode.commands.executeCommand('setContext', 'vbsln.hasSolution', this.root !== undefined);
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (!element) {
      return this.root ? [this.root] : [];
    }
    return element.getChildren();
  }

  /** The currently loaded solution, if any. */
  getCurrentSolution(): Solution | undefined {
    return this.solution;
  }

  /** All loaded VB projects. */
  getProjects(): VbProject[] {
    return [...this.projectsByPath.values()];
  }
}
