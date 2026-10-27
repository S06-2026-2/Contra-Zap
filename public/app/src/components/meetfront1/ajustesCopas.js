import { createContext, useContext } from 'react';

// Como a jogada da manilha de Copas é desenhada (CartaCopasSimulada e
// MarcaCarbonizada em MesaDanificada.jsx). Mesmo esquema de ajustesZap.js:
// a demo de desempenho (DemoBeta.jsx, na branch StashedFronts) troca peça por peça pra medir; o jogo
// usa AJUSTES_COPAS_PADRAO.
//
// - fogo: 'original' = FogueiraCodepen com as bolinhas animadas em blend
//   mode `screen` e blur em cada fogueira (18 fogueiras x 16 bolinhas atrás
//   da carta crescida, 50 bolinhas em cima dela na mesa); 'flipbook' = o
//   mesmo ciclo pré-desenhado num sprite (fogoFlipbook.js), cada fogueira
//   vira uma imagem trocando de quadro; 'flipbook-unico' = o fogo de trás
//   inteiro (as 18 fogueiras sendo lançadas) num sprite só, tocado uma
//   vez; 'canvas' = o fogo de trás inteiro num <canvas> redesenhado a cada
//   quadro (os dois em fogoInteiro.js; o fogo de cima na mesa fica como no
//   'flipbook'); 'off' = sem fogo (só pra medir).
// - marca: 'original' = a marca carbonizada como SVG com blur, crescendo
//   por animação; 'imagem' = o mesmo SVG como <img> (o navegador desenha o
//   blur uma vez e a animação só mexe na imagem pronta); 'off' = sem marca
//   (só pra medir).
// - brasaFiltro: true = o contorno do coração brilha por `drop-shadow` e
//   esfria trocando a cor do traço; false = o brilho é um traço largo
//   translúcido, e o esfriar é a camada quente sumindo por opacidade em
//   cima da fria.
// - fogoDecodificar (só com fogo 'flipbook'): os sprites já decodificados
//   logo depois de gerar, em vez de na primeira vez que aparecem.
// - fogoMontarAntes (idem): as fogueiras da pulsada são montadas já na
//   subida da carta, invisíveis e com a animação parada no começo; na
//   pulsada só soltam a animação.
export const AJUSTES_COPAS_ORIGINAL = {
    fogo: 'original',
    marca: 'original',
    brasaFiltro: true,
    fogoDecodificar: false,
    fogoMontarAntes: false,
};
// Otimizado = o que a demo escolheu no S20 (2026-10-12): só o fogo, em
// canvas (lote FOGO INTEIRO: travado igual a sem fogo, ~29 ms; o flipbook
// por fogueira deixava um quadro de ~90 ms quando o fogo acendia; o
// original, ~520 ms no total). Marca em imagem e brasa sem filtro não
// mostraram ganho e ficam como no original; as duas juntas com o flipbook
// formam a "completa", guardada pra comparar.
export const AJUSTES_COPAS_OTIMIZADO = {
    ...AJUSTES_COPAS_ORIGINAL,
    fogo: 'canvas',
};
export const AJUSTES_COPAS_COMPLETA = {
    ...AJUSTES_COPAS_ORIGINAL,
    fogo: 'flipbook',
    marca: 'imagem',
    brasaFiltro: false,
};
export const COPAS_PELADA = {
    ...AJUSTES_COPAS_ORIGINAL,
    fogo: 'off',
    marca: 'off',
    brasaFiltro: false,
};

// false = o jogo usa a jogada de Copas original; true = a otimizada.
export const COPAS_OTIMIZADO = true;
export const AJUSTES_COPAS_PADRAO = COPAS_OTIMIZADO ? AJUSTES_COPAS_OTIMIZADO : AJUSTES_COPAS_ORIGINAL;

export const AjustesCopasContext = createContext(AJUSTES_COPAS_PADRAO);

export function useAjustesCopas() {
    return useContext(AjustesCopasContext);
}
