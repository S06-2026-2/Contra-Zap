import { useSyncExternalStore } from 'react';

// Switch do modo mobile do meetfront1: com a janela estreita a ponto de ser
// claramente um celular em pé, a mesa renderiza outras coisas (layout
// vertical). Fonte única — todo lugar que muda no mobile pergunta pra
// useModoMobile(). Mesmo corte do celular no front arcade (639px, ver
// @media em arcade/arcade.css): celular em pé sempre entra; tablet e
// celular deitado ficam no layout de sempre. Reage na hora a girar a tela
// ou redimensionar a janela.
const CONSULTA_MOBILE = '(max-width: 639px)';

function consulta() {
    return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CONSULTA_MOBILE) : null;
}

function assinar(avisar) {
    const lista = consulta();
    if (!lista) return () => {};
    lista.addEventListener('change', avisar);
    return () => lista.removeEventListener('change', avisar);
}

function estaNoMobile() {
    return consulta()?.matches ?? false;
}

export function useModoMobile() {
    return useSyncExternalStore(assinar, estaNoMobile, () => false);
}
