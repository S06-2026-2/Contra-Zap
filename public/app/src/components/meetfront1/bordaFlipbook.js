// Flipbook da borda elétrica do Zap (borda: 'flipbook' em ajustesZap.js):
// o mesmo filtro da borda viva (BordaEletrica em Carta.jsx), com qualidade
// cheia, desenhado UMA vez em quadros num sprite; a carta só troca de quadro
// por transform (ver .mf1-borda-flip no CSS). O custo do filtro fica todo
// na geração, que roda em segundo plano, um quadro por vez, pra não travar
// a tela — até ficar pronto a carta mostra a borda leve.
//
// O laço tem FLIP_QUADROS quadros a FLIP_FPS. O ruído desliza no mesmo ritmo
// da viva, e os últimos FLIP_EMENDA quadros vão se misturando com os que
// viriam antes do primeiro, então a volta pro começo não dá salto.

export const BORDA_CICLO_MS = 5000;
export const BORDA_DESLIZE_Y = 220;
export const BORDA_DESLIZE_X = 160;
export const BORDA_LARGURA = 114;
export const BORDA_ALTURA = 158;

export const FLIP_QUADROS = 40;
export const FLIP_FPS = 20;
export const FLIP_COLUNAS = 8;
export const FLIP_LINHAS = FLIP_QUADROS / FLIP_COLUNAS;
const FLIP_EMENDA = 10;
const FLIP_OITAVAS = 6;
const FLIP_ESCALA_MAX = 2;
// O deslocamento do filtro (scale 11) joga o traço até ~6px pra fora da
// caixa; a folga cobre isso.
export const FLIP_FOLGA = 8;
export const FLIP_QUADRO_L = BORDA_LARGURA + 2 * FLIP_FOLGA;
export const FLIP_QUADRO_A = BORDA_ALTURA + 2 * FLIP_FOLGA;

function deslocamentos(tempoMs) {
    const f = (((tempoMs % BORDA_CICLO_MS) + BORDA_CICLO_MS) % BORDA_CICLO_MS) / BORDA_CICLO_MS;
    return [BORDA_DESLIZE_Y * (1 - f), -BORDA_DESLIZE_Y * f, BORDA_DESLIZE_X * (1 - f), -BORDA_DESLIZE_X * f];
}

function svgDoQuadro(tempoMs, escala) {
    const [d1, d2, d3, d4] = deslocamentos(tempoMs);
    const ruido = (seed, nome) => `<feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="${FLIP_OITAVAS}" seed="${seed}" result="${nome}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${FLIP_QUADRO_L * escala}" height="${FLIP_QUADRO_A * escala}" viewBox="${-FLIP_FOLGA} ${-FLIP_FOLGA} ${FLIP_QUADRO_L} ${FLIP_QUADRO_A}">
<filter id="f" color-interpolation-filters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
${ruido(1, 'r1')}
<feOffset in="r1" dx="0" dy="${d1.toFixed(2)}" result="o1"/>
<feOffset in="r1" dx="0" dy="${d2.toFixed(2)}" result="o2"/>
${ruido(2, 'r2')}
<feOffset in="r2" dx="${d3.toFixed(2)}" dy="0" result="o3"/>
<feOffset in="r2" dx="${d4.toFixed(2)}" dy="0" result="o4"/>
<feComposite in="o1" in2="o2" result="p1"/>
<feComposite in="o3" in2="o4" result="p2"/>
<feBlend in="p1" in2="p2" mode="color-dodge" result="rf"/>
<feDisplacementMap in="SourceGraphic" in2="rf" scale="11" xChannelSelector="R" yChannelSelector="B"/>
</filter>
<rect x="1" y="1" width="112" height="156" rx="9" fill="none" stroke="#8fdfff" stroke-width="2" filter="url(#f)"/>
</svg>`;
}

function carregarImagem(svg) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}

const proximoQuadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function gerar() {
    const escala = Math.min(window.devicePixelRatio || 1, FLIP_ESCALA_MAX);
    const ql = Math.round(FLIP_QUADRO_L * escala);
    const qa = Math.round(FLIP_QUADRO_A * escala);
    const canvas = document.createElement('canvas');
    canvas.width = ql * FLIP_COLUNAS;
    canvas.height = qa * FLIP_LINHAS;
    const ctx = canvas.getContext('2d');
    const passoMs = 1000 / FLIP_FPS;
    const duracaoMs = FLIP_QUADROS * passoMs;

    for (let i = 0; i < FLIP_QUADROS; i++) {
        const x = (i % FLIP_COLUNAS) * ql;
        const y = Math.floor(i / FLIP_COLUNAS) * qa;
        const k = i - (FLIP_QUADROS - FLIP_EMENDA);
        const img = await carregarImagem(svgDoQuadro(i * passoMs, escala));
        if (k < 0) {
            ctx.drawImage(img, x, y, ql, qa);
        } else {
            // Emenda: perto do fim, vai trocando pelo quadro que vem "antes"
            // do primeiro (mesmo ponto do laço, uma volta atrás).
            const t = (k + 1) / (FLIP_EMENDA + 1);
            const antes = await carregarImagem(svgDoQuadro(i * passoMs - duracaoMs, escala));
            ctx.globalAlpha = 1 - t;
            ctx.drawImage(img, x, y, ql, qa);
            ctx.globalAlpha = t;
            ctx.drawImage(antes, x, y, ql, qa);
            ctx.globalAlpha = 1;
        }
        await proximoQuadro();
    }

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob vazio'))), 'image/png');
    });
    return URL.createObjectURL(blob);
}

let promessa = null;
let urlPronta = null;

// Começa a gerar (uma vez só por página) e devolve a promessa da URL do
// sprite; null se o navegador não deixar gerar.
export function prepararFlipbookBorda() {
    if (!promessa) {
        promessa = gerar()
            .then((url) => { urlPronta = url; return url; })
            .catch((erro) => { console.warn('[flipbook borda]', erro); return null; });
    }
    return promessa;
}

export function urlFlipbookBorda() {
    return urlPronta;
}
