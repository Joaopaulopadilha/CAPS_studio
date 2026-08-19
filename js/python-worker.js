/*
 * Web Worker que roda Python de verdade no navegador via Pyodide (WebAssembly).
 * Fica isolado do thread principal pra não travar a interface durante a execução.
 */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js');

let pyodideReadyPromise = null;

function ensurePyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = loadPyodide({
      stdout: (text) => postMessage({ type: 'stdout', text }),
      stderr: (text) => postMessage({ type: 'stderr', text }),
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
