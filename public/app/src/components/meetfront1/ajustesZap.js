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
};
// Otimizado = o que a demo de desempenho escolheu no S20: borda em
// flipbook (custa o mesmo que sem borda) + brilho sem filtro. Os ajustes
// da crescida não deram ganho e ficam como no original.
export const AJUSTES_ZAP_OTIMIZADO = {
    ...AJUSTES_ZAP_ORIGINAL,
    borda: 'flipbook',
    brilhoFiltro: false,
};

// false = o jogo usa o zap original; true = o otimizado.
export const ZAP_OTIMIZADO = true;
export const AJUSTES_ZAP_PADRAO = ZAP_OTIMIZADO ? AJUSTES_ZAP_OTIMIZADO : AJUSTES_ZAP_ORIGINAL;

export const AjustesZapContext = createContext(AJUSTES_ZAP_PADRAO);

export function useAjustesZap() {
    return useContext(AjustesZapContext);
}
