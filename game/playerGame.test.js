// playerGame.test.js — item 22 do README: Player agora guarda `rate` de
// verdade (era o 3º arg ignorado); PlayerGame não leva senha nem rate pra
// dentro do motor (mesmo recorte do PlayerGame de training/python/motor/
// partida.py). Local, fora do git (ver .gitignore).
//
// Roda com: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from './Player.js';
import { PlayerGame } from './PlayerGame.js';

test('Player guarda o rate passado (não é mais ignorado)', () => {
    assert.equal(new Player('ana', null, 7).rate, 7);
});

test('Player sem rate cai em 0 (default), compatível com os chamadores de 2 args', () => {
    assert.equal(new Player('ana', null).rate, 0);
    assert.equal(new Player('ana', 'senha').senha, 'senha'); // 2 args continua funcionando
});

test('PlayerGame não carrega senha nem rate pra dentro do motor', () => {
    const base = { id: 3, nome: 'bia', senha: 'segredo', rate: 42, bot: false };
    const pg = new PlayerGame(base);

    assert.equal(pg.senha, null, 'o assento do motor não deve guardar credencial');
    assert.equal(pg.rate, 0, 'rate/ranking é conceito de conta, não entra no motor');
    // o que o motor precisa de verdade continua vindo
    assert.equal(pg.id, 3);
    assert.equal(pg.nome, 'bia');
    assert.equal(pg.bot, false);
    assert.equal(pg.hp, 3);
});

test('PlayerGame nascido de um Bot preserva o flag eraBot', () => {
    const pg = new PlayerGame({ id: -1, nome: 'Bot 1', bot: true });
    assert.equal(pg.bot, true);
    assert.equal(pg.eraBot, true);
    assert.equal(pg.senha, null);
});
