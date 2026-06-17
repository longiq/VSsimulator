import * as vscode from 'vscode';
import { Solution } from '../solution/SolutionParser';
import { VbProject } from '../solution/VbprojParser';

/** Discriminator for the different kinds of nodes in the tree. */
export type NodeKind = 'solution' | 'project' | 'references' | 'reference' | 'folder' | 'file';

/** Base class for every entry shown in the Solution Explorer tree. */
export abstract class TreeNode extends vscode.TreeItem {
  abstract readonly kind: NodeKind;
  /** Compute the children of this node lazily. */
  abstract getChildren(): TreeNode[];
}

export class SolutionNode extends TreeNode {
  readonly kind = 'solution';
  constructor(public readonly solution: Solution, private readonly projects: ProjectNode[]) {
    super(`Solution '${solution.name}'`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'solution';
    this.iconPath = new vscode.ThemeIcon('archive');
    this.resourceUri = vscode.Uri.file(solution.path);
    this.tooltip = solution.path;
  }
  getChildren(): TreeNode[] {
    return this.projects;
  }
}

export class ProjectNode extends TreeNode {
  readonly kind = 'project';
  constructor(public readonly project: VbProject) {
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('package');
    this.resourceUri = vscode.Uri.file(project.path);
    this.tooltip = project.path;
    this.description = project.outputType !== 'Unknown' ? project.outputType : undefined;
  }

  getChildren(): TreeNode[] {
    const children: TreeNode[] = [new ReferencesNode(this.project)];
    children.push(...buildFileTree(this.project));
    return children;
  }
}

class ReferencesNode extends TreeNode {
  readonly kind = 'references';
  constructor(private readonly project: VbProject) {
    super('References', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'references';
    this.iconPath = new vscode.ThemeIcon('references');
  }
  getChildren(): TreeNode[] {
    return this.project.references
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => new ReferenceNode(r.name, r.isProjectReference));
  }
}

class ReferenceNode extends TreeNode {
  readonly kind = 'reference';
  constructor(name: string, isProject: boolean) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'reference';
    this.iconPath = new vscode.ThemeIcon(isProject ? 'project' : 'library');
  }
  getChildren(): TreeNode[] {
    return [];
  }
}

export class FolderNode extends TreeNode {
  readonly kind = 'folder';
  constructor(label: string, private readonly children: TreeNode[]) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'folder';
    this.iconPath = vscode.ThemeIcon.Folder;
  }
  getChildren(): TreeNode[] {
    return this.children;
  }
}

export class FileNode extends TreeNode {
  readonly kind = 'file';
  constructor(label: string, absolutePath: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'file';
    this.resourceUri = vscode.Uri.file(absolutePath);
    this.iconPath = vscode.ThemeIcon.File;
    this.command = {
      command: 'vbsln.openFile',
      title: 'Open File',
      arguments: [vscode.Uri.file(absolutePath)],
    };
    this.tooltip = absolutePath;
  }
  getChildren(): TreeNode[] {
    return [];
  }
}

/** Intermediate mutable tree used to group included items into folders. */
interface DirEntry {
  dirs: Map<string, DirEntry>;
  files: { label: string; absolutePath: string }[];
}

/**
 * Build a Visual-Studio-like folder tree from the flat list of included items.
 * Non-SDK projects list every file explicitly, so the folder structure is
 * inferred from the relative include paths.
 */
function buildFileTree(project: VbProject): TreeNode[] {
  const root: DirEntry = { dirs: new Map(), files: [] };

  const ensureDir = (segments: string[]): DirEntry => {
    let current = root;
    for (const seg of segments) {
      let next = current.dirs.get(seg);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        current.dirs.set(seg, next);
      }
      current = next;
    }
    return current;
  };

  for (const item of project.items) {
    const segments = item.include.split(/[\\/]/).filter((s) => s.length > 0);
    const fileName = segments.pop();
    if (!fileName) {
      continue;
    }
    ensureDir(segments).files.push({ label: fileName, absolutePath: item.absolutePath });
  }

  // Declared empty folders.
  for (const folder of project.folders) {
    const segments = folder.split(/[\\/]/).filter((s) => s.length > 0);
    ensureDir(segments);
  }

  const materialize = (entry: DirEntry): TreeNode[] => {
    const folderNodes = [...entry.dirs.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, child]) => new FolderNode(name, materialize(child)));
    const fileNodes = entry.files
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((f) => new FileNode(f.label, f.absolutePath));
    // Folders first, then files, matching Visual Studio's ordering.
    return [...folderNodes, ...fileNodes];
  };

  return materialize(root);
}
