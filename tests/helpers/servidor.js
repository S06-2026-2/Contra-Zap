// servidor.js
// Sobe o servidor de verdade (o `criarServidor` do Server.js — mesmo Express,
// mesmo Socket.io, mesmo registrarSocketServer) numa porta efêmera, com os
// tempos do SalaManager encolhidos pra escala de teste.
//
// O import de './ambiente.js' é a PRIMEIRA linha de propósito: ele precisa
// rodar antes de qualquer módulo do projeto ser avaliado (ver o comentário
// lá). Os módulos do projeto entram por `await import(...)` dentro da função,
// já com DB_PATH/JWT_SECRET no lugar.
import './ambiente.js';
import { once } from 'node:events';
import { conectar } from './cliente.js';

// Os tempos de produção (15s pra sala lotada começar, 20s por turno, 90s de
// inatividade, 150s de vaga reservada) tornariam a suíte impossível. Estes
// são os defaults de teste; qualquer um pode ser sobrescrito por chamada.
//
// `tempoEsperaInicioMs` fica ALTO de propósito: assim nenhuma partida começa
// sozinha no meio de um teste de sala de espera. Quem quer uma partida em
// andamento manda `forcarInicio` (ver criarPartida em protocolo.js), que é
// determinístico — esperar um timer é a receita clássica de teste
// intermitente. Testes do início automático passam um valor curto de propósito.
export const TEMPOS_DE_TESTE = {
    tempoEsperaInicioMs: 30_000,
    tempoTurnoMs: 2_000,
    atrasoBotMs: 5,
    limiteInatividadeMs: 90_000,
    tempoReservaMs: 150_000,
    pausaVazaMs: 5,
    pausaRodadaMs: 5,
    chatCooldownMs: 3_000,
};

// Os tetos por IP do socketServer (ver rateLimiter.js) contam por
// `socket.handshake.address` — e a suíte inteira sai de 127.0.0.1. Com os
// valores de produção (5 falhas de login por 20min, 10 cadastros por 10min),
// um arquivo de teste que exercita erro de senha algumas vezes começaria a
// receber MUITAS_TENTATIVAS em vez do código que ele está testando, e a
// ordem dos subtestes viraria parte do resultado.
//
// Por isso o default aqui é folgado: nenhum teste esbarra nisso por
// acidente. Quem testa o rate limit DE PROPÓSITO passa valores apertados
// (ver tests/api/limites.test.js) — assim o limite continua coberto, só que
// de forma explícita.
export const LIMITES_DE_TAXA_DE_TESTE = {
    verificarNomeMax: 100_000,
    entrarMax: 100_000,
    cadastrarMax: 100_000,
};

// Devolve um handle com tudo que o teste precisa: a URL, o salaManager (pra
// espiar estado interno quando o protocolo não expõe) e `fechar()`, que
// derruba os clientes e o servidor. Chame `fechar()` sempre — um socket
// aberto segura o event loop e o processo de teste não termina.
export async function subirServidor(configSala = {}, limitesDeTaxa = {}) {
    const { criarServidor } = await import('../../Server.js');
    const { SalaManager } = await import('../../conexao/SalaManager.js');

    const salaManager = new SalaManager({ ...TEMPOS_DE_TESTE, ...configSala });
    const { app, server, io } = criarServidor({
        salaManager,
        limitesDeTaxa: { ...LIMITES_DE_TAXA_DE_TESTE, ...limitesDeTaxa },
    });

    // Porta 0 = o sistema escolhe uma livre. Nenhum teste conflita com outro
    // rodando em paralelo, nem com um `npm start` aberto na 3000.
    server.listen(0);
    await once(server, 'listening');

    const { port } = server.address();
    const url = `http://localhost:${port}`;
    const clientes = [];

    return {
        url,
        porta: port,
        app,
        server,
        io,
        salaManager,

        // Toda conexão aberta por aqui é fechada junto com o servidor.
        async conectar() {
            const cliente = await conectar(url);
            clientes.push(cliente);
            return cliente;
        },

        async fechar() {
            await Promise.all(clientes.map(cliente => cliente.desconectar()));
            // io.close() fecha os sockets restantes E o servidor HTTP embaixo.
            await new Promise(resolve => io.close(resolve));
            if (server.listening) {
                await new Promise(resolve => server.close(resolve));
            }
        },
    };
}
