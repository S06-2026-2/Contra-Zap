import { Game } from '../../../../game/Game.js';
import { PlayerGame } from '../../../../game/PlayerGame.js';
import {
    construirObs110, construirObsRound1, maskAposta, maskCarta, ROTULOS_OBS110, ROTULOS_OBS_ROUND1,
} from '../../../../bots/observacao.js';
import { argmaxMascarado } from '../../../../bots/rede.js';

// Partida simulada do lab do cérebro: quatro bots com a regra de verdade
// (game/Game.js, Rodada, Mesa...) e as redes de verdade, decidindo pelo
// mesmo código do bots/BotBrain.js (observacao.js monta a entrada, argmax
// na saída com a máscara de jogada legal). Sem timer, sem animação, sem
// socket: um gerador que solta um evento por passo e o lab decide o ritmo.
//
// Mesmo fluxo do GameController._jogarUmaRodada: dá as cartas, vira a
// manilha, apostas na ordem da rodada, todas as vazas, perda de vida,
// eliminação, gira quem começa e monta a próxima rodada (que cresce +1
// carta). `controller` aqui é só o recorte que observacao.js lê.

export const NOMES = ['Você', 'Bot 1', 'Bot 2', 'Bot 3'];

function softmaxMascarado(logits, mask) {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (mask[i] && logits[i] > max) max = logits[i];
    const exp = logits.map((v, i) => (mask[i] ? Math.exp(v - max) : 0));
    const soma = exp.reduce((a, b) => a + b, 0) || 1;
    return exp.map((v) => v / soma);
}

// Retrato do que a mesinha do lab desenha depois de cada passo.
function retrato(controller, numeroRodada) {
    const rodada = controller.rodada;
    const naMesa = new Map((rodada.mesaAtiva?.cartasNaMesa ?? []).map((j) => [j.jogador, j.carta]));
    return {
        numeroRodada,
        cartasRodada: rodada.round,
        vira: rodada.vira,
        viraValor: rodada.viraValor,
        jogadores: controller.jogadores.map((j) => ({
            nome: j.nome,
            mao: [...j.mao],
            aposta: j.aposta,
            steak: j.steak,
            hp: j.hp,
            vivo: j.hp > 0,
            naMesa: naMesa.get(j) ?? null,
        })),
    };
}

// Decide (aposta ou carta) do jeito do BotBrain e devolve tudo o que
// aconteceu no meio. `rede` = rodada >= 2, `redeRound1` = rodada cega.
function decidir(controller, jogador, fase, { rede, redeRound1 }) {
    const rodada = controller.rodada;
    if (fase === 'carta' && (rodada.round === 1 || jogador.mao.length <= 1)) {
        return { forcada: true, escolha: 0 };
    }
    const cega = rodada.round === 1;
    const redeUsada = cega ? redeRound1 : rede;
    const obs = cega ? construirObsRound1(controller, jogador) : construirObs110(controller, jogador, fase === 'aposta');
    const detalhe = redeUsada.detalhar(obs);
    let mask;
    let logits;
    if (fase === 'aposta') {
        logits = detalhe.aposta;
        if (cega) {
            const somaOutros = rodada.gameOrder.reduce((s, j) => (j === jogador ? s : s + j.aposta), 0);
            const ehUltimo = rodada.gameOrder[rodada.gameOrder.length - 1] === jogador;
            mask = [1, rodada.round > 1 && ehUltimo && somaOutros + 1 === rodada.round ? 0 : 1];
        } else {
            mask = maskAposta(rodada, jogador);
        }
    } else {
        logits = detalhe.carta;
        mask = maskCarta(jogador.mao.length);
    }
    return {
        forcada: false,
        cega,
        rede: redeUsada,
        obs,
        rotulos: cega ? ROTULOS_OBS_ROUND1 : ROTULOS_OBS110,
        detalhe,
        logits,
        mask,
        probs: softmaxMascarado(logits, mask),
        escolha: argmaxMascarado(logits, mask),
    };
}

export function* rodarPartida({ rede, redeRound1, seed }) {
    const jogadores = NOMES.map((nome, id) => new PlayerGame({ nome, id, bot: true }));
    const game = new Game({ numberPlayers: 4, roundStart: 1, randomShuffle: true, jogadores, seed });
    game.setstartsequence();
    const controller = { jogadores, rodada: game.newRodada(), _cartasJogadasRodada: new Set() };
    let numeroRodada = 1;
    const redes = { rede, redeRound1 };

    while (true) {
        const rodada = controller.rodada;
        rodada.darCartas();
        controller._cartasJogadasRodada = new Set();
        rodada.virarManilha();
        yield { tipo: 'rodada', estado: retrato(controller, numeroRodada) };

        for (const jogador of rodada.gameOrder) {
            const decisao = decidir(controller, jogador, 'aposta', redes);
            const retratoAntes = retrato(controller, numeroRodada);
            jogador.aposta = decisao.escolha;
            yield { tipo: 'decisao', fase: 'aposta', jogador: jogador.nome, decisao, estadoAntes: retratoAntes, estado: retrato(controller, numeroRodada) };
        }

        for (let v = 0; v < rodada.round; v++) {
            if (v > 0) rodada.novaVaza();
            for (const jogador of rodada.ordemDaVaza()) {
                const decisao = decidir(controller, jogador, 'carta', redes);
                const retratoAntes = retrato(controller, numeroRodada);
                const carta = jogador.mao.splice(decisao.escolha, 1)[0];
                controller._cartasJogadasRodada.add(carta.valorInt * 4 + carta.naipeInt);
                rodada.registrarJogada(jogador, carta);
                yield { tipo: 'decisao', fase: 'carta', jogador: jogador.nome, carta, decisao, estadoAntes: retratoAntes, estado: retrato(controller, numeroRodada) };
            }
            const vencedor = rodada.finalizarVaza();
            yield { tipo: 'vaza', vencedor: vencedor?.nome ?? null, estado: retrato(controller, numeroRodada) };
        }

        rodada.finalizarRodada();
        yield { tipo: 'fimRodada', estado: retrato(controller, numeroRodada) };

        const vivos = game.gameOrder.filter((j) => j.hp > 0);
        if (vivos.length <= 1) {
            yield { tipo: 'fimJogo', vencedor: vivos[0]?.nome ?? null, estado: retrato(controller, numeroRodada) };
            return;
        }
        game.eliminarZerados();
        rodada.resetarApostasSteaks();
        game.girarOrdem();
        numeroRodada++;
        controller.rodada = game.proximaRodada();
    }
}
