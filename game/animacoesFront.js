// Quanto tempo o front novo (MesaExperimento.jsx + as coreografias de
// manilha em MesaDanificada.jsx) leva animando cada evento da partida. O
// servidor soma isto numa linha do tempo (ver GameController._somarAnimacaoFront)
// pra saber até quando a tela ainda está ocupada — é o que decide quanto a
// primeira aposta de cada rodada espera (ver _esperarDistribuicao).
//
// Todos os números são cópias das constantes de lá (nome delas nos
// comentários). Mudou a animação lá, muda aqui.

// Carta saindo da SUA mão antes de voar (DURACAO_SAIDA_MAO_MS) — o servidor
// não sabe de qual tela é a carta, então conta sempre.
const SAIDA_DA_MAO_MS = 220;
// Voo de carta jogada (DURACAO_JOGADA_MS = 650 / VELOCIDADE).
const JOGADA_MS = 325;

// Coreografia inteira de cada manilha, do voo até pousar de vez.
const MANILHA_MS = {
    // SIM_VOO 620 + SIM_CRESCIDA 550 + SIM_SEGURAR 600 + FACA_QUEDA 550
    // + FACA_DESLIZE 520 + SIM_LEVANTAR 420 + SIM_POUSO_FINAL 260
    Espadas: 3_520,
    // SIM_VOO 620 + SIM_CRESCIDA 550 + COPAS_SEGURAR 100 + COPAS_ATRASO_CHAMAS 80
    // + COPAS_QUEIMANDO_ALTO 760 + COPAS_DESCIDA 520 + COPAS_QUEIMANDO_MESA 1200
    // + SIM_LEVANTAR 420 + SIM_POUSO_FINAL 260
    Copas: 4_510,
    // SIM_VOO 620 + SIM_CRESCIDA 550 + OUROS_SEGURAR 200 + OUROS_PICARETA_ENTRADA 420
    // + OUROS_CARGA 650 + OUROS_GOLPE 300 + OUROS_SLOWMO 420 + OUROS_QUEDA 190
    // + OUROS_ASSENTAR 220 + OUROS_QUIQUE 460
    Ouros: 4_030,
    // SIM_VOO 620 + SIM_CRESCIDA 550 + ZAP_SEGURAR 200 + ZAP_QUEDA 560 + ZAP_DISSIPAR 1100
    Paus: 3_030,
};

// Revelação da vaza com vencedora: VAZA_SEGURAR_ULTIMA_CARTA 1500 +
// VAZA_REVELACAO_TRANSICAO 550 + VAZA_REVELACAO_PAUSA 1100 +
// VAZA_IMPACTO_DURACAO 220 + VAZA_IMPACTO_PAUSA 680 + VAZA_VIAGEM_DURACAO 600.
const VAZA_COM_VENCEDORA_MS = 4_650;
// Melada: choque das meladas (MELADA_SUBIR 550 + SEGURAR 350 + RECUAR 180
// + INVESTIR 170 + QUICAR 260 + PARADA 900 = 2410) + VAZA_EXPLOSAO_DURACAO
// 900.
const VAZA_MELADA_MS = 3_310;

// Fim de rodada: corações revelados por RODADA_FIM_REVELACAO_MS, ou mais se
// alguém leva cartas de dano (diferença × DANO_CARTA_ATRASO_ENTRE 260 +
// DANO_CARTA_VOO 640 + CORACAO_IMPACTO 380 + 400 de respiro).
const RODADA_FIM_REVELACAO_MS = 2_800;
const DANO_POR_CARTA_MS = 260;
const DANO_FIXO_MS = 640 + 380 + 400;

// Eliminação: PAUSA_MORTE_APOS_DANO 1000 + MORTE_IMPACTO 1500 +
// MORTE_DESINTEGRAR 900 (todas as mortes da rodada tocam juntas).
const ELIMINACAO_MS = 3_400;

// Fichas da aposta: a última sai (valor-1) × FICHA_ATRASO_ENTRE 90 depois da
// primeira, voa até FICHA_DURACAO_MAX 1150 e assenta FICHA_ASSENTAMENTO 320.
const FICHA_ATRASO_ENTRE_MS = 90;
const FICHA_VOO_MAX_MS = 1_150;
const FICHA_ASSENTAR_MS = 320;

// Distribuição, por assento vivo: DURACAO_DECK 200 + FOLGA_APOS_BARALHO 120
// + DURACAO_CARTA 380 + PAUSA_POS_ENTREGA 125, mais ATRASO_ENTRE_CARTAS 70
// por carta; e DURACAO_DECK 200 no fim.
const DISTRIBUICAO_POR_ASSENTO_MS = 825;
const DISTRIBUICAO_POR_CARTA_MS = 70;
const DISTRIBUICAO_FIM_MS = 200;
// Vira: DURACAO_DECK 200 + FOLGA_APOS_BARALHO 120 + DURACAO_VIRA_IDA 280 +
// DURACAO_VIRA_VOLTA 300 + DURACAO_DECK 200.
const VIRA_MS = 1_100;

export function duracaoApostaFeita(valor) {
    if (!(valor > 0)) return 0;
    return (valor - 1) * FICHA_ATRASO_ENTRE_MS + FICHA_VOO_MAX_MS + FICHA_ASSENTAR_MS;
}

// `naipeManilha`: nome do naipe se a carta é manilha, null se não.
export function duracaoCartaJogada(naipeManilha) {
    return SAIDA_DA_MAO_MS + (naipeManilha ? MANILHA_MS[naipeManilha] ?? MANILHA_MS.Copas : JOGADA_MS);
}

export function duracaoVazaFinalizada(temVencedor) {
    return temVencedor ? VAZA_COM_VENCEDORA_MS : VAZA_MELADA_MS;
}

// `placar`: o resultado de rodadaFinalizada ([{ diferenca, ... }]).
export function duracaoRodadaFinalizada(placar) {
    const maiorDiferenca = Math.max(0, ...placar.map((linha) => linha.diferenca ?? 0));
    if (maiorDiferenca === 0) return RODADA_FIM_REVELACAO_MS;
    return Math.max(RODADA_FIM_REVELACAO_MS, maiorDiferenca * DANO_POR_CARTA_MS + DANO_FIXO_MS);
}

export function duracaoEliminacao() {
    return ELIMINACAO_MS;
}

export function duracaoDistribuicaoEVira(assentosVivos, cartas) {
    return assentosVivos * (DISTRIBUICAO_POR_ASSENTO_MS + cartas * DISTRIBUICAO_POR_CARTA_MS)
        + DISTRIBUICAO_FIM_MS
        + VIRA_MS;
}
