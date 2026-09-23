// Estado e montagem do "FILTRO DE TELA" da frente arcade — mesma lógica do
// painel de components/novo/Partida.jsx (mesmas chaves de FILTROS, mesmo
// grão via feTurbulence e mesma CRT via feDisplacementMap/feOffset), só que
// aplicada na casca arcade (ver Casca.jsx) em vez do #root, e lembrada no
// localStorage pra sobreviver à troca Lobby -> Partida (cada tela monta a
// própria casca). 100% local: não toca no servidor nem no protocolo.
import { useEffect, useState } from 'react';

// Mesmas chaves de FILTROS em components/novo/Partida.jsx.
export const FILTROS = {
    nenhum:    '',
    pixelado:  'url(#cz-pixelar)',
    gameboy:   'url(#cz-pixelar) grayscale(1) sepia(1) saturate(2.6) hue-rotate(55deg) contrast(1.4) brightness(0.95)',
    crt:       'saturate(1.6) contrast(1.35) brightness(1.12) drop-shadow(0 0 1px rgba(255,255,255,0.35))',
    sepia:     'sepia(0.85) contrast(1.1)',
    negativo:  'invert(1) hue-rotate(180deg)',
    cinza:     'grayscale(1) contrast(1.15)',
    desfoque:  'blur(2px)',
};
export const USA_PIXEL = new Set(['pixelado', 'gameboy']);

export const FILTRO_PADRAO = {
    efeito: 'nenhum',
    pixel: 3,
    grao: 0,
    graoColorido: false,
    graoAnimado: false,
    curvatura: 0,
    scanlines: 0,
    scanlinePasso: 3,
    aberracao: 0,
};

const CHAVE_FILTRO = 'contrazap-arcade-filtro';

function lerFiltroSalvo() {
    try {
        const bruto = JSON.parse(localStorage.getItem(CHAVE_FILTRO) ?? 'null');
        if (!bruto || typeof bruto !== 'object') return FILTRO_PADRAO;
        const junto = { ...FILTRO_PADRAO, ...bruto };
        return FILTROS[junto.efeito] === undefined ? { ...junto, efeito: 'nenhum' } : junto;
    } catch {
        return FILTRO_PADRAO;
    }
}

// Mapa de deslocamento pra curvatura CRT — cópia de mapaCurvatura em
// components/novo/Partida.jsx (gradiente em "S" num eixo só; 128 = parado).
function mapaCurvatura(eixo) {
    const stops = [[0, 0], [0.15, 30], [0.35, 85], [0.5, 128], [0.65, 171], [0.85, 225], [1, 255]];
    const paradas = stops
        .map(([o, v]) => `<stop offset='${o}' stop-color='${eixo === 'x' ? `rgb(${v},0,0)` : `rgb(0,${v},0)`}'/>`)
        .join('');
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>` +
        `<defs><linearGradient id='m' x1='0' y1='0' x2='${eixo === 'x' ? 1 : 0}' y2='${eixo === 'x' ? 0 : 1}'>` +
        `${paradas}</linearGradient></defs><rect width='64' height='64' fill='url(#m)'/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export const MAPA_CURV_X = mapaCurvatura('x');
export const MAPA_CURV_Y = mapaCurvatura('y');

export function useFiltros() {
    const [estado, setEstado] = useState(lerFiltroSalvo);
    const [graoSeed, setGraoSeed] = useState(1);

    useEffect(() => {
        try {
            localStorage.setItem(CHAVE_FILTRO, JSON.stringify(estado));
        } catch {
            // sem localStorage: o filtro só não sobrevive à troca de tela
        }
    }, [estado]);

    const { efeito, pixel, grao, graoColorido, graoAnimado, curvatura, scanlines, scanlinePasso, aberracao } = estado;

    // "Ferve" o grão re-semeando o feTurbulence a ~15fps (mesmo capado baixo
    // de propósito do novo/Partida.jsx — feTurbulence é caro).
    useEffect(() => {
        if (grao <= 0 || !graoAnimado) return;
        let raf;
        let ultimo = 0;
        const passo = (t) => {
            raf = requestAnimationFrame(passo);
            if (t - ultimo < 66) return;
            ultimo = t;
            setGraoSeed((s) => (s % 97) + 1);
        };
        raf = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(raf);
    }, [grao, graoAnimado]);

    // Um <filter> por tamanho de pixel (id carrega o tamanho): a Chrome não
    // reavalia feTile/feFlood quando só o atributo muda. Grão e CRT usam id
    // fixo, exceto o grão animado, que precisa do seed no id pra "ferver".
    const grId = grao > 0 && graoAnimado ? `cz-grao-${graoSeed}` : 'cz-grao';
    const crtAtivo = curvatura > 0 || aberracao > 0;
    const filtroCss = [
        (FILTROS[efeito] ?? '').replaceAll('#cz-pixelar', `#cz-pixelar-${pixel}`),
        grao > 0 ? `url(#${grId})` : '',
        crtAtivo ? 'url(#cz-crt)' : '',
    ].filter(Boolean).join(' ');

    const ativos = [
        efeito !== 'nenhum' ? efeito : null,
        grao > 0 ? 'grão' : null,
        curvatura > 0 || scanlines > 0 || aberracao > 0 ? 'crt' : null,
    ].filter(Boolean);

    return {
        ...estado,
        graoSeed,
        grId,
        filtroCss,
        usaPixel: USA_PIXEL.has(efeito),
        resumo: ativos.length ? ativos.join(' + ') : 'off',
        // feComponentTransfer linear em torno de 0.5 (ver novo/Partida.jsx).
        grK: (grao / 100) * 2,
        grC: 0.5 - grao / 100,
        abInt: aberracao > 0 ? Math.max(1, Math.round((aberracao / 100) * 8)) : 0,
        curvPx: -(curvatura / 100) * 28,
        overscan: curvatura > 0 ? 1 + (curvatura / 100) * 0.06 : 1,
        scanlineOp: (scanlines / 100) * 0.75,
        scanlineBg: `repeating-linear-gradient(180deg,rgba(0,0,0,.85) 0px,rgba(0,0,0,.85) 1px,transparent 1px,transparent ${scanlinePasso}px)`,
        graoColorido,
        definir: (chave, valor) => setEstado((atual) => ({ ...atual, [chave]: valor })),
        resetar: () => setEstado(FILTRO_PADRAO),
    };
}
