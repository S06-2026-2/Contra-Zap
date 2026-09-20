// loopPartida.test.js — o loop da partida (item 20 do README): antes era
// recursão mútua _jogarRodadaAtual <-> _avancarOuFinalizar (um frame de pilha
// por rodada até o fim da partida), agora é um while raso em _rodarPartida.
// Estes testes travam o comportamento observável: a partida termina, os
// eventos saem na mesma cadência de antes, e destruir() no meio para tudo.
// Local, fora do git (ver .gitignore).
//
// Roda com: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { GameController } from './GameController.js';
import { Bot } from '../bots/Bot.js';

// Mesa 100% de bots (decidem na hora, sem esperar timeout). `hp` controla
// quão longa a partida fica. Devolve o controller já rodando + um coletor de
// eventos.
function partidaDeBots({ jogadores = 3, roundStart = 1, maxDeck = 2, hp = 3 } = {}) {
    const c = new GameController({ numberPlayers: jogadores, roundStart, maxDeck, atrasoBotMs: 0, tempoTurnoMs: 50 });
    for (let i = 0; i < jogadores; i++) c.entrarNaSala(new Bot());
    for (const j of c.jogadores) j.hp = hp;

    const ev = { novaRodada: 0, rodadaFinalizada: 0, jogoFinalizado: 0, abortada: 0, vencedor: null };
    c.on('novaRodadaIniciada', () => { ev.novaRodada++; });
    c.on('rodadaFinalizada', () => { ev.rodadaFinalizada++; });
    c.on('jogoFinalizado', ({ vencedor }) => { ev.jogoFinalizado++; ev.vencedor = vencedor; });
    c.on('partidaAbortada', () => { ev.abortada++; });

    c.iniciarPartida();
    return { c, ev };
}

async function esperarFim(c, timeoutMs) {
    const limite = Date.now() + timeoutMs;
    while (!c.finalizada && Date.now() < limite) await sleep(5);
    assert.equal(c.finalizada, true, `a partida não terminou em ${timeoutMs}ms (parou na rodada ${c.numeroRodada})`);
}

test('a partida roda até o fim e emite exatamente um jogoFinalizado', async () => {
    const { c, ev } = partidaDeBots({ jogadores: 3, hp: 3 });
    await esperarFim(c, 10_000);

    assert.equal(ev.jogoFinalizado, 1);
    assert.equal(ev.abortada, 0);
    assert.ok(ev.vencedor, 'jogoFinalizado sem vencedor');
});

test('novaRodadaIniciada e rodadaFinalizada saem uma vez por rodada (cadência preservada)', async () => {
    // rodada 1: novaRodadaIniciada vem do iniciarPartida; 2+ vêm do
    // _avancarParaProximaRodada. rodadaFinalizada sai em TODA rodada, inclusive
    // a última. Os dois contadores têm que bater entre si e com numeroRodada.
    const { c, ev } = partidaDeBots({ jogadores: 3, hp: 5 });
    await esperarFim(c, 10_000);

    assert.equal(ev.novaRodada, c.numeroRodada);
    assert.equal(ev.rodadaFinalizada, c.numeroRodada);
});

test('partida mais longa (várias rodadas) termina limpa, sem abortar', async () => {
    // hp maior => mais rodadas passando pelo loop. A recursão antiga empilhava
    // um frame por rodada; o while não.
    const { c, ev } = partidaDeBots({ jogadores: 4, roundStart: 2, maxDeck: 2, hp: 10 });
    await esperarFim(c, 20_000);

    assert.equal(ev.jogoFinalizado, 1);
    assert.equal(ev.abortada, 0);
    assert.ok(c.numeroRodada >= 4, `esperava mais rodadas, parou em ${c.numeroRodada}`);
    assert.equal(ev.novaRodada, c.numeroRodada);
    assert.equal(ev.rodadaFinalizada, c.numeroRodada);
});

test('destruir() no meio do loop para a partida (não finaliza, não aborta)', async () => {
    const { c, ev } = partidaDeBots({ jogadores: 3, roundStart: 3, maxDeck: 1, hp: 50 });
    await sleep(20); // deixa entrar no loop
    const rodadaNoCorte = c.numeroRodada;
    c.destruir();

    await sleep(200);
    assert.equal(c.numeroRodada, rodadaNoCorte, 'o loop avançou depois do destruir');
    assert.equal(c.finalizada, false);
    assert.equal(ev.abortada, 0);
});
