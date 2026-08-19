/*
 * LocalDisk: liga a VFS a uma pasta real do computador usando a
 * File System Access API (showDirectoryPicker). Onde não houver
 * suporte (Firefox/Safari), o app cai para localStorage + import/zip.
 */
const LocalDisk = (() => {
  const supported = 'showDirectoryPicker' in window;

  async function readDirRecursive(dirHandle, handleMap) {
    const folderNode = VFS.createNode('folder', dirHandle.name);
    folderNode.children = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue; // ignora .git etc.
      if (handle.kind === 'directory') {
        const child = await readDirRecursive(handle, handleMap);
        handleMap.set(child.id, handle);
        folderNode.children.push(child);
      } else {
        const file = await handle.getFile();
        const isTextLike = /\.(html|htm|css|js|mjs|json|md|txt|svg|xml)$/i.test(name);
        let content = '';
        if (isTextLike) {
          content = await file.text();
        } else {
          content = `/* Arquivo binário "${name}" não é editável aqui. */`;
        }
        const child = VFS.createNode('file', name, content);
        handleMap.set(child.id, handle);
        folderNode.children.push(child);
      }
    }
    VFS.sortChildren(folderNode);
    return folderNode;
  }

  async function openFolder() {
    if (!supported) throw new Error('Este navegador não suporta abrir pastas locais (use Chrome ou Edge).');
    const dirHandle = await window.showDirectoryPicker();
    const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Permissão de escrita negada.');
    const handleMap = new Map();
    const root = await readDirRecursive(dirHandle, handleMap);
    VFS.resetTo(root); // define root.id = 'root' e reindexa nodesById
    for (const [id, handle] of handleMap) VFS.setHandle(id, handle);
    VFS.setHandle('root', dirHandle);
    VFS.setLocalRootName(dirHandle.name);
    return dirHandle.name;
  }

  async function writeFile(fileId) {
    const handle = VFS.getHandle(fileId);
    const node = VFS.get(fileId);
    if (!handle || !node) return false;
    try {
      const writable = await handle.createWritable();
      await writable.write(node.content);
      await writable.close();
      return true;
    } catch (e) {
      console.warn('Falha ao escrever no disco:', e);
      return false;
    }
  }

  async function createFileOnDisk(parentId, name, content) {
    const parentHandle = VFS.getHandle(parentId);
    if (!parentHandle) return null;
    const fileHandle = await parentHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return fileHandle;
  }

  async function createFolderOnDisk(parentId, name) {
    const parentHandle = VFS.getHandle(parentId);
    if (!parentHandle) return null;
    return await parentHandle.getDirectoryHandle(name, { create: true });
  }

  async function removeFromDisk(parentId, name) {
    const parentHandle = VFS.getHandle(parentId);
    if (!parentHandle) return false;
    try {
      await parentHandle.removeEntry(name, { recursive: true });
      return true;
    } catch (e) {
      console.warn('Falha ao remover do disco:', e);
      return false;
    }
  }

  function isLinked() {
    return !!VFS.getHandle('root');
  }

  return {
    supported,
    openFolder,
    writeFile,
    createFileOnDisk,
    createFolderOnDisk,
    removeFromDisk,
    isLinked,
  };
})();
