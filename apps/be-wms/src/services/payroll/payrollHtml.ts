import sanitizeHtml from "sanitize-html";
export function sanitizePayrollSignature(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p","br","strong","b","em","i","u","span","div","a","table","tbody","tr","td","th","img"],
    allowedAttributes: { a: ["href","title"], img: ["src","alt","width","height"],
      table: ["width", "cellpadding", "cellspacing", "border", "role"], td: ["colspan", "rowspan", "width"], th: ["colspan", "rowspan", "width"], "*": ["style"] },
    allowedSchemes: ["https","mailto","tel"], allowedSchemesByTag: { img: ["https"] },
    allowedStyles: { "*": { color: [/^#[0-9a-f]{3,8}$/i], "background-color": [/^#[0-9a-f]{3,8}$/i],
      "font-size": [/^\d{1,2}px$/], "text-align": [/^(left|right|center)$/], "font-weight": [/^(bold|normal|[1-9]00)$/],
      "font-family": [/^[a-zA-Z ,'-]+$/], padding: [/^[\d.]+(?:px|em|pt)(?:\s+[\d.]+(?:px|em|pt)){0,3}$/],
      margin: [/^[\d.]+(?:px|em|pt)(?:\s+[\d.]+(?:px|em|pt)){0,3}$/],
      width: [/^\d{1,4}(?:px|%)$/], height: [/^\d{1,4}px$/], "vertical-align": [/^(top|middle|bottom)$/],
      border: [/^\d{1,2}px (?:solid|dotted|dashed) #[0-9a-f]{3,8}$/i], "line-height": [/^[\d.]+(?:px|em|%)?$/] } },
  });
}
export function payrollPlainText(html: string) {
  return sanitizeHtml(html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n"), { allowedTags: [], allowedAttributes: {} });
}
