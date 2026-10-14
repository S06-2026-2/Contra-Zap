import { createContext, useContext } from 'react';

// Como a manilha de Paus (zap) é desenhada — vale pra toda carta de Paus que
// é manilha (mão, mesa, voando) e pra coreografia da jogada dela
// (CartaPausSimulada em MesaDanificada.jsx). A demo de desempenho
// (DemoBeta.jsx) troca peça por peça pra medir; o jogo usa
// AJUSTES_ZAP_PADRAO.
//
// - borda: 'viva' = BordaEletrica original (4 feTurbulence de 6 oitavas,
//   deslizando a cada quadro); 'enxuta' = o mesmo desenho com 2 feTurbulence
//   de 3 oitavas; 'flipbook' = quadros da viva pré-desenhados num sprite
//   (bordaFlipbook.js); 'leve' = o filtro calculado uma vez só (menos
//   oitavas, sem mexer nos atributos) numa camada própria que só treme por
//   transform; 'off' = sem borda elétrica.
// - bordaPulo: na viva e na enxuta, o deslize é atualizado a cada tantos
//   quadros (1 = todo quadro).
// - brilhoFiltro: true = halos por `filter: drop-shadow` (no container da
//   carta, em cada raio, no raio do céu); false = os mesmos halos como traço
//   largo translúcido / box-shadow parado em camada própria, sem filtro.
// - raiosDentro / raiosFora / raioCeu: liga ou desliga cada fonte de raio
//   (RaiosNaCarta, RaiosZap, RaioDaQueda — o clarão da tela fica sempre).
//
// Ajustes da crescida (a carta subindo pro centro da tela na jogada,
// CartaPausSimulada em MesaDanificada.jsx), em teste:
// - escuroOpacidade: o fundo escurece por opacity (GPU) em vez de transição
//   de background (repinta a tela inteira a cada quadro).
// - raiosForaAntes: RaiosZap já fica montado (vazio) durante o voo, pra não
//   nascer junto com a crescida.
// - cartaGrande: a carta é desenhada no tamanho grande (zoom) e encolhida
//   por transform, com a camada congelada (will-change) — crescer não
//   obriga a redesenhar maior.
// - semRaiosNaSubida: não solta raio novo (dentro nem faísca de fora)
//   enquanto ela cresce.
// - raiosNoImpacto: false = não solta raio novo (dentro nem fora) na
//   dissipação, depois que ela bate na mesa.
//
// Zap em canvas (em teste, ver zapCanvas.js):
// - canvas: true = na jogada, os raios de dentro da carta, os de fora e o
//   raio do céu são desenhados num canvas só por cima da tela, em vez de
//   SVG (raiosDentro/raiosFora/raioCeu continuam ligando cada um).
// - canvasBrilho: com o canvas, o brilho borrado em volta dos raios (o
//   lugar dos drop-shadow) volta.
export const AJUSTES_ZAP_ORIGINAL = {
    borda: 'viva',
    bordaPulo: 1,
    brilhoFiltro: true,
    raiosDentro: true,
    raiosFora: true,
    raioCeu: true,
    escuroOpacidade: false,
    raiosForaAntes: false,
    cartaGrande: false,
    semRaiosNaSubida: false,
    raiosNoImpacto: true,
    canvas: false,
    canvasBrilho: true,
};
// Otimizado em SVG = o que a demo escolheu no S20 em 2026-10-11: borda em
// flipbook (custa o mesmo que sem borda) + brilho sem filtro. Os ajustes
// da crescida não deram ganho e ficam como no original. Era o padrão do
// jogo até o canvas; os lotes antigos da demo continuam usando ele.
export const AJUSTES_ZAP_SVG = {
    ...AJUSTES_ZAP_ORIGINAL,
    borda: 'flipbook',
    brilhoFiltro: false,
};
// Otimizado = lote ZAP CANVAS (S20, 2026-10-12): borda em flipbook e toda a
// eletricidade da jogada num canvas (travado 377 -> ~236 ms na rodada
// curta). Sem os raios SVG, os brilhos saem de graça e voltam: o borrado
// dos raios (canvasBrilho) e o drop-shadow/brightness da carta
// (brilhoFiltro, como no original).
export const AJUSTES_ZAP_OTIMIZADO = {
    ...AJUSTES_ZAP_ORIGINAL,
    borda: 'flipbook',
    canvas: true,
    canvasBrilho: true,
};

// false = o jogo usa o zap original; true = o otimizado.
export const ZAP_OTIMIZADO = true;
export const AJUSTES_ZAP_PADRAO = ZAP_OTIMIZADO ? AJUSTES_ZAP_OTIMIZADO : AJUSTES_ZAP_ORIGINAL;

export const AjustesZapContext = createContext(AJUSTES_ZAP_PADRAO);

export function useAjustesZap() {
    return useContext(AjustesZapContext);
}
