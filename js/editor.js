/*
 * Editor: encapsula o Monaco Editor e a gestão de abas (tabs).
 */
const Editor = (() => {
  let monacoEditor = null;
  let models = new Map(); // fileId -> monaco.editor.ITextModel
  let openTabs = []; // array de fileId, em ordem
  let activeId = null;
  let onChangeCallback = null;
  let onActiveChangeCallback = null;
  let dirtySet = new Set(); // ids com alteração ainda não persistida no disco (só relevante p/ File System Access)
  let autoCloseGuard = false; // evita reentrância ao inserir a tag de fechamento programaticamente

  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  // Fecha a tag automaticamente ao digitar ">", igual ao VS Code:
  // <title> vira <title>|</title> com o cursor entre as duas.
  function maybeAutoCloseTag(model, event) {
    if (autoCloseGuard) return;
    if (model.getLanguageId() !== 'html') return;
    const change = event.changes[event.changes.length - 1];
    if (!change || change.text !== '>') return;

    const lineNumber = change.range.startLineNumber;
    const column = change.range.startColumn + 1; // posição logo após o ">" recém digitado
    const before = model.getLineContent(lineNumber).slice(0, column - 1);
    const match = before.match(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)>$/);
    if (!match) return;

    const tagName = match[1];
    const attrs = match[2] || '';
    if (attrs.trim().endsWith('/')) return; // self-closing, tipo <img ... />
    if (VOID_ELEMENTS.has(tagName.toLowerCase())) return;

    const closeTag = `</${tagName}>`;
    const afterCursor = model.getValueInRange({
      startLineNumber: lineNumber, startColumn: column,
      endLineNumber: lineNumber, endColumn: column + closeTag.length,
    });
    if (afterCursor.toLowerCase() === closeTag.toLowerCase()) return; // já está fechado ali na frente

    autoCloseGuard = true;
    monacoEditor.executeEdits('auto-close-tag', [{
      range: { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column },
      text: closeTag,
    }]);
    monacoEditor.setPosition({ lineNumber, column });
    autoCloseGuard = false;
  }

  function languageFor(name) {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const map = {
      html: 'html', htm: 'html',
      css: 'css',
      js: 'javascript', mjs: 'javascript',
      py: 'python', pyw: 'python',
      json: 'json',
      md: 'markdown',
      ts: 'typescript',
      svg: 'xml', xml: 'xml',
      txt: 'plaintext',
    };
    return map[ext] || 'plaintext';
  }

  function init(container, { onChange, onActiveChange, onSave, onRun }) {
    onChangeCallback = onChange;
    onActiveChangeCallback = onActiveChange;

    monaco.editor.defineTheme('estudo-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e1e',
      },
    });

    monacoEditor = monaco.editor.create(container, {
      theme: 'estudo-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      tabSize: 2,
      wordWrap: 'off',
    });

    if (onSave) {
      // Ctrl+S com o foco no editor: intercepta antes de virar o "Salvar página" do navegador.
      monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave);
    }
    if (onRun) {
      // Ctrl+Enter roda o arquivo Python ativo (convenção comum de notebooks/playgrounds).
      monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
    }
  }

  function attachModelListeners(model, fileId) {
    model.onDidChangeContent((event) => {
      maybeAutoCloseTag(model, event);
      const content = model.getValue();
      dirtySet.add(fileId);
      if (onChangeCallback) onChangeCallback(fileId, content);
    });
  }

  function getOrCreateModel(node) {
    if (models.has(node.id)) return models.get(node.id);
    const model = monaco.editor.createModel(node.content, languageFor(node.name));
    attachModelListeners(model, node.id);
    models.set(node.id, model);
    return model;
  }

  function open(node) {
    if (!openTabs.includes(node.id)) {
      openTabs.push(node.id);
    }
    activate(node.id);
  }

  function activate(fileId) {
    const node = VFS.get(fileId);
    if (!node || node.type !== 'file') return;
    activeId = fileId;
    const model = getOrCreateModel(node);
    monacoEditor.setModel(model);
    if (onActiveChangeCallback) onActiveChangeCallback(fileId);
  }

  function close(fileId) {
    const idx = openTabs.indexOf(fileId);
    if (idx === -1) return;
    openTabs.splice(idx, 1);
    const model = models.get(fileId);
    if (model) {
      model.dispose();
      models.delete(fileId);
    }
    dirtySet.delete(fileId);
    if (activeId === fileId) {
      activeId = null;
      if (openTabs.length > 0) {
        activate(openTabs[Math.min(idx, openTabs.length - 1)]);
      } else {
        monacoEditor.setModel(null);
        if (onActiveChangeCallback) onActiveChangeCallback(null);
      }
    }
  }

  function closeAllFor(fileId) {
    // usado quando um arquivo é removido do VFS (delete)
    close(fileId);
  }

  function renameOpen(fileId, newName) {
    const model = models.get(fileId);
    if (!model) return;
    const node = VFS.get(fileId);
    const newModel = monaco.editor.createModel(model.getValue(), languageFor(newName));
    attachModelListeners(newModel, fileId);
    model.dispose();
    models.set(fileId, newModel);
    if (activeId === fileId) monacoEditor.setModel(newModel);
  }

  function getOpenTabs() {
    return [...openTabs];
  }

  function getActiveId() {
    return activeId;
  }

  function getValue(fileId) {
    const model = models.get(fileId);
    return model ? model.getValue() : null;
  }

  function markClean(fileId) {
    dirtySet.delete(fileId);
  }

  function isDirty(fileId) {
    return dirtySet.has(fileId);
  }

  function focus() {
    if (monacoEditor) monacoEditor.focus();
  }

  return {
    init,
    open,
    activate,
    close,
    closeAllFor,
    renameOpen,
    getOpenTabs,
    getActiveId,
    getValue,
    languageFor,
    markClean,
    isDirty,
    focus,
  };
})();
