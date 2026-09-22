// fimDeJogo.test.js — desempate de fim de jogo (item 18) e o payload de
// jogadorSaiu (item 25). Local, fora do git (ver .gitignore).
//
// Roda com: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from './GameController.js';

// Prepara um controller no ponto em que _resolverFimDeJogo é chamado: game e
// rodada com o mesmo gameOrder de stubs { nome, hp }.
function controllerCom(gameOrder) {
    const c = new GameController({ numberPlayers: gameOrder.length });
    c.game = { gameOrder };
    c.rodada = { gameOrder };
    return c;
}

function fimDeJogo(gameOrder) {
    const c = controllerCom(gameOrder);
    let vencedor;
    c.on('jogoFinalizado', ({ vencedor: v }) => { vencedor = v; });
    const acabou = c._resolverFimDeJogo();
    return { acabou, vencedor, finalizada: c.finalizada };
}

test('sobra 1 vivo (hp > 0): ele vence', () => {
    const r = fimDeJogo([{ nome: 'A', hp: 2 }, { nome: 'B', hp: -1 }, { nome: 'C', hp: 0 }]);
    assert.equal(r.acabou, true);
    assert.equal(r.vencedor, 'A');
    assert.equal(r.finalizada, true);
});

test('2+ vivos: a partida continua (não emite, não finaliza)', () => {
    const c = controllerCom([{ nome: 'A', hp: 2 }, { nome: 'B', hp: 1 }, { nome: 'C', hp: -1 }]);
    let emitiu = false;
    c.on('jogoFinalizado', () => { emitiu = true; });
    assert.equal(c._resolverFimDeJogo(), false);
    assert.equal(emitiu, false);
    assert.equal(c.finalizada, false);
});

test('todos morreram: vence o hp mais perto de 0 (perdeu menos vida)', () => {
    const r = fimDeJogo([{ nome: 'A', hp: -3 }, { nome: 'B', hp: -1 }, { nome: 'C', hp: -2 }]);
    assert.equal(r.acabou, true);
    assert.equal(r.vencedor, 'B'); // -1 é o mais perto de 0
});

test('todos morreram e empataram no hp: vence quem vem antes em gameOrder (chegou primeiro)', () => {
    // B e C os dois em -1; B vem antes -> B
    assert.equal(fimDeJogo([{ nome: 'A', hp: -3 }, { nome: 'B', hp: -1 }, { nome: 'C', hp: -1 }]).vencedor, 'B');
    // mesma coisa, ordem trocada -> C
    assert.equal(fimDeJogo([{ nome: 'A', hp: -3 }, { nome: 'C', hp: -1 }, { nome: 'B', hp: -1 }]).vencedor, 'C');
});

test('todos exatamente em 0: vence o primeiro de gameOrder', () => {
    assert.equal(fimDeJogo([{ nome: 'X', hp: 0 }, { nome: 'Y', hp: 0 }]).vencedor, 'X');
});

test('jogadorSaiu carrega o nome (item 25 — pra virar linha de chat)', () => {
    const c = new GameController({ numberPlayers: 4 });
    c.entrarNaSala({ id: 1, nome: 'ana' });
    c.entrarNaSala({ id: 2, nome: 'bia' });

    const saidas = [];
    c.on('jogadorSaiu', (p) => saidas.push(p));
    c.removerJogador(2);

    assert.deepEqual(saidas, [{ id: 2, nome: 'bia' }]);
});

test('jogadorEntrou carrega id e nome', () => {
    const c = new GameController({ numberPlayers: 4 });
    const entradas = [];
    c.on('jogadorEntrou', (p) => entradas.push(p));
    c.entrarNaSala({ id: 7, nome: 'caio' });
    assert.deepEqual(entradas, [{ id: 7, nome: 'caio' }]);
});
