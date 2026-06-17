import { CONTAINER_TYPES, FormControl, FormModel } from './DesignerParser';

/** Render a parsed form model to standalone HTML (no vscode dependency). */
export function renderHtml(model: FormModel): string {
  const controlsHtml = model.controls.map(renderControl).join('\n');
  const warning =
    model.warnings.length > 0
      ? `<div class="warn">Approximate preview. Unsupported control types shown as placeholders: ${escapeHtml(
          model.warnings.join(', ')
        )}</div>`
      : '';

  // Chrome (title bar) height above the client area.
  const titleBar = 30;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 13px; padding: 16px;
         color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .hint { opacity: 0.7; margin-bottom: 12px; }
  .warn { color: #b58900; margin-bottom: 12px; }
  .form-window { position: relative; width: ${model.width}px; height: ${model.height + titleBar}px;
                 background: #f0f0f0; border: 1px solid #707070; box-shadow: 0 6px 24px rgba(0,0,0,0.35);
                 color: #000; }
  .title-bar { height: ${titleBar}px; background: linear-gradient(#fafafa,#e6e6e6);
               border-bottom: 1px solid #c0c0c0; display: flex; align-items: center;
               padding: 0 8px; font-weight: 600; box-sizing: border-box; }
  .title-bar .buttons { margin-left: auto; letter-spacing: 4px; color: #555; }
  .client { position: relative; width: 100%; height: ${model.height}px; overflow: hidden; }
  .ctl { position: absolute; box-sizing: border-box; font-size: 12px; overflow: hidden; }
  .Label, .LinkLabel { background: transparent; display: flex; align-items: center; }
  .LinkLabel { color: #0066cc; text-decoration: underline; }
  .TextBox, .RichTextBox, .MaskedTextBox, .ComboBox, .ListBox, .CheckedListBox,
  .NumericUpDown, .DateTimePicker { background: #fff; border: 1px solid #7a7a7a; display: flex;
               align-items: center; padding: 0 4px; }
  .Button { background: linear-gradient(#fdfdfd,#e1e1e1); border: 1px solid #707070; border-radius: 3px;
            display: flex; align-items: center; justify-content: center; }
  .CheckBox, .RadioButton { background: transparent; display: flex; align-items: center; gap: 6px; }
  .box::before { content: ""; width: 13px; height: 13px; border: 1px solid #707070; background: #fff;
            display: inline-block; flex: 0 0 auto; }
  .RadioButton .box::before { border-radius: 50%; }
  .Panel { background: rgba(0,0,0,0.02); border: 1px solid #c8c8c8; }
  .GroupBox { border: 1px solid #b0b0b0; border-radius: 3px; overflow: visible; }
  .GroupBox > .caption { position: absolute; top: -8px; left: 8px; background: #f0f0f0;
            padding: 0 4px; font-size: 12px; }
  .GroupBox > .content, .Panel > .content, .TabControl > .content { position: absolute; inset: 0; }
  .GroupBox > .content { top: 14px; left: 3px; right: 3px; bottom: 3px; }
  .ComboBox::after, .DateTimePicker::after, .NumericUpDown::after { content: "\\25BC"; font-size: 8px;
            margin-left: auto; color: #444; }
  .PictureBox { background: #fff; border: 1px solid #b0b0b0; display: flex; align-items: center;
            justify-content: center; color: #999; }
  .ProgressBar { background: #fff; border: 1px solid #7a7a7a; }
  .ProgressBar::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 40%;
            background: #06b025; }
  .unknown { background: repeating-linear-gradient(45deg,#fdecec,#fdecec 6px,#f7dada 6px,#f7dada 12px);
            border: 1px dashed #c0392b; display: flex; align-items: center; justify-content: center;
            color: #c0392b; font-size: 11px; }
</style></head>
<body>
  <div class="hint">Read-only preview of <b>${escapeHtml(model.name)}</b> &mdash; rendered from the designer file, not the live WinForms engine.</div>
  ${warning}
  <div class="form-window">
    <div class="title-bar"><span>${escapeHtml(model.title)}</span><span class="buttons">&#9472; &#9633; &#10005;</span></div>
    <div class="client">
      ${controlsHtml}
    </div>
  </div>
</body></html>`;
}

function renderControl(c: FormControl): string {
  const style = `left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;`;
  const isContainer = CONTAINER_TYPES.has(c.type);
  const isToggle = c.type === 'CheckBox' || c.type === 'RadioButton';
  const known = isContainer || isToggle || c.type in cssClassFor;
  const cls = known ? c.type : 'unknown';
  const text = escapeHtml(c.text ?? '');

  if (c.type === 'GroupBox') {
    return `<div class="ctl GroupBox" style="${style}">
      <span class="caption">${text}</span>
      <div class="content">${c.children.map(renderControl).join('')}</div>
    </div>`;
  }
  if (isContainer) {
    return `<div class="ctl ${cls}" style="${style}">
      <div class="content">${c.children.map(renderControl).join('')}</div>
    </div>`;
  }
  if (c.type === 'CheckBox' || c.type === 'RadioButton') {
    return `<div class="ctl ${cls}" style="${style}"><span class="box"></span><span>${text}</span></div>`;
  }
  if (c.type === 'PictureBox') {
    return `<div class="ctl PictureBox" style="${style}">&#128247;</div>`;
  }
  if (!known) {
    return `<div class="ctl unknown" style="${style}" title="${escapeHtml(c.name)}">${escapeHtml(c.type)}</div>`;
  }
  return `<div class="ctl ${cls}" style="${style}">${text}</div>`;
}

// Types that render with a styled box + text (no special markup).
const cssClassFor: Record<string, true> = {
  Label: true,
  LinkLabel: true,
  TextBox: true,
  RichTextBox: true,
  MaskedTextBox: true,
  Button: true,
  PictureBox: true,
  ComboBox: true,
  ListBox: true,
  CheckedListBox: true,
  NumericUpDown: true,
  DateTimePicker: true,
  ProgressBar: true,
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
