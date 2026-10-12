import { FOGO_COLUNAS, FOGO_LINHAS, FOGO_QUADROS, FOGO_CICLO_MS, FOGO_LARGURA_EM, FOGO_QUADRO_ALTURA_EM, cubicBezier, prepararBlobs } from './fogoFlipbook.js';

// O fogo de trás da carta de Copas (as fogueirinhas da pulsada, ver
// sortearFogueiras 'borda' em MesaDanificada.jsx) desenhado de uma vez, como
// UM elemento só na tela, em vez de 18 fogueiras animadas cada uma:
//
// - fogo 'flipbook-unico': a sequência inteira (do acender até apagar)
//   pré-desenhada num sprite grande, tocado uma vez.
// - fogo 'canvas': um <canvas> redesenhado a cada quadro, por JS.
//
// Os dois usam a mesma conta (desenharFogueiras): o "lançar pra fora" de
// cada fogueira refeito como no @keyframes mesa-exp-fogo-espalhar do
// index.css, e o quadro certo do sprite dela (fogoFlipbook.js) desenhado
// na posição, tamanho e opacidade daquele instante. Tudo em unidades da
// caixa da carta (110x154), que é o container das chamas.

const CARTA_L = 110;
const CARTA_A = 154;
const easeOut = cubicBezier(0, 0, 0.58, 1);

// Imagens dos sprites das fogueiras, prontas pra desenhar no canvas.
let promessaBitmaps = null;
let bitmapsProntos = null;

export function prepararBitmapsFogo() {
    if (!promessaBitmaps) {
        promessaBitmaps = prepararBlobs()
            .then(async (blobs) => {
                bitmapsProntos = { borda: await Promise.all(blobs.borda.map((b) => createImageBitmap(b))) };
                return bitmapsProntos;
            })
            .catch((erro) => { console.warn('[fogo inteiro: bitmaps]', erro); return null; });
    }
    return promessaBitmaps;
}

export function bitmapsFogoProntos() {
    return bitmapsProntos;
}

// Posição e tamanho de uma fogueira no avanço `e` (0..1, já com o easing)
// do lançamento: base em (bx, by), `em` em unidades da carta.
function caixaFogueira(f, e) {
    const escala = f.escalaInicial + (f.escalaFinal - f.escalaInicial) * e;
    return {
        bx: (f.x / 100) * CARTA_L + f.foraX * e,
        by: (f.y / 100) * CARTA_A + f.foraY * e,
        em: f.fonte * escala,
    };
}

// Retângulo (unidades da carta) que cobre todas as fogueiras o tempo todo.
// Posição e escala andam juntas com o mesmo `e`, então basta o começo e o
// fim do lançamento.
export function caixaDoFogo(fogueiras) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const f of fogueiras) {
        for (const e of [0, 1]) {
            const { bx, by, em } = caixaFogueira(f, e);
            x0 = Math.min(x0, bx - (FOGO_LARGURA_EM / 2) * em);
            x1 = Math.max(x1, bx + (FOGO_LARGURA_EM / 2) * em);
            y0 = Math.min(y0, by - FOGO_QUADRO_ALTURA_EM * em);
            y1 = Math.max(y1, by);
        }
    }
    return { x: Math.floor(x0), y: Math.floor(y0), l: Math.ceil(x1 - x0) + 1, a: Math.ceil(y1 - y0) + 1 };
}

// Desenha as fogueiras como estão `t` ms depois de acender, numa escala de
// `k` px por unidade da carta, com a `caixa` em (0,0). Cada fogueira: o
// laço do lançamento (atraso, duração, ease-out) e a opacidade dele (sobe
// até 15%, fica, apaga de 70% ao fim, cada trecho em ease-out), e o quadro
// do sprite na fase dela.
export function desenharFogueiras(ctx, fogueiras, bitmaps, t, k, caixa) {
    for (let i = 0; i < fogueiras.length; i++) {
        const f = fogueiras[i];
        const tl = t - f.atrasoMs;
        if (tl < 0) continue;
        const p = (tl % f.duracaoMs) / f.duracaoMs;
        const opacidade = p < 0.15 ? easeOut(p / 0.15) : p < 0.7 ? 1 : 1 - easeOut((p - 0.7) / 0.3);
        if (opacidade <= 0) continue;
        const { bx, by, em } = caixaFogueira(f, easeOut(p));
        const bmp = bitmaps[i % bitmaps.length];
        const ql = bmp.width / FOGO_COLUNAS;
        const qa = bmp.height / FOGO_LINHAS;
        const fase = (((t + (f.faseMs ?? 0)) % FOGO_CICLO_MS) + FOGO_CICLO_MS) % FOGO_CICLO_MS;
        const q = Math.min(FOGO_QUADROS - 1, Math.floor((fase / FOGO_CICLO_MS) * FOGO_QUADROS));
        ctx.globalAlpha = opacidade;
        ctx.drawImage(
            bmp,
            (q % FOGO_COLUNAS) * ql, Math.floor(q / FOGO_COLUNAS) * qa, ql, qa,
            (bx - (FOGO_LARGURA_EM / 2) * em - caixa.x) * k,
            (by - FOGO_QUADRO_ALTURA_EM * em - caixa.y) * k,
            FOGO_LARGURA_EM * em * k,
            FOGO_QUADRO_ALTURA_EM * em * k,
        );
    }
    ctx.globalAlpha = 1;
}

// --- fogo 'flipbook-unico' ---
//
// INTEIRO_QUADROS a INTEIRO_FPS cobrem o tempo que o fogo de trás fica
// montado (as chamas altas + a descida apagando, ~1.3s). Resolução baixa de
// propósito: o fogo é todo degradê, e o sprite inteiro já fica com uns
// 2300x2400 px. INTEIRO_VARIANTES sorteios diferentes, pra não ser sempre
// o mesmo fogo.
export const INTEIRO_FPS = 20;
export const INTEIRO_COLUNAS = 6;
export const INTEIRO_LINHAS = 5;
export const INTEIRO_QUADROS = INTEIRO_COLUNAS * INTEIRO_LINHAS;
const INTEIRO_PX_POR_UNIDADE = 1.2;
const INTEIRO_VARIANTES = 2;

const proximoQuadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function gerarInteiro(fogueiras, bitmaps) {
    const caixa = caixaDoFogo(fogueiras);
    const k = INTEIRO_PX_POR_UNIDADE;
    const ql = Math.ceil(caixa.l * k);
    const qa = Math.ceil(caixa.a * k);
    const canvas = document.createElement('canvas');
    canvas.width = ql * INTEIRO_COLUNAS;
    canvas.height = qa * INTEIRO_LINHAS;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < INTEIRO_QUADROS; i++) {
        ctx.save();
        ctx.translate((i % INTEIRO_COLUNAS) * ql, Math.floor(i / INTEIRO_COLUNAS) * qa);
        ctx.beginPath();
        ctx.rect(0, 0, ql, qa);
        ctx.clip();
        desenharFogueiras(ctx, fogueiras, bitmaps, (i * 1000) / INTEIRO_FPS, k, caixa);
        ctx.restore();
        if (i % 6 === 5) await proximoQuadro();
    }
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob vazio'))), 'image/png');
    });
    return { url: URL.createObjectURL(blob), caixa };
}

let promessaInteiro = null;
let inteirosProntos = null;

// `sortear` devolve um sorteio novo de fogueiras da pulsada (quem chama é
// MesaDanificada, que é quem sabe sortear). Gera uma vez só por página e
// devolve a promessa de [{ url, caixa }, ...]; null se não der.
export function prepararFogoInteiro(sortear) {
    if (!promessaInteiro) {
        promessaInteiro = prepararBitmapsFogo()
            .then(async (bitmaps) => {
                if (!bitmaps) return null;
                const lista = [];
                for (let i = 0; i < INTEIRO_VARIANTES; i++) {
                    lista.push(await gerarInteiro(sortear(), bitmaps.borda));
                }
                inteirosProntos = lista;
                return lista;
            })
            .catch((erro) => { console.warn('[fogo inteiro]', erro); return null; });
    }
    return promessaInteiro;
}

export function fogosInteirosProntos() {
    return inteirosProntos;
}
