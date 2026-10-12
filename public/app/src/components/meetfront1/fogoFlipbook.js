// Flipbook do fogo de Copas (fogo: 'flipbook' em ajustesCopas.js): o ciclo
// de 1s de uma FogueiraCodepen (MesaDanificada.jsx) — as bolinhas laranja
// subindo e encolhendo, misturadas por `screen` — desenhado UMA vez num
// canvas, quadro a quadro, com a mesma conta do CSS (.mesa-exp-fogo-particula
// e @keyframes mesa-exp-fogo-subir no index.css). A fogueira na tela vira um
// sprite só trocando de quadro por transform, no lugar das 16 (ou 50)
// bolinhas animadas com blend mode e do blur em cada fogueira.
//
// Como no CSS, todas as bolinhas têm o mesmo ciclo de 1s, então o laço do
// sprite fecha sem emenda. Cada variante sorteia os atrasos das bolinhas de
// novo, pras fogueiras da borda não saírem todas iguais.
//
// Medidas em `em`, iguais às do CSS: fogueira de 10em x 12em, bolinha de 5em
// subindo 10em. O quadro tem FOGO_FOLGA_TOPO_EM a mais em cima, porque a
// bolinha passa um pouco do topo da fogueira antes de sumir.

export const FOGO_QUADROS = 24;
export const FOGO_CICLO_MS = 1000;
export const FOGO_COLUNAS = 6;
export const FOGO_LINHAS = FOGO_QUADROS / FOGO_COLUNAS;
export const FOGO_LARGURA_EM = 10;
export const FOGO_ALTURA_EM = 12;
export const FOGO_FOLGA_TOPO_EM = 1;
export const FOGO_QUADRO_ALTURA_EM = FOGO_ALTURA_EM + FOGO_FOLGA_TOPO_EM;
// Pixels de sprite por `em`. Na tela o `em` passa pouco disso (a maior
// fogueira da borda, já crescida, fica com ~30px por em), e o fogo é todo
// degradê, então esticar não aparece.
const FOGO_PX_POR_EM = 12;
const FOGO_ESCALA_MAX = 2;

const BOLINHA_EM = 5;
const SUBIDA_EM = 10;
const COR = '255, 80, 0';

// Variantes: 'borda' = as fogueirinhas da pulsada (16 bolinhas); 'cobrindo'
// = o fogão em cima da carta na mesa (50).
const VARIANTES = {
    borda: { particulas: 16, quantas: 3 },
    cobrindo: { particulas: 50, quantas: 1 },
};

// Mesma curva do cubic-bezier() do CSS: acha o t da curva em x por bisseção
// e devolve o y dele.
export function cubicBezier(x1, y1, x2, y2) {
    const coord = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    return (x) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 30; i++) {
            const meio = (lo + hi) / 2;
            if (coord(meio, x1, x2) < x) lo = meio;
            else hi = meio;
        }
        return coord((lo + hi) / 2, y1, y2);
    };
}

const easeIn = cubicBezier(0.42, 0, 1, 1);

// Mesmo @keyframes mesa-exp-fogo-subir: transform de 0 a 100% com ease-in;
// opacidade 0 -> 1 até 25% e 1 -> 0 até o fim, cada trecho com ease-in.
function estadoBolinha(p) {
    const e = easeIn(p);
    const opacidade = p < 0.25 ? easeIn(p / 0.25) : 1 - easeIn((p - 0.25) / 0.75);
    return { subida: SUBIDA_EM * e, escala: 1 - e, opacidade };
}

function desenharQuadro(ctx, x0, y0, pxEm, atrasos, tempo) {
    const n = atrasos.length;
    // radial-gradient sem tamanho num quadrado = elipse farthest-corner, raio
    // meia-largura * √2; paradas em 20% e 70% dele.
    const raioGrad = (BOLINHA_EM / 2) * Math.SQRT2;
    for (let i = 0; i < n; i++) {
        const p = (((tempo + atrasos[i]) % 1) + 1) % 1;
        const { subida, escala, opacidade } = estadoBolinha(p);
        if (escala <= 0 || opacidade <= 0) continue;
        const cx = x0 + ((FOGO_LARGURA_EM - BOLINHA_EM) * (i / n) + BOLINHA_EM / 2) * pxEm;
        const cy = y0 + (FOGO_FOLGA_TOPO_EM + FOGO_ALTURA_EM - BOLINHA_EM / 2 - subida) * pxEm;
        const r = raioGrad * escala * pxEm;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0.2, `rgba(${COR}, 1)`);
        grad.addColorStop(0.7, `rgba(${COR}, 0)`);
        ctx.globalAlpha = opacidade;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, (BOLINHA_EM / 2) * escala * pxEm, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

const proximoQuadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function gerarSprite(particulas) {
    const pxEm = FOGO_PX_POR_EM * Math.min(window.devicePixelRatio || 1, FOGO_ESCALA_MAX);
    const ql = Math.round(FOGO_LARGURA_EM * pxEm);
    const qa = Math.round(FOGO_QUADRO_ALTURA_EM * pxEm);
    const canvas = document.createElement('canvas');
    canvas.width = ql * FOGO_COLUNAS;
    canvas.height = qa * FOGO_LINHAS;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'screen';
    const atrasos = Array.from({ length: particulas }, () => Math.random());

    for (let i = 0; i < FOGO_QUADROS; i++) {
        const x0 = (i % FOGO_COLUNAS) * ql;
        const y0 = Math.floor(i / FOGO_COLUNAS) * qa;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, ql, qa);
        ctx.clip();
        desenharQuadro(ctx, x0, y0, pxEm, atrasos, i / FOGO_QUADROS);
        ctx.restore();
    }
    await proximoQuadro();

    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob vazio'))), 'image/png');
    });
}

async function gerar() {
    const blobs = {};
    for (const [modo, { particulas, quantas }] of Object.entries(VARIANTES)) {
        blobs[modo] = [];
        for (let i = 0; i < quantas; i++) {
            blobs[modo].push(await gerarSprite(particulas));
        }
    }
    return blobs;
}

const urlsDosBlobs = (blobs) => Object.fromEntries(
    Object.entries(blobs).map(([modo, lista]) => [modo, lista.map((b) => URL.createObjectURL(b))]),
);

let promessaBlobs = null;
let promessa = null;
let urlsProntas = null;

// Os PNGs dos sprites ({ borda: [blob, ...], cobrindo: [blob] }), gerados
// uma vez só por página — base dos conjuntos de URL daqui e do fogo inteiro
// (fogoInteiro.js).
export function prepararBlobs() {
    if (!promessaBlobs) promessaBlobs = gerar();
    return promessaBlobs;
}

// Começa a gerar (uma vez só por página) e devolve a promessa de
// { borda: [url, ...], cobrindo: [url] }; null se o navegador não deixar.
export function prepararFlipbookFogo() {
    if (!promessa) {
        promessa = prepararBlobs()
            .then((blobs) => { urlsProntas = urlsDosBlobs(blobs); return urlsProntas; })
            .catch((erro) => { console.warn('[flipbook fogo]', erro); return null; });
    }
    return promessa;
}

export function urlsFlipbookFogo() {
    return urlsProntas;
}

// fogoDecodificar (ajustesCopas.js): os mesmos sprites em URLs próprias,
// já decodificados (`img.decode()`) logo depois de gerar e guardados vivos
// aqui — a fogueira não precisa decodificar o PNG na primeira vez que
// aparece. URLs separadas das de cima pra decodificar um conjunto não
// adiantar o trabalho do outro (a demo compara os dois na mesma página).
let promessaDecodificada = null;
let urlsDecodificadas = null;
const imagensDecodificadas = [];

export function prepararFlipbookFogoDecodificado() {
    if (!promessaDecodificada) {
        promessaDecodificada = prepararBlobs()
            .then(async (blobs) => {
                const urls = urlsDosBlobs(blobs);
                for (const url of Object.values(urls).flat()) {
                    const img = new Image();
                    img.src = url;
                    await img.decode();
                    imagensDecodificadas.push(img);
                }
                urlsDecodificadas = urls;
                return urls;
            })
            .catch((erro) => { console.warn('[flipbook fogo decodificado]', erro); return null; });
    }
    return promessaDecodificada;
}

export function urlsFlipbookFogoDecodificado() {
    return urlsDecodificadas;
}
