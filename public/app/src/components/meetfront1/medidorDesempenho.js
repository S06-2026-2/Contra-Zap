// Medidor de quadros da demo de desempenho (ver DemoBeta.jsx). Um laço de
// requestAnimationFrame anota o intervalo entre quadros e a "fase" da
// partida em que cada um caiu (a demo marca a fase a cada evento). Se o
// navegador suportar, também observa os long-animation-frames (Chrome 123+)
// — separa quanto do quadro travado foi JavaScript e quanto foi
// estilo/layout/pintura (onde moram os filtros) — e as long tasks.
//
// `invalido`: a página ficou escondida (tela apagou, app em segundo plano)
// ou um quadro passou de QUADRO_PAUSA_MS — isso é o navegador parado, não
// travada de animação, e estraga a medição inteira.
const QUADRO_PAUSA_MS = 2500;

function percentil(ordenados, p) {
    if (!ordenados.length) return 0;
    const i = Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length));
    return ordenados[i];
}

function resumir(intervalos, base) {
    const ordenados = [...intervalos].sort((a, b) => a - b);
    const total = intervalos.reduce((s, dt) => s + dt, 0);
    return {
        quadros: intervalos.length,
        fpsMedio: total > 0 ? (intervalos.length * 1000) / total : 0,
        p50: percentil(ordenados, 50),
        p95: percentil(ordenados, 95),
        p99: percentil(ordenados, 99),
        pior: ordenados[ordenados.length - 1] ?? 0,
        acima33: intervalos.filter((dt) => dt > 33.4).length,
        acima50: intervalos.filter((dt) => dt > 50).length,
        acima100: intervalos.filter((dt) => dt > 100).length,
        // Tempo "perdido": o quanto cada quadro passou do intervalo normal
        // da tela (mediana) — independe de a tela ser 60Hz ou 144Hz.
        travadoMs: intervalos.reduce((s, dt) => s + Math.max(0, dt - base * 1.5), 0),
    };
}

// Medidor que está medindo agora (um por vez) — pra quem não recebe o
// medidor por props (as coreografias da mesa) poder marcar fase com
// marcarFase. Sem medidor ativo, marcarFase não faz nada.
let ativo = null;

export function marcarFase(nome) {
    ativo?.fase(nome);
}

export function criarMedidor() {
    const intervalos = [];
    const faseDoQuadro = [];
    const fases = [];
    let faseAtual = -1;
    let raf = 0;
    let ultimo = 0;
    let inicio = 0;
    let observadores = [];
    const loaf = { n: 0, duracaoMs: 0, scriptMs: 0, renderMs: 0, bloqueioMs: 0 };
    const longtask = { n: 0, totalMs: 0 };
    let suportaLoaf = false;
    let suportaLongtask = false;
    let escondida = false;
    const aoMudarVisibilidade = () => {
        if (document.hidden) escondida = true;
    };

    function quadro(agora) {
        if (ultimo) {
            intervalos.push(agora - ultimo);
            faseDoQuadro.push(faseAtual);
        }
        ultimo = agora;
        raf = requestAnimationFrame(quadro);
    }

    function observar(tipo, aoReceber) {
        if (!PerformanceObserver.supportedEntryTypes?.includes(tipo)) return false;
        const obs = new PerformanceObserver((lista) => lista.getEntries().forEach(aoReceber));
        obs.observe({ type: tipo, buffered: false });
        observadores.push(obs);
        return true;
    }

    const medidor = {
        iniciar() {
            ativo = medidor;
            inicio = performance.now();
            raf = requestAnimationFrame(quadro);
            document.addEventListener('visibilitychange', aoMudarVisibilidade);
            suportaLoaf = observar('long-animation-frame', (e) => {
                loaf.n += 1;
                loaf.duracaoMs += e.duration;
                loaf.bloqueioMs += e.blockingDuration ?? 0;
                const script = (e.scripts ?? []).reduce((s, sc) => s + sc.duration, 0);
                loaf.scriptMs += script;
                if (e.renderStart) loaf.renderMs += e.startTime + e.duration - e.renderStart;
            });
            suportaLongtask = observar('longtask', (e) => {
                longtask.n += 1;
                longtask.totalMs += e.duration;
            });
        },
        fase(nome) {
            let i = fases.indexOf(nome);
            if (i === -1) i = fases.push(nome) - 1;
            faseAtual = i;
        },
        // FPS e pior quadro do último segundo, pro mostrador ao vivo.
        aoVivo() {
            let soma = 0;
            let n = 0;
            let pior = 0;
            for (let i = intervalos.length - 1; i >= 0 && soma < 1000; i--) {
                soma += intervalos[i];
                n += 1;
                pior = Math.max(pior, intervalos[i]);
            }
            return { fps: soma > 0 ? (n * 1000) / soma : 0, pior, fase: fases[faseAtual] ?? '—' };
        },
        parar() {
            if (ativo === medidor) ativo = null;
            cancelAnimationFrame(raf);
            document.removeEventListener('visibilitychange', aoMudarVisibilidade);
            observadores.forEach((o) => o.disconnect());
            observadores = [];
            const base = percentil([...intervalos].sort((a, b) => a - b), 50) || 1000 / 60;
            const porFase = fases.map((nome, i) => ({
                nome,
                ...resumir(intervalos.filter((_, q) => faseDoQuadro[q] === i), base),
            }));
            return {
                invalido: escondida || intervalos.some((dt) => dt > QUADRO_PAUSA_MS),
                duracaoS: (performance.now() - inicio) / 1000,
                hzTela: 1000 / base,
                ...resumir(intervalos, base),
                loaf: suportaLoaf ? loaf : null,
                longtask: suportaLongtask ? longtask : null,
                fases: porFase,
            };
        },
    };
    return medidor;
}
