/*
 * app.js — orquestra a UI: explorador de arquivos, abas, toolbar,
 * redimensionamento de painéis, modais e barra de status.
 */
(function () {
  // O próprio Monaco cancela pedidos de sugestão/hover em andamento quando um
  // novo pedido os torna obsoletos (ex.: digitando rápido, ou em telas de
  // toque). Isso é interno da biblioteca e não afeta nada, mas some como um
  // "Uncaught (in promise) Canceled" no console — só filtra esse ruído.
  function isCanceledNoise(err) {
    return !!err && err.message === 'Canceled';
  }
  window.addEventListener('unhandledrejection', (e) => {
    if (isCanceledNoise(e.reason)) e.preventDefault();
  });
  window.addEventListener('error', (e) => {
    if (isCanceledNoise(e.error)) e.preventDefault();
  });

  const state = {
    expanded: new Set(['root']),
    selectedId: null,
    creating: null, // { parentId, type }
    renamingId: null,
    projectName: 'Novo Projeto',
    autoRefresh: true,
    previewOpen: false,
    previewEntryId: null, // arquivo .html "fixado" no painel de visualização
    terminalOpen: false,
    sidebarOpen: true,
  };

  const saveTimers = new Map();

  const $ = (sel) => document.querySelector(sel);

  const el = {};

  function cacheEls() {
    el.appBody = $('#app-body');
    el.sidebar = $('#sidebar');
    el.resizer1 = $('#resizer-1');
    el.btnToggleSidebar = $('#btn-toggle-sidebar');
    el.btnFullscreen = $('#btn-fullscreen');
    el.tree = $('#file-tree');
    el.tabs = $('#tabs');
    el.monacoContainer = $('#monaco-container');
    el.previewFrame = $('#preview-frame');
    el.autoRefreshBox = $('#auto-refresh');
    el.statusMode = $('#status-mode');
    el.statusLang = $('#status-lang');
    el.statusMsg = $('#status-msg');
    el.projectNameLabel = $('#project-name');
    el.importInput = $('#import-input');
    el.modalOverlay = $('#modal-overlay');
    el.modalTitle = $('#modal-title');
    el.modalInput = $('#modal-input');
    el.modalError = $('#modal-error');
    el.modalOk = $('#modal-ok');
    el.modalCancel = $('#modal-cancel');
    el.contextMenu = $('#context-menu');
    el.toast = $('#toast');
    el.previewPane = $('#preview-pane');
    el.previewFileName = $('#preview-file-name');
    el.resizer2 = $('#resizer-2');
    el.resizer3 = $('#resizer-3');
    el.terminalPanel = $('#terminal-panel');
    el.pythonConsole = $('#python-console');
    el.btnRunPython = $('#btn-run-python');
    el.btnStopPython = $('#btn-stop-python');
    el.btnClearConsole = $('#btn-clear-console');
  }

  /* ---------------- Utilidades de UI ---------------- */

  function showToast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', !!isError);
    el.toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.toast.classList.add('hidden'), 3500);
  }

  function setStatusMsg(msg) {
    el.statusMsg.textContent = msg;
    clearTimeout(setStatusMsg._t);
    setStatusMsg._t = setTimeout(() => { el.statusMsg.textContent = ''; }, 2500);
  }

  function openModal({ title, value = '', placeholder = '', mode = 'prompt' }) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = title;
      el.modalError.textContent = '';
      el.modalInput.style.display = mode === 'confirm' ? 'none' : 'block';
      el.modalInput.value = value;
      el.modalInput.placeholder = placeholder;
      el.modalOverlay.classList.remove('hidden');
      if (mode !== 'confirm') {
        setTimeout(() => { el.modalInput.focus(); el.modalInput.select(); }, 0);
      }

      function cleanup(result) {
        el.modalOverlay.classList.add('hidden');
        el.modalOk.removeEventListener('click', onOk);
        el.modalCancel.removeEventListener('click', onCancel);
        el.modalInput.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onOk() {
        if (mode === 'confirm') return cleanup(true);
        const val = el.modalInput.value.trim();
        if (!val) { el.modalError.textContent = 'Digite um nome.'; return; }
        cleanup(val);
      }
      function onCancel() { cleanup(mode === 'confirm' ? false : null); }
      function onKeydown(e) {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      }
      el.modalOk.textContent = mode === 'confirm' ? 'Excluir' : 'OK';
      el.modalOk.addEventListener('click', onOk);
      el.modalCancel.addEventListener('click', onCancel);
      el.modalInput.addEventListener('keydown', onKeydown);
    });
  }

  function promptName(title, value = '') {
    return openModal({ title, value, placeholder: 'nome-do-arquivo.html', mode: 'prompt' });
  }

  function confirmAction(title) {
    return openModal({ title, mode: 'confirm' });
  }

  function hideContextMenu() {
    el.contextMenu.classList.add('hidden');
    el.contextMenu.innerHTML = '';
  }

  function showContextMenu(x, y, items) {
    el.contextMenu.innerHTML = '';
    for (const item of items) {
      if (item === '-') {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        el.contextMenu.appendChild(sep);
        continue;
      }
      const div = document.createElement('div');
      div.className = 'ctx-item' + (item.danger ? ' danger' : '');
      div.textContent = item.label;
      div.addEventListener('click', () => { hideContextMenu(); item.action(); });
      el.contextMenu.appendChild(div);
    }
    el.contextMenu.style.left = x + 'px';
    el.contextMenu.style.top = y + 'px';
    el.contextMenu.classList.remove('hidden');
  }

  document.addEventListener('click', hideContextMenu);
  window.addEventListener('blur', hideContextMenu);

  // O menu de botão direito do navegador não combina com um app que imita o VS Code.
  // Trocamos por menus próprios (linhas do explorador) e simplesmente suprimimos o
  // nativo em todo o resto — exceto dentro do Monaco e do iframe de preview, que têm
  // seus próprios menus de contexto (copiar/colar, inspecionar, etc.).
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && (e.target.closest('#monaco-container') || e.target.closest('#preview-frame'))) return;
    e.preventDefault();
  });

  // Mostra/esconde o explorador — libera espaço útil em qualquer tela. Em
  // telas estreitas ele vira uma tela cheia que substitui o editor (não cabe
  // dos dois lado a lado), então volta a fechar sozinho ao escolher um arquivo.
  function isNarrowScreen() {
    return window.matchMedia('(max-width: 800px)').matches;
  }

  function setSidebarOpen(open) {
    state.sidebarOpen = open;
    el.sidebar.classList.toggle('hidden', !open);
    el.resizer1.classList.toggle('hidden', !open);
    el.appBody.classList.toggle('sidebar-open', open);
  }

  function toggleSidebar() {
    setSidebarOpen(!state.sidebarOpen);
  }

  function closeMobileSidebar() {
    if (isNarrowScreen()) setSidebarOpen(false);
  }

  // Tela cheia real do navegador — útil em tablets, onde a barra de
  // endereço/abas come uma boa fatia da tela.
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener('fullscreenchange', () => {
    const isFull = !!document.fullscreenElement;
    el.btnFullscreen.textContent = isFull ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
  });

  function setupTreeContextMenu() {
    el.tree.addEventListener('contextmenu', (e) => {
      if (e.target !== el.tree) return; // clique em cima de uma linha: ela já trata o próprio menu
      e.preventDefault();
      state.selectedId = null;
      renderTree();
      showContextMenu(e.clientX, e.clientY, [
        { label: '📄 Novo arquivo', action: () => beginCreate('root', 'file') },
        { label: '📁 Nova pasta', action: () => beginCreate('root', 'folder') },
      ]);
    });
  }

  // Delete no item selecionado do explorador, como no VS Code.
  // Ignora quando o foco está no editor Monaco ou em algum campo de texto
  // (renomear/criar/modal), para não atrapalhar a edição normal do código.
  document.addEventListener('keydown', async (e) => {
    if (e.key !== 'Delete') return;
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (target.closest && target.closest('#monaco-container')) return;
    if (!el.modalOverlay.classList.contains('hidden')) return;
    if (state.creating || state.renamingId) return;
    if (!state.selectedId || !VFS.get(state.selectedId)) return;
    e.preventDefault();
    await doDelete(state.selectedId);
  });

  // Ctrl+S em qualquer lugar da página (fora do editor, que já tem seu próprio
  // atalho registrado no Monaco): impede o navegador de abrir "Salvar página como".
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    saveActiveFile();
  });

  // Ctrl+` mostra/esconde o terminal, igual ao VS Code.
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.key !== '`') return;
    e.preventDefault();
    toggleTerminal();
  });

  /* ---------------- Explorador de arquivos ---------------- */

  function iconFor(node) {
    if (node.type === 'folder') return state.expanded.has(node.id) ? '📂' : '📁';
    const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
    const map = { html: '🌐', htm: '🌐', css: '🎨', js: '📜', mjs: '📜', py: '🐍', pyw: '🐍', json: '🧩', md: '📝', svg: '🖼️', xml: '🧾' };
    return map[ext] || '📄';
  }

  function renderTree() {
    el.tree.innerHTML = '';
    const root = VFS.getRoot();
    renderChildren(root, el.tree, 0);
    if (state.creating && state.creating.parentId === 'root') {
      el.tree.appendChild(buildCreateRow(0));
    }
  }

  function renderChildren(folderNode, container, depth) {
    for (const child of folderNode.children) {
      container.appendChild(buildRow(child, depth));
      if (child.type === 'folder' && state.expanded.has(child.id)) {
        renderChildren(child, container, depth + 1);
        if (state.creating && state.creating.parentId === child.id) {
          container.appendChild(buildCreateRow(depth + 1));
        }
      }
    }
  }

  function buildRow(node, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row' + (state.selectedId === node.id ? ' selected' : '');
    row.style.paddingLeft = (depth * 14 + (node.type === 'folder' ? 2 : 20)) + 'px';
    row.dataset.id = node.id;

    if (node.type === 'folder') {
      const twisty = document.createElement('span');
      twisty.className = 'twisty';
      twisty.textContent = state.expanded.has(node.id) ? '▾' : '▸';
      row.appendChild(twisty);
    }

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = iconFor(node);
    row.appendChild(icon);

    if (state.renamingId === node.id) {
      const input = document.createElement('input');
      input.className = 'inline-edit';
      input.value = node.name;
      row.appendChild(input);
      setTimeout(() => { input.focus(); input.select(); }, 0);
      let renameFinished = false;
      const finish = (commit) => {
        if (renameFinished) return;
        renameFinished = true;
        state.renamingId = null;
        if (commit) {
          const newName = input.value.trim();
          if (newName && newName !== node.name) doRename(node.id, newName);
          else renderTree();
        } else {
          renderTree();
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    } else {
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = node.name;
      row.appendChild(name);
    }

    row.addEventListener('click', () => {
      state.selectedId = node.id;
      if (node.type === 'folder') {
        toggleFolder(node.id);
      } else {
        Editor.open(node);
        renderTabs();
        closeMobileSidebar(); // no celular, escolher um arquivo já volta pro editor
      }
      renderTree();
    });

    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      state.renamingId = node.id;
      renderTree();
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.selectedId = node.id;
      renderTree();
      const items = [];
      if (node.type === 'folder') {
        items.push({ label: '📄 Novo arquivo', action: () => beginCreate(node.id, 'file') });
        items.push({ label: '📁 Nova pasta', action: () => beginCreate(node.id, 'folder') });
        items.push('-');
      } else {
        const lang = Editor.languageFor(node.name);
        if (lang === 'html') {
          items.push({ label: '👁️ Visualizar', action: () => openPreview(node.id) });
          items.push('-');
        } else if (lang === 'python') {
          items.push({ label: '▶️ Executar', action: () => runPythonFile(node.id) });
          items.push('-');
        }
      }
      items.push({ label: '✏️ Renomear', action: () => { state.renamingId = node.id; renderTree(); } });
      items.push({ label: '🗑️ Excluir', danger: true, action: () => doDelete(node.id) });
      showContextMenu(e.clientX, e.clientY, items);
    });

    return row;
  }

  function buildCreateRow(depth) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (depth * 14 + 20) + 'px';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = state.creating.type === 'folder' ? '📁' : '📄';
    row.appendChild(icon);
    const input = document.createElement('input');
    input.className = 'inline-edit';
    input.placeholder = state.creating.type === 'folder' ? 'nome-da-pasta' : 'arquivo.html';
    row.appendChild(input);
    setTimeout(() => input.focus(), 0);

    let createFinished = false;
    const finish = (commit) => {
      if (createFinished) return;
      createFinished = true;
      const creating = state.creating;
      state.creating = null;
      if (commit) {
        const name = input.value.trim();
        if (name) doCreate(creating.parentId, creating.type, name);
        else renderTree();
      } else {
        renderTree();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    return row;
  }

  function toggleFolder(id) {
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
  }

  function beginCreate(parentId, type) {
    state.expanded.add(parentId);
    state.creating = { parentId, type };
    setSidebarOpen(true); // garante que o explorador esteja visível pra mostrar o campo novo
    renderTree();
  }

  async function doCreate(parentId, type, name) {
    try {
      const node = type === 'file' ? VFS.createFile(parentId, name) : VFS.createFolder(parentId, name);
      if (LocalDisk.isLinked()) {
        if (type === 'file') {
          const handle = await LocalDisk.createFileOnDisk(parentId, name, '');
          if (handle) VFS.setHandle(node.id, handle);
        } else {
          const handle = await LocalDisk.createFolderOnDisk(parentId, name);
          if (handle) VFS.setHandle(node.id, handle);
        }
      }
      renderTree();
      if (type === 'file') {
        Editor.open(node);
        renderTabs();
        refreshPreview();
      }
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function doRename(id, newName) {
    const node = VFS.get(id);
    const oldName = node.name;
    try {
      VFS.rename(id, newName);
      Editor.renameOpen(id, newName);
      if (LocalDisk.isLinked() && node.type === 'file') {
        const parent = VFS.findParent(id);
        const oldHandle = VFS.getHandle(id);
        const newHandle = await LocalDisk.createFileOnDisk(parent.id, newName, node.content);
        if (newHandle) {
          VFS.setHandle(id, newHandle);
          await LocalDisk.removeFromDisk(parent.id, oldName);
        }
      } else if (LocalDisk.isLinked() && node.type === 'folder') {
        showToast('O nome mudou só no editor: pastas não são renomeadas no disco automaticamente.');
      }
      renderTree();
      renderTabs();
      refreshPreview();
    } catch (e) {
      showToast(e.message, true);
      renderTree();
    }
  }

  async function doDelete(id) {
    const node = VFS.get(id);
    const ok = await confirmAction(`Excluir "${node.name}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    const parent = VFS.findParent(id);
    if (LocalDisk.isLinked() && parent) {
      await LocalDisk.removeFromDisk(parent.id, node.name);
    }
    const removedFileIds = collectFileIds(node);
    removedFileIds.forEach((fid) => Editor.closeAllFor(fid));
    VFS.remove(id);
    if (state.selectedId === id) state.selectedId = null;
    if (state.previewEntryId && removedFileIds.includes(state.previewEntryId)) closePreview();
    renderTree();
    renderTabs();
    refreshPreview();
  }

  function collectFileIds(node, out = []) {
    if (node.type === 'file') out.push(node.id);
    else node.children.forEach((c) => collectFileIds(c, out));
    return out;
  }

  /* ---------------- Abas (tabs) ---------------- */

  function renderTabs() {
    el.tabs.innerHTML = '';
    const openTabs = Editor.getOpenTabs();
    const activeId = Editor.getActiveId();
    for (const id of openTabs) {
      const node = VFS.get(id);
      if (!node) continue;
      const tab = document.createElement('div');
      tab.className = 'tab' + (id === activeId ? ' active' : '');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'tab-name';
      nameSpan.textContent = node.name;
      const dirty = document.createElement('span');
      dirty.className = 'tab-dirty';
      dirty.textContent = Editor.isDirty(id) ? '●' : '';
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '✕';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        Editor.close(id);
        renderTabs();
        renderTree();
      });
      tab.appendChild(nameSpan);
      tab.appendChild(dirty);
      tab.appendChild(close);
      tab.addEventListener('click', () => {
        Editor.activate(id);
        state.selectedId = id;
        renderTabs();
        renderTree();
        updateStatusBar();
      });
      tab.addEventListener('auxclick', (e) => {
        if (e.button === 1) { Editor.close(id); renderTabs(); renderTree(); }
      });
      el.tabs.appendChild(tab);
    }
    updateStatusBar();
  }

  function updateStatusBar() {
    const activeId = Editor.getActiveId();
    const node = activeId ? VFS.get(activeId) : null;
    el.statusLang.textContent = node ? Editor.languageFor(node.name) : '';
    el.statusMode.textContent = LocalDisk.isLinked()
      ? `📂 Pasta: ${VFS.getLocalRootName()}`
      : '💾 localStorage';
  }

  /* ---------------- Preview / salvamento com debounce ---------------- */

  async function commitSave(fileId) {
    clearTimeout(saveTimers.get(fileId));
    saveTimers.delete(fileId);
    const content = Editor.getValue(fileId);
    if (content === null) return;
    VFS.updateContent(fileId, content);
    if (LocalDisk.isLinked()) await LocalDisk.writeFile(fileId);
    Editor.markClean(fileId);
    renderTabs();
  }

  function onEditorChange(fileId, content) {
    renderTabs();
    clearTimeout(saveTimers.get(fileId));
    saveTimers.set(fileId, setTimeout(async () => {
      await commitSave(fileId);
      if (state.autoRefresh) refreshPreview();
    }, 350));
  }

  function onEditorActiveChange(fileId) {
    updateStatusBar();
  }

  function refreshPreview() {
    if (!state.previewOpen || !state.previewEntryId) return;
    updatePreviewFileName();
    Preview.render(state.previewEntryId);
  }

  function updatePreviewFileName() {
    const node = VFS.get(state.previewEntryId);
    el.previewFileName.textContent = node ? node.name : '';
  }

  // Ctrl+S: salva o arquivo ativo na hora (sem esperar o debounce) e sempre
  // atualiza a visualização (se estiver aberta), mesmo com o "auto" desligado.
  async function saveActiveFile() {
    const activeId = Editor.getActiveId();
    if (activeId) await commitSave(activeId);
    refreshPreview();
    setStatusMsg('💾 Salvo');
  }

  /* ---------------- Painel de visualização (aberto sob demanda) ---------------- */

  function openPreview(fileId) {
    state.previewOpen = true;
    state.previewEntryId = fileId;
    el.previewPane.classList.remove('hidden');
    el.resizer2.classList.remove('hidden');
    refreshPreview();
  }

  function closePreview() {
    state.previewOpen = false;
    el.previewPane.classList.add('hidden');
    el.resizer2.classList.add('hidden');
  }

  /* ---------------- Terminal (painel de baixo, como no VS Code) ---------------- */

  function openTerminal() {
    state.terminalOpen = true;
    el.terminalPanel.classList.remove('hidden');
    el.resizer3.classList.remove('hidden');
  }

  function closeTerminal() {
    state.terminalOpen = false;
    el.terminalPanel.classList.add('hidden');
    el.resizer3.classList.add('hidden');
  }

  function toggleTerminal() {
    if (state.terminalOpen) closeTerminal();
    else openTerminal();
  }

  function appendConsoleLine(kind, text) {
    const line = document.createElement('div');
    line.className = 'py-line' + (kind === 'stderr' ? ' py-stderr' : kind === 'system' ? ' py-system' : '');
    line.textContent = text;
    el.pythonConsole.appendChild(line);
    el.pythonConsole.scrollTop = el.pythonConsole.scrollHeight;
  }

  function setPythonRunning(running) {
    el.btnRunPython.disabled = running;
    el.btnRunPython.classList.toggle('hidden', running);
    el.btnStopPython.classList.toggle('hidden', !running);
  }

  async function runPythonFile(fileId) {
    const node = fileId && VFS.get(fileId);
    if (!node || Editor.languageFor(node.name) !== 'python') {
      showToast('Selecione um arquivo .py para executar.', true);
      return;
    }
    if (Editor.getActiveId() !== fileId) {
      Editor.open(node);
      state.selectedId = node.id;
      renderTabs();
      renderTree();
    }
    await commitSave(fileId);

    openTerminal();
    el.pythonConsole.innerHTML = '';
    setPythonRunning(true);
    if (!PyRunner.isReady()) {
      appendConsoleLine('system', '⏳ Carregando Python (Pyodide)... pode levar alguns segundos na primeira vez.');
    }
    try {
      await PyRunner.run(Editor.getValue(fileId));
      appendConsoleLine('system', '✓ Concluído.');
    } catch (e) {
      appendConsoleLine('stderr', (e && e.message) || String(e));
      appendConsoleLine('system', '✗ Encerrado com erro.');
    } finally {
      setPythonRunning(false);
    }
  }

  function stopPython() {
    PyRunner.stop();
    appendConsoleLine('system', '⏹️ Interrompido.');
    setPythonRunning(false);
  }

  function setupPythonConsole() {
    // Só registra pra onde mandar a saída; o worker/Pyodide só é carregado
    // de verdade na primeira execução (PyRunner.run), pra não pesar o
    // carregamento inicial de quem nem usa Python.
    PyRunner.setOutputHandler((kind, text) => appendConsoleLine(kind, text));
    el.btnRunPython.addEventListener('click', () => runPythonFile(Editor.getActiveId()));
    el.btnStopPython.addEventListener('click', stopPython);
    el.btnClearConsole.addEventListener('click', () => { el.pythonConsole.innerHTML = ''; });
    $('#btn-close-terminal').addEventListener('click', closeTerminal);
    $('#btn-toggle-terminal').addEventListener('click', toggleTerminal);
    $('#btn-close-preview').addEventListener('click', closePreview);
  }

  /* ---------------- Toolbar ---------------- */

  function setupToolbar() {
    el.btnToggleSidebar.addEventListener('click', toggleSidebar);
    el.btnFullscreen.addEventListener('click', toggleFullscreen);
    $('#btn-new-file').addEventListener('click', () => beginCreate(rootOrSelectedFolder(), 'file'));
    $('#btn-new-folder').addEventListener('click', () => beginCreate(rootOrSelectedFolder(), 'folder'));
    $('#side-new-file').addEventListener('click', () => beginCreate(rootOrSelectedFolder(), 'file'));
    $('#side-new-folder').addEventListener('click', () => beginCreate(rootOrSelectedFolder(), 'folder'));

    $('#btn-open-folder').addEventListener('click', async () => {
      if (!LocalDisk.supported) {
        showToast('Seu navegador não suporta abrir pastas locais. Use Chrome/Edge, ou tente "Importar".', true);
        return;
      }
      try {
        const name = await LocalDisk.openFolder();
        el.projectNameLabel.textContent = name;
        resetEditorState();
        renderTree();
        openDefaultFile();
        showToast(`Pasta "${name}" aberta. Alterações são salvas direto no disco.`);
      } catch (e) {
        if (e.name !== 'AbortError') showToast(e.message, true);
      }
    });

    $('#btn-import').addEventListener('click', () => el.importInput.click());
    el.importInput.addEventListener('change', async () => {
      try {
        const root = await Zip.importFromFileList(el.importInput.files);
        el.projectNameLabel.textContent = root.name;
        VFS.resetTo(root);
        VFS.setLocalRootName(null);
        resetEditorState();
        renderTree();
        openDefaultFile();
        showToast(`Pasta "${root.name}" importada (cópia em memória — use "Baixar .zip" para salvar).`);
      } catch (e) {
        showToast(e.message, true);
      } finally {
        el.importInput.value = '';
      }
    });

    $('#btn-export-zip').addEventListener('click', async () => {
      await Zip.exportProject(state.projectName);
      setStatusMsg('Projeto exportado como .zip');
    });

    $('#btn-reset').addEventListener('click', async () => {
      const ok = await confirmAction('Começar um projeto novo? O projeto atual salvo neste navegador será substituído.');
      if (!ok) return;
      VFS.resetTo(buildDefaultProject());
      VFS.setLocalRootName(null);
      state.projectName = 'Novo Projeto';
      el.projectNameLabel.textContent = '';
      resetEditorState();
      renderTree();
      openDefaultFile();
    });

    el.autoRefreshBox.addEventListener('change', () => {
      state.autoRefresh = el.autoRefreshBox.checked;
      if (state.autoRefresh) refreshPreview();
    });
    $('#btn-refresh-preview').addEventListener('click', refreshPreview);
    $('#btn-open-preview-tab').addEventListener('click', () => Preview.openInNewTab());
  }

  function rootOrSelectedFolder() {
    if (!state.selectedId) return 'root';
    return VFS.folderOf(state.selectedId);
  }

  function resetEditorState() {
    for (const id of Editor.getOpenTabs()) Editor.close(id);
    state.selectedId = null;
    state.expanded = new Set(['root']);
    renderTabs();
  }

  function openDefaultFile() {
    const root = VFS.getRoot();
    const index = root.children.find((c) => c.type === 'file' && c.name.toLowerCase() === 'index.html');
    const first = index || root.children.find((c) => c.type === 'file');
    if (first) {
      Editor.open(first);
      state.selectedId = first.id;
    }
    renderTabs();
    renderTree();
    refreshPreview();
  }

  /* ---------------- Redimensionamento dos painéis ---------------- */

  function setupResizers() {
    setupResizer($('#resizer-1'), (dx) => {
      const sidebar = $('#sidebar');
      const newWidth = sidebar.offsetWidth + dx;
      sidebar.style.width = Math.max(160, Math.min(500, newWidth)) + 'px';
    });
    setupResizer($('#resizer-2'), (dx) => {
      const preview = $('#preview-pane');
      const newWidth = preview.offsetWidth - dx;
      preview.style.width = Math.max(220, Math.min(window.innerWidth * 0.75, newWidth)) + 'px';
    });
    setupResizer($('#resizer-3'), (dx, dy) => {
      const terminal = el.terminalPanel;
      const newHeight = terminal.offsetHeight - dy; // arrastar pra cima aumenta a altura
      terminal.style.height = Math.max(120, Math.min(window.innerHeight * 0.7, newHeight)) + 'px';
    });
  }

  function setupResizer(handle, onDrag) {
    // Pointer Events cobrem mouse, toque e caneta com o mesmo código — mousedown
    // sozinho não funciona em celular/tablet (não existe "arrastar com o dedo"
    // via evento de mouse). setPointerCapture garante que o arraste continua
    // recebendo eventos mesmo se o ponteiro sair da faixa fina do divisor.
    let lastX = 0;
    let lastY = 0;
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId);
      lastX = e.clientX;
      lastY = e.clientY;
      handle.classList.add('dragging');
      document.body.style.cursor = getComputedStyle(handle).cursor;
      // Enquanto arrasta, o iframe do preview não pode "roubar" os eventos de
      // ponteiro do documento principal — senão o arraste trava ao passar por cima dele.
      el.previewFrame.style.pointerEvents = 'none';
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      onDrag(dx, dy);
    });
    function endDrag(e) {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      handle.releasePointerCapture(e.pointerId);
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      el.previewFrame.style.pointerEvents = '';
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  /* ---------------- Boot ---------------- */

  function boot() {
    cacheEls();
    VFS.init(buildDefaultProject);
    setupToolbar();
    setupResizers();
    setupTreeContextMenu();
    setupPythonConsole();
    setSidebarOpen(!isNarrowScreen()); // começa aberta em telas largas, fechada em celular

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      // O bundle "editor.main" só traz o realce de sintaxe. Os módulos abaixo
      // ligam o IntelliSense de verdade (sugestões de tags, hover, etc.) pra
      // HTML/CSS/JS/JSON, igual ao VS Code.
      require(['vs/language/html/htmlMode', 'vs/language/css/cssMode', 'vs/language/json/jsonMode', 'vs/language/typescript/tsMode'], () => {});
      EmbeddedCssIntellisense.init();
      EmbeddedJsIntellisense.init();
      HtmlIntellisense.init();

      Editor.init(el.monacoContainer, { onChange: onEditorChange, onActiveChange: onEditorActiveChange, onSave: saveActiveFile, onRun: () => runPythonFile(Editor.getActiveId()) });
      Preview.init(el.previewFrame);
      renderTree();
      openDefaultFile();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
