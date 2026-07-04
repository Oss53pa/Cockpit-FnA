// Génère un PDF A4 professionnel depuis un Markdown, avec rendu des diagrammes
// Mermaid. Utilise Playwright + Chrome système (headless). Usage :
//   node scripts/md2pdf.mjs <input.md> <output.pdf> "<Titre>"
import fs from 'node:fs';
import path from 'node:path';

const [inMd, outPdf, title] = process.argv.slice(2);
if (!inMd || !outPdf) { console.error('usage: node scripts/md2pdf.mjs <in.md> <out.pdf> [title]'); process.exit(1); }

const md = fs.readFileSync(inMd, 'utf8');
const docTitle = title || path.basename(inMd);

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  :root { --ink:#1a1a1a; --muted:#666; --line:#e3e3e3; --accent:#7FA88E; --code:#f6f8f7; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: var(--ink); font-size: 10.2px; line-height: 1.5; margin: 0; }
  .doc { padding: 0 2mm; }
  h1 { font-size: 20px; border-bottom: 2px solid var(--accent); padding-bottom: 4px; margin: 22px 0 10px; page-break-after: avoid; }
  h2 { font-size: 15px; margin: 18px 0 8px; padding-bottom: 3px; border-bottom: 1px solid var(--line); page-break-after: avoid; }
  h3 { font-size: 12.5px; margin: 14px 0 6px; color:#222; page-break-after: avoid; }
  h4 { font-size: 11px; margin: 10px 0 4px; }
  p { margin: 6px 0; }
  a { color: #2f6f57; text-decoration: none; }
  code { font-family: "JetBrains Mono", Consolas, monospace; font-size: 9px; background: var(--code);
         padding: 1px 4px; border-radius: 3px; }
  pre { background: var(--code); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;
        overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.6px; line-height: 1.4; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 8.8px; page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f2f5f3; font-weight: 600; }
  tr:nth-child(even) td { background: #fafbfa; }
  blockquote { border-left: 3px solid var(--accent); margin: 8px 0; padding: 2px 12px; color: #444; background:#f7faf8; }
  ul, ol { margin: 6px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid var(--line); margin: 14px 0; }
  .mermaid { text-align: center; margin: 12px 0; page-break-inside: avoid; }
  .mermaid svg { max-width: 100%; height: auto; }
  h1, h2 { break-after: avoid; }
</style></head>
<body><div class="doc" id="c"></div>
<script type="module">
  import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js';
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  const source = ${JSON.stringify(md)};
  marked.setOptions({ gfm: true, breaks: false });
  document.getElementById('c').innerHTML = marked.parse(source);
  // Transforme les blocs \`\`\`mermaid en conteneurs .mermaid
  document.querySelectorAll('code.language-mermaid').forEach((el) => {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = el.textContent;
    (el.closest('pre') || el).replaceWith(div);
  });
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose',
    flowchart: { htmlLabels: true }, fontFamily: 'Segoe UI, Arial, sans-serif' });
  try { await mermaid.run(); } catch (e) { console.error('mermaid', e); }
  window.__ready = true;
</script></body></html>`;

const { chromium } = await import('playwright');

async function launch() {
  for (const opt of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
    try { return await chromium.launch({ headless: true, ...opt }); }
    catch (e) { /* try next */ }
  }
  throw new Error('Aucun navigateur Chromium/Chrome/Edge lançable via Playwright.');
}

const browser = await launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 }).catch(() => {});
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: outPdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="font-size:7px;width:100%;padding:0 14mm;color:#999;display:flex;justify-content:space-between">
    <span>${docTitle}</span><span>page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log('PDF généré :', outPdf, '(' + (fs.statSync(outPdf).size / 1024).toFixed(0) + ' Ko)');
