import { useEffect, useRef } from 'react';

// Raios riscando POR DENTRO da carta de Paus quando ela é manilha (ver
// Carta.jsx). Inspirado no LightningStrike do three.js (pen "Lightning
// Animation" da wakana-k): cada raio nasce num ponto qualquer da carta e vai
// até outro ponto qualquer, a frente dele avançando do começo pro fim, com
// ramificações brotando conforme a frente passa por elas (e às vezes
// ramificação da ramificação); o traçado fica tremendo enquanto está aceso e
// some apagando da origem pro destino.
//
// Em repouso sai um de vez em quando (INTERVALO_CALMO_MS). `taxa` (raios por
// segundo) liga uma tempestade por cima disso, e `transicaoMs` é quanto tempo
// leva pra ir da taxa de agora até a nova — a jogada do Zap usa isso pra
// encher a carta de raios na queda e deixar escoar até sumir depois do
// impacto.
//
// Os raios são criados direto no DOM, fora do React (mesmo motivo de
// RaiosZap em MesaDanificada.jsx: na tempestade são dezenas vivendo poucos
// centésimos de segundo cada).

const SVG_NS = 'http://www.w3.org/2000/svg';
const LARGURA = 110;
const ALTURA = 154;
const MARGEM = 7;
const DISTANCIA_MIN = 40;
const INTERVALO_CALMO_MS = [1300, 3400];
const VIDA_CALMA_MS = [420, 650];
const VIDA_TEMPESTADE_MS = [170, 360];
const MAX_RAIOS_VIVOS = 45;
// Frações da vida do raio: a frente leva PROPAGACAO pra chegar no destino, e
// o apagamento começa em INICIO_SUMIR.
const PROPAGACAO = 0.3;
const PROPAGACAO_RAMO = 0.2;
const INICIO_SUMIR = 0.62;
const CHANCE_RECURSAO = 0.4;
const PROFUNDIDADE_MAX = 2;

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

function pontoNaCarta() {
    return [sortear(MARGEM, LARGURA - MARGEM), sortear(MARGEM, ALTURA - MARGEM)];
}

function prenderNaCarta([x, y]) {
    return [Math.min(LARGURA - MARGEM, Math.max(MARGEM, x)), Math.min(ALTURA - MARGEM, Math.max(MARGEM, y))];
}

// Zigue-zague por deslocamento de ponto médio. Cada ponto do meio também
// ganha um tremor próprio (direção, amplitude, frequência e fase), pro
// traçado ficar se contorcendo enquanto o raio está aceso — as pontas ficam
// fixas.
function tracarRamo(x0, y0, x1, y1, geracoes) {
    let pontos = [[x0, y0], [x1, y1]];
    let desvio = Math.hypot(x1 - x0, y1 - y0) * 0.28;
    for (let g = 0; g < geracoes; g++) {
        const novos = [pontos[0]];
        for (let i = 1; i < pontos.length; i++) {
            const [ax, ay] = pontos[i - 1];
            const [bx, by] = pontos[i];
            const norma = Math.hypot(bx - ax, by - ay) || 1;
            const empurrao = (Math.random() * 2 - 1) * desvio;
            novos.push([(ax + bx) / 2 - ((by - ay) / norma) * empurrao, (ay + by) / 2 + ((bx - ax) / norma) * empurrao]);
            novos.push(pontos[i]);
        }
        pontos = novos;
        desvio *= 0.55;
    }
    const ultimo = pontos.length - 1;
    return pontos.map(([x, y], i) => {
        const ponta = i === 0 || i === ultimo;
        const angulo = Math.random() * Math.PI * 2;
        const amplitude = ponta ? 0 : sortear(0.6, 2.4);
        return { x, y, tx: Math.cos(angulo) * amplitude, ty: Math.sin(angulo) * amplitude, freq: sortear(0.025, 0.06), fase: Math.random() * Math.PI * 2 };
    });
}

// Ramo + as ramificações dele, recursivo. `inicio`/`duracao` são frações da
// vida do raio inteiro: a ramificação nasce quando a frente do pai passa por
// ela.
function gerarRamos(x0, y0, x1, y1, profundidade, inicio, duracao, lista) {
    const pontos = tracarRamo(x0, y0, x1, y1, profundidade === 0 ? 5 : 4);
    lista.push({ pontos, profundidade, inicio, duracao });
    if (profundidade >= PROFUNDIDADE_MAX) return;
    const quantidade = profundidade === 0 ? 1 + Math.floor(Math.random() * 3) : (Math.random() < CHANCE_RECURSAO ? 1 : 0);
    const direcao = Math.atan2(y1 - y0, x1 - x0);
    const comprimento = Math.hypot(x1 - x0, y1 - y0);
    for (let k = 0; k < quantidade; k++) {
        const fracao = sortear(0.15, 0.75);
        const { x: bx, y: by } = pontos[Math.floor(fracao * (pontos.length - 1))];
        const angulo = direcao + (Math.random() < 0.5 ? -1 : 1) * sortear(0.35, 1.0);
        const c = comprimento * (1 - fracao) * sortear(0.4, 0.8);
        const [ex, ey] = prenderNaCarta([bx + Math.cos(angulo) * c, by + Math.sin(angulo) * c]);
        if (Math.hypot(ex - bx, ey - by) < 8) continue;
        gerarRamos(bx, by, ex, ey, profundidade + 1, inicio + fracao * duracao, PROPAGACAO_RAMO, lista);
    }
}

function criarRaio(svg, agora, tempestade) {
    const origem = pontoNaCarta();
    let destino = pontoNaCarta();
    for (let i = 0; i < 6 && Math.hypot(destino[0] - origem[0], destino[1] - origem[1]) < DISTANCIA_MIN; i++) {
        destino = pontoNaCarta();
    }
    const ramos = [];
    gerarRamos(origem[0], origem[1], destino[0], destino[1], 0, 0, PROPAGACAO, ramos);
    const g = document.createElementNS(SVG_NS, 'g');
    for (const ramo of ramos) {
        const espessura = 0.62 ** ramo.profundidade;
        ramo.camadas = ['carta-exp-raio-brilho', 'carta-exp-raio-nucleo'].map((classe) => {
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('class', classe);
            path.style.strokeWidth = String((classe === 'carta-exp-raio-brilho' ? 3.4 : 1.2) * espessura);
            g.appendChild(path);
            return path;
        });
    }
    svg.appendChild(g);
    const [vMin, vMax] = tempestade ? VIDA_TEMPESTADE_MS : VIDA_CALMA_MS;
    return { g, ramos, nasceu: agora, vida: sortear(vMin, vMax) };
}

function atualizarRaio(raio, agora) {
    const p = (agora - raio.nasceu) / raio.vida;
    if (p >= 1) {
        raio.g.remove();
        return false;
    }
    const sumico = Math.max(0, (p - INICIO_SUMIR) / (1 - INICIO_SUMIR));
    // Crepitar: o brilho oscila quadro a quadro.
    raio.g.style.opacity = String(0.65 + Math.random() * 0.35);
    for (const ramo of raio.ramos) {
        const frente = Math.min(1, Math.max(0, (p - ramo.inicio) / ramo.duracao));
        if (frente <= 0) {
            ramo.camadas.forEach((path) => path.setAttribute('d', ''));
            continue;
        }
        let d = '';
        let comprimento = 0;
        let ax = 0;
        let ay = 0;
        ramo.pontos.forEach((pt, i) => {
            const onda = Math.sin(agora * pt.freq + pt.fase);
            const x = pt.x + pt.tx * onda;
            const y = pt.y + pt.ty * onda;
            if (i > 0) comprimento += Math.hypot(x - ax, y - ay);
            d += `${i === 0 ? 'M' : ' L'}${x.toFixed(1)},${y.toFixed(1)}`;
            ax = x;
            ay = y;
        });
        // Trecho visível = de `sumico` até `frente` ao longo do ramo:
        // traço 0, vão até o começo, traço até a frente, vão pro resto.
        const a = sumico * comprimento;
        const b = frente * comprimento;
        const tracejado = `0 ${a.toFixed(1)} ${Math.max(0, b - a).toFixed(1)} ${comprimento.toFixed(1)}`;
        for (const path of ramo.camadas) {
            path.setAttribute('d', d);
            path.style.strokeDasharray = tracejado;
        }
    }
    return true;
}

// Taxa da tempestade no instante `agora`, no meio da rampa de uma taxa pra
// outra. Subindo começa devagar e dispara no fim; descendo segura um pouco
// no alto antes de cair e escoa devagar no fim.
function taxaDaRampa({ de, para, inicio, duracao }, agora) {
    const t = duracao > 0 ? Math.min(1, Math.max(0, (agora - inicio) / duracao)) : 1;
    const curva = para >= de ? t * t : t * t * (3 - 2 * t);
    return de + (para - de) * curva;
}

export default function RaiosNaCarta({ taxa = 0, transicaoMs = 0 }) {
    const svgRef = useRef(null);
    const rampaRef = useRef({ de: 0, para: 0, inicio: 0, duracao: 0 });

    useEffect(() => {
        const agora = performance.now();
        rampaRef.current = { de: taxaDaRampa(rampaRef.current, agora), para: taxa, inicio: agora, duracao: transicaoMs };
    }, [taxa, transicaoMs]);

    useEffect(() => {
        const vivos = [];
        let anterior = performance.now();
        let proximoCalmo = anterior + sortear(300, INTERVALO_CALMO_MS[1]);
        let acumulado = 0;
        let quadro;
        function passo(agora) {
            const svg = svgRef.current;
            if (svg) {
                if (agora >= proximoCalmo) {
                    vivos.push(criarRaio(svg, agora, false));
                    proximoCalmo = agora + sortear(...INTERVALO_CALMO_MS);
                }
                acumulado += (taxaDaRampa(rampaRef.current, agora) * (agora - anterior)) / 1000;
                while (acumulado >= 1) {
                    acumulado -= 1;
                    if (vivos.length < MAX_RAIOS_VIVOS) vivos.push(criarRaio(svg, agora, true));
                }
                for (let i = vivos.length - 1; i >= 0; i--) {
                    if (!atualizarRaio(vivos[i], agora)) vivos.splice(i, 1);
                }
            }
            anterior = agora;
            quadro = requestAnimationFrame(passo);
        }
        quadro = requestAnimationFrame(passo);
        return () => {
            cancelAnimationFrame(quadro);
            vivos.forEach((raio) => raio.g.remove());
        };
    }, []);

    return <svg ref={svgRef} className="carta-exp-raio" viewBox={`0 0 ${LARGURA} ${ALTURA}`} preserveAspectRatio="none" />;
}
