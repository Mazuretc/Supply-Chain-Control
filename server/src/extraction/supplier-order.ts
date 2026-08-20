export function canonicalizeSupplierOrder(value: unknown): string | null {
  const canonical = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[\s_–—/\\]+/g, '-')
    .replace(/[^A-ZА-ЯЁ0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return canonical || null;
}
