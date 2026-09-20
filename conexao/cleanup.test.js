// cleanup.test.js — teardown de sala / poda de memória (grupo 4 do README).
// Local, fora do git (ver .gitignore) — mesma política dos outros testes.
//
// Roda com: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { GameController } from '../game/GameController.js';
import { Bot } from '../bots/Bot.js';
import { SalaManager } from './SalaManager.js';
import { CodigosErro } from './eventos.js';

const donoStub = (id = 1) => ({ id, nome: `p${id}` });

test('destruir(): marca _encerrado, corta timers e solta os listeners', () => {
    const c = new GameController({ numberPlayers: 2 });
    c.on('qualquerCoisa', () => {});
    c.agendarInicio(60_000);                 // cria _timerInicio
    c._timersReserva.set(99, setTimeout(() => {}, 60_000)); // simula contador de reserva
    assert.ok(c._timerInicio);
    assert.equal(c._timersReserva.size, 1);

    c.destruir();

    assert.equal(c._encerrado, true);
    assert.equal(c._timerInicio, null);
    assert.equal(c._timersReserva.size, 0);
    assert.equal(c.listenerCount('qualquerCoisa'), 0);
});

test('destruir() é idempotente', () => {
    const c = new GameController({ numberPlayers: 2 });
    c.destruir();
    assert.doesNotThrow(() => c.destruir());
});

test('SalaManager.removerSala faz o teardown do controller', () => {
    const sm = new SalaManager();
    const sala = sm.criarSala(donoStub(), { numberPlayers: 4, roundStart: 3 });
    const controller = sala.controller;

    sm.removerSala(sala.salaId);

    assert.equal(sm.obterSala(sala.salaId), null);
    assert.equal(controller._encerrado, true);
    // idempotente: remover de novo, ou um id que não existe, não explode
    assert.doesNotThrow(() => sm.removerSala(sala.salaId));
    assert.doesNotThrow(() => sm.removerSala('NAOEXISTE'));
});

test('destruir() no meio da partida para o loop (não avança de rodada, não finaliza)', async () => {
    const c = new GameController({ numberPlayers: 3, roundStart: 3, atrasoBotMs: 20, tempoTurnoMs: 20 });
    for (let i = 0; i < 3; i++) c.entrarNaSala(new Bot());
    c.iniciarPartida();

    await sleep(30);                 // deixa entrar no loop (ainda na rodada 1)
    assert.equal(c.numeroRodada, 1);
    c.destruir();

    await sleep(250);               // tempo de sobra pra rodada 1 acabar, se o loop seguisse
    assert.equal(c.numeroRodada, 1, 'o loop avançou de rodada depois do destruir');
    assert.equal(c.finalizada, false, 'a partida chegou ao fim depois do destruir');
});

test('_ultimoChatPorJogador é podado quando as marcas passam do cooldown', () => {
    const sm = new SalaManager({ chatCooldownMs: 40 });
    const sala = sm.criarSala(donoStub(1), { numberPlayers: 4, chatAberto: true });
    sm.entrarSala(sala.salaId, donoStub(2));
    sm.entrarSala(sala.salaId, donoStub(3));

    // injeta marcas velhas de dois jogadores que não vão mandar mais nada
    sm._ultimoChatPorJogador.set(2, Date.now() - 10_000);
    sm._ultimoChatPorJogador.set(3, Date.now() - 10_000);
    assert.equal(sm._ultimoChatPorJogador.size, 2);

    // um envio aceito do jogador 1 dispara a poda das marcas vencidas
    sm.enviarChat(sala.salaId, donoStub(1), { tipo: 'restrita', id: 1 });

    assert.equal(sm._ultimoChatPorJogador.has(2), false);
    assert.equal(sm._ultimoChatPorJogador.has(3), false);
    assert.equal(sm._ultimoChatPorJogador.has(1), true); // a marca fresca fica
});

test('_ultimoChatPorJogador NÃO poda quem ainda está em cooldown', () => {
    const sm = new SalaManager({ chatCooldownMs: 5_000 });
    const sala = sm.criarSala(donoStub(1), { numberPlayers: 4, chatAberto: true });
    sm.entrarSala(sala.salaId, donoStub(2));

    sm._ultimoChatPorJogador.set(2, Date.now()); // acabou de mandar
    sm.enviarChat(sala.salaId, donoStub(1), { tipo: 'restrita', id: 1 });

    assert.equal(sm._ultimoChatPorJogador.has(2), true);
});

test('criarSala respeita o teto global de salas (LIMITE_DE_SALAS)', () => {
    const sm = new SalaManager();
    // enche o Map direto pra não pagar o custo de criar MAX_SALAS de verdade
    for (let i = 0; i < 1000; i++) sm.salas.set(`X${i}`, {});
    assert.equal(sm.salas.size, 1000);

    try {
        sm.criarSala(donoStub(), { numberPlayers: 4 });
        assert.fail('devia ter lançado LIMITE_DE_SALAS');
    } catch (e) {
        assert.equal(e.codigo, CodigosErro.LIMITE_DE_SALAS);
    }

    sm.salas.delete('X0'); // abriu uma vaga
    assert.doesNotThrow(() => sm.criarSala(donoStub(), { numberPlayers: 4 }));
});
