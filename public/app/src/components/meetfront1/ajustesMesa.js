import { createContext, useContext } from 'react';
import { useModoMobile } from './modoMobile.js';

// Ajustes de desempenho do resto da mesa (fora das manilhas), do pente fino
// de 2026-10-12. Mesmo esquema de ajustesZap.js/ajustesCopas.js: a demo de
// desempenho (DemoBeta.jsx) troca peça por peça pra medir; o jogo usa
// ajustesMesaDoJogo (ver MESA_OTIMIZADA).
//
// - timerLeve: o pavio do seu timer (PavioReto) e o disco dos outros
//   (TimerNome) sem filtro no que muda a cada quadro. No pavio, as partes
//   paradas (borda, trilha, marcas, ficha) ficam num SVG próprio com as
//   sombras de sempre, desenhado uma vez; o traço que encolhe brilha por um
//   halo largo translúcido em vez de drop-shadow; e a brasa da ponta anda
//   numa camada própria por transform (antes: atributo transform no SVG,
//   que repintava o pavio inteiro com os filtros a cada quadro). O pulsar
//   dos últimos segundos vira opacidade. No disco, a sombra vira um círculo
//   escuro parado em vez do drop-shadow no SVG inteiro.
// - voosTransform: fichas voando (apostas) e cartas de dano (fim de rodada)
//   andam só por transform, escrito direto no elemento a cada quadro — sem
//   setState (re-render do React) nem left/top (layout) por quadro, e numa
//   camada própria (a sombra da ficha é desenhada uma vez só).
// - cartasTransform: as cartas voando (distribuição e jogadas indo pra
//   mesa) deslizam por transform num "trilho" do tamanho da mesa, em vez
//   de transição de left/top (layout a cada quadro).
export const AJUSTES_MESA_ORIGINAL = {
    timerLeve: false,
    voosTransform: false,
    cartasTransform: false,
};
export const AJUSTES_MESA_OTIMIZADO = {
    timerLeve: true,
    voosTransform: true,
    cartasTransform: true,
};

// Qual mesa o jogo usa. 'mobile' (padrão, aprovado em 2026-10-13 no lote
// JOGO × TODAS) = a otimizada só com o switch mobile ligado (tela pequena,
// ver modoMobile.js), a original no resto; true = a otimizada sempre;
// false = a original sempre.
export const MESA_OTIMIZADA = 'mobile';

export function ajustesMesaDoJogo(mobile) {
    const otimizada = MESA_OTIMIZADA === 'mobile' ? mobile : MESA_OTIMIZADA;
    return otimizada ? AJUSTES_MESA_OTIMIZADO : AJUSTES_MESA_ORIGINAL;
}

// Sem provider (ou com valor null) = a mesa do jogo, que acompanha o
// switch mobile na hora; a demo passa um ajuste fixo pra medir.
export const AjustesMesaContext = createContext(null);

export function useAjustesMesa() {
    const fixo = useContext(AjustesMesaContext);
    const mobile = useModoMobile();
    return fixo ?? ajustesMesaDoJogo(mobile);
}
