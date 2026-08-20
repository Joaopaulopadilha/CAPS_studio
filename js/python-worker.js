/*
 * Web Worker que roda Python de verdade no navegador via Pyodide (WebAssembly).
 * Fica isolado do thread principal pra não travar a interface durante a execução.
 */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js');

let pyodideReadyPromise = null;

// Buffers compartilhados com o thread principal pra input() funcionar de
// verdade: Atomics.wait() trava a execução do worker (sem travar a página)
// até o thread principal escrever a resposta do usuário e notificar de volta.
// Só existem se o navegador estiver "cross-origin isolated" (ver
// coi-serviceworker.js); sem isso, input() volta string vazia na hora.
let controlView = null;
let textBuffer = null;

function syncStdin() {
  if (!controlView) return '';
  Atomics.store(controlView, 0, 0); // 0 = esperando resposta
  postMessage({ type: 'input-request' });
  Atomics.wait(controlView, 0, 0); // trava aqui até o main thread notificar
  const len = Atomics.load(controlView, 1);
  // TextDecoder.decode() recusa ler direto de uma view compartilhada —
  // copia pra um buffer comum antes.
  const bytes = new Uint8Array(len);
  bytes.set(new Uint8Array(textBuffer, 0, len));
  return new TextDecoder().decode(bytes);
}

function ensurePyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = loadPyodide({
      stdout: (text) => postMessage({ type: 'stdout', text }),
      stderr: (text) => postMessage({ type: 'stderr', text }),
      stdin: syncStdin,
    });
  }
  return pyodideReadyPromise;
}

function formatError(err) {
  // Erros de código Python chegam com o traceback completo em err.message.
  return (err && err.message) || String(err);
}

self.onmessage = async (e) => {
  const { type, id, code } = e.data;

  if (type === 'buffers') {
    controlView = new Int32Array(e.data.controlBuffer);
    textBuffer = e.data.textBuffer;
    return;
  }

  if (type === 'init') {
    try {
      await ensurePyodide();
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'init-error', error: formatError(err) });
    }
    return;
  }

  if (type === 'run') {
    try {
      const pyodide = await ensurePyodide();
      // Cada execução ganha um namespace novo, pra variáveis de uma rodada
      // anterior não vazarem pra próxima (mesma ideia de "rodar do zero").
      const namespace = pyodide.globals.get('dict')();
      try {
        await pyodide.runPythonAsync(code, { globals: namespace });
      } finally {
        namespace.destroy();
      }
      postMessage({ type: 'done', id });
    } catch (err) {
      postMessage({ type: 'error', id, error: formatError(err) });
    }
  }
};
