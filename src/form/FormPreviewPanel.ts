import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseDesignerFile } from './DesignerParser';
import { escapeHtml, renderHtml } from './formHtml';

const openPanels = new Map<string, vscode.WebviewPanel>();

/** Open (or reuse) a read-only preview of a WinForms designer file. */
export function showFormPreview(designerPath: string): void {
  const key = designerPath.toLowerCase();
  const existing = openPanels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Active);
    update(existing, designerPath);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'vbslnFormPreview',
    `Form: ${path.basename(designerPath).replace(/\.Designer\.vb$/i, '')}`,
    vscode.ViewColumn.Active,
    { enableScripts: false, retainContextWhenHidden: true }
  );
  panel.iconPath = new vscode.ThemeIcon('window');
  openPanels.set(key, panel);

  // Live refresh when the designer file is saved.
  const watcher = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.uri.fsPath.toLowerCase() === key) {
      update(panel, designerPath);
    }
  });
  panel.onDidDispose(() => {
    openPanels.delete(key);
    watcher.dispose();
  });

  update(panel, designerPath);
}

function update(panel: vscode.WebviewPanel, designerPath: string): void {
  try {
    if (!fs.existsSync(designerPath)) {
      panel.webview.html = errorHtml(`Designer file not found:\n${designerPath}`);
      return;
    }
    panel.webview.html = renderHtml(parseDesignerFile(designerPath));
  } catch (err) {
    panel.webview.html = errorHtml(err instanceof Error ? err.message : String(err));
  }
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;color:var(--vscode-foreground)">
    <h3>Cannot preview form</h3><pre>${escapeHtml(message)}</pre></body></html>`;
}
