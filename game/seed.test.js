// seed.test.js — RNG semeável (item 21 do README). Sem seed nada muda
// (Math.random); com seed a partida é reproduzível e o embaralhamento bate
// bit a bit com o motor Python (training/python/test_seed.py pina a MESMA
// referência). Local, fora do git (ver .gitignore).
//
// Roda com: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRng } from './rng.js';
import { Game } from './Game.js';

// Distribui a 1ª rodada de uma partida de N jogadores com a seed dada e
// devolve { ordem, vira, maos } — o suficiente pra comparar dois runs.
function primeiraRodada({ jogadores = 4, roundStart = 3, seed }) {
    const jog = Array.from({ length: jogadores }, (_, i) => ({
        nome: `a${i}`, id: i,
        comprarCarta(c) { (this.mao ||= []).push(c); },
    }));
    const g = new Game({ numberPlayers: jogadores, roundStart, randomShuffle: true, seed, jogadores: jog });
    g.setstartsequence();
    const r = g.newRodada();
    r.darCartas();
    r.virarManilha();
    return {
        ordem: g.gameOrder.map(j => j.nome),
        vira: r.vira.toString(),
        maos: g.gameOrder.map(j => ({ nome: j.nome, mao: j.mao.map(c => c.toString()) })),
    };
}

test('criarRng sem seed devolve o próprio Math.random (nada muda)', () => {
    assert.equal(criarRng(undefined), Math.random);
    assert.equal(criarRng(null), Math.random);
});

test('criarRng com seed é determinístico e no intervalo [0, 1)', () => {
    const a = Array.from({ length: 20 }, criarRng(42));
    const b = Array.from({ length: 20 }, criarRng(42));
    assert.deepEqual(a, b);
    assert.ok(a.every(x => x >= 0 && x < 1));
    // seed diferente => sequência diferente
    assert.notDeepEqual(a, Array.from({ length: 20 }, criarRng(43)));
});

test('mesma seed reproduz a partida inteira (ordem, vira, mãos)', () => {
    const um = primeiraRodada({ seed: 12345 });
    const dois = primeiraRodada({ seed: 12345 });
    assert.deepEqual(um, dois);
});

test('seeds diferentes dão partidas diferentes', () => {
    const um = primeiraRodada({ seed: 1 });
    const dois = primeiraRodada({ seed: 2 });
    assert.notDeepEqual(um, dois);
});

test('sem seed a partida ainda roda (só não é determinística)', () => {
    const r = primeiraRodada({ seed: undefined });
    assert.equal(r.ordem.length, 4);
    assert.equal(r.maos.reduce((n, m) => n + m.mao.length, 0), 12);
});

// Referência fixa compartilhada com training/python/test_seed.py — se um dos
// dois motores mudar o embaralhamento, o seu teste quebra.
test('referência de paridade: seed 999, 4 jogadores, roundStart 3', () => {
    const r = primeiraRodada({ seed: 999, jogadores: 4, roundStart: 3 });
    assert.deepEqual(r.ordem, ['a2', 'a0', 'a1', 'a3']);
    assert.equal(r.vira, '[5 de Paus]');
    assert.deepEqual(r.maos, [
        { nome: 'a2', mao: ['[4 de Paus]', '[A de Espadas]', '[5 de Copas]'] },
        { nome: 'a0', mao: ['[5 de Ouros]', '[4 de Copas]', '[3 de Copas]'] },
        { nome: 'a1', mao: ['[J de Ouros]', '[5 de Espadas]', '[K de Paus]'] },
        { nome: 'a3', mao: ['[3 de Ouros]', '[4 de Ouros]', '[J de Copas]'] },
    ]);
});
