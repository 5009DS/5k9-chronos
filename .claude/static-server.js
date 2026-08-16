// Servidor estático mínimo para pré-visualizar o Sistema/ localmente.
// Necessário porque módulos ES não carregam via file://
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'Sistema');
// A porta vem do ambiente quando quem inicia é o preview (autoPort), que
// escolhe uma livre. 5175 continua sendo o padrão para execução manual.
// Nada aqui depende de uma porta fixa — não há callback de OAuth, webhook
// nem CORS amarrado a ela; o login do Supabase é por e-mail e senha.
const PORT = Number(process.env.PORT) || 5175;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const file = path.join(ROOT, rel);

    if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    const entregar = (caminho) => fs.readFile(caminho, (err, data) => {
        if (err) { res.writeHead(404).end('Not found'); return; }
        // no-store: sem isto o Chrome cacheia os módulos ES por heurística e
        // uma edição no código não aparece nem com reload forçado.
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(caminho).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(data);
    });

    // Fallback de SPA: rota sem extensão (/forms, /f/abc) não é arquivo —
    // devolve o index.html e deixa o roteador do app resolver. Espelha o
    // rewrite do vercel.json, para o local e a produção se comportarem
    // igual. Caminhos COM extensão continuam 404 quando não existem, senão
    // um .js digitado errado voltaria HTML e o erro ficaria indecifrável.
    fs.access(file, fs.constants.R_OK, (err) => {
        if (err && !path.extname(file)) return entregar(path.join(ROOT, 'index.html'));
        entregar(file);
    });
}).listen(PORT, () => console.log(`5K9 Chronos em http://localhost:${PORT}`));
