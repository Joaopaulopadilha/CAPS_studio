/*
 * Preview: monta um documento HTML autocontido a partir do arquivo
 * de entrada (normalmente index.html), inlineando <link> e <script>
 * locais para que o iframe consiga renderizar sem servidor.
 */
const Preview = (() => {
  let iframe = null;
  let currentEntryId = null;

  function init(iframeEl) {
    iframe = iframeEl;
  }

  function isExternal(href) {
    return /^([a-z]+:)?\/\//i.test(href) || href.startsWith('data:') || href.startsWith('#');
  }

  function inlineHtml(node) {
    const folderId = VFS.folderOf(node.id);
    let html = node.content;

    // <link rel="stylesheet" href="...">
    html = html.replace(/<link\s+([^>]*rel=["']stylesheet["'][^>]*)>/gi, (match, attrs) => {
      const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return match;
      const href = hrefMatch[1];
      if (isExternal(href)) return match;
      const target = VFS.resolveRelative(folderId, href);
      if (target && target.type === 'file') {
        return `<style>\n${target.content}\n</style>`;
      }
      return `<!-- não encontrado: ${href} -->`;
    });

    // <script src="..."></script>
    html = html.replace(/<script\s+([^>]*src=["']([^"']+)["'][^>]*)>\s*<\/script>/gi, (match, attrs, href) => {
      if (isExternal(href)) return match;
      const target = VFS.resolveRelative(folderId, href);
      if (target && target.type === 'file') {
        return `<script>\n${target.content}\n<\/script>`;
      }
      return `<!-- não encontrado: ${href} -->`;
    });

    // imagens locais viram um aviso visual sutil (sem servidor não há como servir binário)
    return html;
  }

  function pickEntry(preferredId) {
    if (preferredId) {
      const node = VFS.get(preferredId);
      if (node && node.type === 'file' && Editor.languageFor(node.name) === 'html') return node;
    }
    // procura index.html na raiz
    const root = VFS.getRoot();
    const indexAtRoot = root.children.find((c) => c.type === 'file' && c.name.toLowerCase() === 'index.html');
    if (indexAtRoot) return indexAtRoot;
    // senão, primeiro .html encontrado na raiz
    const anyHtml = root.children.find((c) => c.type === 'file' && Editor.languageFor(c.name) === 'html');
    return anyHtml || null;
  }

  function render(preferredId) {
    const entry = pickEntry(preferredId);
    if (!entry) {
      iframe.srcdoc = `<html><body style="font-family:sans-serif;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <p>Nenhum arquivo .html para exibir. Crie um index.html.</p></body></html>`;
      currentEntryId = null;
      return;
    }
    currentEntryId = entry.id;
    const finalHtml = inlineHtml(entry);
    iframe.srcdoc = finalHtml;
  }

  function getCurrentEntryId() {
    return currentEntryId;
  }

  function openInNewTab() {
    const entry = pickEntry(currentEntryId);
    if (!entry) return;
    const finalHtml = inlineHtml(entry);
    const blob = new Blob([finalHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return { init, render, getCurrentEntryId, openInNewTab };
})();
