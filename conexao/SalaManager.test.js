// SalaManager.test.js
// Testes do degrau 1: só a camada de sala, sem nenhum socket envolvido.
// Roda com o test runner nativo do Node: `npm test` (ou `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { SalaManager, ErroSala } from './SalaManager.js';
import { Player } from '../game/Player.js';
import { CodigosErro } from './eventos.js';

function criarPlayer(id, nome) {
    const player = new Player(nome, 'senha123');
    player.id = id;
    return player;
}

function assertErroSala(fn, codigoEsperado) {
    assert.throws(fn, (erro) => {
        assert.ok(erro instanceof ErroSala, `esperava ErroSala, recebeu ${erro}`);
        assert.equal(erro.codigo, codigoEsperado);
        return true;
    });
}

test('criarSala cria a sala e já coloca o dono dentro dela', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');

    const sala = manager.criarSala(dono, { numberPlayers: 4 });

    assert.equal(sala.jogadores.length, 1);
    assert.equal(sala.jogadores[0].nome, 'henrique');
    assert.equal(sala.iniciada, false);
    assert.equal(manager.obterSala(sala.salaId), sala);
});

test('entrarSala deixa os outros 3 jogadores entrarem até lotar a sala', () => {
    const manager = new SalaManager();
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 4 });

    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));
    manager.entrarSala(sala.salaId, criarPlayer(3, 'moras'));
    manager.entrarSala(sala.salaId, criarPlayer(4, 'guilherme'));

    assert.equal(sala.jogadores.length, 4);
    assert.deepEqual(
        sala.jogadores.map(jogador => jogador.nome),
        ['henrique', 'piconi', 'moras', 'guilherme']
    );
});

test('entrarSala recusa com SALA_CHEIA quando a sala já atingiu numberPlayers', () => {
    const manager = new SalaManager();
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));

    assertErroSala(
        () => manager.entrarSala(sala.salaId, criarPlayer(3, 'moras')),
        CodigosErro.SALA_CHEIA
    );
});

test('entrarSala recusa com SALA_NAO_ENCONTRADA para um salaId que não existe', () => {
    const manager = new SalaManager();

    assertErroSala(
        () => manager.entrarSala('XXXXXX', criarPlayer(1, 'henrique')),
        CodigosErro.SALA_NAO_ENCONTRADA
    );
});

test('entrarSala recusa nome já usado na mesma sala com NOME_INVALIDO', () => {
    const manager = new SalaManager();
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 4 });

    assertErroSala(
        () => manager.entrarSala(sala.salaId, criarPlayer(2, 'henrique')),
        CodigosErro.NOME_INVALIDO
    );
});

test('entrarSala recusa o mesmo id de jogador entrando duas vezes com JA_ESTA_NA_SALA', () => {
    const manager = new SalaManager();
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 4 });

    assertErroSala(
        () => manager.entrarSala(sala.salaId, criarPlayer(1, 'henrique-de-novo')),
        CodigosErro.JA_ESTA_NA_SALA
    );
});

test('entrarSala recusa com SALA_JA_INICIADA depois que a partida da sala começou', () => {
    const manager = new SalaManager();
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 3 });
    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));

    sala.controller.iniciarPartida();
    assert.equal(sala.iniciada, true);

    assertErroSala(
        () => manager.entrarSala(sala.salaId, criarPlayer(3, 'moras')),
        CodigosErro.SALA_JA_INICIADA
    );
});

test('duas salas criadas em sequência recebem salaId diferentes', () => {
    const manager = new SalaManager();
    const salaA = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 4 });
    const salaB = manager.criarSala(criarPlayer(2, 'piconi'), { numberPlayers: 4 });

    assert.notEqual(salaA.salaId, salaB.salaId);
});

test('quem cria a sala vira adm; quem entra depois não', () => {
    const manager = new SalaManager();
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));

    assert.equal(sala.jogadores[0].adm, true);
    assert.equal(sala.jogadores[1].adm, false);
});

test('criarSala recusa numberPlayers fora do intervalo aceito (2 a 6) com CONFIGURACAO_INVALIDA', () => {
    const manager = new SalaManager();

    for (const numberPlayers of [0, 1, 7, -1, 3.5, NaN, 'abc']) {
        assertErroSala(
            () => manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers }),
            CodigosErro.CONFIGURACAO_INVALIDA
        );
    }
});

test('criarSala recusa roundStart menor que 1 (ou não inteiro) com CONFIGURACAO_INVALIDA', () => {
    const manager = new SalaManager();

    for (const roundStart of [0, -1, 2.5, NaN]) {
        assertErroSala(
            () => manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 4, roundStart }),
            CodigosErro.CONFIGURACAO_INVALIDA
        );
    }
});

test('sala lotada começa sozinha depois do tempo de espera configurado', async () => {
    const manager = new SalaManager({ tempoEsperaInicioMs: 20 });
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 2 });

    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));
    assert.equal(sala.iniciada, false, 'não deve começar na hora — só depois da espera');

    await esperar(50);
    assert.equal(sala.iniciada, true);
});

test('forcarInicio pelo adm pula a espera e começa na hora', async () => {
    const manager = new SalaManager({ tempoEsperaInicioMs: 10_000 });
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));

    manager.forcarInicio(sala.salaId, dono);

    assert.equal(sala.iniciada, true);
});

test('forcarInicio por quem não é adm devolve NAO_AUTORIZADO', () => {
    const manager = new SalaManager({ tempoEsperaInicioMs: 10_000 });
    const sala = manager.criarSala(criarPlayer(1, 'henrique'), { numberPlayers: 2 });
    const convidado = criarPlayer(2, 'piconi');
    manager.entrarSala(sala.salaId, convidado);

    assertErroSala(() => manager.forcarInicio(sala.salaId, convidado), CodigosErro.NAO_AUTORIZADO);
});

test('forcarInicio antes da sala lotar devolve SALA_NAO_CHEIA', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });

    assertErroSala(() => manager.forcarInicio(sala.salaId, dono), CodigosErro.SALA_NAO_CHEIA);
});

test('forcarInicio numa sala inexistente devolve SALA_NAO_ENCONTRADA', () => {
    const manager = new SalaManager();

    assertErroSala(
        () => manager.forcarInicio('XXXXXX', criarPlayer(1, 'henrique')),
        CodigosErro.SALA_NAO_ENCONTRADA
    );
});

test('forcarInicio numa sala que já começou devolve SALA_JA_INICIADA', () => {
    const manager = new SalaManager({ tempoEsperaInicioMs: 10_000 });
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, criarPlayer(2, 'piconi'));
    manager.forcarInicio(sala.salaId, dono);

    assertErroSala(() => manager.forcarInicio(sala.salaId, dono), CodigosErro.SALA_JA_INICIADA);
});

test('sairSala tira o jogador da lista e os outros continuam', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const convidado = criarPlayer(2, 'piconi');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });
    manager.entrarSala(sala.salaId, convidado);

    manager.sairSala(sala.salaId, convidado);

    assert.equal(sala.jogadores.length, 1);
    assert.equal(sala.jogadores[0].nome, 'henrique');
});

test('sairSala do adm transfere a posição pro próximo da lista', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const convidado = criarPlayer(2, 'piconi');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });
    manager.entrarSala(sala.salaId, convidado);

    manager.sairSala(sala.salaId, dono);

    assert.equal(sala.jogadores.length, 1);
    assert.equal(sala.jogadores[0].nome, 'piconi');
    assert.equal(sala.jogadores[0].adm, true);
});

test('sairSala do último jogador descarta a sala', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });

    manager.sairSala(sala.salaId, dono);

    assert.equal(manager.obterSala(sala.salaId), null);
});

test('sairSala cancela o início agendado quando a sala deixa de estar cheia', async () => {
    const manager = new SalaManager({ tempoEsperaInicioMs: 30 });
    const dono = criarPlayer(1, 'henrique');
    const convidado = criarPlayer(2, 'piconi');
    const sala = manager.criarSala(dono, { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, convidado); // lota -> agenda início

    manager.sairSala(sala.salaId, convidado); // sala não está mais cheia

    await esperar(60);
    assert.equal(sala.iniciada, false, 'início agendado devia ter sido cancelado');
});

test('sairSala numa sala inexistente devolve SALA_NAO_ENCONTRADA', () => {
    const manager = new SalaManager();

    assertErroSala(
        () => manager.sairSala('XXXXXX', criarPlayer(1, 'henrique')),
        CodigosErro.SALA_NAO_ENCONTRADA
    );
});

test('sairSala por quem não está na sala devolve NAO_ESTA_NA_SALA', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });

    assertErroSala(
        () => manager.sairSala(sala.salaId, criarPlayer(2, 'piconi')),
        CodigosErro.NAO_ESTA_NA_SALA
    );
});

test('sairSala depois que a partida começou devolve SALA_JA_INICIADA', () => {
    const manager = new SalaManager({ tempoEsperaInicioMs: 10_000 });
    const dono = criarPlayer(1, 'henrique');
    const convidado = criarPlayer(2, 'piconi');
    const sala = manager.criarSala(dono, { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, convidado);
    manager.forcarInicio(sala.salaId, dono);

    assertErroSala(() => manager.sairSala(sala.salaId, dono), CodigosErro.SALA_JA_INICIADA);
});

// Helper: cria uma sala de 2, força o início e devolve { sala, dono,
// convidado, jogadorDaVez, outroJogador } assim que o primeiro turnoJogador
// dispara — GameController agora espera jogada real, então todo teste de
// jogarCarta precisa primeiro descobrir de quem é a vez (é decidida por
// sorteio em Game.setstartsequence, não dá pra saber sem perguntar).
async function criarSalaIniciada() {
    const manager = new SalaManager({ tempoEsperaInicioMs: 10_000 });
    const dono = criarPlayer(1, 'henrique');
    const convidado = criarPlayer(2, 'piconi');
    const sala = manager.criarSala(dono, { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, convidado);

    // Aposta 1 sozinho por quem for chamado — o motor agora pausa em
    // turnoAposta antes da primeira vaza, e nada aqui testa aposta, só
    // jogarCarta, então destrava isso sem precisar responder de verdade.
    sala.controller.on('turnoAposta', ({ id }) => sala.controller.apostar(id, 1));

    const primeiraVez = new Promise((resolve) => sala.controller.once('turnoJogador', resolve));
    manager.forcarInicio(sala.salaId, dono);
    const { id: idDaVez } = await primeiraVez;

    const jogadorDaVez = idDaVez === dono.id ? dono : convidado;
    const outroJogador = idDaVez === dono.id ? convidado : dono;
    return { manager, sala, jogadorDaVez, outroJogador };
}

test('jogarCarta numa sala cuja partida ainda não começou devolve SALA_NAO_INICIADA', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });

    assertErroSala(() => manager.jogarCarta(sala.salaId, dono, 0), CodigosErro.SALA_NAO_INICIADA);
});

test('jogarCarta numa sala inexistente devolve SALA_NAO_ENCONTRADA', () => {
    const manager = new SalaManager();

    assertErroSala(
        () => manager.jogarCarta('XXXXXX', criarPlayer(1, 'henrique'), 0),
        CodigosErro.SALA_NAO_ENCONTRADA
    );
});

test('jogarCarta fora da vez devolve NAO_E_SUA_VEZ', async () => {
    const { manager, sala, outroJogador } = await criarSalaIniciada();

    assertErroSala(() => manager.jogarCarta(sala.salaId, outroJogador, 0), CodigosErro.NAO_E_SUA_VEZ);
});

test('jogarCarta com índice fora da mão devolve CARTA_INVALIDA', async () => {
    const { manager, sala, jogadorDaVez } = await criarSalaIniciada();

    assertErroSala(() => manager.jogarCarta(sala.salaId, jogadorDaVez, 99), CodigosErro.CARTA_INVALIDA);
});

test('jogarCarta válida passa a vez pro próximo jogador', async () => {
    const { manager, sala, jogadorDaVez } = await criarSalaIniciada();

    const proximaVez = new Promise((resolve) => sala.controller.once('turnoJogador', resolve));
    manager.jogarCarta(sala.salaId, jogadorDaVez, 0);
    const { id: idDaProxima } = await proximaVez;

    assert.notEqual(idDaProxima, jogadorDaVez.id);
});

test('jogarCarta de verdade limpa a flag desconectado mesmo sem passar por reconectar', async () => {
    const { manager, sala, jogadorDaVez } = await criarSalaIniciada();
    const jogadorGame = sala.jogadores.find(j => j.id === jogadorDaVez.id);
    jogadorGame.desconectado = true; // simula uma flag ligada de antes

    manager.jogarCarta(sala.salaId, jogadorDaVez, 0);

    assert.equal(jogadorGame.desconectado, false);
});

// Igual criarSalaIniciada, mas com tempoTurnoMs bem curto — pra testar o
// que acontece quando ninguém responde a tempo, sem esperar os 15s reais.
async function criarSalaIniciadaComTurnoRapido(tempoTurnoMs) {
    const manager = new SalaManager({ tempoEsperaInicioMs: 10_000, tempoTurnoMs });
    const dono = criarPlayer(1, 'henrique');
    const convidado = criarPlayer(2, 'piconi');
    const sala = manager.criarSala(dono, { numberPlayers: 2 });
    manager.entrarSala(sala.salaId, convidado);

    // Mesmo motivo de criarSalaIniciada: destrava a fase de aposta com um
    // valor fixo, o timeout que este helper existe pra testar é o de carta.
    sala.controller.on('turnoAposta', ({ id }) => sala.controller.apostar(id, 1));

    const primeiraVez = new Promise((resolve) => sala.controller.once('turnoJogador', resolve));
    manager.forcarInicio(sala.salaId, dono);
    const { id: idDaVez } = await primeiraVez;

    const jogadorDaVez = idDaVez === dono.id ? dono : convidado;
    const outroJogador = idDaVez === dono.id ? convidado : dono;
    return { manager, sala, jogadorDaVez, outroJogador };
}

test('quando tempoTurnoMs estoura, o motor joga sozinho (última carta) e liga a flag desconectado', async () => {
    const { sala, jogadorDaVez } = await criarSalaIniciadaComTurnoRapido(30);

    const jogadaAutomatica = new Promise((resolve) => sala.controller.once('jogadaAutomatica', resolve));
    const dados = await jogadaAutomatica;

    assert.equal(dados.id, jogadorDaVez.id);
    const jogadorGame = sala.jogadores.find(j => j.id === jogadorDaVez.id);
    assert.equal(jogadorGame.desconectado, true);
});

test('reconectar limpa a flag desconectado depois de uma jogada automática', async () => {
    const { manager, sala, jogadorDaVez } = await criarSalaIniciadaComTurnoRapido(30);
    await new Promise((resolve) => sala.controller.once('jogadaAutomatica', resolve));

    const jogadorGame = sala.jogadores.find(j => j.id === jogadorDaVez.id);
    assert.equal(jogadorGame.desconectado, true);

    manager.reconectar(sala.salaId, jogadorDaVez);

    assert.equal(jogadorGame.desconectado, false);
});

test('reconectar devolve a mão atual e de quem é a vez', async () => {
    const { manager, sala, jogadorDaVez, outroJogador } = await criarSalaIniciada();

    const { estado } = manager.reconectar(sala.salaId, outroJogador);

    assert.equal(estado.suaVez, false);
    assert.equal(estado.jogadorDaVez, jogadorDaVez.nome);
    assert.equal(estado.mao.length, 1); // roundStart default 1, ninguém jogou ainda

    const { estado: estadoDaVez } = manager.reconectar(sala.salaId, jogadorDaVez);
    assert.equal(estadoDaVez.suaVez, true);
});

test('reconectar numa sala cuja partida ainda não começou devolve SALA_NAO_INICIADA', () => {
    const manager = new SalaManager();
    const dono = criarPlayer(1, 'henrique');
    const sala = manager.criarSala(dono, { numberPlayers: 4 });

    assertErroSala(() => manager.reconectar(sala.salaId, dono), CodigosErro.SALA_NAO_INICIADA);
});

test('reconectar numa sala inexistente devolve SALA_NAO_ENCONTRADA', () => {
    const manager = new SalaManager();

    assertErroSala(
        () => manager.reconectar('XXXXXX', criarPlayer(1, 'henrique')),
        CodigosErro.SALA_NAO_ENCONTRADA
    );
});

test('reconectar por quem não faz parte da partida devolve NAO_ESTA_NA_SALA', async () => {
    const { manager, sala } = await criarSalaIniciada();
    const estranho = criarPlayer(99, 'estranho');

    assertErroSala(() => manager.reconectar(sala.salaId, estranho), CodigosErro.NAO_ESTA_NA_SALA);
});
