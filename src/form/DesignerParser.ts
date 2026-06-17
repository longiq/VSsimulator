import * as fs from 'fs';

/** A single control parsed from a WinForms designer file. */
export interface FormControl {
  name: string;
  /** Simple type name, e.g. `Button`, `Label`. */
  type: string;
  /** Location relative to the parent's client area. */
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  /** Child controls (for containers such as Panel / GroupBox). */
  children: FormControl[];
}

/** A parsed WinForms form. */
export interface FormModel {
  /** Form class / Name. */
  name: string;
  /** Window title (form Text). */
  title: string;
  /** Client area width. */
  width: number;
  /** Client area height. */
  height: number;
  /** Top-level controls (children nested within their containers). */
  controls: FormControl[];
  /** Non-fatal notes surfaced to the user (e.g. unsupported controls). */
  warnings: string[];
}

/** Control type names this preview knows how to render specifically. */
const KNOWN_TYPES = new Set([
  'Label',
  'LinkLabel',
  'TextBox',
  'RichTextBox',
  'MaskedTextBox',
  'Button',
  'CheckBox',
  'RadioButton',
  'Panel',
  'GroupBox',
  'TabControl',
  'PictureBox',
  'ComboBox',
  'ListBox',
  'CheckedListBox',
  'NumericUpDown',
  'DateTimePicker',
  'ProgressBar',
]);

/** Container types whose children are nested in the layout. */
export const CONTAINER_TYPES = new Set(['Panel', 'GroupBox', 'TabControl', 'TabPage']);

interface RawControl {
  name: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  autoSize?: boolean;
  parent?: string; // container name; undefined => form level
}

/** Parse a designer file from disk. */
export function parseDesignerFile(designerPath: string): FormModel {
  const content = fs.readFileSync(designerPath, 'utf8');
  return parseDesignerContent(content);
}

/** Parse raw VB designer source (the `InitializeComponent` body). */
export function parseDesignerContent(content: string): FormModel {
  const body = extractInitializeComponent(content) ?? content;
  const lines = body.split(/\r?\n/).map((l) => l.trim());

  const controls = new Map<string, RawControl>();
  const order: string[] = [];
  const warnings = new Set<string>();

  // Form-level properties (set on `Me.<prop>` with a single segment).
  let formName = 'Form';
  let formTitle = '';
  let formW = 300;
  let formH = 200;

  const ensure = (name: string): RawControl => {
    let c = controls.get(name);
    if (!c) {
      c = { name, type: 'Control' };
      controls.set(name, c);
      order.push(name);
    }
    return c;
  };

  for (const line of lines) {
    // 1) Control declaration: Me.X = New <ns>.<Type>()
    let m = /^Me\.(\w+)\s*=\s*New\s+([\w.]+)\(\s*\)\s*$/.exec(line);
    if (m) {
      const name = m[1];
      const type = simpleType(m[2]);
      const c = ensure(name);
      c.type = type;
      if (!KNOWN_TYPES.has(type)) {
        warnings.add(type);
      }
      continue;
    }

    // 2) Parent/child wiring: [Me.<container>.]Controls.Add(Me.<child>)
    m = /^Me(?:\.(\w+))?\.Controls\.Add\(Me\.(\w+)\)/.exec(line);
    if (m) {
      const container = m[1]; // undefined => form
      const child = m[2];
      ensure(child).parent = container;
      continue;
    }

    // 3) Control property: Me.<name>.<prop> = <value>
    m = /^Me\.(\w+)\.(\w+)\s*=\s*(.+)$/.exec(line);
    if (m) {
      const [, name, prop, rawValue] = m;
      applyControlProp(ensure(name), prop, rawValue);
      continue;
    }

    // 4) Form property: Me.<prop> = <value>
    m = /^Me\.(\w+)\s*=\s*(.+)$/.exec(line);
    if (m) {
      const [, prop, rawValue] = m;
      switch (prop) {
        case 'Name':
          formName = parseString(rawValue) ?? formName;
          break;
        case 'Text':
          formTitle = parseString(rawValue) ?? formTitle;
          break;
        case 'ClientSize': {
          const size = parseSize(rawValue);
          if (size) {
            formW = size.w;
            formH = size.h;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // Materialize raw controls into a nested tree.
  const built = new Map<string, FormControl>();
  for (const name of order) {
    const raw = controls.get(name)!;
    built.set(name, finalize(raw));
  }

  const roots: FormControl[] = [];
  for (const name of order) {
    const raw = controls.get(name)!;
    const node = built.get(name)!;
    if (raw.parent && built.has(raw.parent)) {
      built.get(raw.parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return {
    name: formName,
    title: formTitle || formName,
    width: formW,
    height: formH,
    controls: roots,
    warnings: [...warnings].sort(),
  };
}

function finalize(raw: RawControl): FormControl {
  const isLabelLike = raw.type === 'Label' || raw.type === 'LinkLabel' || raw.type === 'CheckBox' || raw.type === 'RadioButton';
  const defaultW = isLabelLike ? Math.max(40, (raw.text?.length ?? 6) * 7 + 20) : 100;
  const defaultH = isLabelLike ? 19 : 23;
  return {
    name: raw.name,
    type: raw.type,
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    width: raw.width ?? defaultW,
    height: raw.height ?? defaultH,
    text: raw.text,
    children: [],
  };
}

function applyControlProp(c: RawControl, prop: string, rawValue: string): void {
  switch (prop) {
    case 'Location': {
      const p = parsePoint(rawValue);
      if (p) {
        c.x = p.x;
        c.y = p.y;
      }
      break;
    }
    case 'Size': {
      const s = parseSize(rawValue);
      if (s) {
        c.width = s.w;
        c.height = s.h;
      }
      break;
    }
    case 'Text':
      c.text = parseString(rawValue) ?? c.text;
      break;
    case 'AutoSize':
      c.autoSize = /true/i.test(rawValue);
      break;
    default:
      break;
  }
}

/** Slice out the body of the InitializeComponent method, if present. */
function extractInitializeComponent(content: string): string | undefined {
  const start = /Sub\s+InitializeComponent\s*\(\s*\)/i.exec(content);
  if (!start) {
    return undefined;
  }
  const rest = content.slice(start.index + start[0].length);
  const end = /End\s+Sub/i.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

function simpleType(fullType: string): string {
  const parts = fullType.split('.');
  return parts[parts.length - 1];
}

function parsePoint(value: string): { x: number; y: number } | undefined {
  const m = /\(\s*(-?\d+)\s*,\s*(-?\d+)/.exec(value);
  return m ? { x: parseInt(m[1], 10), y: parseInt(m[2], 10) } : undefined;
}

function parseSize(value: string): { w: number; h: number } | undefined {
  const m = /\(\s*(-?\d+)\s*,\s*(-?\d+)/.exec(value);
  return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : undefined;
}

function parseString(value: string): string | undefined {
  const m = /^"((?:[^"]|"")*)"/.exec(value.trim());
  return m ? m[1].replace(/""/g, '"') : undefined;
}
