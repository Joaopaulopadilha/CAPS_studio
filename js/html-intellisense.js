/*
 * HtmlIntellisense: ajuda a começar um arquivo .html do zero.
 * - Documento vazio + Ctrl+Espaço: sugere o esqueleto HTML5 básico
 *   (DOCTYPE, <html lang>, <head>, <body>) como snippet.
 * - Dentro de lang="...": sugere códigos de idioma comuns — é o primeiro
 *   tab-stop do esqueleto acima, então dá pra escolher o idioma na hora.
 */
const HtmlIntellisense = (() => {
  const BOILERPLATE = [
    '<!DOCTYPE html>',
    '<html lang="${1:pt-br}">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>${2:Documento}</title>',
    '</head>',
    '<body>',
    '  $0',
    '</body>',
    '</html>',
    '',
  ].join('\n');

  const LANGUAGES = [
    ['pt-br', 'Português (Brasil)'],
    ['pt', 'Português'],
    ['en', 'Inglês'],
    ['en-us', 'Inglês (EUA)'],
    ['es', 'Espanhol'],
    ['fr', 'Francês'],
    ['de', 'Alemão'],
    ['it', 'Italiano'],
    ['ja', 'Japonês'],
    ['zh', 'Chinês'],
    ['ko', 'Coreano'],
    ['ru', 'Russo'],
    ['ar', 'Árabe'],
    ['nl', 'Holandês'],
  ];

  function langSuggestions(model, position) {
    const line = model.getLineContent(position.lineNumber);
    const before = line.slice(0, position.column - 1);
    const match = before.match(/\blang=["']([a-zA-Z-]*)$/i);
    if (!match) return null;

    const typed = match[1];
    const range = new monaco.Range(
      position.lineNumber, position.column - typed.length,
      position.lineNumber, position.column
    );
    return LANGUAGES.map(([code, label]) => ({
      label: `${code} — ${label}`,
      kind: monaco.languages.CompletionItemKind.EnumMember,
      insertText: code,
      range,
    }));
  }

  function boilerplateSuggestion(model, position) {
    if (model.getValue().trim() !== '') return null;
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    return [{
      label: '!',
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: 'Estrutura HTML5 básica (doctype, html, head, body)',
      filterText: '! html5 doctype estrutura',
      insertText: BOILERPLATE,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    }];
  }

  function init() {
    monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: ['"', "'"],
      provideCompletionItems(model, position) {
        if (model.getLanguageId() !== 'html') return { suggestions: [] };
        const suggestions = langSuggestions(model, position) || boilerplateSuggestion(model, position) || [];
        return { suggestions };
      },
    });
  }

  return { init };
})();
