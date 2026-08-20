/*
 * EmbeddedJsIntellisense: mesmo problema do CSS embutido, agora pro
 * <script>...</script> dentro do HTML — o Monaco não estende o serviço de
 * JavaScript/TypeScript pra dentro do HTML automaticamente. Só que aqui, em
 * vez de uma lista própria (como fizemos pro CSS), dá pra usar o serviço de
 * verdade: mantemos um modelo JS invisível em sincronia com o conteúdo do
 * <script> atual e perguntamos pra ele — o resultado é IntelliSense real,
 * incluindo inferência de tipo (ex.: canvas.getContext depois de um
 * document.getElementById(...)).
 */
const EmbeddedJsIntellisense = (() => {
  const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  let KIND_MAP = null;
  let shadowModel = null;

  function buildKindMap() {
    const K = monaco.languages.CompletionItemKind;
    return {
      class: K.Class, interface: K.Interface, module: K.Module,
      enum: K.Enum, 'enum member': K.EnumMember,
      type: K.Class, 'type parameter': K.TypeParameter, alias: K.Reference,
      function: K.Function, 'local function': K.Function,
      method: K.Method, getter: K.Property, setter: K.Property,
      property: K.Property, constructor: K.Constructor,
      call: K.Method, index: K.Property, construct: K.Constructor,
      parameter: K.Variable, var: K.Variable, 'local var': K.Variable,
      let: K.Variable, const: K.Constant, label: K.Text,
      'primitive type': K.Keyword, keyword: K.Keyword,
      script: K.File, directory: K.Folder, string: K.Text, warning: K.Text,
    };
  }

  function mapKind(tsKind) {
    return KIND_MAP[tsKind] || monaco.languages.CompletionItemKind.Text;
  }

  function isJsScriptTag(attrs) {
    if (/\bsrc\s*=/i.test(attrs)) return false; // script externo, sem conteúdo pra analisar
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    if (!typeMatch) return true; // sem "type" = javascript por padrão
    const type = typeMatch[1].toLowerCase();
    return type === '' || type.includes('javascript') || type === 'module';
  }

  function findScriptBlockAt(model, position) {
    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    SCRIPT_BLOCK_RE.lastIndex = 0;
    let match;
    while ((match = SCRIPT_BLOCK_RE.exec(text))) {
      if (!isJsScriptTag(match[1] || '')) continue;
      const contentStart = match.index + match[0].indexOf('>') + 1;
      const contentEnd = contentStart + match[2].length;
      if (offset >= contentStart && offset <= contentEnd) {
        return { contentStart, blockText: match[2] };
      }
    }
    return null;
  }

  function init() {
    KIND_MAP = buildKindMap();
    shadowModel = monaco.editor.createModel('', 'javascript', monaco.Uri.parse('inmemory://embedded/script.js'));

    monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: ['.'],
      async provideCompletionItems(model, position) {
        if (model.getLanguageId() !== 'html') return { suggestions: [] };
        const block = findScriptBlockAt(model, position);
        if (!block) return { suggestions: [] };

        const offsetInBlock = model.getOffsetAt(position) - block.contentStart;
        if (shadowModel.getValue() !== block.blockText) shadowModel.setValue(block.blockText);

        try {
          const workerFactory = await monaco.languages.typescript.getJavaScriptWorker();
          const proxy = await workerFactory(shadowModel.uri);
          const uriString = shadowModel.uri.toString();
          const info = await proxy.getCompletionsAtPosition(uriString, offsetInBlock);
          if (!info || !info.entries) return { suggestions: [] };

          const word = model.getWordUntilPosition(position);
          const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
          return {
            suggestions: info.entries.map((entry) => ({
              label: entry.name,
              kind: mapKind(entry.kind),
              insertText: entry.name,
              sortText: entry.sortText,
              range,
            })),
          };
        } catch (e) {
          return { suggestions: [] };
        }
      },
    });
  }

  return { init };
})();
