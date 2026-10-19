// observacao.js
// O que a rede do bot "ve": a montagem do vetor de entrada (110 numeros na
// rodada >= 2, 22 na rodada cega) e as mascaras de acao legal, a partir do
// estado do jogo (`controller` com `rodada`, `jogadores` e
// `_cartasJogadasRodada`, do jeito do game/GameController.js). Modulo puro
// (sem node:fs nem metricas) de proposito: o bots/BotBrain.js usa no
// servidor e o lab do cerebro (/lab no front) usa no navegador, entao o que
// o lab mostra e exatamente o que o bot de producao enxerga.
//
// ROTULOS_OBS110/ROTULOS_OBS_ROUND1 dizem o que cada posicao do vetor
// significa, na mesma ordem em que construirObs110/construirObsRound1
// montam -- mexeu num, mexe no outro.

export const MAX_HAND = 12;      // teto de cartas na observacao / espaco de aposta (== MAX_HAND do treino)
const MAX_APOSTA = MAX_HAND;
const NUM_RANKS = 10;
const NUM_NAIPES = 4;
// Assentos que as redes enxergam. Fixo em 4 porque foi so com 4 que elas
// treinaram (training/env_bridge.js:NUM_SEATS). Salas de 2/3/5/6 sao
// encaixadas nesse formato por ajustarParaModelo() -- ver o comentario la.
const SEATS_MODELO = 4;

// --- codificacao de estado (porte fiel de training/env_bridge.js:construirObs
//     e training/python/harness_round1.py:construir_obs_round1) ---

function codificarCarta(carta, viraValor) {
    return [
        carta.valorInt / (NUM_RANKS - 1),
        carta.naipeInt / (NUM_NAIPES - 1),
        carta.valorInt === viraValor ? 1 : 0,
    ];
}
const CARTA_VAZIA = [0, 0, 0];

function codificarMao(mao, viraValor) {
    const out = [];
    for (let i = 0; i < MAX_HAND; i++) {
        out.push(...(i < mao.length ? codificarCarta(mao[i], viraValor) : CARTA_VAZIA));
    }
    return out;
}

// Ordem sempre relativa a quem decide ("eu, o proximo, ...") pela ordem de
// assento fixa (controller.jogadores), nao pela gameOrder que gira por rodada.
function ordemRelativa(jogadores, euId) {
    const n = jogadores.length;
    const indice = jogadores.findIndex(j => j.id === euId);
    const ordem = [];
    for (let i = 0; i < n; i++) ordem.push(jogadores[(indice + i) % n]);
    return ordem;
}

// As duas redes foram treinadas so em mesa de 4 (ver training/env_bridge.js:
// NUM_SEATS e harness_round1.py) e a observacao tem um bloco de numeros por
// assento -- com 2/3/5/6 jogadores o vetor mudaria de tamanho e
// nn.js:_tronco recusaria ("obs de X valores, rede espera 110"). Aqui a
// lista de assentos (ja em ordem relativa, eu primeiro) e forcada pra
// exatamente SEATS_MODELO entradas:
//   - menos que 4: completa com `null` (assento fantasma). Cada campo dele
//     vira 0 na obs, que a rede le como um assento ja eliminado -- estado
//     que ela viu muito em partidas de 4 depois de alguem morrer, entao
//     continua dentro da distribuicao de treino.
//   - mais que 4: mantem eu + os SEATS_MODELO-1 seguintes na ordem de
//     assento e descarta o resto. Aqui sim e fora da distribuicao (a rede
//     nunca viu 5-6 na mesa); perde a informacao dos assentos mais
//     distantes, mas nao quebra e joga algo coerente. Rede propria pra 5-6
//     ainda esta por fazer (ver DEV.md).
function ajustarParaModelo(ordemRel) {
    const ajustada = ordemRel.slice(0, SEATS_MODELO);
    while (ajustada.length < SEATS_MODELO) ajustada.push(null);
    return ajustada;
}

function codificarMesa(mesaAtiva, ordemRel, viraValor) {
    const jogadasPorId = new Map((mesaAtiva?.cartasNaMesa ?? []).map(j => [j.jogador.id, j.carta]));
    const out = [];
    for (const jogador of ordemRel) {
        // jogador === null -> assento fantasma (ajustarParaModelo), nunca jogou carta.
        const carta = jogador ? jogadasPorId.get(jogador.id) : null;
        out.push(...(carta ? codificarCarta(carta, viraValor) : CARTA_VAZIA), carta ? 1 : 0);
    }
    return out;
}

function codificarMemoria(cartasJogadas) {
    const out = new Array(NUM_RANKS * NUM_NAIPES).fill(0);
    for (const chave of cartasJogadas) out[chave] = 1;
    return out;
}

// Set de ids que ja apostaram nesta rodada. Aposta acontece em ordem de
// rodada.gameOrder: quem vem antes de `jogador` ja apostou, o resto (e ele
// mesmo) nao. Na fase de carta, todos ja apostaram.
function idsQueApostaram(controller, jogador, faseAposta) {
    const ordem = controller.rodada.gameOrder;
    if (!faseAposta) return new Set(ordem.map(j => j.id));
    const meuIndice = ordem.findIndex(j => j === jogador);
    return new Set(ordem.slice(0, meuIndice < 0 ? 0 : meuIndice).map(j => j.id));
}

export function construirObs110(controller, jogador, faseAposta) {
    const rodada = controller.rodada;
    // ordemRelativa devolve N assentos (2..6); a rede treinou com 4 e a obs
    // tem um bloco por assento (mesa + hp/aposta/steak). ajustarParaModelo
    // recorta/preenche pra SEMPRE dar SEATS_MODELO blocos -- senao o vetor
    // muda de tamanho e nn.js:_tronco recusa.
    const ordemRel = ajustarParaModelo(ordemRelativa(controller.jogadores, jogador.id));
    const apostaram = idsQueApostaram(controller, jogador, faseAposta);
    const cartasJogadas = controller._cartasJogadasRodada ?? new Set();

    const hpApostaSteak = [];
    for (const j of ordemRel) {
        if (j) hpApostaSteak.push(j.hp / 3, j.aposta / MAX_APOSTA, j.steak / MAX_HAND, apostaram.has(j.id) ? 1 : 0);
        else hpApostaSteak.push(0, 0, 0, 0); // assento fantasma: mesmos zeros de um jogador ja eliminado
    }

    return [
        ...codificarMao(jogador.mao, rodada.viraValor),
        ...codificarMesa(rodada.mesaAtiva, ordemRel, rodada.viraValor),
        ...hpApostaSteak,
        rodada.viraValor / (NUM_RANKS - 1),
        rodada.round / MAX_HAND,
        ...codificarMemoria(cartasJogadas),
    ];
}

// Round 1 (rodada cega): ve as cartas dos outros, nao a propria. Igual a
// construirObs110, a rede de round 1 tambem so treinou com 4 assentos
// (obs_dim=22: 3 cartas de outros + 4 blocos hp/aposta + vira), entao a obs
// e recortada/preenchida pra esse formato fixo por ajustarParaModelo.
export function construirObsRound1(controller, jogador) {
    const rodada = controller.rodada;
    const ordemRel = ajustarParaModelo(ordemRelativa(controller.jogadores, jogador.id));
    const apostaram = idsQueApostaram(controller, jogador, true);

    const vec = [];
    for (const outro of ordemRel.slice(1)) {
        vec.push(...(outro ? codificarCarta(outro.mao[0], rodada.viraValor) : CARTA_VAZIA));
    }
    for (const j of ordemRel) {
        if (j) vec.push(j.hp / 3, j.aposta / 1, apostaram.has(j.id) ? 1 : 0);
        else vec.push(0, 0, 0);
    }
    vec.push(rodada.viraValor / (NUM_RANKS - 1));
    return vec;
}

// --- mascaras de acao legal (mesma regra estrutural de env_bridge / GameController) ---

export function maskAposta(rodada, jogador) {
    const numCartas = rodada.round;
    const somaOutros = rodada.gameOrder.reduce((s, j) => (j === jogador ? s : s + j.aposta), 0);
    const ehUltimo = rodada.gameOrder[rodada.gameOrder.length - 1] === jogador;
    const proibido = ehUltimo ? numCartas - somaOutros : null;
    const mask = new Array(MAX_APOSTA + 1).fill(0);
    for (let v = 0; v <= Math.min(numCartas, MAX_APOSTA); v++) {
        if (v !== proibido) mask[v] = 1;
    }
    return mask;
}

export function maskCarta(tamanhoMao) {
    const mask = new Array(MAX_HAND).fill(0);
    for (let i = 0; i < Math.min(tamanhoMao, MAX_HAND); i++) mask[i] = 1;
    return mask;
}

// --- o que cada posicao do vetor significa (mesma ordem das funcoes acima) ---

const NOMES_ASSENTO = ['eu', 'próximo', '2º depois', '3º depois'];

function rotulosCarta(prefixo, grupo) {
    return [
        { grupo, rotulo: `${prefixo}: valor` },
        { grupo, rotulo: `${prefixo}: naipe` },
        { grupo, rotulo: `${prefixo}: é manilha` },
    ];
}

export const ROTULOS_OBS110 = [
    ...Array.from({ length: MAX_HAND }, (_, i) => rotulosCarta(`carta ${i + 1}`, 'Minha mão')).flat(),
    ...NOMES_ASSENTO.flatMap((nome) => [
        ...rotulosCarta(`${nome} jogou`, 'Mesa'),
        { grupo: 'Mesa', rotulo: `${nome}: já jogou` },
    ]),
    ...NOMES_ASSENTO.flatMap((nome) => [
        { grupo: 'Jogadores', rotulo: `${nome}: vida` },
        { grupo: 'Jogadores', rotulo: `${nome}: aposta` },
        { grupo: 'Jogadores', rotulo: `${nome}: vazas feitas` },
        { grupo: 'Jogadores', rotulo: `${nome}: já apostou` },
    ]),
    { grupo: 'Rodada', rotulo: 'manilha' },
    { grupo: 'Rodada', rotulo: 'cartas na rodada' },
    ...Array.from({ length: NUM_RANKS * NUM_NAIPES }, (_, i) => ({
        grupo: 'Cartas já jogadas',
        rotulo: `${['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'][Math.floor(i / 4)]} de ${['Ouros', 'Espadas', 'Copas', 'Paus'][i % 4]}`,
    })),
];

export const ROTULOS_OBS_ROUND1 = [
    ...NOMES_ASSENTO.slice(1).flatMap((nome) => rotulosCarta(`carta do ${nome}`, 'Cartas dos outros')),
    ...NOMES_ASSENTO.flatMap((nome) => [
        { grupo: 'Jogadores', rotulo: `${nome}: vida` },
        { grupo: 'Jogadores', rotulo: `${nome}: aposta` },
        { grupo: 'Jogadores', rotulo: `${nome}: já apostou` },
    ]),
    { grupo: 'Rodada', rotulo: 'manilha' },
];
