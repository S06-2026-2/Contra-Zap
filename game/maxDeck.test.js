// maxDeck.test.js — teto de baralhos por rodada (item 17 do README).
// Local, fora do git (ver .gitignore) — mesma política dos testes de conexao.
//
// Roda com: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_DECK_SEM_LIMITE } from './Game.js';
import { SalaManager, ErroSala } from '../conexao/SalaManager.js';
import { CodigosErro } from '../conexao/eventos.js';

// Monta um Game já "no meio da partida": gameOrder povoado com stubs de
// jogador (só hp importa pra proximaRodada) e round no valor desejado.
function gameEmAndamento({ vivos, round, maxDeck, numberPlayers }) {
    const g = new Game({
        numberPlayers: numberPlayers ?? vivos,
        roundStart: round,
        randomShuffle: true,
        maxDeck,
        jogadores: [],
    });
    g.gameOrder = Array.from({ length: vivos }, () => ({ hp: 3 }));
    g.round = round;
    return g;
}

// Chama proximaRodada() n vezes e devolve o valor de round depois de cada
// chamada. Mata `mortesApos` jogadores (tira do gameOrder) na rodada indicada.
function evoluir(g, n, mortes = {}) {
    const historico = [];
    for (let i = 1; i <= n; i++) {
        if (mortes[i]) g.gameOrder = g.gameOrder.slice(0, g.gameOrder.length - mortes[i]);
        g.proximaRodada();
        historico.push(g.round);
    }
    return historico;
}

test('baralhosNecessarios: numCards = jogadores*round + 1, arredonda pra cima', () => {
    assert.equal(Game.baralhosNecessarios(4, 3), 1);   // 13 cartas
    assert.equal(Game.baralhosNecessarios(6, 6), 1);   // 37 cartas
    assert.equal(Game.baralhosNecessarios(6, 7), 2);   // 43 cartas
    assert.equal(Game.baralhosNecessarios(3, 13), 1);  // 40 cartas exatas -> 1 baralho
    assert.equal(Game.baralhosNecessarios(3, 14), 2);  // 43 cartas
});

test('sem maxDeck na config: default é "Sem Limite" (50)', () => {
    const g = new Game({ numberPlayers: 4, roundStart: 3, randomShuffle: true, jogadores: [] });
    assert.equal(g.maxDeck, MAX_DECK_SEM_LIMITE);
    assert.equal(g.maxDeck, 50);
});

test('Sem Limite: a mão cresce +1 toda rodada, sem teto', () => {
    const g = gameEmAndamento({ vivos: 6, round: 1, maxDeck: MAX_DECK_SEM_LIMITE });
    assert.deepEqual(evoluir(g, 8), [2, 3, 4, 5, 6, 7, 8, 9]);
});

test('maxDeck baixo: round congela quando a próxima rodada não cabe', () => {
    // 6 jogadores, maxDeck 1: cabe até round 6 (37 cartas). round 7 = 43 -> 2 baralhos.
    const g = gameEmAndamento({ vivos: 6, round: 1, maxDeck: 1 });
    assert.deepEqual(evoluir(g, 8), [2, 3, 4, 5, 6, 6, 6, 6]);
});

test('morte libera o teto: round volta a subir (nunca pula pra recuperar)', () => {
    const g = gameEmAndamento({ vivos: 6, round: 1, maxDeck: 1 });
    // rodadas 1-5: sobe até 6. rodada 6: congela em 6. rodada 7: 1 morte (5 vivos)
    // -> cabe round 7 (36 cartas). rodada 8: congela em 7 (44 cartas nao cabe).
    // rodada 9: mais 1 morte (4 vivos) -> sobe pra 8. rodada 10: sobe pra 9
    // (37 cartas). rodada 11: congela em 9.
    const hist = evoluir(g, 11, { 7: 1, 9: 1 });
    assert.deepEqual(hist, [2, 3, 4, 5, 6, 6, 7, 7, 8, 9, 9]);
});

test('congelado: round nunca diminui mesmo com a mesa cheia por muitas rodadas', () => {
    const g = gameEmAndamento({ vivos: 6, round: 6, maxDeck: 1 });
    const hist = evoluir(g, 20);
    assert.ok(hist.every(r => r === 6), `esperava tudo 6, veio ${hist}`);
});

test('20 jogadores, 18 morrem: preso em round 1 com a mesa cheia, destrava quando esvazia', () => {
    // maxDeck 1, 20 vivos: floor(39/20) -> nem round 1 sobe pra 2 (20*2+1=41 -> 2 baralhos).
    const g = gameEmAndamento({ vivos: 20, round: 1, maxDeck: 1 });
    assert.deepEqual(evoluir(g, 4), [1, 1, 1, 1]);
    // sobram 2 vivos: floor(39/2) = 19, a mão volta a crescer +1/rodada.
    g.gameOrder = g.gameOrder.slice(0, 2);
    assert.deepEqual(evoluir(g, 5), [2, 3, 4, 5, 6]);
});

test('Rodada montada a partir do Game nunca estoura a assertion de baralho', () => {
    // Com o teto ativo, numBaralho*40 >= numCards sempre — a rede de segurança
    // que botamos em Rodada (item 14) não deve disparar em nenhum passo.
    const g = gameEmAndamento({ vivos: 6, round: 1, maxDeck: 2 });
    for (let i = 0; i < 30; i++) {
        assert.doesNotThrow(() => g.newRodada());
        g.proximaRodada();
    }
});

// ---- validação na camada de sala ----

const donoStub = () => ({ id: 1, nome: 'dono' });

test('criarSala: maxDeck default vira 50 e entra na configOriginal', () => {
    const sm = new SalaManager();
    const sala = sm.criarSala(donoStub(), { numberPlayers: 4, roundStart: 3 });
    assert.equal(sala.configOriginal.maxDeck, 50);
    assert.equal(sala.controller.maxDeck, 50);
});

test('criarSala: maxDeck fora de 1..50 é CONFIGURACAO_INVALIDA', () => {
    const sm = new SalaManager();
    // null/undefined não entram aqui de propósito: significam "usa o default".
    for (const mau of [0, 51, -1, 1.5, 'x']) {
        assert.throws(
            () => sm.criarSala(donoStub(), { numberPlayers: 4, roundStart: 3, maxDeck: mau }),
            (e) => e instanceof ErroSala && e.codigo === CodigosErro.CONFIGURACAO_INVALIDA,
            `maxDeck=${mau} devia ser rejeitado`
        );
    }
});

test('criarSala: roundStart que não cabe em maxDeck com a mesa cheia é rejeitado', () => {
    const sm = new SalaManager();
    // 6 jogadores * 7 cartas + 1 = 43 -> 2 baralhos > maxDeck 1
    assert.throws(
        () => sm.criarSala(donoStub(), { numberPlayers: 6, roundStart: 7, maxDeck: 1 }),
        (e) => e instanceof ErroSala && e.codigo === CodigosErro.CONFIGURACAO_INVALIDA
    );
    // 6 * 6 + 1 = 37 -> 1 baralho, cabe
    assert.doesNotThrow(() => sm.criarSala(donoStub(), { numberPlayers: 6, roundStart: 6, maxDeck: 1 }));
});

test('jogarDeNovo mantém o maxDeck da sala original', () => {
    const sm = new SalaManager();
    const sala = sm.criarSala(donoStub(), { numberPlayers: 2, roundStart: 3, maxDeck: 3 });
    // marca a partida como terminada pra jogarDeNovo aceitar (getter só leitura)
    sala.controller._finalizada = true;
    const nova = sm.jogarDeNovo(sala.salaId, donoStub());
    assert.equal(nova.configOriginal.maxDeck, 3);
    assert.equal(nova.controller.maxDeck, 3);
});
