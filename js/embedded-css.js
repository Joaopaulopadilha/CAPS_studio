/*
 * EmbeddedCssIntellisense: o Monaco padrão não sabe sugerir propriedades CSS
 * dentro de um <style>...</style> embutido num arquivo .html (só funciona em
 * arquivos .css separados). Como isso é justamente o jeito mais comum de
 * quem está aprendendo escrever CSS, este módulo registra um provedor de
 * sugestões próprio pra cobrir esse caso: uma lista ampla de propriedades
 * (com snippet "propriedade: |;"), sugestões de valor pras mais comuns, e
 * prioriza no topo da lista as propriedades mais usadas pro elemento do
 * seletor atual (button, input, img...), sem esconder as outras.
 */
const EmbeddedCssIntellisense = (() => {
  const CSS_PROPERTIES = [
    // Cor e fundo
    ['color', 'Cor do texto'],
    ['background', 'Atalho para fundo (cor, imagem, posição...)'],
    ['background-color', 'Cor de fundo'],
    ['background-image', 'Imagem de fundo'],
    ['background-position', 'Posição da imagem de fundo'],
    ['background-size', 'Tamanho da imagem de fundo'],
    ['background-repeat', 'Se a imagem de fundo se repete'],
    ['background-attachment', 'Se o fundo rola junto com a página'],
    ['accent-color', 'Cor de checkboxes, radios e barras de progresso'],
    ['caret-color', 'Cor do cursor de texto piscando'],
    // Caixa: tamanho e espaçamento
    ['width', 'Largura'],
    ['height', 'Altura'],
    ['max-width', 'Largura máxima'],
    ['max-height', 'Altura máxima'],
    ['min-width', 'Largura mínima'],
    ['min-height', 'Altura mínima'],
    ['margin', 'Espaço fora do elemento'],
    ['margin-top', 'Espaço fora, em cima'],
    ['margin-right', 'Espaço fora, à direita'],
    ['margin-bottom', 'Espaço fora, embaixo'],
    ['margin-left', 'Espaço fora, à esquerda'],
    ['padding', 'Espaço dentro do elemento, antes da borda'],
    ['padding-top', 'Espaço interno, em cima'],
    ['padding-right', 'Espaço interno, à direita'],
    ['padding-bottom', 'Espaço interno, embaixo'],
    ['padding-left', 'Espaço interno, à esquerda'],
    ['box-sizing', 'Como largura/altura são calculadas'],
    ['aspect-ratio', 'Proporção entre largura e altura'],
    // Borda
    ['border', 'Atalho para borda (largura, estilo, cor)'],
    ['border-radius', 'Arredonda os cantos'],
    ['border-color', 'Cor da borda'],
    ['border-width', 'Largura da borda'],
    ['border-style', 'Estilo da borda (solid, dashed...)'],
    ['border-top', 'Borda de cima'],
    ['border-right', 'Borda da direita'],
    ['border-bottom', 'Borda de baixo'],
    ['border-left', 'Borda da esquerda'],
    ['outline', 'Contorno (não afeta o layout)'],
    ['outline-offset', 'Distância do contorno até a borda'],
    // Layout / posicionamento
    ['display', 'Como o elemento é exibido no layout'],
    ['position', 'Tipo de posicionamento'],
    ['top', 'Distância do topo (com position)'],
    ['right', 'Distância da direita (com position)'],
    ['bottom', 'Distância de baixo (com position)'],
    ['left', 'Distância da esquerda (com position)'],
    ['float', 'Flutua o elemento pra um lado'],
    ['clear', 'Cancela o float'],
    ['overflow', 'O que fazer com conteúdo que não cabe'],
    ['overflow-x', 'Overflow no eixo horizontal'],
    ['overflow-y', 'Overflow no eixo vertical'],
    ['z-index', 'Ordem de empilhamento'],
    ['visibility', 'Se o elemento é visível (mas ainda ocupa espaço)'],
    // Flexbox / grid
    ['flex', 'Atalho de flex-grow/shrink/basis'],
    ['flex-direction', 'Direção dos itens flex'],
    ['flex-wrap', 'Se os itens flex quebram linha'],
    ['flex-grow', 'Quanto o item cresce pra ocupar espaço extra'],
    ['flex-shrink', 'Quanto o item encolhe se faltar espaço'],
    ['flex-basis', 'Tamanho inicial do item flex'],
    ['justify-content', 'Alinhamento horizontal dos itens flex'],
    ['align-items', 'Alinhamento vertical dos itens flex'],
    ['align-self', 'Alinhamento de um item flex específico'],
    ['gap', 'Espaço entre itens flex/grid'],
    ['row-gap', 'Espaço entre linhas do flex/grid'],
    ['column-gap', 'Espaço entre colunas do flex/grid'],
    ['grid-template-columns', 'Colunas do grid'],
    ['grid-template-rows', 'Linhas do grid'],
    ['grid-column', 'Em quais colunas o item fica'],
    ['grid-row', 'Em quais linhas o item fica'],
    ['place-items', 'Atalho de align-items + justify-items'],
    // Texto
    ['font', 'Atalho pra fonte (tamanho, família, peso...)'],
    ['font-family', 'Fonte do texto'],
    ['font-size', 'Tamanho da fonte'],
    ['font-weight', 'Peso da fonte (negrito etc.)'],
    ['font-style', 'Estilo da fonte (itálico etc.)'],
    ['line-height', 'Altura da linha'],
    ['letter-spacing', 'Espaçamento entre letras'],
    ['word-spacing', 'Espaçamento entre palavras'],
    ['text-align', 'Alinhamento do texto'],
    ['text-decoration', 'Sublinhado, riscado etc.'],
    ['text-transform', 'Maiúsculas/minúsculas automáticas'],
    ['text-overflow', 'O que mostrar quando o texto não cabe (ex.: "...")'],
    ['text-shadow', 'Sombra do texto'],
    ['text-indent', 'Recuo da primeira linha'],
    ['white-space', 'Como espaços e quebras de linha são tratados'],
    ['vertical-align', 'Alinhamento vertical (elementos inline)'],
    ['list-style', 'Estilo de marcadores de lista'],
    ['list-style-type', 'Tipo do marcador (disc, decimal...)'],
    // Interação / efeitos visuais
    ['cursor', 'Ícone do mouse ao passar por cima'],
    ['pointer-events', 'Se o elemento responde a cliques/mouse'],
    ['user-select', 'Se o texto pode ser selecionado'],
    ['resize', 'Se o elemento pode ser redimensionado pelo usuário'],
    ['appearance', 'Remove/ajusta o visual padrão do navegador'],
    ['opacity', 'Transparência (0 a 1)'],
    ['box-shadow', 'Sombra da caixa'],
    ['filter', 'Efeitos visuais (blur, brilho, contraste...)'],
    ['backdrop-filter', 'Efeito visual aplicado ao fundo por trás do elemento'],
    ['transition', 'Anima mudanças de propriedades'],
    ['transform', 'Move, rotaciona, escala o elemento'],
    ['transform-origin', 'Ponto de referência pra rotação/escala'],
    ['animation', 'Atalho para animação com @keyframes'],
    ['object-fit', 'Como uma imagem/vídeo preenche a caixa'],
    ['object-position', 'Posição do conteúdo dentro da caixa (com object-fit)'],
    ['content', 'Conteúdo gerado (usado com ::before/::after)'],
    ['scroll-behavior', 'Rolagem suave ao navegar pra âncoras'],
  ];

  // Sempre oferecidas além do que a propriedade específica já sugere, pra
  // Ctrl+Espaço nunca voltar vazio, mesmo numa propriedade sem lista própria.
  const GLOBAL_VALUES = ['inherit', 'initial', 'unset'];

  // Paleta padrão de cores nomeadas do CSS (as ~148 do spec), + as duas
  // palavras-chave especiais que sempre andam junto delas.
  const NAMED_COLORS = [
    'transparent', 'currentColor',
    'black', 'white', 'gray', 'grey', 'silver', 'dimgray', 'dimgrey',
    'darkgray', 'darkgrey', 'lightgray', 'lightgrey', 'gainsboro', 'whitesmoke',
    'red', 'darkred', 'firebrick', 'crimson', 'indianred', 'lightcoral',
    'salmon', 'darksalmon', 'lightsalmon', 'tomato', 'coral', 'orangered',
    'orange', 'darkorange', 'gold', 'goldenrod', 'darkgoldenrod',
    'yellow', 'lightyellow', 'lemonchiffon', 'khaki', 'darkkhaki',
    'green', 'darkgreen', 'forestgreen', 'seagreen', 'mediumseagreen',
    'lightgreen', 'palegreen', 'lime', 'limegreen', 'greenyellow',
    'olive', 'olivedrab', 'darkolivegreen', 'yellowgreen',
    'teal', 'darkcyan', 'cyan', 'aqua', 'lightcyan', 'turquoise',
    'mediumturquoise', 'darkturquoise', 'paleturquoise', 'aquamarine',
    'mediumaquamarine', 'cadetblue',
    'blue', 'darkblue', 'mediumblue', 'navy', 'midnightblue', 'royalblue',
    'blueviolet', 'dodgerblue', 'steelblue', 'skyblue', 'lightskyblue',
    'lightblue', 'powderblue', 'cornflowerblue', 'slateblue', 'mediumslateblue',
    'darkslateblue',
    'purple', 'darkviolet', 'darkorchid', 'mediumpurple', 'mediumorchid',
    'orchid', 'violet', 'plum', 'thistle', 'lavender', 'indigo', 'rebeccapurple',
    'magenta', 'fuchsia', 'darkmagenta', 'mediumvioletred', 'deeppink',
    'hotpink', 'palevioletred', 'pink', 'lightpink',
    'brown', 'saddlebrown', 'sienna', 'chocolate', 'peru', 'sandybrown',
    'burlywood', 'tan', 'rosybrown', 'wheat', 'navajowhite', 'bisque',
    'moccasin', 'blanchedalmond', 'papayawhip', 'peachpuff',
    'ivory', 'beige', 'linen', 'oldlace', 'antiquewhite', 'cornsilk',
    'seashell', 'mistyrose', 'lavenderblush', 'floralwhite', 'ghostwhite',
    'aliceblue', 'azure', 'honeydew', 'mintcream', 'snow',
    'slategray', 'slategrey', 'lightslategray', 'lightslategrey',
    'lightsteelblue', 'lightgoldenrodyellow', 'darkseagreen', 'lightseagreen',
    'springgreen', 'mediumspringgreen', 'chartreuse', 'lawngreen', 'deepskyblue',
  ];

  // Presets de tamanho comuns em botões (pequeno / médio / grande) — o
  // valor mais à esquerda de cada lista é sempre o mais "neutro/médio".
  const SIZE_PRESETS = ['0', '4px', '8px', '12px', '16px', '24px', '32px', '48px'];
  const PADDING_PRESETS = ['8px 16px', '10px 20px', '6px 12px', '12px 24px', '4px 8px', '16px 32px', '0'];
  const RADIUS_PRESETS = ['4px', '6px', '8px', '12px', '16px', '9999px', '50%', '0'];
  const FONT_SIZE_PRESETS = ['12px', '14px', '16px', '18px', '20px', '24px', '32px', '1rem', '1.5rem'];
  const WIDTH_PRESETS = ['auto', '100%', 'fit-content', 'max-content', 'min-content', '120px', '160px', '200px', '240px'];

  const CSS_VALUES = {
    // Cores
    color: NAMED_COLORS,
    'background-color': NAMED_COLORS,
    'border-color': NAMED_COLORS,
    'outline-color': NAMED_COLORS,
    'text-decoration-color': NAMED_COLORS,
    'caret-color': NAMED_COLORS,
    'accent-color': NAMED_COLORS,
    // Tamanhos comuns (largura, altura, espaçamentos) — pensados também
    // pra botões pequenos/médios/grandes, não só pra caixas em geral.
    width: WIDTH_PRESETS,
    height: ['auto', '100%', 'fit-content', 'max-content', 'min-content', '32px', '40px', '48px'],
    'max-width': ['none', '100%', 'max-content', 'fit-content'],
    'max-height': ['none', '100%', 'max-content', 'fit-content'],
    'min-width': ['0', '80px', '100px', '120px', '100%', 'max-content'],
    'min-height': ['0', '32px', '40px', '48px', '100%'],
    margin: ['0', 'auto', ...SIZE_PRESETS],
    padding: PADDING_PRESETS,
    'padding-top': SIZE_PRESETS,
    'padding-right': SIZE_PRESETS,
    'padding-bottom': SIZE_PRESETS,
    'padding-left': SIZE_PRESETS,
    'margin-top': ['0', 'auto', ...SIZE_PRESETS],
    'margin-right': ['0', 'auto', ...SIZE_PRESETS],
    'margin-bottom': ['0', 'auto', ...SIZE_PRESETS],
    'margin-left': ['0', 'auto', ...SIZE_PRESETS],
    gap: SIZE_PRESETS,
    'row-gap': SIZE_PRESETS,
    'column-gap': SIZE_PRESETS,
    top: ['0', 'auto', '50%'],
    right: ['0', 'auto', '50%'],
    bottom: ['0', 'auto', '50%'],
    left: ['0', 'auto', '50%'],
    'border-radius': RADIUS_PRESETS,
    'border-width': ['1px', '2px', '3px', '4px'],
    'outline-offset': ['2px', '4px'],
    'z-index': ['0', '1', '10', '100', '999'],
    opacity: ['1', '0.9', '0.75', '0.5', '0'],
    'line-height': ['1', '1.2', '1.5', '1.6', 'normal'],
    'letter-spacing': ['normal', '0.5px', '1px'],
    'word-spacing': ['normal', '2px'],
    'text-indent': ['0', '1em', '2em'],
    'font-size': FONT_SIZE_PRESETS,
    'font-family': ['system-ui, sans-serif', 'Arial, sans-serif', 'Georgia, serif', '"Courier New", monospace'],
    // Layout
    flex: ['1', 'auto', 'none'],
    'flex-grow': ['0', '1'],
    'flex-shrink': ['0', '1'],
    'flex-basis': ['auto', '0', '100px'],
    'grid-template-columns': ['1fr 1fr', 'repeat(3, 1fr)', 'auto'],
    'grid-template-rows': ['auto', '1fr 1fr'],
    'place-items': ['center', 'start', 'end', 'stretch'],
    'aspect-ratio': ['1 / 1', '16 / 9', '4 / 3'],
    // Fundo
    'background-position': ['center', 'top', 'bottom', 'left', 'right'],
    'background-size': ['cover', 'contain', 'auto'],
    'background-repeat': ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'],
    'object-position': ['center', 'top', 'bottom'],
    // Efeitos
    'box-shadow': ['0 1px 3px rgba(0,0,0,0.2)', '0 4px 6px rgba(0,0,0,0.1)', 'none'],
    'text-shadow': ['1px 1px 2px rgba(0,0,0,0.3)', 'none'],
    transition: ['all 0.2s ease', 'all 0.3s ease-in-out', 'transform 0.2s ease'],
    transform: ['none', 'scale(1.05)', 'rotate(45deg)', 'translateY(-2px)'],
    'transform-origin': ['center', 'top left'],
    filter: ['none', 'blur(4px)', 'grayscale(1)', 'brightness(1.2)'],
    'backdrop-filter': ['none', 'blur(8px)'],
    animation: ['spin 1s linear infinite'],
    'list-style': ['none', 'disc', 'circle', 'decimal'],
    content: ['""', "' '"],
    display: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none', 'inline-flex'],
    position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
    'text-align': ['left', 'right', 'center', 'justify'],
    'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '400', '700'],
    'font-style': ['normal', 'italic', 'oblique'],
    'text-decoration': ['none', 'underline', 'line-through', 'overline'],
    'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
    'text-overflow': ['clip', 'ellipsis'],
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
    'align-self': ['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
    'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line'],
    'vertical-align': ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom'],
    'border-style': ['solid', 'dashed', 'dotted', 'double', 'none'],
    'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
    'pointer-events': ['auto', 'none'],
    'user-select': ['auto', 'none', 'text', 'all'],
    resize: ['none', 'both', 'horizontal', 'vertical'],
    appearance: ['none', 'auto'],
    float: ['left', 'right', 'none'],
    clear: ['left', 'right', 'both', 'none'],
    'list-style-type': ['disc', 'circle', 'square', 'decimal', 'none'],
    'scroll-behavior': ['auto', 'smooth'],
  };

  // Propriedades mais relevantes por elemento — aparecem no topo da lista,
  // sem esconder o resto (é só ordenação, tudo continua sugerido).
  const box = ['width', 'height', 'margin', 'padding', 'border', 'border-radius', 'box-sizing', 'box-shadow'];
  const text = ['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'];
  const bg = ['background', 'background-color'];
  const interactive = ['cursor', 'transition', 'outline'];

  const ELEMENT_PRIORITY = {
    button: [...bg, ...box, ...text, ...interactive, 'display'],
    a: ['color', 'text-decoration', 'font-weight', 'cursor', 'display', 'padding', ...bg, 'border-radius'],
    input: [...box, ...bg, ...text, 'outline', 'appearance'],
    textarea: [...box, ...bg, ...text, 'outline', 'resize'],
    select: [...box, ...bg, ...text, 'outline', 'appearance', 'cursor'],
    label: [...text, 'display', 'cursor', 'margin'],
    img: ['width', 'height', 'object-fit', 'border-radius', 'box-shadow', 'display', 'margin', 'filter'],
    p: [...text, 'margin', 'letter-spacing'],
    span: [...text, 'display'],
    h1: [...text, 'margin', 'letter-spacing'],
    h2: [...text, 'margin', 'letter-spacing'],
    h3: [...text, 'margin', 'letter-spacing'],
    h4: [...text, 'margin', 'letter-spacing'],
    h5: [...text, 'margin', 'letter-spacing'],
    h6: [...text, 'margin', 'letter-spacing'],
    ul: ['list-style', 'list-style-type', 'padding', 'margin'],
    ol: ['list-style', 'list-style-type', 'padding', 'margin'],
    li: [...text, 'padding', 'margin'],
    nav: ['display', 'flex-direction', 'justify-content', 'align-items', 'gap', ...bg, 'padding'],
    header: ['display', ...bg, 'padding', 'box-shadow'],
    footer: ['display', ...bg, 'padding'],
    section: ['display', 'padding', 'margin', ...bg],
    article: ['display', 'padding', 'margin', ...bg, 'border-radius', 'box-shadow'],
    main: ['display', 'padding', 'margin', 'max-width'],
    div: ['display', 'position', ...box, ...bg, 'flex-direction', 'justify-content', 'align-items', 'gap', 'overflow'],
    body: [...bg, 'margin', 'padding', 'font-family', 'color'],
    table: ['width', 'border', 'border-collapse', 'margin'],
    form: ['display', 'flex-direction', 'gap', 'padding', ...bg],
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
        return { contentStart, blockText: match[1] };
      }
    }
    return null;
  }

  // Descobre se o cursor está dentro do bloco de declarações de uma regra
  // (depois de um "{" ainda não fechado) e, se estiver, qual é o seletor
  // dessa regra — usado tanto pra decidir "propriedade vs seletor" quanto
  // pra priorizar propriedades relevantes ao elemento (button, input...).
  function getCssPosition(blockText, offset) {
    const openBraces = [];
    for (let i = 0; i < offset; i++) {
      if (blockText[i] === '{') openBraces.push(i);
      else if (blockText[i] === '}') openBraces.pop();
    }
    if (openBraces.length === 0) return { inRule: false, selector: '' };
    const openIndex = openBraces[openBraces.length - 1];
    const beforeBrace = blockText.slice(0, openIndex);
    const selector = beforeBrace.slice(beforeBrace.lastIndexOf('}') + 1).trim();
    return { inRule: true, selector };
  }

  function analyzeDeclaration(prefixText) {
    // Olha só a linha atual (até o cursor): cobre tanto "propriedade: valor"
    // quanto várias declarações na mesma linha, sem se confundir com um
    // ";" de uma declaração anterior ainda não fechada em outra linha. O
    // "{" também conta como fronteira — senão "button { color: |" (seletor
    // e declaração na mesma linha) confundia tudo com o nome do seletor.
    const lineText = prefixText.slice(prefixText.lastIndexOf('\n') + 1);
    const lastBoundary = Math.max(lineText.lastIndexOf(';'), lineText.lastIndexOf('{'));
    const statement = lineText.slice(lastBoundary + 1);
    const colonIndex = statement.indexOf(':');
    if (colonIndex === -1) return { kind: 'property' };
    return { kind: 'value', property: statement.slice(0, colonIndex).trim().toLowerCase() };
  }

  function priorityPropertiesFor(selector) {
    if (!selector) return new Set();
    const tags = Object.keys(ELEMENT_PRIORITY).filter((tag) => new RegExp(`(^|[\\s.,:>+~#\\[])${tag}\\b`, 'i').test(selector));
    const merged = new Set();
    for (const tag of tags) for (const prop of ELEMENT_PRIORITY[tag]) merged.add(prop);
    return merged;
  }

  function init() {
    monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: [':', ' '],
      provideCompletionItems(model, position) {
        if (model.getLanguageId() !== 'html') return { suggestions: [] };
        const block = findStyleBlockAt(model, position);
        if (!block) return { suggestions: [] };

        const offset = model.getOffsetAt(position);
        const offsetInBlock = offset - block.contentStart;
        const cssPos = getCssPosition(block.blockText, offsetInBlock);
        if (!cssPos.inRule) return { suggestions: [] }; // escrevendo o seletor, não uma declaração

        const prefixText = block.blockText.slice(0, offsetInBlock);
        const ctx = analyzeDeclaration(prefixText);
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

        if (ctx.kind === 'value') {
          // Toda propriedade ganha inherit/initial/unset além da lista própria
          // (se tiver) — assim Ctrl+Espaço sempre mostra algo, mesmo pras
          // ~2/3 das propriedades que não têm valores específicos catalogados.
          const values = (CSS_VALUES[ctx.property] || []).concat(GLOBAL_VALUES);
          return {
            suggestions: values.map((value) => ({
              label: value,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: value,
              range,
            })),
          };
        }

        const priority = priorityPropertiesFor(cssPos.selector);
        return {
          suggestions: CSS_PROPERTIES.map(([name, doc]) => {
            const isPriority = priority.has(name);
            return {
              label: name,
              kind: monaco.languages.CompletionItemKind.Property,
              detail: doc,
              insertText: `${name}: $0;`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              // "0..." ordena antes de "1..." — mantém as prioritárias no topo
              // e o resto em seguida, sem esconder nada.
              sortText: (isPriority ? '0' : '1') + name,
              range,
            };
          }),
        };
      },
    });
  }

  return { init };
})();
