/*
 * Conteúdo inicial do projeto: apenas um index.html mínimo.
 */
function buildDefaultProject() {
  const root = { id: 'root', type: 'folder', name: '', children: [] };

  const file = (name, content) => ({ id: 'tmp_' + Math.random(), type: 'file', name, content });

  root.children.push(file('index.html', INDEX_HTML));

  return root;
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Meu Projeto</title>
</head>
<body>

  <h1>Olá, mundo!</h1>

</body>
</html>
`;
