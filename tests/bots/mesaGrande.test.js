// O bot continua usando a rede em mesa de 5 e 6?
//
// As duas redes treinaram só com 4 assentos (training/env_bridge.js:
// NUM_SEATS), e a observação tem um bloco de números por assento. Com 2 ou 3
// jogadores sobra assento fantasma; com 5 ou 6, bots/observacao.js recorta a
// mesa nos 4 mais próximos. É um caminho declaradamente fora da distribuição
// de treino, e portanto o mais fácil de quebrar.
//
// O problema é COMO ele quebra. O BotBrain embrulha a decisão num try/catch
// que, em qualquer erro, devolve o heurístico burro ("aposta 1, joga a última
// carta") e segue a partida. Nenhuma exceção sobe, nenhum teste de API falha,
// nenhum jogador recebe erro: os bots simplesmente ficam ruins, e o único
// sinal é um console.warn que ninguém lê. A sala de 6 jogadores que a
// interface passou a suportar cai exatamente nesse caminho.
//
// Por isso este arquivo não se contenta com "devolveu uma jogada legal":
// ele vigia o console.warn e falha se a rede tiver sido abandonada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherAposta, escolherCarta } from '../../bots/BotBrain.js';
import { MODELOS_BOT } from '../../bots/modelosBot.js';
import { Carta } from '../../game/Carta.js';

const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
const VALORES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const COM_REDE = MODELOS_BOT.filter((modelo) => modelo.arquivo);

// Semente fixa: mesa aleatória que é a MESMA em toda execução, senão um
// teste que falha uma vez não dá pra reproduzir.
let semente = 20261028;
const rnd = () => (semente = (semente * 48271) % 2147483647) / 2147483647;
const inteiro = (n) => Math.floor(rnd() * n);

let proximoId = 0;
const carta = () => {
    const v = inteiro(10), n = inteiro(4);
    return new Carta(proximoId++, n, v, NAIPES[n], VALORES[v], 1);
};

// Recorte que bots/observacao.js lê — montado à mão de propósito: aqui o
// assunto é a rede, não o motor, e subir uma partida de 6 só pra chegar
// neste ponto tornaria o teste lento e indireto.
function mesa(quantos, round, modeloBot) {
    const jogadores = Array.from({ length: quantos }, (_, i) => ({
        id: `p${i}`,
        nome: `J${i}`,
        mao: Array.from({ length: round }, carta),
        hp: 1 + inteiro(3),
        aposta: inteiro(round + 1),
        steak: inteiro(round + 1),
    }));
    const cartasNaMesa = jogadores
        .slice(1)
        .filter(() => rnd() < 0.5)
        .map((j) => ({ jogador: { id: j.id }, carta: carta() }));
    return {
        jogadores,
        modeloBot,
        _cartasJogadasRodada: new Set(Array.from({ length: inteiro(8) }, () => inteiro(40))),
        rodada: {
            round,
            viraValor: inteiro(10),
            // Embaralhado: é a gameOrder que decide quem já apostou e quem é
            // o último, a parte mais fácil de errar no recorte.
            gameOrder: [...jogadores].sort(() => rnd() - 0.5),
            mesaAtiva: { cartasNaMesa },
        },
    };
}

// Roda `acao` com o console.warn sob vigia. Devolve o que a ação retornou e
// os avisos que o BotBrain emitiu no caminho.
function vigiandoOsAvisos(acao) {
    const original = console.warn;
    const avisos = [];
    console.warn = (...args) => { avisos.push(args.join(' ')); };
    try {
        return { resultado: acao(), avisos };
    } finally {
        console.warn = original;
    }
}

test('o bot usa a rede em qualquer tamanho de mesa', async (t) => {
    for (const quantos of [2, 3, 4, 5, 6]) {
        await t.test(`mesa de ${quantos}: decide pela rede, sem cair no heurístico`, () => {
            for (const modelo of COM_REDE) {
                for (let tentativa = 0; tentativa < 8; tentativa++) {
                    const round = 2 + inteiro(5);
                    const controller = mesa(quantos, round, modelo.id);
                    const eu = controller.jogadores[0];

                    const aposta = vigiandoOsAvisos(
                        () => escolherAposta(eu, { permiteAposta1: true, controller }),
                    );
                    assert.deepEqual(aposta.avisos, [],
                        `${modelo.nome} abandonou a rede na aposta com ${quantos} jogadores`);
                    assert.ok(aposta.resultado >= 0 && aposta.resultado <= round,
                        `aposta ${aposta.resultado} fora de [0, ${round}]`);

                    const jogada = vigiandoOsAvisos(() => escolherCarta(eu, controller));
                    assert.deepEqual(jogada.avisos, [],
                        `${modelo.nome} abandonou a rede na carta com ${quantos} jogadores`);
                    assert.ok(jogada.resultado >= 0 && jogada.resultado < eu.mao.length,
                        `índice ${jogada.resultado} fora de uma mão de ${eu.mao.length}`);
                }
            }
        });
    }

    await t.test('rodada cega também aguenta mesa grande', () => {
        // A rede de round 1 tem obs própria (22 números, as cartas dos
        // outros) e o mesmo recorte para 4 assentos.
        for (const quantos of [2, 5, 6]) {
            const controller = mesa(quantos, 1, 'campeao');
            const eu = controller.jogadores[0];
            const { resultado, avisos } = vigiandoOsAvisos(
                () => escolherAposta(eu, { permiteAposta1: true, controller }),
            );
            assert.deepEqual(avisos, [], `abandonou a rede cega com ${quantos} jogadores`);
            assert.ok(resultado === 0 || resultado === 1, `aposta cega inválida: ${resultado}`);
        }
    });

    await t.test('o modelo sem rede usa o heurístico em silêncio, sem avisar', () => {
        // 'iniciante' não tem arquivo de rede: cair no heurístico é o
        // comportamento dele, não uma falha. O console.warn é reservado pro
        // caso em que a rede EXISTE e deu erro — se este teste começar a ver
        // aviso aqui, os dois casos se confundiram.
        const controller = mesa(6, 4, 'iniciante');
        const { resultado, avisos } = vigiandoOsAvisos(
            () => escolherAposta(controller.jogadores[0], { permiteAposta1: true, controller }),
        );
        assert.deepEqual(avisos, []);
        assert.equal(resultado, 1, 'o heurístico aposta 1 quando pode');
    });
});
