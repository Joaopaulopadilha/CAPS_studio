/*
 * PyRunner: fala com o Web Worker do Python (python-worker.js) e expõe
 * uma API simples de "rodar código e receber a saída" pro app.js.
 */
const PyRunner = (() => {
  let worker = null;
  let readyPromise = null;
  let pending = new Map(); // id -> { resolve, reject }
  let runCounter = 0;
  let onOutputCallback = null;

  function handleMessage(e) {
    const msg = e.data;
    if (msg.type === 'stdout' || msg.type === 'stderr') {
      if (onOutputCallback) onOutputCallback(msg.type, msg.text);
    } else if (msg.type === 'done' || msg.type === 'error') {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.type === 'done') entry.resolve();
      else entry.reject(new Error(msg.error));
    }
  }

  function ensureWorker() {
    if (worker) return;
    worker = new Worker('js/python-worker.js');
    worker.addEventListener('message', handleMessage);
  }

  function setOutputHandler(onOutput) {
    onOutputCallback = onOutput;
  }

  function init() {
    ensureWorker();
    if (!readyPromise) {
      readyPromise = new Promise((resolve, reject) => {
        function onReady(e) {
          if (e.data.type === 'ready') {
            worker.removeEventListener('message', onReady);
            resolve();
          } else if (e.data.type === 'init-error') {
            worker.removeEventListener('message', onReady);
            reject(new Error(e.data.error));
          }
        }
        worker.addEventListener('message', onReady);
        worker.postMessage({ type: 'init' });
      });
    }
    return readyPromise;
  }

  async function run(code) {
    await init();
    const id = ++runCounter;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'run', id, code });
    });
  }

  function isReady() {
    return !!readyPromise;
  }

  function stop() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    readyPromise = null;
    for (const { reject } of pending.values()) reject(new Error('Execução interrompida.'));
    pending.clear();
  }

  return { setOutputHandler, run, isReady, stop };
})();
