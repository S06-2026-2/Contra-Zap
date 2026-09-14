// docs/servir.js
// Servidor da documentação de API. Roda POR FORA do Server.js: não importa
// nada do projeto, não abre banco, não toca no jogo. É só um estático com
// proxy — dá pra apagar este arquivo que o jogo continua igual.
//
//   node docs/servir.js        (ou `npm run docs`)  ->  http://localhost:3001
//
// Por que ele também faz proxy pro jogo, em vez de ser só um estático:
//
//   O socket.io do Server.js não habilita CORS (`new Server(server, {...})`
//   sem a opção `cors`), então o default do socket.io v4 vale: conexão de
//   outra origem é recusada. Uma página em :3001 falando direto com :3000
//   seria bloqueada pelo navegador. Como servir a doc de dentro do Server.js
//   está fora de questão (ela é "por fora"), o caminho que sobra sem mexer
//   no jogo é este: tudo que não é documentação é repassado pra :3000, então
//   a página conversa sempre com a própria origem (:3001) e o proxy entrega.
//
//   Isso vale também pro "Try it out" do Swagger: a página reescreve a URL
//   pra origem atual (ver requestInterceptor no index.html) e o /health sai
//   por aqui.
import { createServer, request as pedidoHttp } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.DOCS_PORT) || 3001;
const JOGO = { host: process.env.JOGO_HOST || 'localhost', port: Number(process.env.JOGO_PORT) || 3000 };

// Só estas pastas saem do disco; todo o resto vira proxy pro jogo.
const PASTAS_ESTATICAS = ['/docs/', '/postman/'];

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
};

const servidor = createServer((req, res) => {
    const caminhoUrl = decodeURIComponent(new URL(req.url, `http://localhost:${PORTA}`).pathname);

    if (caminhoUrl === '/') {
        res.writeHead(302, { Location: '/docs/' });
        return res.end();
    }

    if (PASTAS_ESTATICAS.some(pasta => caminhoUrl.startsWith(pasta))) {
        return servirArquivo(caminhoUrl, res);
    }

    encaminharParaOJogo(req, res);
});

function servirArquivo(caminhoUrl, res) {
    // path.join normaliza o `..`; a checagem depois garante que nada saia da
    // raiz do projeto, mesmo com um caminho montado de propósito pra escapar.
    let alvo = path.join(RAIZ, caminhoUrl);
    if (!alvo.startsWith(RAIZ + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Fora da raiz do projeto.');
    }

    if (existsSync(alvo) && statSync(alvo).isDirectory()) {
        alvo = path.join(alvo, 'index.html');
    }
    if (!existsSync(alvo)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`Não encontrado: ${caminhoUrl}`);
    }

    res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(alvo)] ?? 'application/octet-stream',
        // A doc é lida do disco a cada request: editar o yaml e dar F5 tem
        // que mostrar a mudança na hora, sem cache atrapalhando.
        'Cache-Control': 'no-store',
    });
    createReadStream(alvo).pipe(res);
}

function encaminharParaOJogo(req, res) {
    const upstream = pedidoHttp(
        { host: JOGO.host, port: JOGO.port, method: req.method, path: req.url, headers: req.headers },
        (resposta) => {
            res.writeHead(resposta.statusCode, resposta.headers);
            resposta.pipe(res);
        }
    );

    upstream.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            erro: 'JOGO_FORA_DO_AR',
            mensagem: `Nada respondendo em ${JOGO.host}:${JOGO.port}. Suba o servidor do jogo com "npm start" noutro terminal.`,
        }));
    });

    req.pipe(upstream);
}

// O socket.io tenta subir de polling pra websocket. Sem tratar o upgrade, a
// conexão continuaria funcionando (fica em polling), mas com um erro visível
// no console do navegador a cada tentativa.
servidor.on('upgrade', (req, socket, cabeca) => {
    const upstream = pedidoHttp({
        host: JOGO.host, port: JOGO.port, method: req.method, path: req.url, headers: req.headers,
    });

    upstream.on('upgrade', (resposta, socketJogo, cabecaJogo) => {
        const cabecalhos = Object.entries(resposta.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${cabecalhos}\r\n\r\n`);
        if (cabecaJogo?.length) socket.write(cabecaJogo);
        socketJogo.pipe(socket).pipe(socketJogo);
        socketJogo.on('error', () => socket.destroy());
    });

    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    if (cabeca?.length) upstream.write(cabeca);
    upstream.end();
});

servidor.listen(PORTA, () => {
    console.log(`Documentação da API em http://localhost:${PORTA}`);
    console.log(`Repassando o que não é documentação para ${JOGO.host}:${JOGO.port} (suba o jogo com "npm start").`);
});
