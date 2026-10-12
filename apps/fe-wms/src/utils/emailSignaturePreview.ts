import createDOMPurify from "dompurify";
import { PAYROLL_SIGNATURE_POLICY } from "@bduck/shared-types";

let purifier: ReturnType<typeof createDOMPurify> | undefined;
export function sanitizeEmailSignaturePreview(html: string) {
  if (typeof window === "undefined") return "";
  if (!purifier) {
    purifier = createDOMPurify(window);
    const attributes: Record<string, string[]> = PAYROLL_SIGNATURE_POLICY.allowedAttributes;
    const styles: Record<string, RegExp[]> = PAYROLL_SIGNATURE_POLICY.allowedStyles["*"];
    purifier.addHook("uponSanitizeAttribute", (node, data) => {
      const tag = node.nodeName.toLowerCase();
      const tagAttributes = Object.hasOwn(attributes, tag) ? attributes[tag] : [];
      if (![...tagAttributes, ...attributes["*"]].includes(data.attrName)) { data.keepAttr = false; return; }
      if (data.attrName === "style") {
        data.attrValue = data.attrValue.split(";").flatMap(declaration => {
          const colon = declaration.indexOf(":");
          const property = declaration.slice(0, colon).trim();
          const value = declaration.slice(colon + 1).trim();
          const patterns = Object.hasOwn(styles, property) ? styles[property] : [];
          return colon > 0 && patterns.some(regex => regex.test(value.replace(/\s*!important\s*$/i, ""))) ? [property + ":" + value] : [];
        }).join(";");
      }
      if (data.attrName === "href" || data.attrName === "src") {
        const scheme = data.attrValue.trim().match(/^([a-z][a-z\d+.-]*):/i)?.[1].toLowerCase();
        const schemes = tag === "img" ? PAYROLL_SIGNATURE_POLICY.allowedSchemesByTag.img : PAYROLL_SIGNATURE_POLICY.allowedSchemes;
        if (scheme && !schemes.includes(scheme)) data.keepAttr = false;
      }
    });
  }
  return purifier.sanitize(html, { ALLOWED_TAGS: PAYROLL_SIGNATURE_POLICY.allowedTags,
    ALLOWED_ATTR: [...new Set(Object.values(PAYROLL_SIGNATURE_POLICY.allowedAttributes).flat())], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
}

export function buildEmailSignaturePreview(html: string, lang: "vi" | "zh") {
  const clean = sanitizeEmailSignaturePreview(html);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';img-src https:;style-src 'unsafe-inline';base-uri 'none';form-action 'none'"><style>body{margin:0;padding:16px;background:#fff;color:#0f172a;font-family:Arial,sans-serif;line-height:1.6;overflow-wrap:anywhere}img{max-width:100%}table{max-width:100%}</style></head><body>${clean}</body></html>`;
}
