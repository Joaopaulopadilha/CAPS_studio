/*
 * EmbeddedCssIntellisense: o Monaco padrão não sabe sugerir propriedades CSS
 * dentro de um <style>...</style> embutido num arquivo .html (só funciona em
 * arquivos .css separados). Como isso é justamente o jeito mais comum de
 * quem está aprendendo escrever CSS, este módulo registra um provedor de
 * sugestões próprio pra cobrir esse caso: propriedades comuns (com um
 * snippet "propriedade: |;") e, pras mais usadas, sugestões de valor também.
 */
const EmbeddedCssIntellisense = (() => {
  const CSS_PROPERTIES = [
    ['color', 'Cor do texto'],
    ['background', 'Atalho para fundo (cor, imagem, posição...)'],
    ['background-color', 'Cor de fundo'],
    ['background-image', 'Imagem de fundo'],
    ['border', 'Atalho para borda (largura, estilo, cor)'],
    ['border-radius', 'Arredonda os cantos'],
    ['border-color', 'Cor da borda'],
    ['border-width', 'Largura da borda'],
    ['border-style', 'Estilo da borda (solid, dashed...)'],
    ['margin', 'Espaço fora do elemento'],
    ['padding', 'Espaço dentro do elemento, antes da borda'],
    ['width', 'Largura'],
    ['height', 'Altura'],
    ['max-width', 'Largura máxima'],
    ['max-height', 'Altura máxima'],
    ['min-width', 'Largura mínima'],
    ['min-height', 'Altura mínima'],
    ['display', 'Como o elemento é exibido no layout'],
    ['position', 'Tipo de posicionamento'],
    ['top', 'Distância do topo (com position)'],
    ['right', 'Distância da direita (com position)'],
    ['bottom', 'Distância de baixo (com position)'],
    ['left', 'Distância da esquerda (com position)'],
    ['flex', 'Atalho de flex-grow/shrink/basis'],
    ['flex-direction', 'Direção dos itens flex'],
    ['flex-wrap', 'Se os itens flex quebram linha'],
    ['justify-content', 'Alinhamento horizontal dos itens flex'],
    ['align-items', 'Alinhamento vertical dos itens flex'],
    ['gap', 'Espaço entre itens flex/grid'],
    ['grid-template-columns', 'Colunas do grid'],
    ['grid-template-rows', 'Linhas do grid'],
    ['font-family', 'Fonte do texto'],
    ['font-size', 'Tamanho da fonte'],
    ['font-weight', 'Peso da fonte (negrito etc.)'],
    ['font-style', 'Estilo da fonte (itálico etc.)'],
    ['line-height', 'Altura da linha'],
    ['letter-spacing', 'Espaçamento entre letras'],
    ['text-align', 'Alinhamento do texto'],
    ['text-decoration', 'Sublinhado, riscado etc.'],
    ['text-transform', 'Maiúsculas/minúsculas automáticas'],
    ['white-space', 'Como espaços e quebras de linha são tratados'],
    ['overflow', 'O que fazer com conteúdo que não cabe'],
    ['overflow-x', 'Overflow no eixo horizontal'],
    ['overflow-y', 'Overflow no eixo vertical'],
    ['cursor', 'Ícone do mouse ao passar por cima'],
    ['opacity', 'Transparência (0 a 1)'],
    ['visibility', 'Se o elemento é visível'],
    ['z-index', 'Ordem de empilhamento'],
    ['box-shadow', 'Sombra da caixa'],
    ['text-shadow', 'Sombra do texto'],
    ['box-sizing', 'Como largura/altura são calculadas'],
    ['transition', 'Anima mudanças de propriedades'],
    ['transform', 'Move, rotaciona, escala o elemento'],
    ['animation', 'Atalho para animação com @keyframes'],
    ['outline', 'Contorno (não afeta o layout)'],
    ['float', 'Flutua o elemento pra um lado'],
    ['clear', 'Cancela o float'],
    ['vertical-align', 'Alinhamento vertical (elementos inline)'],
    ['list-style', 'Estilo de marcadores de lista'],
    ['content', 'Conteúdo gerado (usado com ::before/::after)'],
    ['object-fit', 'Como uma imagem/vídeo preenche a caixa'],
    ['pointer-events', 'Se o elemento responde a cliques/mouse'],
    ['user-select', 'Se o texto pode ser selecionado'],
  ];

  const CSS_VALUES = {
    display: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none', 'inline-flex'],
    position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
    'text-align': ['left', 'right', 'center', 'justify'],
    'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '400', '700'],
    'font-style': ['normal', 'italic', 'oblique'],
    'text-decoration': ['none', 'underline', 'line-through', 'overline'],
    'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
    cursor: ['pointer', 'default', 'text', 'move', 'not-allowed', 'grab', 'help'],
    overflow: ['visible', 'hidden', 'scroll', 'auto'],
    'overflow-x': ['visible', 'hidden', 'scroll', 'auto'],
    'overflow-y': ['visible', 'hidden', 'scroll', 'auto'],
    visibility: ['visible', 'hidden', 'collapse'],
    'box-sizing': ['content-box', 'border-box'],
    'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
    'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
    'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
    'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
    'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line'],
    'vertical-align': ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom'],
    'border-style': ['solid', 'dashed', 'dotted', 'double', 'none'],
    'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
    'pointer-events': ['auto', 'none'],
    'user-select': ['auto', 'none', 'text', 'all'],
    float: ['left', 'right', 'none'],
    clear: ['left', 'right', 'both', 'none'],
  };

  function findStyleBlockAt(model, position) {
    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = re.exec(text))) {
      const contentStart = match.index + match[0].indexOf('>') + 1;
      const contentEnd = contentStart + match[1].length;
      if (offset >= contentStart && offset <= contentEnd) {
        return { contentStart };
      }
    }
    return null;
  }

  function analyzeContext(prefixText) {
    // Olha só a linha atual (até o cursor): cobre tanto "propriedade: valor"
    // quanto várias declarações na mesma linha, sem se confundir com um
    // ";" de uma declaração anterior ainda não fechada em outra linha.
    const lineText = prefixText.slice(prefixText.lastIndexOf('\n') + 1);
    const statement = lineText.slice(lineText.lastIndexOf(';') + 1);
    const colonIndex = statement.indexOf(':');
    if (colonIndex === -1) return { kind: 'property' };
    return { kind: 'value', property: statement.slice(0, colonIndex).trim().toLowerCase() };
  }

  function init() {
    monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: [':', ' '],
      provideCompletionItems(model, position) {
        if (model.getLanguageId() !== 'html') return { suggestions: [] };
        const block = findStyleBlockAt(model, position);
        if (!block) return { suggestions: [] };

        const offset = model.getOffsetAt(position);
        const prefixText = model.getValue().slice(block.contentStart, offset);
        const ctx = analyzeContext(prefixText);
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

        if (ctx.kind === 'value') {
          const values = CSS_VALUES[ctx.property] || [];
          return {
            suggestions: values.map((value) => ({
              label: value,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: value,
              range,
            })),
          };
        }

        return {
          suggestions: CSS_PROPERTIES.map(([name, doc]) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Property,
            detail: doc,
            insertText: `${name}: $0;`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          })),
        };
      },
    });
  }

  return { init };
})();
