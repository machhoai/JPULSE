import type { PayrollDeltaOp } from './payrollEmail.js';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function payrollSafeLink(value: unknown): string | null {
  if (typeof value !== 'string' || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return null;
    if (url.protocol === 'mailto:') {
      if ([...url.searchParams].some(([key, text]) => text.includes('\0') || key.toLowerCase() !== 'body' && (text.includes('\r') || text.includes('\n')))) return null;
      if (['\r', '\n', '\0'].some(c => decodeURIComponent(url.pathname).includes(c))) return null;
    }
    return url.href;
  } catch { return null; }
}
const fonts: Record<string, string> = { serif: 'Georgia,Times New Roman,serif', monospace: 'Courier New,monospace' };
const sizes: Record<string, string> = { small: '0.75em', large: '1.5em', huge: '2.5em' };
const color = (value: unknown) => typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(value) ? value : null;
export function payrollInlineHtml(text: string, a: PayrollDeltaOp['attributes'] = {}) {
  if (!text) return '';
  let html = escape(text);
  if (a.bold) html = `<strong>${html}</strong>`;
  if (a.italic) html = `<em>${html}</em>`;
  if (a.underline) html = `<u>${html}</u>`;
  if (a.strike) html = `<s>${html}</s>`;
  if (a.script === 'sub') html = `<sub>${html}</sub>`;
  if (a.script === 'super') html = `<sup>${html}</sup>`;
  const style: string[] = [];
  if (typeof a.font === 'string' && Object.hasOwn(fonts, a.font)) style.push('font-family:' + fonts[a.font]);
  if (typeof a.size === 'string' && Object.hasOwn(sizes, a.size)) style.push('font-size:' + sizes[a.size]);
  if (color(a.color)) style.push('color:' + color(a.color));
  if (color(a.background)) style.push('background-color:' + color(a.background));
  if (style.length) html = `<span style="${style.join(';')}">${html}</span>`;
  const link = payrollSafeLink(a.link);
  if (link) html = `<a href="${escape(link)}" style="color:#0066cc;text-decoration:underline">${html}</a>`;
  return html;
}
interface Line { html: string; attributes: NonNullable<PayrollDeltaOp['attributes']> }
function lineStyle(a: Line['attributes'], list = false) {
  const style = ['margin:0 0 8px'];
  if (['center', 'right', 'justify'].includes(String(a.align))) style.push('text-align:' + a.align);
  const indent = typeof a.indent === 'number' && Number.isInteger(a.indent) ? Math.max(0, Math.min(8, a.indent)) : 0;
  if (indent && !list) style.push('margin-left:' + indent * 24 + 'px');
  return style.join(';');
}
export function payrollLinesHtml(lines: Line[]) {
  let html = ''; const stack: { tag: 'ol' | 'ul'; open: boolean }[] = [];
  const closeLevel = () => { const level = stack.pop()!; if (level.open) html += '</li>'; html += `</${level.tag}>`; };
  for (const line of lines) {
    const a = line.attributes, tag = a.list === 'ordered' ? 'ol' : a.list === 'bullet' ? 'ul' : null;
    if (tag) {
      const requested = typeof a.indent === 'number' && Number.isInteger(a.indent) ? Math.max(0, Math.min(8, a.indent)) : 0;
      const depth = Math.min(requested, stack.length);
      while (stack.length > depth + 1) closeLevel();
      if (stack[depth] && stack[depth].tag !== tag) closeLevel();
      if (stack.length === depth + 1) { if (stack[depth].open) html += '</li>'; }
      else { html += `<${tag} style="margin:0 0 8px;padding-left:24px">`; stack.push({ tag, open: false }); }
      html += `<li style="${lineStyle(a, true)}">${line.html || '<br>'}`; stack[stack.length - 1].open = true;
    } else {
      while (stack.length) closeLevel();
      const heading = typeof a.header === 'number' && a.header >= 1 && a.header <= 3 ? `h${a.header}` : a.blockquote ? 'blockquote' : 'p';
      const headingStyle = heading.startsWith('h') ? ';font-weight:bold;font-size:' + ({ h1: 28, h2: 24, h3: 18 }[heading as 'h1' | 'h2' | 'h3']) + 'px' : '';
      html += `<${heading} style="${lineStyle(a)}${headingStyle}${heading === 'blockquote' ? ';border-left:3px solid #cbd5e1;padding-left:12px' : ''}">${line.html || '<br>'}</${heading}>`;
    }
  }
  while (stack.length) closeLevel();
  return html;
}
