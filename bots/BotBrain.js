// BotBrain.js
// Cerebro dos bots. E o UNICO lugar do projeto que decide uma jogada
// automatica: turno de um Bot de verdade e timeout de jogador real
// desconectado passam os dois por aqui (ver PlayerGame.bot e
// game/GameController.js). GameController nao sabe nem precisa saber como a
// decisao foi tomada -- so passa `jogador` e, agora, o `controller` pra dar
// acesso ao estado da rodada (mao dos outros na rodada cega, mesa, manilha,
// memoria de cartas). Sem `controller` (ou se os modelos nao carregarem) cai
// no heuristico burro de sempre.
//
// Estrategia atual: duas redes treinadas por self-play/RL (training/), com
// os pesos exportados pra bots/models/*.json (ver training/python/
// export_weights.py) e o forward pass reimplementado em JS puro (bots/nn.js):
//   - round 1 (rodada cega, aposta 0/1 sem ver a propria carta): round1.json
//   - round >= 2 (aposta e escolha de carta): a rede do modelo da sala
//     (noite1.json, noite1H.json ou slot01.json -- ver abaixo)
// A escolha de carta no round 1 e forcada (1 carta so), nao usa rede.
//
// As duas redes so treinaram em mesa de 4 (training/env_bridge.js), mas
// aqui rodam pra qualquer tamanho de sala (2 a 6): a observacao tem um
// bloco de numeros por assento, entao ela e sempre encaixada no formato de
// 4 assentos por ajustarParaModelo() -- completando com assento fantasma
// quando ha menos gente, cortando os assentos mais distantes quando ha
// mais. Fora de 4 e mais fraco (2/3 ainda cai dentro da distribuicao de
// treino porque "assento fantasma" == jogador ja eliminado, que a rede viu
// muito; 5/6 nao), mas e melhor que o heuristico burro de "ultima carta /
// aposta 1" -- que agora so sobra quando os modelos nem carregam ou nao ha
// `controller`. Uma rede dedicada a 5-6 fica pro futuro (ver DEV.md, "O que
// falta fazer").
//
// Qual rede de rodada >= 2 joga depende da sala: `controller.modeloBot`
// (escolhido em criarSala, catalogo em bots/modelosBot.js). Sem isso cai no
// MODELO_BOT_PADRAO. O modelo 'iniciante' nao tem rede nenhuma -- joga
// sempre pelo heuristico, inclusive na rodada 1.
import { RedeAtorCritico, argmaxMascarado } from './nn.js';
import { construirObs110, construirObsRound1, maskAposta, maskCarta } from './observacao.js';
import { MODELOS_BOT, MODELO_BOT_PADRAO, modeloBotPorId } from './modelosBot.js';
import { cronometrarDecisaoBot } from '../observabilidade/metricas.js';

// --- carrega os modelos uma vez; falha vira "sem modelo", nunca derruba o servidor ---
// Cada arquivo falha sozinho: um JSON faltando derruba so aquele modelo pro
// heuristico, os outros continuam jogando com rede.
function carregarOuNull(arquivo) {
    try {
        return RedeAtorCritico.carregar(arquivo);
    } catch (erro) {
        console.warn(`[BotBrain] modelo ${arquivo} nao carregado (${erro.message}) -- usando heuristico burro`);
        return null;
    }
}

const REDE_ROUND1 = carregarOuNull('round1.json');
// id do modelo (bots/modelosBot.js) -> rede de rodada >= 2 (null = heuristico).
const REDES_NOITE = new Map(
    MODELOS_BOT.map(m => [m.id, m.arquivo ? carregarOuNull(m.arquivo) : null])
);

function modeloDaSala(controller) {
    return modeloBotPorId(controller?.modeloBot) ?? modeloBotPorId(MODELO_BOT_PADRAO);
}

// Rede de rodada >= 2 que joga nesta sala, ou null pro heuristico.
function redeNoiteDaSala(controller) {
    return REDES_NOITE.get(modeloDaSala(controller).id) ?? null;
}

// Rede da rodada cega: so faz sentido pra modelo com rede -- o 'iniciante'
// e heuristico do comeco ao fim.
function redeRound1DaSala(controller) {
    return modeloDaSala(controller).arquivo ? REDE_ROUND1 : null;
}

// --- ponto de plugue: as duas funcoes que o GameController chama ---

// Indice (0-based) da carta escolhida na mao do jogador.
export function escolherCarta(jogador, controller) {
    const pararCronometro = cronometrarDecisaoBot();
    try {
        return _escolherCartaInterno(jogador, controller);
    } finally {
        pararCronometro();
    }
}

function _escolherCartaInterno(jogador, controller) {
    const heuristico = () => jogador.mao.length - 1;
    const rede = redeNoiteDaSala(controller);
    if (!rede || !controller?.rodada) return heuristico();
    // Round 1 tem 1 carta: jogada forcada, nao gasta rede.
    if (controller.rodada.round === 1 || jogador.mao.length <= 1) return 0;
    try {
        const obs = construirObs110(controller, jogador, false);
        const logits = rede.logitsCarta(obs);
        if (!logits) return heuristico(); // rede sem cabeca de carta (ex.: a de round 1) -- nao deveria chegar aqui, mas nao explode
        const escolha = argmaxMascarado(logits, maskCarta(jogador.mao.length));
        return escolha >= 0 && escolha < jogador.mao.length ? escolha : heuristico();
    } catch (erro) {
        console.warn(`[BotBrain] escolherCarta caiu no heuristico: ${erro.message}`);
        return heuristico();
    }
}

// `permiteAposta1` vem do GameController (so ele sabe as apostas ja feitas):
// false quando apostar 1 fecharia a soma da rodada no numero de cartas (regra
// do ultimo a apostar). Devolve o valor apostado (== indice da acao).
export function escolherAposta(jogador, { permiteAposta1, controller } = {}) {
    const pararCronometro = cronometrarDecisaoBot();
    try {
        return _escolherApostaInterno(jogador, { permiteAposta1, controller });
    } finally {
        pararCronometro();
    }
}

function _escolherApostaInterno(jogador, { permiteAposta1, controller } = {}) {
    const heuristico = () => (permiteAposta1 ? 1 : 0);
    if (!controller?.rodada) return heuristico();

    try {
        if (controller.rodada.round === 1) {
            const redeRound1 = redeRound1DaSala(controller);
            if (!redeRound1) return heuristico();
            const obs = construirObsRound1(controller, jogador);
            const logits = redeRound1.logitsAposta(obs);
            const mask = [1, permiteAposta1 ? 1 : 0];
            const escolha = argmaxMascarado(logits, mask);
            return escolha >= 0 ? escolha : heuristico();
        }
        const rede = redeNoiteDaSala(controller);
        if (!rede) return heuristico();
        const obs = construirObs110(controller, jogador, true);
        const logits = rede.logitsAposta(obs);
        const escolha = argmaxMascarado(logits, maskAposta(controller.rodada, jogador));
        return escolha >= 0 ? escolha : heuristico();
    } catch (erro) {
        console.warn(`[BotBrain] escolherAposta caiu no heuristico: ${erro.message}`);
        return heuristico();
    }
}
