import { useEffect, useRef, useState } from 'react';
import MesaExperimento from './MesaExperimento.jsx';
import FiltroTela, { CHOQUE_MODO, FILTRO_ANTIGO_SVG } from './FiltroTela.jsx';
import { criarMedidor } from './medidorDesempenho.js';
import { AJUSTES_ZAP_ORIGINAL, AJUSTES_ZAP_OTIMIZADO, AJUSTES_ZAP_PADRAO, AjustesZapContext } from './ajustesZap.js';
import { prepararFlipbookBorda } from './bordaFlipbook.js';

// Partida beta (botão "🎬 DEMO" no login): uma rodada fixa só de bots, sem
// servidor, pra medir desempenho da mesa do meetfront1. O roteiro abaixo
// faz o papel do socket — mesmos eventos e payloads do PROTOCOLO.md, no
// mesmo ritmo do GameController (antes de cada turno espera a mesa avisar
// animacoesConcluidas, como o "segurar pelas animações"; o bot leva
// ATRASO_BOT_MS pra decidir). Antes de rodar dá pra desligar peças do filtro
// de tela; no fim sai um relatório de quadros, guardado num histórico pra
// comparar uma configuração com a outra.
//
// A rodada: vira K (manilha A), 2 cartas. Vaza 1: K, 7, 4, K — os K melam,
// o 7 leva. Vaza 2 (o 7 abre): 2, 3, A de Copas (manilha), A de Paus (zap)
// — o zap leva. Bot 3 apostou 1 e não fez nada: perde um coração.

const EU = 'Demo';
const ORDEM = [EU, 'Bot 1', 'Bot 2', 'Bot 3'];
const MAOS = {
    [EU]: ['[K de Espadas]', '[A de Paus]'],
    'Bot 1': ['[7 de Copas]', '[2 de Ouros]'],
    'Bot 2': ['[4 de Paus]', '[3 de Espadas]'],
    'Bot 3': ['[K de Copas]', '[A de Copas]'],
};
const APOSTAS = { [EU]: 1, 'Bot 1': 1, 'Bot 2': 0, 'Bot 3': 1 };
const VAZAS = [
    {
        jogadas: [[EU, '[K de Espadas]', 'K'], ['Bot 1', '[7 de Copas]', '7'], ['Bot 2', '[4 de Paus]', '4'], ['Bot 3', '[K de Copas]', 'K (melou)']],
        vencedor: 'Bot 1',
        carta: '[7 de Copas]',
    },
    {
        jogadas: [['Bot 1', '[2 de Ouros]', '2'], ['Bot 2', '[3 de Espadas]', '3'], ['Bot 3', '[A de Copas]', 'A♥ manilha'], [EU, '[A de Paus]', 'A♣ zap']],
        vencedor: EU,
        carta: '[A de Paus]',
    },
];
const RESULTADO = [
    { nome: EU, aposta: 1, steak: 1, diferenca: 0, hp: 3 },
    { nome: 'Bot 1', aposta: 1, steak: 1, diferenca: 0, hp: 3 },
    { nome: 'Bot 2', aposta: 0, steak: 0, diferenca: 0, hp: 3 },
    { nome: 'Bot 3', aposta: 1, steak: 0, diferenca: 1, hp: 2 },
];

// Mesmos tempos do servidor (GameController: atrasoBotMs 2s, pausaVazaMs
// 1.6s) — o bot aqui decide um pouco mais rápido pra demo não arrastar.
const ATRASO_BOT_MS = 1500;
const PAUSA_VAZA_MS = 1600;
// Se a mesa nunca avisar que parou de animar, segue assim mesmo.
const ESPERA_MESA_MAX_MS = 20000;
// Depois do último evento, quanto fica medindo com a mesa já parada.
const FOLGA_FINAL_MS = 1500;

// Cada passo: espera `atraso`, depois (se `esperarMesa`) espera a mesa
// parar de animar, aí solta `eventos` juntos. `fase` rotula os quadros
// medidos a partir dali.
function montarRoteiro() {
    const passos = [{
        fase: 'distribuição + vira',
        eventos: [
            ['novaRodadaIniciada', { numero: 1, cartas: 2, ordem: ORDEM }],
            ['suaMao', { mao: MAOS[EU] }],
            ['manilhaVirada', { vira: '[K de Ouros]', viraValor: 7 }],
        ],
    }];
    const turno = (nome, tipo) => ({
        esperarMesa: true,
        eventos: [
            [tipo === 'aposta' ? 'turnoAposta' : 'turnoJogador', { jogador: nome }],
            ['timerTurno', { jogador: nome, tipo, tempoMs: ATRASO_BOT_MS }],
        ],
    });
    ORDEM.forEach((nome, i) => {
        passos.push(turno(nome, 'aposta'));
        passos.push({ atraso: ATRASO_BOT_MS, fase: i === 0 ? 'apostas' : undefined, eventos: [['apostaFeita', { jogador: nome, aposta: APOSTAS[nome] }]] });
    });
    VAZAS.forEach((vaza, v) => {
        vaza.jogadas.forEach(([nome, carta, rotulo], j) => {
            const t = turno(nome, 'jogada');
            if (j === 0 && v > 0) t.atraso = PAUSA_VAZA_MS;
            passos.push(t);
            const eventos = [['cartaJogada', { jogador: nome, carta }]];
            if (j === vaza.jogadas.length - 1) eventos.push(['vazaFinalizada', { vencedor: vaza.vencedor, carta: vaza.carta }]);
            passos.push({ atraso: ATRASO_BOT_MS, fase: `vaza ${v + 1}: ${rotulo}`, eventos });
        });
    });
    // O servidor solta o rodadaFinalizada só PAUSA_VAZA_MS depois da última
    // carta, por cima da coreografia do zap ainda caindo. Aqui espera a mesa
    // parar antes, pra queda do zap e o dano caírem em fases separadas.
    passos.push({ atraso: PAUSA_VAZA_MS, esperarMesa: true, fase: 'fim de rodada (dano)', eventos: [['rodadaFinalizada', { numero: 1, resultado: RESULTADO }]] });
    return passos;
}

// Roteiro curto (lote "SÓ ZAP"): rodada de 1 carta, apostas de uma vez, e o
// zap é a primeira carta da vaza — jogado por mim, pra ele passar pela mão
// também. Só mede a partir do turno do zap (`iniciarMedicao`); cada teste
// remonta a mesa, então ela começa sempre limpa.
function montarRoteiroZap() {
    return [
        {
            eventos: [
                ['novaRodadaIniciada', { numero: 1, cartas: 1, ordem: ORDEM }],
                ['suaMao', { mao: ['[A de Paus]'] }],
                ['manilhaVirada', { vira: '[K de Ouros]', viraValor: 7 }],
            ],
        },
        { atraso: 400, esperarMesa: true, eventos: ORDEM.map((nome) => ['apostaFeita', { jogador: nome, aposta: 0 }]) },
        {
            atraso: 400,
            esperarMesa: true,
            iniciarMedicao: true,
            fase: 'zap na mão',
            eventos: [
                ['turnoJogador', { jogador: EU }],
                ['timerTurno', { jogador: EU, tipo: 'jogada', tempoMs: ATRASO_BOT_MS }],
            ],
        },
        { atraso: ATRASO_BOT_MS, fase: 'zap jogado', eventos: [['cartaJogada', { jogador: EU, carta: '[A de Paus]' }]] },
    ];
}

const ESTADO_INICIAL = {
    iniciada: true,
    jogadores: ORDEM.map((nome) => ({ nome, adm: nome === EU })),
    ordem: ORDEM,
    ultimoSeq: 0,
    prazoTurno: null,
    mao: [],
    cartasRodada: 0,
    numeroRodada: 0,
    mesa: [],
    vira: null,
    jogadorDaVez: null,
    jogadorDaVezAposta: null,
    apostas: {},
    vazasFeitas: {},
    ultimoPlacar: [],
    vazaResultado: null,
};

// Mesmo tratamento dos handlers de meetfront1/Partida.jsx, só dos eventos
// que o roteiro solta.
function aplicarEvento(e, evento, p) {
    switch (evento) {
        case 'novaRodadaIniciada':
            return { ...e, mesa: [], vazaResultado: null, vira: null, jogadorDaVezAposta: null, cartasRodada: p.cartas, numeroRodada: p.numero, ordem: p.ordem, apostas: {}, vazasFeitas: {} };
        case 'suaMao':
            return { ...e, mao: p.mao };
        case 'manilhaVirada':
            return { ...e, vira: { carta: p.vira, valor: p.viraValor } };
        case 'turnoAposta':
            return { ...e, jogadorDaVezAposta: p.jogador, prazoTurno: null };
        case 'apostaFeita':
            return {
                ...e,
                jogadorDaVezAposta: null,
                prazoTurno: e.prazoTurno?.jogador === p.jogador ? null : e.prazoTurno,
                apostas: { ...e.apostas, [p.jogador]: p.aposta },
            };
        case 'timerTurno':
            return { ...e, prazoTurno: { jogador: p.jogador, tipo: p.tipo, tempoMs: p.tempoMs, inicio: Date.now() } };
        case 'turnoJogador':
            return { ...e, jogadorDaVez: p.jogador, prazoTurno: null };
        case 'cartaJogada': {
            const abrindoVazaNova = e.vazaResultado != null;
            const indice = p.jogador === EU ? e.mao.indexOf(p.carta) : -1;
            return {
                ...e,
                prazoTurno: e.prazoTurno?.jogador === p.jogador ? null : e.prazoTurno,
                jogadorDaVez: e.jogadorDaVez === p.jogador ? null : e.jogadorDaVez,
                vazaResultado: abrindoVazaNova ? null : e.vazaResultado,
                mesa: [...(abrindoVazaNova ? [] : e.mesa), { jogador: p.jogador, carta: p.carta }],
                mao: indice === -1 ? e.mao : e.mao.filter((_, i) => i !== indice),
            };
        }
        case 'vazaFinalizada':
            return {
                ...e,
                vazaResultado: { vencedor: p.vencedor, carta: p.carta },
                vazasFeitas: p.vencedor ? { ...e.vazasFeitas, [p.vencedor]: (e.vazasFeitas[p.vencedor] ?? 0) + 1 } : e.vazasFeitas,
            };
        case 'rodadaFinalizada':
            return { ...e, ultimoPlacar: p.resultado };
        default:
            return e;
    }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function PartidaDemo({ medidor, roteiro, onFim, onSair }) {
    const [estado, setEstado] = useState(ESTADO_INICIAL);
    const seqRef = useRef(0);
    const seqAvisadoRef = useRef(-1);
    const avisoRef = useRef(null);
    const limparVazaRef = useRef(null);
    const onFimRef = useRef(onFim);
    onFimRef.current = onFim;

    useEffect(() => {
        let cancelado = false;
        let medindo = true;

        function esperarMesaParada() {
            if (seqAvisadoRef.current >= seqRef.current) return Promise.resolve();
            return new Promise((resolve) => {
                const prazo = setTimeout(() => {
                    console.warn(`[demo] mesa não avisou o seq ${seqRef.current} em ${ESPERA_MESA_MAX_MS}ms — seguindo`);
                    avisoRef.current = null;
                    resolve();
                }, ESPERA_MESA_MAX_MS);
                avisoRef.current = () => {
                    if (seqAvisadoRef.current < seqRef.current) return;
                    clearTimeout(prazo);
                    avisoRef.current = null;
                    resolve();
                };
            });
        }

        function soltar(evento, p) {
            if (evento === 'cartaJogada' || evento === 'novaRodadaIniciada') {
                clearTimeout(limparVazaRef.current);
            }
            const seq = ++seqRef.current;
            setEstado((e) => ({ ...aplicarEvento(e, evento, p), ultimoSeq: seq }));
            if (evento === 'vazaFinalizada') {
                limparVazaRef.current = setTimeout(() => {
                    setEstado((e) => ({ ...e, mesa: [], vazaResultado: null }));
                }, PAUSA_VAZA_MS);
            }
        }

        (async () => {
            const passos = roteiro === 'zap' ? montarRoteiroZap() : montarRoteiro();
            const medeDesdeOInicio = !passos.some((p) => p.iniciarMedicao);
            if (medeDesdeOInicio) {
                medidor.fase('início');
                medidor.iniciar();
            }
            await esperar(800);
            for (const passo of passos) {
                if (passo.atraso) await esperar(passo.atraso);
                if (cancelado) return;
                if (passo.esperarMesa) {
                    // Dá tempo dos efeitos do último evento marcarem as
                    // travas antes de confiar no aviso.
                    await esperar(200);
                    await esperarMesaParada();
                }
                if (cancelado) return;
                if (passo.fase) medidor.fase(passo.fase);
                if (passo.iniciarMedicao) medidor.iniciar();
                passo.eventos.forEach(([evento, p]) => soltar(evento, p));
            }
            await esperar(400);
            await esperarMesaParada();
            await esperar(FOLGA_FINAL_MS);
            if (cancelado) return;
            medindo = false;
            onFimRef.current(medidor.parar());
        })();

        return () => {
            cancelado = true;
            if (medindo) medidor.parar();
            clearTimeout(limparVazaRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez por demo (a DemoBeta remonta com key nova)
    }, []);

    return (
        <MesaExperimento
            estado={{
                salaId: 'DEMO', meuNome: EU, senha: null, souDono: false, erro: null, infoSala: null,
                segundosParaIniciar: null, chatAberto: false, chatEmCooldown: false, erroChat: null,
                distribuicaoLiberada: null, maosReveladas: {}, eliminados: [], desconectados: [],
                vencedor: null, mensagensChat: [], conviteRevanche: null,
                ...estado,
            }}
            acoes={{
                animacoesConcluidas: (seq) => {
                    if (seq == null) return;
                    seqAvisadoRef.current = Math.max(seqAvisadoRef.current, seq);
                    avisoRef.current?.();
                },
                aindaAnimando: () => {},
                enviarChatPronta: () => {},
                aceitarConviteRevanche: () => {},
                sair: onSair,
            }}
        />
    );
}

// Peças do filtro de tela que dá pra desligar antes de rodar. Ligada = como
// está no ajuste salvo do meetfront1 (FiltroTela.jsx); desligada = zerada só
// durante a demo.
const PECAS = [
    { chave: 'grao', rotulo: 'Grão (feTurbulence)', curto: 'grão' },
    { chave: 'graoAnimado', rotulo: 'Grão animado (re-semeia ~15x/s)', curto: 'grão anim.' },
    { chave: 'scanlines', rotulo: 'Scanlines (camada multiply na tela toda)', curto: 'scanlines' },
    { chave: 'aberracao', rotulo: 'Aberração cromática (CRT)', curto: 'aberração' },
    { chave: 'choque', rotulo: 'Choque de aberração na manilha', curto: 'choque' },
];
// `antigo`: qual filtro (ver FILTRO_ANTIGO_SVG em FiltroTela.jsx) — começa
// no que a mesa usa de verdade.
// `zap`: ajustes da manilha de Paus (ver ajustesZap.js) — também começa no
// que a mesa usa.
const TUDO_LIGADO = { ...Object.fromEntries(PECAS.map((p) => [p.chave, true])), antigo: FILTRO_ANTIGO_SVG, zap: AJUSTES_ZAP_PADRAO };
const TUDO_DESLIGADO = { ...Object.fromEntries(PECAS.map((p) => [p.chave, false])), antigo: FILTRO_ANTIGO_SVG, zap: AJUSTES_ZAP_PADRAO };

// Peças do zap que dá pra ligar/desligar na tela de configuração. A borda
// gira a cada toque pelos estados de BORDAS (modo + pulo).
const PECAS_ZAP = [
    { chave: 'brilhoFiltro', rotulo: 'Brilhos por drop-shadow (desligado = halo sem filtro)' },
    { chave: 'raiosDentro', rotulo: 'Raios por dentro da carta' },
    { chave: 'raiosFora', rotulo: 'Raios em volta da carta' },
    { chave: 'raioCeu', rotulo: 'Raio do céu no impacto' },
];
const BORDAS = [
    { borda: 'viva', bordaPulo: 1 },
    { borda: 'viva', bordaPulo: 2 },
    { borda: 'viva', bordaPulo: 3 },
    { borda: 'enxuta', bordaPulo: 1 },
    { borda: 'enxuta', bordaPulo: 2 },
    { borda: 'enxuta', bordaPulo: 3 },
    { borda: 'flipbook', bordaPulo: 1 },
    { borda: 'leve', bordaPulo: 1 },
    { borda: 'off', bordaPulo: 1 },
];
const ROTULO_BORDA = {
    viva: 'viva (original)',
    enxuta: 'enxuta (2 ruídos, 3 oitavas)',
    flipbook: 'flipbook (pré-desenhada)',
    leve: 'leve (calculada uma vez)',
    off: 'desligada',
};
function rotuloBorda(z) {
    const pulo = z.bordaPulo ?? 1;
    const deslizando = z.borda === 'viva' || z.borda === 'enxuta';
    return `${ROTULO_BORDA[z.borda]}${deslizando && pulo > 1 ? ` · a cada ${pulo} quadros` : ''}`;
}
function proximaBorda(z) {
    const i = BORDAS.findIndex((b) => b.borda === z.borda && b.bordaPulo === (z.bordaPulo ?? 1));
    return BORDAS[(i + 1) % BORDAS.length];
}
const ZAP_PELADO = { borda: 'off', bordaPulo: 1, brilhoFiltro: false, raiosDentro: false, raiosFora: false, raioCeu: false };

function rotuloZap(z) {
    const igual = (a) => Object.keys(a).every((k) => a[k] === z[k]);
    if (igual(AJUSTES_ZAP_ORIGINAL)) return 'zap original';
    if (igual(AJUSTES_ZAP_OTIMIZADO)) return 'zap otimizado';
    if (igual(ZAP_PELADO)) return 'zap sem efeitos';
    const partes = [];
    const pulo = z.bordaPulo ?? 1;
    if (z.borda === 'off') partes.push('sem borda');
    else if (z.borda !== 'viva' || pulo > 1) partes.push(`borda ${z.borda}${pulo > 1 && z.borda !== 'flipbook' && z.borda !== 'leve' ? ` /${pulo}` : ''}`);
    if (!z.brilhoFiltro) partes.push('brilho sem filtro');
    if (!z.raiosDentro) partes.push('sem raios dentro');
    if (!z.raiosFora) partes.push('sem raios fora');
    if (!z.raioCeu) partes.push('sem raio do céu');
    if (z.escuroOpacidade) partes.push('escuro por opacidade');
    if (z.raiosForaAntes) partes.push('raios fora montados antes');
    if (z.cartaGrande) partes.push('carta grande');
    if (z.semRaiosNaSubida) partes.push('sem raios na subida');
    if (z.raiosNoImpacto === false) partes.push('sem raios no impacto');
    return `zap: ${partes.join(', ')}`;
}

function sobrescritaDe(cfg) {
    const s = {};
    if (!cfg.grao) s.grao = 0;
    if (!cfg.graoAnimado) s.graoAnimado = false;
    if (!cfg.scanlines) s.scanlines = 0;
    if (!cfg.aberracao) s.aberracao = 0;
    return s;
}

function rotuloDe(cfg) {
    const ligadas = PECAS.filter((p) => cfg[p.chave]);
    const filtro = ligadas.length ? `${rotuloPecas(cfg, ligadas)} · ${cfg.antigo ? 'filtro antigo' : 'filtro leve'}` : 'tudo desligado';
    const modoChoque = cfg.choque && cfg.choqueModo && cfg.choqueModo !== 'tela' ? ` · choque ${cfg.choqueModo}` : '';
    const rotulo = `${cfg.zap ? `${filtro} · ${rotuloZap(cfg.zap)}` : filtro}${modoChoque}`;
    if (cfg.nome) return `${cfg.nome} (${rotulo})`;
    return cfg.roteiro === 'zap' ? `só zap · ${rotulo}` : rotulo;
}

function rotuloPecas(cfg, ligadas) {
    if (ligadas.length === PECAS.length) return 'tudo ligado';
    if (!cfg.grao && !cfg.aberracao && cfg.graoAnimado && cfg.scanlines && cfg.choque) return 'sem filtro SVG (grão + aberração)';
    return `sem ${PECAS.filter((p) => !cfg[p.chave]).map((p) => p.curto).join(', ')}`;
}

const CHAVE_HISTORICO = 'contrazap-mf1-demo-historico';
const HISTORICO_MAX = 30;

function lerHistorico() {
    try {
        const h = JSON.parse(localStorage.getItem(CHAVE_HISTORICO) ?? '[]');
        return Array.isArray(h) ? h : [];
    } catch {
        return [];
    }
}

function gravarHistorico(h) {
    try {
        localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(h));
    } catch {
        // sem localStorage: o histórico só vive até fechar a demo
    }
}

const ms = (v) => `${Math.round(v)}ms`;
const fps = (v) => v.toFixed(1);

// Mostrador ao vivo (fora da camada filtrada): escreve direto no DOM a cada
// 250ms pra não re-renderizar nada do React.
function MostradorAoVivo({ medidor, prefixo = '' }) {
    const ref = useRef(null);
    useEffect(() => {
        const id = setInterval(() => {
            const v = medidor.aoVivo();
            if (ref.current) ref.current.textContent = `${prefixo}FPS ${Math.round(v.fps)} · pior ${ms(v.pior)} · ${v.fase}`;
        }, 250);
        return () => clearInterval(id);
    }, [medidor, prefixo]);
    return <div ref={ref} className="az-px mf1-demo-hud">FPS —</div>;
}

// Média de cada configuração do lote (com várias voltas, a mesma
// configuração roda mais de uma vez), na ordem em que rodaram.
function resumirLote(lote) {
    const grupos = new Map();
    for (const r of [...lote].reverse()) {
        if (!grupos.has(r.rotulo)) grupos.set(r.rotulo, []);
        grupos.get(r.rotulo).push(r);
    }
    const media = (rs, campo) => rs.reduce((s, r) => s + r[campo], 0) / rs.length;
    return [...grupos].map(([rotulo, rs]) => ({
        rotulo,
        n: rs.length,
        fpsMedio: media(rs, 'fpsMedio'),
        p95: media(rs, 'p95'),
        pior: media(rs, 'pior'),
        acima50: media(rs, 'acima50'),
        travadoMs: media(rs, 'travadoMs'),
    }));
}

const TEXTO_ENVIO = {
    enviando: 'Mandando pro servidor…',
    enviado: 'Resultado do lote salvo no servidor ✓',
    falhou: 'Não deu pra mandar pro servidor — use COPIAR HISTÓRICO.',
};

function Relatorio({ atual, historico, lote, envio, onDeNovo, onVoltar, onLimpar }) {
    const [copiado, setCopiado] = useState(false);
    const fasesPiores = [...atual.fases].filter((f) => f.quadros > 0).sort((a, b) => b.travadoMs - a.travadoMs);
    async function copiar() {
        try {
            await navigator.clipboard.writeText(JSON.stringify(historico, null, 2));
            setCopiado(true);
        } catch {
            setCopiado(false);
        }
    }
    return (
        <div className="az-raiz mf1-demo-tela">
            <div className="mf1-demo-painel mf1-demo-painel-largo">
                <div className="az-px mf1-demo-titulo">RESULTADO · {atual.rotulo}</div>
                <div className="mf1-demo-numeros">
                    <div><span className="az-px">{fps(atual.fpsMedio)}</span>fps médio</div>
                    <div><span className="az-px">{ms(atual.p95)}</span>p95 do quadro</div>
                    <div><span className="az-px">{ms(atual.pior)}</span>pior quadro</div>
                    <div><span className="az-px">{atual.acima50}</span>quadros &gt; 50ms</div>
                    <div><span className="az-px">{ms(atual.travadoMs)}</span>tempo travado</div>
                </div>
                <div className="mf1-demo-nota">
                    {atual.quadros} quadros em {atual.duracaoS.toFixed(1)}s · tela ~{Math.round(atual.hzTela)}Hz
                    {atual.loaf && ` · quadros longos: ${atual.loaf.n} (JS ${ms(atual.loaf.scriptMs)}, estilo/layout/pintura ${ms(atual.loaf.renderMs)})`}
                    {atual.longtask && ` · long tasks: ${atual.longtask.n} (${ms(atual.longtask.totalMs)})`}
                </div>

                {lote && (
                    <>
                        <div className="az-px mf1-demo-subtitulo">RESUMO DO LOTE (média por configuração)</div>
                        <table className="mf1-demo-tabela">
                            <thead>
                                <tr><th>configuração</th><th>vezes</th><th>fps</th><th>p95</th><th>pior</th><th>&gt;50ms</th><th>travado</th></tr>
                            </thead>
                            <tbody>
                                {resumirLote(lote).map((r) => (
                                    <tr key={r.rotulo}>
                                        <td>{r.rotulo}</td><td>{r.n}</td><td>{fps(r.fpsMedio)}</td><td>{ms(r.p95)}</td><td>{ms(r.pior)}</td><td>{r.acima50.toFixed(1)}</td><td>{ms(r.travadoMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {envio && <div className="mf1-demo-nota">{TEXTO_ENVIO[envio]}</div>}
                    </>
                )}
                {!lote && envio && <div className="mf1-demo-nota">{TEXTO_ENVIO[envio]}</div>}

                <div className="az-px mf1-demo-subtitulo">ONDE TRAVOU NO ÚLTIMO TESTE (fases, pior primeiro)</div>
                <table className="mf1-demo-tabela">
                    <thead>
                        <tr><th>fase</th><th>fps</th><th>p95</th><th>pior</th><th>&gt;50ms</th><th>travado</th></tr>
                    </thead>
                    <tbody>
                        {fasesPiores.map((f) => (
                            <tr key={f.nome}>
                                <td>{f.nome}</td><td>{fps(f.fpsMedio)}</td><td>{ms(f.p95)}</td><td>{ms(f.pior)}</td><td>{f.acima50}</td><td>{ms(f.travadoMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="az-px mf1-demo-subtitulo">HISTÓRICO (mais recente primeiro)</div>
                <table className="mf1-demo-tabela">
                    <thead>
                        <tr><th>configuração</th><th>fps</th><th>p95</th><th>pior</th><th>&gt;50ms</th><th>travado</th></tr>
                    </thead>
                    <tbody>
                        {historico.map((r) => (
                            <tr key={r.em} className={r.em === atual.em ? 'mf1-demo-atual' : undefined}>
                                <td>{r.rotulo}</td><td>{fps(r.fpsMedio)}</td><td>{ms(r.p95)}</td><td>{ms(r.pior)}</td><td>{r.acima50}</td><td>{ms(r.travadoMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mf1-demo-botoes">
                    <button type="button" className="az-b az-px az-btn az-btn-amarelo" onClick={onDeNovo}>RODAR DE NOVO</button>
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={copiar}>{copiado ? 'COPIADO!' : 'COPIAR HISTÓRICO'}</button>
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={onLimpar}>LIMPAR HISTÓRICO</button>
                    <button type="button" className="az-b az-btn-fantasma" onClick={onVoltar}>Voltar</button>
                </div>
            </div>
        </div>
    );
}

// Uma volta de cada lote, repetida `voltas` vezes (ver montarLote).
// "VÁRIOS TESTES": tudo ligado, cada peça desligada sozinha (o resto
// ligado), tudo desligado.
const VOLTA_PECAS = [
    TUDO_LIGADO,
    ...PECAS.map((p) => ({ ...TUDO_LIGADO, [p.chave]: false })),
    TUDO_DESLIGADO,
];
// "TESTE DO FILTRO SVG": grão e aberração são as duas peças que põem um
// `filter: url(...)` na camada da tela inteira — aqui saem juntas (scanlines
// e choque ficam), pra ver se é esse filtro em si que pesa.
const VOLTA_FILTRO_SVG = [
    TUDO_LIGADO,
    { ...TUDO_LIGADO, grao: false, aberracao: false },
    TUDO_DESLIGADO,
];
// "ANTIGO × LEVE": o mesmo ajuste com os dois filtros, e sem filtro nenhum.
const VOLTA_ANTIGO_LEVE = [
    { ...TUDO_LIGADO, antigo: true },
    { ...TUDO_LIGADO, antigo: false },
    TUDO_DESLIGADO,
];
// Os dois lotes de cima estudam as peças do filtro ANTIGO.
const comAntigo = (volta) => volta.map((c) => ({ ...c, antigo: true }));
const VOLTA_PECAS_ANTIGO = comAntigo(VOLTA_PECAS);
const VOLTA_FILTRO_SVG_ANTIGO = comAntigo(VOLTA_FILTRO_SVG);
// "ZAP": filtro leve ligado em todos; varia só o zap — original, cada peça
// desligada (ou trocada pela versão leve) sozinha, otimizado e sem efeito
// nenhum.
const comZap = (zap) => ({ ...TUDO_LIGADO, antigo: false, zap });
const VOLTA_ZAP = [
    comZap(AJUSTES_ZAP_ORIGINAL),
    comZap({ ...AJUSTES_ZAP_ORIGINAL, borda: 'off' }),
    comZap({ ...AJUSTES_ZAP_ORIGINAL, borda: 'leve' }),
    comZap({ ...AJUSTES_ZAP_ORIGINAL, brilhoFiltro: false }),
    comZap({ ...AJUSTES_ZAP_ORIGINAL, raiosDentro: false }),
    comZap({ ...AJUSTES_ZAP_ORIGINAL, raiosFora: false }),
    comZap({ ...AJUSTES_ZAP_ORIGINAL, raioCeu: false }),
    comZap(AJUSTES_ZAP_OTIMIZADO),
    comZap(ZAP_PELADO),
];
// "BORDA": filtro leve e o resto do zap original em todos; varia só a borda
// — viva, viva pulando quadros, enxuta (com e sem pulo), flipbook, leve,
// sem borda — e o candidato a novo otimizado (flipbook + brilho sem filtro).
const comBorda = (borda, bordaPulo = 1) => comZap({ ...AJUSTES_ZAP_ORIGINAL, borda, bordaPulo });
const VOLTA_BORDA = [
    comBorda('viva'),
    comBorda('viva', 2),
    comBorda('viva', 3),
    comBorda('enxuta'),
    comBorda('enxuta', 2),
    comBorda('enxuta', 3),
    comBorda('flipbook'),
    comBorda('leve'),
    comBorda('off'),
    comZap({ ...AJUSTES_ZAP_OTIMIZADO, borda: 'flipbook' }),
];
// "SÓ ZAP": todas as formas do zap dos lotes ZAP e BORDA, uma vez cada, no
// roteiro curto (montarRoteiroZap).
const VOLTA_SO_ZAP = [...new Map([...VOLTA_ZAP, ...VOLTA_BORDA].map((c) => [rotuloDe(c), { ...c, roteiro: 'zap' }])).values()];
// "CRESCIDA": roteiro curto, todos com o zap vencedor (flipbook + brilho
// sem filtro); cada ajuste da crescida sozinho e todos juntos.
const ZAP_VENCEDOR = { ...AJUSTES_ZAP_OTIMIZADO, borda: 'flipbook' };
const AJUSTES_CRESCIDA = ['escuroOpacidade', 'raiosForaAntes', 'cartaGrande', 'semRaiosNaSubida'];
const VOLTA_CRESCIDA = [
    ZAP_VENCEDOR,
    ...AJUSTES_CRESCIDA.map((k) => ({ ...ZAP_VENCEDOR, [k]: true })),
    { ...ZAP_VENCEDOR, ...Object.fromEntries(AJUSTES_CRESCIDA.map((k) => [k, true])) },
].map((zap) => ({ ...comZap(zap), roteiro: 'zap' }));
// "IMPACTO": roteiro curto com o zap vencedor; tira sozinho cada suspeito
// do tranco depois que ele bate na mesa — o choque de aberração da tela
// (filtro SVG na tela toda), o raio do céu, os raios da dissipação — e
// os três juntos.
const comZapCurto = (zap, extra = {}) => ({ ...comZap(zap), roteiro: 'zap', ...extra });
const VOLTA_IMPACTO = [
    comZapCurto(ZAP_VENCEDOR),
    comZapCurto(ZAP_VENCEDOR, { choque: false }),
    comZapCurto({ ...ZAP_VENCEDOR, raioCeu: false }),
    comZapCurto({ ...ZAP_VENCEDOR, raiosNoImpacto: false }),
    comZapCurto({ ...ZAP_VENCEDOR, raioCeu: false, raiosNoImpacto: false }, { choque: false }),
];
// "CHOQUE": roteiro curto com o zap vencedor; o choque da tela no impacto
// de cada jeito (ver CHOQUE_MODO em FiltroTela.jsx) e sem choque.
const VOLTA_CHOQUE = [
    comZapCurto(ZAP_VENCEDOR, { choqueModo: 'tela' }),
    comZapCurto(ZAP_VENCEDOR, { choqueModo: 'curto' }),
    comZapCurto(ZAP_VENCEDOR, { choqueModo: 'glitch' }),
    comZapCurto(ZAP_VENCEDOR, { choqueModo: 'franjas' }),
    comZapCurto(ZAP_VENCEDOR, { choqueModo: 'franjas-glitch' }),
    comZapCurto(ZAP_VENCEDOR, { choque: false }),
];
// "ANTES × AGORA": a partida inteira como era antes da otimização (filtro
// antigo com a aberração SVG na tela toda, zap original, choque por filtro)
// e como está agora (filtro leve, zap otimizado, choque em franjas +
// glitch). Um de cada por volta, alternados, pra variação do celular cair
// igual nos dois.
const VOLTA_ANTES_AGORA = [
    { ...TUDO_LIGADO, nome: 'ANTES', antigo: true, zap: AJUSTES_ZAP_ORIGINAL, choqueModo: 'tela' },
    { ...TUDO_LIGADO, nome: 'AGORA', antigo: false, zap: AJUSTES_ZAP_OTIMIZADO, choqueModo: 'franjas-glitch' },
];
// Botão "DEMO COM ZAP FLIPBOOK": a partida inteira com o vencedor do lote SÓ
// ZAP (borda flipbook + brilho sem filtro), pra ver ele no jogo.
const DEMO_ZAP_FLIPBOOK = comZap(ZAP_VENCEDOR);
const usaFlipbook = (configs) => configs.some((c) => (c.zap ?? AJUSTES_ZAP_PADRAO).borda === 'flipbook');
// Teste que voltou com a página pausada (ver `invalido` em
// medidorDesempenho.js) roda de novo no fim do lote, até esse tanto de vezes.
const REPETICOES_INVALIDO_MAX = 3;

function montarLote(volta, voltas) {
    return Array.from({ length: voltas }, () => volta).flat();
}

// Manda o lote pro servidor (POST /api/demo-desempenho, só fora de
// produção), que grava em resultados-demo/ na raiz do repo.
async function enviarLote(lote) {
    const resposta = await fetch('/api/demo-desempenho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            em: new Date().toISOString(),
            navegador: navigator.userAgent,
            tela: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
            resumo: resumirLote(lote),
            resultados: lote,
        }),
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
}

export default function DemoBeta({ onVoltar }) {
    const [etapa, setEtapa] = useState('config');
    const [cfg, setCfg] = useState(TUDO_LIGADO);
    const [rodada, setRodada] = useState(0);
    const [medidor, setMedidor] = useState(null);
    const [atual, setAtual] = useState(null);
    const [historico, setHistorico] = useState(lerHistorico);
    const [voltas, setVoltas] = useState(2);
    // Lote em andamento: configurações que ainda faltam (`fila`) e os
    // resultados já feitos; `loteFeito` fica pro relatório quando acaba.
    const [fila, setFila] = useState([]);
    const [totalLote, setTotalLote] = useState(0);
    const [loteFeito, setLoteFeito] = useState(null);
    const [envio, setEnvio] = useState(null);
    const resultadosLoteRef = useRef([]);
    const repeticoesRef = useRef(0);

    // Vai gerando o flipbook da borda enquanto a tela de configuração está
    // aberta, pra não ter espera ao começar.
    useEffect(() => { prepararFlipbookBorda(); }, []);

    function rodar(config) {
        setCfg(config);
        setMedidor(criarMedidor());
        setRodada((r) => r + 1);
        setEtapa('rodando');
    }

    // O flipbook é gerado antes de começar a medir, pra geração não entrar
    // na conta (no jogo ela roda uma vez e fica guardada).
    async function iniciar(config = cfg) {
        if (usaFlipbook([config])) await prepararFlipbookBorda();
        setTotalLote(0);
        setFila([]);
        setLoteFeito(null);
        setEnvio(null);
        rodar(config);
    }

    async function iniciarLote(volta) {
        if (usaFlipbook(volta)) await prepararFlipbookBorda();
        const lote = montarLote(volta, voltas);
        resultadosLoteRef.current = [];
        repeticoesRef.current = 0;
        setTotalLote(lote.length);
        setFila(lote.slice(1));
        setLoteFeito(null);
        setEnvio(null);
        rodar(lote[0]);
    }

    function terminar(resultado) {
        const registro = { em: new Date().toISOString(), rotulo: rotuloDe(cfg), config: cfg, ...resultado };
        // No lote, teste pausado não entra em nada: volta pro fim da fila.
        if (totalLote > 0 && resultado.invalido && repeticoesRef.current < REPETICOES_INVALIDO_MAX) {
            repeticoesRef.current += 1;
            const [proxima, ...resto] = [...fila, cfg];
            setFila(resto);
            rodar(proxima);
            return;
        }
        const novo = [registro, ...historico].slice(0, HISTORICO_MAX);
        gravarHistorico(novo);
        setHistorico(novo);
        setAtual(registro);

        if (totalLote > 0) {
            resultadosLoteRef.current = [registro, ...resultadosLoteRef.current];
            if (fila.length > 0) {
                setFila(fila.slice(1));
                rodar(fila[0]);
                return;
            }
            const lote = resultadosLoteRef.current;
            setTotalLote(0);
            setLoteFeito(lote);
            setEnvio('enviando');
            enviarLote(lote).then(() => setEnvio('enviado'), () => setEnvio('falhou'));
        } else {
            // Teste avulso também vai pro servidor, como um lote de um.
            setEnvio('enviando');
            enviarLote([registro]).then(() => setEnvio('enviado'), () => setEnvio('falhou'));
        }
        setEtapa('relatorio');
    }

    function cancelar() {
        setTotalLote(0);
        setFila([]);
        setEtapa('config');
    }

    function limpar() {
        gravarHistorico([]);
        setHistorico(atual ? [atual] : []);
    }

    if (etapa === 'rodando') {
        return (
            <>
                <FiltroTela sobrescrita={sobrescritaDe(cfg)} semChoque={!cfg.choque} antigo={!!cfg.antigo} choqueModo={cfg.choqueModo ?? CHOQUE_MODO}>
                    <AjustesZapContext.Provider value={cfg.zap ?? AJUSTES_ZAP_PADRAO}>
                        <PartidaDemo key={rodada} medidor={medidor} roteiro={cfg.roteiro} onFim={terminar} onSair={cancelar} />
                    </AjustesZapContext.Provider>
                </FiltroTela>
                <MostradorAoVivo
                    medidor={medidor}
                    prefixo={totalLote > 0 ? `${totalLote - fila.length}/${totalLote} ${rotuloDe(cfg)} · ` : ''}
                />
            </>
        );
    }

    if (etapa === 'relatorio' && atual) {
        return (
            <Relatorio
                atual={atual}
                historico={historico}
                lote={loteFeito}
                envio={envio}
                onDeNovo={() => setEtapa('config')}
                onVoltar={onVoltar}
                onLimpar={limpar}
            />
        );
    }

    return (
        <div className="az-raiz mf1-demo-tela">
            <div className="mf1-demo-painel">
                <div className="az-px mf1-demo-titulo">PARTIDA BETA</div>
                <div className="mf1-demo-nota">
                    Rodada fixa só de bots: K, 7, 4, K (os K melam) e depois 2, 3, A de Copas (manilha), A de Paus (zap).
                    Você só assiste. No fim sai o relatório de quadros.
                </div>
                <div className="az-px mf1-demo-subtitulo">FILTRO DE TELA</div>
                {PECAS.map((p) => (
                    <button
                        key={p.chave}
                        type="button"
                        className="az-b mf1-demo-check"
                        onClick={() => setCfg((c) => ({ ...c, [p.chave]: !c[p.chave] }))}
                    >
                        <span className={`mf1-demo-marca${cfg[p.chave] ? ' mf1-demo-marca-ligada' : ''}`} />
                        <span>{p.rotulo}</span>
                    </button>
                ))}
                <div className="mf1-demo-botoes">
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => setCfg(TUDO_LIGADO)}>TUDO LIGADO</button>
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => setCfg(TUDO_DESLIGADO)}>TUDO DESLIGADO</button>
                </div>
                <button
                    type="button"
                    className="az-b mf1-demo-check"
                    onClick={() => setCfg((c) => ({ ...c, antigo: !c.antigo }))}
                >
                    <span className={`mf1-demo-marca${cfg.antigo ? ' mf1-demo-marca-ligada' : ''}`} />
                    <span>Usar o filtro ANTIGO (SVG na tela toda) em vez do leve</span>
                </button>

                <div className="az-px mf1-demo-subtitulo">ZAP (MANILHA DE PAUS)</div>
                <button
                    type="button"
                    className="az-b mf1-demo-check"
                    onClick={() => setCfg((c) => {
                        const z = c.zap ?? AJUSTES_ZAP_PADRAO;
                        return { ...c, zap: { ...z, ...proximaBorda(z) } };
                    })}
                >
                    <span className={`mf1-demo-marca${(cfg.zap ?? AJUSTES_ZAP_PADRAO).borda !== 'off' ? ' mf1-demo-marca-ligada' : ''}`} />
                    <span>Borda elétrica: {rotuloBorda(cfg.zap ?? AJUSTES_ZAP_PADRAO)}</span>
                </button>
                {PECAS_ZAP.map((p) => (
                    <button
                        key={p.chave}
                        type="button"
                        className="az-b mf1-demo-check"
                        onClick={() => setCfg((c) => {
                            const z = c.zap ?? AJUSTES_ZAP_PADRAO;
                            return { ...c, zap: { ...z, [p.chave]: !z[p.chave] } };
                        })}
                    >
                        <span className={`mf1-demo-marca${(cfg.zap ?? AJUSTES_ZAP_PADRAO)[p.chave] ? ' mf1-demo-marca-ligada' : ''}`} />
                        <span>{p.rotulo}</span>
                    </button>
                ))}
                <div className="mf1-demo-botoes">
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => setCfg((c) => ({ ...c, zap: AJUSTES_ZAP_ORIGINAL }))}>ZAP ORIGINAL</button>
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => setCfg((c) => ({ ...c, zap: AJUSTES_ZAP_OTIMIZADO }))}>ZAP OTIMIZADO</button>
                </div>
                <div className="mf1-demo-nota">Vai rodar: <strong>{rotuloDe(cfg)}</strong></div>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciar()}>COMEÇAR DEMO</button>
                <button type="button" className="az-b az-px az-btn az-btn-verde az-btn-g" onClick={() => iniciar(DEMO_ZAP_FLIPBOOK)}>
                    DEMO COM ZAP FLIPBOOK
                </button>

                <div className="az-px mf1-demo-subtitulo">VÁRIOS TESTES</div>
                <div className="mf1-demo-nota">
                    Roda em sequência, sozinho, e no fim manda o resultado pro servidor (cada teste leva ~1 min).
                    <br />
                    <strong>Várias peças</strong>: tudo ligado, cada peça desligada sozinha (o resto ligado) e tudo
                    desligado — {VOLTA_PECAS.length} testes por volta.
                    <br />
                    <strong>Filtro SVG</strong>: tudo ligado, sem grão e aberração juntos (scanlines e choque ficam)
                    e tudo desligado — {VOLTA_FILTRO_SVG.length} testes por volta.
                    <br />
                    <strong>Antigo × leve</strong>: tudo ligado com o filtro antigo, tudo ligado com o leve e tudo
                    desligado — {VOLTA_ANTIGO_LEVE.length} testes por volta.
                    <br />
                    Várias peças e filtro SVG rodam com o filtro antigo (é dele que eles estudam as peças).
                    <br />
                    <strong>Zap</strong>: filtro leve em todos; zap original, cada peça dele desligada (ou trocada
                    pela versão leve) sozinha, zap otimizado e zap sem efeitos — {VOLTA_ZAP.length} testes por volta.
                    <br />
                    <strong>Borda</strong>: filtro leve e zap original em todos; só a borda muda — viva, viva a cada 2 e
                    3 quadros, enxuta (idem), flipbook, leve, sem borda e flipbook com brilho sem filtro — {VOLTA_BORDA.length} testes por volta.
                    <br />
                    <strong>Só zap</strong>: todas as formas do zap dos dois lotes de cima, cada uma numa rodada curta
                    (1 carta, mesa limpa, o zap sai primeiro) e medindo só do zap na mão até ele assentar — {VOLTA_SO_ZAP.length} testes por volta.
                    <br />
                    <strong>Crescida</strong>: rodada curta do zap, sempre com flipbook + brilho sem filtro; cada ajuste
                    da carta crescendo sozinho (escuro por opacidade, raios de fora montados antes, carta desenhada
                    grande, sem raios na subida) e todos juntos — {VOLTA_CRESCIDA.length} testes por volta.
                    <br />
                    <strong>Impacto</strong>: rodada curta do zap vencedor; sem o choque de aberração da tela, sem o raio
                    do céu, sem os raios depois do impacto, e os três desligados juntos — {VOLTA_IMPACTO.length} testes por volta.
                    <br />
                    <strong>Antes × agora</strong>: a partida inteira como era antes da otimização (filtro antigo, zap
                    original, choque por filtro SVG) e como está agora (filtro leve, zap otimizado, franjas + glitch) —
                    {' '}{VOLTA_ANTES_AGORA.length} testes por volta, alternados.
                    <br />
                    <strong>Choque</strong>: rodada curta do zap vencedor; o choque da tela no impacto como é hoje (filtro
                    SVG na tela toda), curto (300 ms, sem tremido), em glitch pré-desenhado (sem filtro), em franjas
                    coloridas nas cartas (drop-shadow), franjas + glitch, e sem choque — {VOLTA_CHOQUE.length} testes por volta.
                    <br />
                    Teste em que a página ficou pausada (tela apagou, app em segundo plano) é refeito sozinho no fim.
                </div>
                <div className="mf1-demo-botoes">
                    {[1, 2, 3, 5].map((v) => (
                        <button
                            key={v}
                            type="button"
                            className={`az-b az-px az-btn ${voltas === v ? 'az-btn-verde' : 'az-btn-cinza'}`}
                            onClick={() => setVoltas(v)}
                        >
                            {v} {v === 1 ? 'VOLTA' : 'VOLTAS'}
                        </button>
                    ))}
                </div>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_PECAS_ANTIGO)}>
                    VÁRIAS PEÇAS ({VOLTA_PECAS.length * voltas} · ~{Math.round(VOLTA_PECAS.length * voltas * 0.95)} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_FILTRO_SVG_ANTIGO)}>
                    TESTE DO FILTRO SVG ({VOLTA_FILTRO_SVG.length * voltas} · ~{Math.round(VOLTA_FILTRO_SVG.length * voltas * 0.95)} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_ANTIGO_LEVE)}>
                    ANTIGO × LEVE ({VOLTA_ANTIGO_LEVE.length * voltas} · ~{Math.round(VOLTA_ANTIGO_LEVE.length * voltas * 0.95)} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_ZAP)}>
                    ZAP ({VOLTA_ZAP.length * voltas} · ~{Math.round(VOLTA_ZAP.length * voltas * 0.95)} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_BORDA)}>
                    BORDA ({VOLTA_BORDA.length * voltas} · ~{Math.round(VOLTA_BORDA.length * voltas * 0.95)} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_SO_ZAP)}>
                    SÓ ZAP ({VOLTA_SO_ZAP.length * voltas} · ~{Math.max(1, Math.round(VOLTA_SO_ZAP.length * voltas * 0.25))} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_CRESCIDA)}>
                    CRESCIDA ({VOLTA_CRESCIDA.length * voltas} · ~{Math.max(1, Math.round(VOLTA_CRESCIDA.length * voltas * 0.25))} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_IMPACTO)}>
                    IMPACTO ({VOLTA_IMPACTO.length * voltas} · ~{Math.max(1, Math.round(VOLTA_IMPACTO.length * voltas * 0.25))} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" onClick={() => iniciarLote(VOLTA_CHOQUE)}>
                    CHOQUE ({VOLTA_CHOQUE.length * voltas} · ~{Math.max(1, Math.round(VOLTA_CHOQUE.length * voltas * 0.25))} min)
                </button>
                <button type="button" className="az-b az-px az-btn az-btn-verde az-btn-g" onClick={() => iniciarLote(VOLTA_ANTES_AGORA)}>
                    ANTES × AGORA ({VOLTA_ANTES_AGORA.length * voltas} · ~{Math.round(VOLTA_ANTES_AGORA.length * voltas * 0.95)} min)
                </button>

                {historico.length > 0 && (
                    <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => { setAtual(historico[0]); setLoteFeito(null); setEtapa('relatorio'); }}>
                        VER ÚLTIMO RESULTADO
                    </button>
                )}
                <button type="button" className="az-b az-btn-fantasma" onClick={onVoltar}>Voltar</button>
            </div>
        </div>
    );
}
