import {
    sortearRaioDentro, RAIO_DENTRO_LARGURA, RAIO_DENTRO_ALTURA, INTERVALO_CALMO_MS, MAX_RAIOS_VIVOS, INICIO_SUMIR, LARGURA_CAMADA,
    taxaDaRampa, sortearEntre,
} from './RaiosNaCarta.jsx';
import { cubicBezier } from './fogoFlipbook.js';

// Zap em canvas (canvas: true em ajustesZap.js): toda a eletricidade da
// jogada do zap num <canvas> só, por cima da tela, redesenhado a cada
// quadro — no lugar de centenas de <path> SVG nascendo e morrendo por
// segundo (RaiosNaCarta dentro da carta, RaiosZap em volta, o raio do céu
// do RaioDaQueda). Mesma lição do fogo de Copas (fogoInteiro.js): um
// elemento só na tela.
//
// - Dentro: a mesma conta de RaiosNaCarta (calmos de vez em quando + a
//   tempestade da taxa em rampa), em unidades da carta — escalam com ela.
// - Fora: os raios curtos e as faíscas dos ZAP_PERFIS (quem sorteia é
//   MesaDanificada, ver `soltarFora`), com o piscar e o voo do CSS deles e a
//   espessura fixa na tela (como o non-scaling-stroke do SVG).
// - Céu: o raio grande do impacto, em px da tela, com o piscar dele.
// - Brilho (`brilho`): o lugar dos drop-shadow que o zap otimizado tirou.
//   Os traços vão também pra um canvas de 1/BRILHO_FRACAO da resolução,
//   que é borrado ali mesmo (barato, a área é pequena) e esticado por baixo
//   dos traços — o esticar ainda suaviza mais.
//
// A carta é lida a cada quadro (centro na tela + a parte 2D do transform do
// miolo: escala e giro), então os raios acompanham ela subindo, caindo e
// tremendo.

const DPR_MAX = 2;
const BRILHO_FRACAO = 4;
const BRILHO_BLUR_PX = 2;
const BRILHO_ALCANCE = 2.6;
const BRILHO_FORCA = 1.6;

const easeOut = cubicBezier(0, 0, 0.58, 1);

// Chaves [progresso, valor] com interpolação linear entre elas.
function porChaves(chaves, p) {
    if (p <= chaves[0][0]) return chaves[0][1];
    for (let i = 1; i < chaves.length; i++) {
        const [p1, v1] = chaves[i];
        if (p <= p1) {
            const [p0, v0] = chaves[i - 1];
            return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0 || 1);
        }
    }
    return chaves[chaves.length - 1][1];
}

// @keyframes mesa-exp-zap-piscar e mesa-exp-zap-queda-piscar (index.css).
const PISCAR = [[0, 1], [0.3, 0.3], [0.45, 1], [1, 0]];
const PISCAR_CEU = [[0, 1], [0.12, 1], [0.2, 0.2], [0.3, 1], [0.5, 0.7], [0.62, 0.15], [0.72, 0.8], [1, 0]];
const CEU_DURACAO_MS = 380;

// Cores e espessuras das classes do SVG original (index.css /
// meetfront1.css): `brilho` é a camada larga ciano, `nucleo` o fio branco,
// `halo` a cor do drop-shadow que vira o brilho borrado.
const ESTILO_DENTRO = { brilho: '#6fdcff', alfaBrilho: 0.7, nucleo: '#effeff', halo: '#2fb4ff' };
const ESTILO_FORA = { brilho: '#7fd8ff', alfaBrilho: 0.55, nucleo: '#f4fcff', halo: '#5fd0ff', larguraBrilho: 4, larguraNucleo: 1.5 };
const ESTILO_CEU = { brilho: '#7fd8ff', alfaBrilho: 0.55, nucleo: '#f4fcff', halo: '#2a8cff', larguraBrilho: 11, larguraNucleo: 3.5 };

// Trecho [a, b] (em comprimento) de uma polilinha — o tracejado que revela e
// apaga os raios de dentro.
function trecho(pts, a, b) {
    const saida = [];
    let andado = 0;
    for (let i = 1; i < pts.length; i += 1) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const seg = Math.hypot(x1 - x0, y1 - y0);
        const ini = andado;
        const fim = andado + seg;
        andado = fim;
        if (fim < a || ini > b || seg === 0) continue;
        const ta = Math.max(0, (a - ini) / seg);
        const tb = Math.min(1, (b - ini) / seg);
        if (!saida.length) saida.push([x0 + (x1 - x0) * ta, y0 + (y1 - y0) * ta]);
        saida.push([x0 + (x1 - x0) * tb, y0 + (y1 - y0) * tb]);
    }
    return saida;
}

export class MotorZapCanvas {
    // `soltarFora(perfil, t, agora)` devolve os raios de fora que nascem
    // agora: [{ tipo: 'raio'|'faisca', tracos, nasceu, dur, dx, dy }],
    // `tracos` em unidades da carta com o centro dela na origem.
    constructor(canvas, soltarFora) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.soltarFora = soltarFora;
        this.brilho = document.createElement('canvas');
        this.brilhoCtx = this.brilho.getContext('2d');
        this.borrado = document.createElement('canvas');
        this.borradoCtx = this.borrado.getContext('2d');
        this.dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
        this.largura = 0;
        this.altura = 0;
        this.dentro = [];
        this.fora = [];
        this.ceu = null;
        this.rampa = { de: 0, para: 0, inicio: 0, duracao: 0 };
        this.acumuladoDentro = 0;
        this.proximoCalmo = performance.now() + sortearEntre(300, INTERVALO_CALMO_MS[1]);
        this.perfil = null;
        this.faseInicio = 0;
        this.faseDuracao = 1;
        this.acumuladoFora = 0;
        this.anterior = performance.now();
        this.sujo = false;
    }

    definirTaxaDentro(taxa, transicaoMs, agora) {
        this.rampa = { de: taxaDaRampa(this.rampa, agora), para: taxa, inicio: agora, duracao: transicaoMs };
    }

    definirFase(perfil, duracaoMs, agora) {
        this.perfil = perfil ?? null;
        this.faseInicio = agora;
        this.faseDuracao = duracaoMs || 1;
        this.acumuladoFora = 0;
    }

    soltarCeu(tracos, agora) {
        this.ceu = { tracos, nasceu: agora };
    }

    redimensionar(l, a) {
        if (l === this.largura && a === this.altura) return;
        this.largura = l;
        this.altura = a;
        this.canvas.width = Math.round(l * this.dpr);
        this.canvas.height = Math.round(a * this.dpr);
        this.brilho.width = Math.max(1, Math.round((l * this.dpr) / BRILHO_FRACAO));
        this.brilho.height = Math.max(1, Math.round((a * this.dpr) / BRILHO_FRACAO));
        this.borrado.width = this.brilho.width;
        this.borrado.height = this.brilho.height;
    }

    nascer(agora, dt, op) {
        if (op.dentro) {
            if (op.pausado) {
                this.acumuladoDentro = 0;
                this.proximoCalmo = Math.max(this.proximoCalmo, agora);
            } else if (agora >= this.proximoCalmo) {
                this.dentro.push(sortearRaioDentro(agora, false));
                this.proximoCalmo = agora + sortearEntre(...INTERVALO_CALMO_MS);
            }
            if (!op.pausado) {
                this.acumuladoDentro += (taxaDaRampa(this.rampa, agora) * dt) / 1000;
                while (this.acumuladoDentro >= 1) {
                    this.acumuladoDentro -= 1;
                    if (this.dentro.length < MAX_RAIOS_VIVOS) this.dentro.push(sortearRaioDentro(agora, true));
                }
            }
        }
        if (op.fora && this.perfil && !op.pausado) {
            const t = Math.min(1, (agora - this.faseInicio) / this.faseDuracao);
            this.acumuladoFora += (this.perfil.taxa(t) * dt) / 1000;
            while (this.acumuladoFora >= 1) {
                this.acumuladoFora -= 1;
                this.fora.push(...this.soltarFora(this.perfil, t, agora));
            }
        }
    }

    // Monta a lista de traços do quadro, já em px da tela (do canvas).
    tracos(agora, mapa, escala) {
        const lista = [];
        for (let i = this.dentro.length - 1; i >= 0; i--) {
            const raio = this.dentro[i];
            const p = (agora - raio.nasceu) / raio.vida;
            if (p >= 1) {
                this.dentro.splice(i, 1);
                continue;
            }
            const sumico = Math.max(0, (p - INICIO_SUMIR) / (1 - INICIO_SUMIR));
            const alfa = 0.65 + Math.random() * 0.35;
            for (const ramo of raio.ramos) {
                const frente = Math.min(1, Math.max(0, (p - ramo.inicio) / ramo.duracao));
                if (frente <= 0) continue;
                let comprimento = 0;
                let anterior = null;
                const pts = ramo.pontos.map((pt) => {
                    const onda = Math.sin(agora * pt.freq + pt.fase);
                    const ponto = mapa(pt.x + pt.tx * onda - RAIO_DENTRO_LARGURA / 2, pt.y + pt.ty * onda - RAIO_DENTRO_ALTURA / 2);
                    if (anterior) comprimento += Math.hypot(ponto[0] - anterior[0], ponto[1] - anterior[1]);
                    anterior = ponto;
                    return ponto;
                });
                const visivel = trecho(pts, sumico * comprimento, frente * comprimento);
                if (visivel.length < 2) continue;
                const espessura = 0.62 ** ramo.profundidade;
                lista.push({
                    pts: visivel,
                    alfa,
                    estilo: ESTILO_DENTRO,
                    larguraBrilho: LARGURA_CAMADA['carta-exp-raio-brilho'] * espessura * escala,
                    larguraNucleo: LARGURA_CAMADA['carta-exp-raio-nucleo'] * espessura * escala,
                });
            }
        }
        for (let i = this.fora.length - 1; i >= 0; i--) {
            const raio = this.fora[i];
            const p = (agora - raio.nasceu) / raio.dur;
            if (p >= 1) {
                this.fora.splice(i, 1);
                continue;
            }
            let alfa;
            let ox = 0;
            let oy = 0;
            if (raio.tipo === 'faisca') {
                const e = easeOut(p);
                ox = raio.dx * e;
                oy = raio.dy * e;
                alfa = p < 0.6 ? 1 : 1 - easeOut((p - 0.6) / 0.4);
            } else {
                alfa = porChaves(PISCAR, p);
            }
            for (const pontos of raio.tracos) {
                lista.push({
                    pts: pontos.map(([x, y]) => mapa(x + ox, y + oy)),
                    alfa,
                    estilo: ESTILO_FORA,
                    larguraBrilho: ESTILO_FORA.larguraBrilho,
                    larguraNucleo: ESTILO_FORA.larguraNucleo,
                });
            }
        }
        if (this.ceu) {
            const p = (agora - this.ceu.nasceu) / CEU_DURACAO_MS;
            if (p >= 1) {
                this.ceu = null;
            } else {
                const alfa = porChaves(PISCAR_CEU, p);
                for (const pontos of this.ceu.tracos) {
                    lista.push({
                        pts: pontos.map(([x, y]) => [x - this.origemX, y - this.origemY]),
                        alfa,
                        estilo: ESTILO_CEU,
                        larguraBrilho: ESTILO_CEU.larguraBrilho,
                        larguraNucleo: ESTILO_CEU.larguraNucleo,
                    });
                }
            }
        }
        return lista;
    }

    // Um quadro: nasce o que tem que nascer, lê onde a carta está e desenha.
    quadro(agora, miolo, op) {
        const dt = agora - this.anterior;
        this.anterior = agora;
        this.nascer(agora, dt, op);

        const rc = this.canvas.getBoundingClientRect();
        this.redimensionar(rc.width, rc.height);
        this.origemX = rc.left;
        this.origemY = rc.top;
        const rm = miolo.getBoundingClientRect();
        const transform = getComputedStyle(miolo).transform;
        const m = transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix();
        const cx = rm.left + rm.width / 2 - rc.left;
        const cy = rm.top + rm.height / 2 - rc.top;
        const mapa = (u, v) => [cx + m.a * u + m.c * v, cy + m.b * u + m.d * v];
        const lista = this.tracos(agora, mapa, Math.hypot(m.a, m.b));

        const ctx = this.ctx;
        if (!lista.length && !this.sujo) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.largura, this.altura);
        this.sujo = lista.length > 0;
        if (!lista.length) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (op.brilho) {
            const b = this.brilhoCtx;
            const k = this.dpr / BRILHO_FRACAO;
            b.setTransform(1, 0, 0, 1, 0, 0);
            b.clearRect(0, 0, this.brilho.width, this.brilho.height);
            b.setTransform(k, 0, 0, k, 0, 0);
            b.lineCap = 'round';
            b.lineJoin = 'round';
            for (const t of lista) {
                b.globalAlpha = t.alfa;
                b.strokeStyle = t.estilo.halo;
                b.lineWidth = t.larguraBrilho * BRILHO_ALCANCE;
                desenharLinha(b, t.pts);
            }
            const d = this.borradoCtx;
            d.clearRect(0, 0, this.borrado.width, this.borrado.height);
            d.filter = `blur(${BRILHO_BLUR_PX}px)`;
            d.drawImage(this.brilho, 0, 0);
            d.filter = 'none';
            ctx.globalAlpha = Math.min(1, BRILHO_FORCA);
            ctx.drawImage(this.borrado, 0, 0, this.largura, this.altura);
            if (BRILHO_FORCA > 1) {
                ctx.globalAlpha = BRILHO_FORCA - 1;
                ctx.drawImage(this.borrado, 0, 0, this.largura, this.altura);
            }
        }

        for (const t of lista) {
            ctx.globalAlpha = t.alfa * t.estilo.alfaBrilho;
            ctx.strokeStyle = t.estilo.brilho;
            ctx.lineWidth = t.larguraBrilho;
            desenharLinha(ctx, t.pts);
        }
        for (const t of lista) {
            ctx.globalAlpha = t.alfa;
            ctx.strokeStyle = t.estilo.nucleo;
            ctx.lineWidth = t.larguraNucleo;
            desenharLinha(ctx, t.pts);
        }
        ctx.globalAlpha = 1;
    }
}

function desenharLinha(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
}
