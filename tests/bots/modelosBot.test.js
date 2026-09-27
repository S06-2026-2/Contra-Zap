// Catálogo de bots (bots/modelosBot.js) x arquivos em bots/models/.
//
// A suíte de API não pega um JSON faltando ou com formato errado: o
// BotBrain cai no heurístico em silêncio (só um console.warn) e a partida
// continua normalmente — o "Campeão" viraria o "Iniciante" sem ninguém
// perceber. Este teste é o que garante que cada opção oferecida na tela de
// criar sala tem de fato a rede que promete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RedeAtorCritico } from '../../bots/nn.js';
import { MODELOS_BOT, MODELO_BOT_PADRAO, modeloBotPorId } from '../../bots/modelosBot.js';

test('catálogo de modelos de bot', async (t) => {
    await t.test('ids únicos e o padrão existe no catálogo', () => {
        const ids = MODELOS_BOT.map(m => m.id);
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(modeloBotPorId(MODELO_BOT_PADRAO));
    });

    await t.test('id desconhecido não vira modelo nenhum', () => {
        for (const id of ['nao-existe', undefined, null, 3]) {
            assert.equal(modeloBotPorId(id), null);
        }
    });

    for (const modelo of MODELOS_BOT.filter(m => m.arquivo)) {
        await t.test(`${modelo.id}: ${modelo.arquivo} carrega com a forma que o BotBrain espera`, () => {
            const rede = RedeAtorCritico.carregar(modelo.arquivo);
            assert.equal(rede.obsDim, 110);
            // Rodada >= 2 escolhe carta também — sem essa cabeça o
            // escolherCarta cairia no heurístico.
            assert.ok(rede.logitsCarta(new Array(110).fill(0)), 'rede sem cabeça de carta');
            assert.equal(rede.logitsAposta(new Array(110).fill(0)).length, 13);
        });
    }

    await t.test('cada rede é um arquivo diferente (nenhuma opção duplicada)', () => {
        const fontes = MODELOS_BOT.filter(m => m.arquivo).map(m => RedeAtorCritico.carregar(m.arquivo).fonte);
        assert.equal(new Set(fontes).size, fontes.length);
    });
});
