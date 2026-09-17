import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { realpathSync } from 'node:fs';
import { registrarSocketServer } from './conexao/socketServer.js';
import { db } from './conexao/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Monta o servidor inteiro (Express + Socket.io + protocolo ligado) mas NÃO
// escuta em porta nenhuma — quem chama decide isso. Existe separado do
// `listen` lá embaixo por dois motivos:
//  - `npm start` sobe do jeito de sempre, na 3000 (ver o bloco no fim do arquivo);
//  - os testes de API sobem o mesmo servidor numa porta efêmera, com um
//    SalaManager de tempos curtos injetado (ver tests/helpers/servidor.js),
//    exercitando este arquivo de verdade em vez de uma cópia parecida.
//
// `salaManager` é opcional: sem ele, o registrarSocketServer cria o dele
// próprio com os tempos de produção (15s de espera pra começar, 20s por
// turno), exatamente como antes.
//
// `limitesDeTaxa` idem: repassado direto pro registrarSocketServer (ver os
// tetos por IP em conexao/socketServer.js). Só os testes passam algo aqui —
// uns pra afrouxar o teto (uma suíte inteira sai da mesma "IP" e estouraria
// o limite de produção sem estar testando isso), outros pra apertar e
// provar que o limite existe mesmo.
export function criarServidor({ salaManager, limitesDeTaxa } = {}) {
    const app = express();
    const server = createServer(app);
    // pingInterval + pingTimeout = pior caso pra perceber uma queda de conexão
    // (aba fechada, rede caiu sem aviso, cabo puxado) — default do socket.io é
    // 25s + 20s = 45s. Encolhido pra ~25s (10s + 15s): perceptível rápido o
    // bastante pro jogador ver o aviso de conexão perdida (ver public/app/src/socket.js)
    // sem exagerar na frequência de ping (ainda troca só um pacote a cada 10s
    // por conexão ociosa).
    const io = new Server(server, {
        pingInterval: 10_000,
        pingTimeout: 15_000,
    });

    const manager = registrarSocketServer(io, salaManager, limitesDeTaxa);

    // Serve o build da interface React (gerado por `npm run build` dentro de
    // public/app — ver public/app/vite.config.js, que manda a saída pra cá).
    // Se essa pasta não existir ainda, rode o build primeiro; ver README.md.
    app.use(express.static(path.join(__dirname, 'public/dist')));

    // Endpoint de healthcheck: usado pelo Docker (HEALTHCHECK) e por qualquer
    // orquestrador/monitoramento pra saber se o processo está de pé e
    // respondendo, sem depender de abrir a partida inteira pra testar.
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    });

    // Fallback de SPA: '/*splat' (não só '/') pra rotas próprias do front que
    // não existem como arquivo nenhum (ver ROTA_EXPERIMENTO em App.jsx) —
    // sem isto, um F5 em /experimento em produção caía em 404 do Express
    // em vez de abrir o React de novo já naquela tela. Só chega aqui o que
    // nem express.static nem /health responderam antes. Express 5 (path-to-
    // regexp v8) não aceita mais '*' sozinho como wildcard, exige nome.
    app.get('/*splat', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/dist/index.html'));
    });

    return { app, server, io, salaManager: manager };
}

function configurarEncerramentoGracioso(server, io) {
    let encerrando = false;

    function encerrarGraciosamente(sinal) {
        if (encerrando) return;
        encerrando = true;
        console.log(`\n${sinal} recebido — encerrando graciosamente...`);

        // Para de aceitar conexão HTTP nova (deixa as que já estão em andamento
        // terminarem sozinhas).
        server.close(() => console.log('Servidor HTTP fechado.'));

        // Fecha o Socket.IO — isso derruba as conexões websocket ativas. Pro
        // escopo atual (estado de partida só em memória, sem persistência entre
        // restarts) não tem como fazer diferente sem mudar a arquitetura; ver
        // item de "arquitetura single-process" no backlog.
        io.close(() => console.log('Socket.IO fechado.'));

        // Fecha o banco — em modo WAL, isso aciona o checkpoint automático que
        // mescla o banco.sqlite-wal de volta pro banco.sqlite principal.
        try {
            db.close();
            console.log('Banco de dados fechado (WAL mesclado no arquivo principal).');
        } catch (err) {
            console.error('Erro ao fechar o banco:', err);
        }

        // Dá um tempo curto pros closes acima terminarem antes de forçar saída
        // (evita o processo nunca sair se alguma conexão ficar pendurada).
        setTimeout(() => {
            console.log('Saindo.');
            process.exit(0);
        }, 2000).unref();
    }

    process.on('SIGTERM', () => encerrarGraciosamente('SIGTERM'));
    process.on('SIGINT', () => encerrarGraciosamente('SIGINT'));
}

function configurarTratamentoErrosNaoCapturados() {
    // Sem isso, um throw dentro de um setTimeout/callback assíncrono (ex.: um
    // bug no GameController) derruba o processo Node inteiro — tira do ar até
    // quem estava numa partida sem problema nenhum. Logamos o erro em vez de
    // deixar o processo morrer silenciosamente sem explicação nenhuma.
    //
    // Ressalva: continuar rodando depois de um uncaughtException não é 100%
    // seguro (o estado interno pode ter ficado inconsistente) — mas pro escopo
    // atual do projeto, favorecer "continuar no ar" em vez de "cair sozinho" é
    // a troca que faz mais sentido. Se isso virar problema recorrente, vale
    // reavaliar pra encerrar graciosamente em vez de só logar.
    process.on('uncaughtException', (err) => {
        console.error('Exceção não capturada:', err);
    });

    process.on('unhandledRejection', (motivo) => {
        console.error('Promise rejeitada sem tratamento:', motivo);
    });
}

// Só sobe de verdade quando este arquivo é o ponto de entrada (`npm start`,
// `node Server.js`, o CMD do Dockerfile). Importar Server.js de um teste
// (ou de qualquer outro módulo) não abre porta nenhuma — é o que permite
// tests/helpers/servidor.js reusar o criarServidor acima sem brigar pela
// porta 3000 com um servidor de desenvolvimento que já esteja rodando.
// realpathSync porque o Node resolve symlinks no módulo principal, mas
// process.argv[1] vem cru — sem isso, um caminho com symlink no meio
// (acontece em container e em instalação via link) faria a comparação
// falhar e o servidor simplesmente não subiria, sem erro nenhum.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    const PORTA = Number(process.env.PORT) || 3000;
    const { server, io } = criarServidor({ limitesDeTaxa: lerLimitesDoAmbiente() });
    configurarEncerramentoGracioso(server, io);
    configurarTratamentoErrosNaoCapturados();
    server.listen(PORTA, () => {
        console.log(`Servidor rodando em http://localhost:${PORTA}`);
    });
}

// Tetos de rate limit por IP vindos do ambiente. Sem nenhuma variável
// definida devolve `{}` — e aí valem os defaults de produção do
// conexao/socketServer.js, exatamente como antes.
//
// Existe porque os tetos contam por IP e o E2E inteiro sai de 127.0.0.1:
// cada login de teste gasta um `verificarNome`, e a suíte passa dos 20 por
// 5min de produção só de existir (ver playwright.config.js, que afrouxa
// isso). Mesma ideia do DB_PATH em conexao/db.js — o default não muda, só
// fica possível apontar pra outro valor sem editar código.
function lerLimitesDoAmbiente() {
    const limites = {};
    for (const [variavel, opcao] of [
        ['VERIFICAR_NOME_MAX', 'verificarNomeMax'],
        ['ENTRAR_MAX', 'entrarMax'],
        ['CADASTRAR_MAX', 'cadastrarMax'],
    ]) {
        const bruto = process.env[variavel];
        if (bruto === undefined) continue;
        const valor = Number(bruto);
        // Valor inválido é ignorado em silêncio de propósito: melhor cair no
        // default seguro do que virar NaN e desligar o limite sem ninguém ver.
        if (Number.isInteger(valor) && valor > 0) limites[opcao] = valor;
    }
    return limites;
}
