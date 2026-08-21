/*
 * EmbeddedColorProvider: mostra a amostra de cor clicável (como no VS Code)
 * ao lado de valores de cor dentro de um <style> embutido no HTML — o
 * Monaco já faz isso sozinho em arquivos .css separados, só não estende
 * pra dentro do HTML.
 *
 * Pra cores nomeadas (ex.: "cornflowerblue"), em vez de guardar uma tabela
 * própria de valores RGB (arriscado errar um dos ~140 nomes de cor do
 * CSS), a gente pergunta pro próprio navegador: atribui o nome a
 * elemento.style.color e lê de volta o valor computado — sempre correto,
 * porque usa a mesma tabela que o navegador usa pra desenhar a página.
 */
const EmbeddedColorProvider = (() => {
  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
  const FUNC_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;
  const WORD_RE = /\b[a-zA-Z]+\b/g;

  const colorCache = new Map(); // nome em minúsculas -> {red,green,blue,alpha} | null
  let probeEl = null;

  function getProbeEl() {
    if (!probeEl) {
      probeEl = document.createElement('div');
      probeEl.style.display = 'none';
      document.body.appendChild(probeEl);
    }
    return probeEl;
  }

  function resolveNamedColor(name) {
    const lower = name.toLowerCase();
    if (colorCache.has(lower)) return colorCache.get(lower);
    const el = getProbeEl();
    el.style.color = '';
    el.style.color = name;
    let result = null;
    if (el.style.color) {
      result = parseRgbString(getComputedStyle(el).color);
    }
    colorCache.set(lower, result);
    return result;
  }

  function parseRgbString(str) {
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const parts = m[1].split(',').map((s) => parseFloat(s));
    if (parts.slice(0, 3).some(Number.isNaN)) return null;
    return {
      red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255,
      alpha: parts[3] !== undefined ? parts[3] : 1,
    };
  }

  function parseHex(hex) {
    let h = hex.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const red = parseInt(h.slice(0, 2), 16) / 255;
    const green = parseInt(h.slice(2, 4), 16) / 255;
    const blue = parseInt(h.slice(4, 6), 16) / 255;
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    if ([red, green, blue].some(Number.isNaN)) return null;
    return { red, green, blue, alpha };
  }

  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
  }

  function parseFunctional(str) {
    const m = str.match(/^(rgba?|hsla?)\(([^)]+)\)$/i);
    if (!m) return null;
    const parts = m[2].split(',').map((s) => s.trim());
    if (/^hsl/i.test(m[1])) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;
      const alpha = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
      if ([h, s, l].some(Number.isNaN)) return null;
      const [red, green, blue] = hslToRgb(h, s, l);
      return { red, green, blue, alpha };
    }
    const red = parseFloat(parts[0]) / 255;
    const green = parseFloat(parts[1]) / 255;
    const blue = parseFloat(parts[2]) / 255;
    const alpha = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    if ([red, green, blue].some(Number.isNaN)) return null;
    return { red, green, blue, alpha };
  }

  function findStyleBlocks(text) {
    const blocks = [];
    const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = re.exec(text))) {
      const contentStart = match.index + match[0].indexOf('>') + 1;
      blocks.push({ start: contentStart, text: match[1] });
    }
    return blocks;
  }

  function collectColorsIn(text, baseOffset, model, results) {
    const seen = []; // evita contar a mesma faixa de texto duas vezes (ex.: "rgb" dentro de "rgb(...)")
    const overlaps = (start, end) => seen.some((r) => start < r.end && end > r.start);
    const addMatch = (start, end, color) => {
      seen.push({ start, end });
      const startPos = model.getPositionAt(baseOffset + start);
      const endPos = model.getPositionAt(baseOffset + end);
      results.push({
        range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        color,
      });
    };

    HEX_RE.lastIndex = 0;
    let m;
    while ((m = HEX_RE.exec(text))) {
      const color = parseHex(m[0]);
      if (color) addMatch(m.index, m.index + m[0].length, color);
    }
    FUNC_RE.lastIndex = 0;
    while ((m = FUNC_RE.exec(text))) {
      const color = parseFunctional(m[0]);
      if (color) addMatch(m.index, m.index + m[0].length, color);
    }
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue; // já é parte de um rgb()/hsl() contado acima
      const color = resolveNamedColor(m[0]);
      if (color) addMatch(start, end, color);
    }
  }

  function toHex2(v) {
    return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  }

  function init() {
    monaco.languages.registerColorProvider('html', {
      provideDocumentColors(model) {
        if (model.getLanguageId() !== 'html') return [];
        const text = model.getValue();
        const results = [];
        for (const block of findStyleBlocks(text)) {
          // só dentro do valor de cada declaração ("prop: valor;"), não no
          // nome da propriedade nem no seletor
          const declRe = /:([^;{}]+);/g;
          let m;
          while ((m = declRe.exec(block.text))) {
            const valueOffset = block.start + m.index + 1;
            collectColorsIn(m[1], valueOffset, model, results);
          }
        }
        return results;
      },
      provideColorPresentations(model, colorInfo) {
        const { red, green, blue, alpha } = colorInfo.color;
        const hex = `#${toHex2(red)}${toHex2(green)}${toHex2(blue)}${alpha < 1 ? toHex2(alpha) : ''}`;
        const r = Math.round(red * 255);
        const g = Math.round(green * 255);
        const b = Math.round(blue * 255);
        const rgb = alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})` : `rgb(${r}, ${g}, ${b})`;
        return [{ label: hex }, { label: rgb }];
      },
    });
  }

  return { init };
})();
