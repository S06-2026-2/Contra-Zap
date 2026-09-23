// Golpes e duelos de manilha da frente arcade — sprites de pixel art
// desenhados em box-shadow, extraídos do protótipo de design
// (design_handoff_frente_arcade, `<script>` do Contra Zap.dc.html). Os
// números aqui são FINAIS: tempos, escalas, alcances e steps() vieram do
// design e não devem ser "arredondados" à mão.
//
// Cada função devolve camadas `{ estilo }` — uma string CSS por <div>, que
// Partida.jsx aplica via `ref={el => el && (el.style.cssText = estilo)}`
// num overlay sobre o feltro. Toda camada nasce com `opacity:0` e só
// aparece no próprio `animation-delay` (com `forwards`) — evita o flash do
// primeiro quadro. Os @keyframes cz-* moram em arcade.css.

// ---- Cartas ----

// Ordem de rank IGUAL valorInt de game/Baralho.js (4,5,6,7,Q,J,K,A,2,3) e
// naipeInt igual (Ouros 0 < Espadas 1 < Copas 2 < Paus 3).
export const ORDEM_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPE_INT = { Ouros: 0, Espadas: 1, Copas: 2, Paus: 3 };
export const GLIFO = { Ouros: '♦', Espadas: '♠', Copas: '♥', Paus: '♣' };
const COR_NAIPE = { Ouros: '#c0392b', Copas: '#c0392b', Espadas: '#1c1f26', Paus: '#1c1f26' };

// "[K de Copas]" (Carta.toString()) -> { rank, naipe, valorInt, naipeInt, glifo, cor }.
export function lerCarta(texto) {
    const m = /^\[(.+) de (.+)]$/.exec(String(texto ?? '').trim());
    if (!m) return null;
    const [, rank, naipe] = m;
    return {
        rank,
        naipe,
        valorInt: ORDEM_RANKS.indexOf(rank),
        naipeInt: NAIPE_INT[naipe] ?? -1,
        glifo: GLIFO[naipe] ?? '',
        cor: COR_NAIPE[naipe] ?? '#1c1f26',
    };
}

// Mesmo critério de game/Mesa.js (e de MesaExperimento.jsx): duas cartas
// iguais se anulam; entre manilhas, só se o naipe também bate (2+ baralhos).
export function saoIdenticas(c1, c2, viraValor) {
    if (c1.valorInt !== c2.valorInt) return false;
    if (c1.valorInt === viraValor) return c1.naipeInt === c2.naipeInt;
    return true;
}

export function compararForca(c1, c2, viraValor) {
    const c1EhManilha = c1.valorInt === viraValor;
    const c2EhManilha = c2.valorInt === viraValor;
    if (c1EhManilha && !c2EhManilha) return 1;
    if (!c1EhManilha && c2EhManilha) return -1;
    if (c1EhManilha && c2EhManilha) return c1.naipeInt - c2.naipeInt;
    return c1.valorInt - c2.valorInt;
}

// ---- Sprites ----

const TINTA = {
    D: '#0a0b0e', W: '#e8f1f7', G: '#f5c451', g: '#8a6410',
    H: '#ff4b3e', h: '#ff8f86', L: '#c98a4b', l: '#e8b072', Y: '#f5c451',
};
const SPRITES = {
    '♠': [
        '...D...', '..DWD..', '..DWD..', '..DWD..', '..DWD..', '..DWD..',
        '..DWD..', '..DWD..', '..DWD..', '..DWD..', '..DWD..', '..DWD..',
        '.DDDDD.', '.DGGGD.', '.DDDDD.', '...G...', '..DGD..', '..DgD..', '...D...',
    ],
    '♥': [
        '.DDD.DDD.', 'DHhHDHHHD', 'DHHHHHHHD', 'DHHHHHHHD',
        '.DHHHHHD.', '..DHHHD..', '...DHD...', '....D....',
    ],
    '♣': [
        '..DDD..', '.DlllD.', 'DlllWlD', 'DlllllD', 'DlllllD',
        '.DlllD.', '.DlllD.', '..DlD..', '..DlD..', '..DlD..', '..DlD..',
        '..DgD..', '..DgD..', '..DDD..',
    ],
    '♦': [
        '....D....', '...DYD...', '..DYWYD..', '.DYYYYYD.',
        'DYYYYYYYD', '.DYYYYYD.', '..DYYYD..', '...DYD...', '....D....',
    ],
};
// Mesma hierarquia de naipeInt, só que indexada pelo glifo.
export const FORCA = { '♦': 1, '♠': 2, '♥': 3, '♣': 4 };
const BRILHO = { '♠': '#e8f1f7', '♥': '#ff4b3e', '♣': '#e8b072', '♦': '#f5c451' };

// filtro(x, y, largura, altura) permite recortar o sprite no próprio grid de
// pixels (metades de um coração rachado, fatias de um ouro cortado).
const sprite = (naipe, e, anim, extra, filtro) => {
    const mapa = SPRITES[naipe];
    const cols = mapa[0].length, rows = mapa.length;
    const px = [];
    mapa.forEach((linha, y) => {
        for (let x = 0; x < linha.length; x++) {
            const cor = TINTA[linha[x]];
            if (cor && (!filtro || filtro(x, y, cols, rows))) px.push(`${x * e}px ${y * e}px 0 0 ${cor}`);
        }
    });
    const w = cols * e, h = rows * e;
    return {
        estilo: `position:absolute;left:50%;top:50%;width:${e}px;height:${e}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;box-shadow:${px.join(',')};opacity:0;transform-origin:${w / 2}px ${h / 2}px;animation:${anim};will-change:transform,opacity;${extra || ''}`,
    };
};
// Parte um sprite numa grade de blocos e devolve cada pedaço voando pra fora —
// o alvo se despedaça mantendo os próprios pixels, não vira poeira genérica.
const pedacos = (naipe, e, cols, rows, dur, atraso, alcance, extraPorPeca) => {
    const fora = [];
    for (let by = 0; by < rows; by++) {
        for (let bx = 0; bx < cols; bx++) {
            const ang = Math.atan2(by - (rows - 1) / 2 || 0.2, bx - (cols - 1) / 2 || 0.2);
            const d = alcance * (0.6 + ((bx * 7 + by * 13) % 40) / 100);
            const rot = ((bx + by) % 2 ? 1 : -1) * (120 + ((bx * 31 + by * 17) % 160));
            fora.push(
                sprite(
                    naipe, e,
                    `cz-frag-rot ${dur}ms steps(7) ${atraso + ((bx + by) % 3) * 24}ms forwards`,
                    `--dx:${Math.round(Math.cos(ang) * d)}px;--dy:${Math.round(Math.sin(ang) * d - 20)}px;--rot:${rot}deg;${extraPorPeca || ''}`,
                    (x, y, c, r) =>
                        Math.min(cols - 1, Math.floor((x / c) * cols)) === bx &&
                        Math.min(rows - 1, Math.floor((y / r) * rows)) === by
                )
            );
        }
    }
    return fora;
};
const quadrados = (n, cor, tam, dur, atraso, alcance) =>
    Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 3) * 0.5;
        const d = alcance * (0.5 + ((i * 37) % 50) / 100);
        return {
            estilo: `position:absolute;left:50%;top:50%;width:${tam}px;height:${tam}px;margin:${-tam / 2}px 0 0 ${-tam / 2}px;background:${cor};opacity:0;--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;animation:cz-frag ${dur}ms steps(5) ${atraso}ms forwards`,
        };
    });
const clarao = (cor, dur, atraso) => ({
    estilo: `position:absolute;inset:0;opacity:0;background:radial-gradient(45% 60% at 50% 50%,${cor} 0%,rgba(0,0,0,0) 72%);animation:cz-clarao ${dur}ms steps(4) ${atraso}ms forwards`,
});
const onda = (cor, dur, atraso) => ({
    estilo: `position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border:6px solid ${cor};border-radius:50%;opacity:0;animation:cz-onda ${dur}ms steps(6) ${atraso}ms forwards`,
});

export function temSprite(naipe) {
    return !!SPRITES[naipe];
}

export function somDoGolpe(naipe, modo) {
    const base = { '♠': 'espada', '♥': 'copas', '♣': 'paus', '♦': 'ouros' }[naipe];
    if (!base) return null;
    return modo === 'anula' ? base + 'Anula' : base;
}

// Cada manilha tem seu golpe. Modo "anula" = duas manilhas iguais se cancelam.
// `supera` = chegou por cima de outra animação ainda rodando (varrido + clarão).
export function camadasGolpe(naipe, modo, supera, { velocidade = 1, escala = 1 } = {}) {
    const t = (ms) => Math.round(ms / velocidade);
    const e = Math.max(3, Math.round(6 * escala * (supera ? 1.3 : 1)));
    const luz = BRILHO[naipe];
    const cam = [];
    if (supera) {
        cam.push({
            estilo: `position:absolute;inset:-10%;background:linear-gradient(90deg,rgba(0,0,0,0) 0%,${luz} 45%,rgba(255,255,255,.9) 50%,${luz} 55%,rgba(0,0,0,0) 100%);opacity:.9;animation:cz-varrer ${t(320)}ms steps(6) forwards`,
        });
        cam.push(clarao('rgba(255,255,255,.75)', t(240), 0));
    }
    const atr = supera ? t(90) : 0;

    if (naipe === '♠' && modo === 'solo') {
        cam.push({
            estilo: `position:absolute;left:50%;top:50%;width:520px;height:${Math.max(6, e)}px;margin:${-e / 2}px 0 0 -260px;background:linear-gradient(90deg,rgba(232,241,247,0),#e8f1f7 55%,rgba(255,255,255,.95));transform-origin:50% 50%;animation:cz-trilha ${t(420)}ms steps(5) ${atr}ms forwards`,
        });
        cam.push(sprite(naipe, e, `cz-corte ${t(360)}ms steps(9) ${atr}ms forwards`));
        cam.push(...quadrados(9, '#e8f1f7', e, t(360), atr + t(150), 150));
    } else if (naipe === '♥' && modo === 'solo') {
        cam.push(onda('#ff4b3e', t(520), atr + t(120)));
        cam.push(sprite(naipe, Math.round(e * 2.4), `cz-coracao ${t(720)}ms steps(8) ${atr}ms forwards`, 'filter:drop-shadow(0 0 14px rgba(255,75,62,.55))'));
        cam.push(...quadrados(10, '#ff8f86', e, t(420), atr + t(220), 190));
    } else if (naipe === '♣' && modo === 'solo') {
        cam.push(sprite(naipe, Math.round(e * 2), `cz-bonk ${t(780)}ms steps(10) ${atr}ms forwards`));
        cam.push(onda('rgba(233,205,160,.85)', t(400), atr + t(340)));
        cam.push(...quadrados(12, '#c98a4b', e, t(420), atr + t(340), 170));
    } else if (naipe === '♦' && modo === 'solo') {
        cam.push(clarao('rgba(245,196,81,.85)', t(420), atr + t(180)));
        cam.push(sprite(naipe, Math.round(e * 2.4), `cz-gema ${t(760)}ms steps(9) ${atr}ms forwards`, 'filter:drop-shadow(0 0 16px rgba(245,196,81,.6))'));
        cam.push(...quadrados(14, '#fff3c4', e, t(520), atr + t(200), 200));
    } else if (modo === 'anula') {
        const gira = naipe === '♠' || naipe === '♣';
        const dur = t(1000);
        const bate = t(360);
        // Espadas se cruzam em X (lâminas pressionadas), os outros naipes vêm na horizontal.
        const cruzam = naipe === '♠';
        const kfL = cruzam ? 'cz-cruz-l' : gira ? 'cz-choque-l90' : 'cz-choque-l';
        const kfR = cruzam ? 'cz-cruz-r' : gira ? 'cz-choque-r90' : 'cz-choque-r';
        const esc = Math.round(e * (cruzam ? 1.45 : gira ? 1.7 : 2));
        cam.push(sprite(naipe, esc, `${kfL} ${dur}ms steps(16) ${atr}ms forwards`));
        cam.push(sprite(naipe, esc, `${kfR} ${dur}ms steps(16) ${atr}ms forwards`));
        cam.push(clarao('rgba(255,255,255,.9)', t(300), atr + bate));
        cam.push(...quadrados(16, luz, e, t(520), atr + bate, 210));
        if (naipe === '♥') {
            cam.push(sprite(naipe, Math.round(e * 2.4), `cz-fundir ${t(260)}ms steps(5) ${atr + bate}ms forwards`));
            cam.push(sprite(naipe, Math.round(e * 2.4), `cz-rachar-l ${t(380)}ms steps(6) ${atr + t(660)}ms forwards`, 'clip-path:inset(0 50% 0 0)'));
            cam.push(sprite(naipe, Math.round(e * 2.4), `cz-rachar-r ${t(380)}ms steps(6) ${atr + t(660)}ms forwards`, 'clip-path:inset(0 0 0 50%)'));
        }
        if (naipe === '♦') cam.push(...quadrados(18, '#f5c451', e, t(600), atr + t(420), 260));
        if (naipe === '♣') cam.push(onda('rgba(233,205,160,.85)', t(460), atr + bate));
        if (naipe === '♠') cam.push(...quadrados(10, '#ffffff', Math.max(2, e - 2), t(300), atr + bate + t(60), 120));
    }
    return { camadas: cam, dur: (modo === 'anula' ? t(1150) : t(900)) + atr, bate: atr + t(modo === 'anula' ? 360 : 340) };
}

// Duelos: a manilha mais forte destrói a que estava ganhando.
// Cada par tem coreografia própria — o alvo reage, apanha e se desfaz.
// Devolve null se o par não tiver duelo desenhado (ex.: mais fraca por cima).
export function camadasDuelo(novo, antigo, { velocidade = 1, escala = 1 } = {}) {
    const t = (ms) => Math.round(ms / velocidade);
    const e = Math.max(3, Math.round(6 * escala));
    const alvo = Math.round(e * 2.4);
    const glow = { '♦': 'rgba(245,196,81,.45)', '♠': 'rgba(232,241,247,.45)', '♥': 'rgba(255,75,62,.5)' };
    const cam = [];
    const par = novo + antigo;

    // Alvo esperando o golpe: fica na mesa e estremece pouco antes do impacto.
    const porAlvo = (bate, kf) =>
        sprite(antigo, alvo, `${kf || `cz-alvo-espera ${bate + t(40)}ms steps(4) forwards`}, cz-alvo-tremer ${t(200)}ms steps(3) ${Math.max(0, bate - t(200))}ms 1`, `filter:drop-shadow(0 0 12px ${glow[antigo] || 'rgba(255,255,255,.4)'})`);

    if (par === '♠♦') {
        // Espada corta o ouro exatamente na diagonal da lâmina.
        const bate = t(520);
        cam.push(porAlvo(bate));
        cam.push(sprite(novo, Math.round(e * 1.8), `cz-golpe-corta ${t(620)}ms steps(14) forwards`));
        cam.push({
            estilo: `position:absolute;left:50%;top:50%;width:560px;height:${Math.max(4, e - 1)}px;margin:${-(e - 1) / 2}px 0 0 -280px;background:linear-gradient(90deg,rgba(255,255,255,0),#ffffff 50%,rgba(255,255,255,0));transform-origin:50% 50%;animation:cz-risco ${t(420)}ms steps(6) ${bate - t(60)}ms forwards`,
        });
        cam.push(clarao('rgba(255,255,255,.8)', t(220), bate - t(20)));
        const meio = (c, r) => (c + r) / 2;
        cam.push(sprite(antigo, alvo, `cz-fatia-a ${t(520)}ms steps(8) ${bate}ms forwards`, null, (x, y, c, r) => x + y < meio(c, r)));
        cam.push(sprite(antigo, alvo, `cz-fatia-b ${t(520)}ms steps(8) ${bate}ms forwards`, null, (x, y, c, r) => x + y >= meio(c, r)));
        cam.push(...quadrados(16, '#f5c451', e, t(520), bate + t(40), 220));
        cam.push(...quadrados(8, '#e8f1f7', Math.max(2, e - 2), t(300), bate, 130));
        return { camadas: cam, dur: bate + t(620), bate, sfx: 'duelo_espada_ouros' };
    }

    if (par === '♥♦') {
        // Coração pulsa atrás e a onda de energia desintegra o diamante.
        const bate = t(440);
        cam.push(porAlvo(bate, `cz-alvo-espera ${bate + t(20)}ms steps(3) forwards`));
        cam.push(sprite(novo, Math.round(e * 3), `cz-domina ${t(900)}ms steps(11) forwards`, 'filter:drop-shadow(0 0 18px rgba(255,75,62,.6))'));
        cam.push(onda('#ff4b3e', t(520), bate - t(120)));
        cam.push(onda('rgba(255,143,134,.8)', t(460), bate - t(20)));
        cam.push(clarao('rgba(255,75,62,.7)', t(260), bate - t(40)));
        cam.push(...pedacos(antigo, alvo, 3, 3, t(560), bate, 230));
        cam.push(...quadrados(14, '#f5c451', e, t(520), bate + t(40), 250));
        return { camadas: cam, dur: t(1000), bate, sfx: 'duelo_copas_ouros' };
    }

    if (par === '♥♠') {
        // A espada avança, o coração a segura no ar e ela se parte em duas.
        const bate = t(560);
        cam.push(sprite(antigo, Math.round(e * 1.9), `cz-espada-presa ${bate}ms steps(12) forwards`, 'filter:drop-shadow(0 0 10px rgba(232,241,247,.4))'));
        cam.push(sprite(novo, Math.round(e * 3), `cz-domina ${t(1000)}ms steps(12) ${t(120)}ms forwards`, 'filter:drop-shadow(0 0 18px rgba(255,75,62,.6))'));
        cam.push(clarao('rgba(255,75,62,.75)', t(280), bate));
        cam.push(onda('#ff4b3e', t(560), bate));
        // Lâmina partida: metade de cima gira pra cima, punho cai.
        const cortar = (cima) => (x, y, c, r) => (cima ? y < r * 0.45 : y >= r * 0.45);
        cam.push(sprite(antigo, Math.round(e * 1.9), `cz-espada-quebra-a ${t(520)}ms steps(8) ${bate}ms forwards`, null, cortar(true)));
        cam.push(sprite(antigo, Math.round(e * 1.9), `cz-espada-quebra-b ${t(520)}ms steps(8) ${bate}ms forwards`, null, cortar(false)));
        cam.push(...quadrados(14, '#e8f1f7', e, t(480), bate, 200));
        return { camadas: cam, dur: t(1180), bate, sfx: 'duelo_copas_espada' };
    }

    if (par === '♣♦') {
        // Porrete desce em cheio e esmaga o diamante contra o feltro.
        const bate = t(470);
        cam.push(porAlvo(bate, `cz-achata ${t(300)}ms steps(5) ${bate}ms both`));
        cam.push(sprite(novo, Math.round(e * 2.1), `cz-marreta ${t(900)}ms steps(12) forwards`));
        cam.push(clarao('rgba(233,205,160,.7)', t(240), bate));
        cam.push(onda('rgba(233,205,160,.85)', t(420), bate));
        cam.push(...pedacos(antigo, alvo, 3, 2, t(540), bate + t(120), 240, 'filter:drop-shadow(0 0 6px rgba(245,196,81,.5))'));
        cam.push(...quadrados(16, '#c98a4b', e, t(460), bate, 200));
        return { camadas: cam, dur: t(1050), bate, sfx: 'duelo_paus_ouros' };
    }

    if (par === '♣♠') {
        // Pancada lateral: a espada é rebatida girando pra fora da mesa.
        const bate = t(520);
        cam.push(porAlvo(bate, `cz-alvo-espera ${bate + t(20)}ms steps(3) forwards`));
        cam.push(sprite(novo, Math.round(e * 2.1), `cz-marreta-lat ${t(920)}ms steps(12) forwards`));
        cam.push(clarao('rgba(255,255,255,.7)', t(220), bate));
        cam.push(sprite(antigo, alvo, `cz-voa-gira ${t(560)}ms steps(9) ${bate}ms forwards`, '--dx:420px;--dy:-210px;--rot:760deg'));
        cam.push(...quadrados(12, '#e8f1f7', e, t(420), bate, 190));
        cam.push(...quadrados(10, '#c98a4b', Math.max(2, e - 1), t(460), bate + t(40), 150));
        return { camadas: cam, dur: t(1120), bate, sfx: 'duelo_paus_espada' };
    }

    if (par === '♣♥') {
        // Pancada seca no coração: ele achata e racha em duas metades.
        const bate = t(470);
        cam.push(porAlvo(bate, `cz-achata ${t(260)}ms steps(4) ${bate}ms both`));
        cam.push(sprite(novo, Math.round(e * 2.1), `cz-marreta ${t(900)}ms steps(12) forwards`));
        cam.push(clarao('rgba(255,75,62,.7)', t(240), bate));
        cam.push(onda('rgba(255,143,134,.8)', t(420), bate + t(40)));
        cam.push(sprite(antigo, alvo, `cz-rachar-l ${t(480)}ms steps(7) ${bate + t(180)}ms forwards`, null, (x, y, c) => x < c / 2));
        cam.push(sprite(antigo, alvo, `cz-rachar-r ${t(480)}ms steps(7) ${bate + t(180)}ms forwards`, null, (x, y, c) => x >= c / 2));
        cam.push(...quadrados(16, '#ff4b3e', e, t(500), bate, 210));
        cam.push(...quadrados(10, '#c98a4b', Math.max(2, e - 1), t(420), bate, 150));
        return { camadas: cam, dur: t(1150), bate, sfx: 'duelo_paus_copas' };
    }

    return null;
}
