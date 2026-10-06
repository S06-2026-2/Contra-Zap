import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Fantasminha from './Fantasminha.jsx';
import Carta from './Carta.jsx';
import { CaixaFantasma, calcularAssentosMobile, deslocamentoMelada, medirMesa } from './MesaExperimento.jsx';
import { useModoMobile } from './modoMobile.js';
import { ESCALA_CARTA_JOGADA_MOBILE, MELADA_POUSO_MOBILE, ZONAS_POUSO_MOBILE, gerarCodigoZonas, sortearPontoNaZona } from './zonasPouso.js';
import './meetfront1.css';

// Lab das zonas de pouso do mobile (aberto pelo botão do Login): a mesa
// mobile com os fantasminhas nas posições de verdade e, por cima, a zona de
// cada assento como um retângulo na cor dele — arrasta pra mover, puxa o
// canto de baixo à direita pra redimensionar. "Tacar" joga cartas sorteadas
// dentro das zonas pra ver se dá pra ler quem jogou o quê. As meladas de
// exemplo (dois grupos de duas) também arrastam: é o canto onde elas se
// juntam. O ajuste fica
// salvo neste navegador e sai como código pronto no painel, no formato de
// zonasPouso.js. Abrir com a janela estreita (modo mobile), senão a
// geometria não é a do celular.

const QUANTIDADES = [2, 3, 4, 5, 6];
const CHAVE_SALVO = 'mf1-lab-pouso';
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
const RODADA_INTERVALO_MS = 260;
const CARTAS_POR_ASSENTO_ESPALHAR = 10;
const ZONA_MIN_PCT = 2;
const BARALHO = [
    { rotacao: -6, x: -3, y: 2 },
    { rotacao: -2, x: -1, y: 1 },
    { rotacao: 1, x: 1, y: -1 },
    { rotacao: 4, x: 2, y: -2 },
    { rotacao: 7, x: 3, y: -3 },
];
// Mesmo valor de ESCALA_BARALHO_REPOUSO em MesaExperimento.jsx.
const ESCALA_BARALHO = 0.55;
// Meladas de exemplo: grupo, posição no grupo e carta.
const MELADAS_EXEMPLO = [
    { grupo: 0, indice: 0, rank: '7', naipe: 'Copas', rot: -14 },
    { grupo: 0, indice: 1, rank: '7', naipe: 'Paus', rot: 9 },
    { grupo: 1, indice: 0, rank: 'Q', naipe: 'Ouros', rot: 22 },
    { grupo: 1, indice: 1, rank: 'Q', naipe: 'Espadas', rot: -6 },
];

function copiarTabela(tabela) {
    return Object.fromEntries(Object.entries(tabela).map(([q, zonas]) => [q, zonas.map((z) => ({ ...z }))]));
}

function carregarSalvo() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_SALVO));
        const valido = salvo?.zonas && QUANTIDADES.every((q) => Array.isArray(salvo.zonas[q]) && salvo.zonas[q].length === q);
        if (valido) {
            return {
                zonas: salvo.zonas,
                escala: Number(salvo.escala) || ESCALA_CARTA_JOGADA_MOBILE,
                melada: salvo.melada ?? { ...MELADA_POUSO_MOBILE },
            };
        }
    } catch { /* sem armazenamento: começa do arquivo */ }
    return { zonas: copiarTabela(ZONAS_POUSO_MOBILE), escala: ESCALA_CARTA_JOGADA_MOBILE, melada: { ...MELADA_POUSO_MOBILE } };
}

function hueDoAssento(indice, quantidade) {
    return (200 + (indice * 360) / quantidade) % 360;
}

function corDoAssento(indice, quantidade) {
    return `hsl(${hueDoAssento(indice, quantidade)} 85% 62%)`;
}

function cartaAleatoria() {
    return {
        rank: RANKS[Math.floor(Math.random() * RANKS.length)],
        naipe: NAIPES[Math.floor(Math.random() * NAIPES.length)],
    };
}

export default function LabPouso({ onVoltar }) {
    const mobile = useModoMobile();
    const [inicial] = useState(carregarSalvo);
    const [zonas, setZonas] = useState(inicial.zonas);
    const [escala, setEscala] = useState(inicial.escala);
    const [melada, setMelada] = useState(inicial.melada);
    const [quantidade, setQuantidade] = useState(6);
    const [cartas, setCartas] = useState([]);
    const [mostrarZonas, setMostrarZonas] = useState(true);
    const [corDono, setCorDono] = useState(false);
    const [painelAberto, setPainelAberto] = useState(true);
    const [copiado, setCopiado] = useState(false);
    const [mesa, setMesa] = useState(null);
    const [tela, setTela] = useState({ largura: window.innerWidth, altura: window.innerHeight });
    const mesaRef = useRef(null);
    const textoRef = useRef(null);
    const arrasteRef = useRef(null);
    const timersRef = useRef([]);
    const proximoIdRef = useRef(0);

    useLayoutEffect(() => {
        const el = mesaRef.current;
        const medir = () => {
            setMesa(medirMesa(el));
            setTela({ largura: window.innerWidth, altura: window.innerHeight });
        };
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        window.addEventListener('resize', medir);
        return () => {
            observador.disconnect();
            window.removeEventListener('resize', medir);
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(CHAVE_SALVO, JSON.stringify({ zonas, escala, melada }));
        } catch { /* sem armazenamento: o código do painel continua valendo */ }
    }, [zonas, escala, melada]);

    useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

    // Arrastar/redimensionar: o pointerdown guarda a zona de partida; o
    // movimento da janela inteira aplica o deslocamento em % da tela.
    useEffect(() => {
        function mover(e) {
            const a = arrasteRef.current;
            if (!a) return;
            const dx = ((e.clientX - a.x0) / window.innerWidth) * 100;
            const dy = ((e.clientY - a.y0) / window.innerHeight) * 100;
            if (a.modo === 'melada') {
                setMelada({ x: a.zona.x + dx, y: a.zona.y + dy });
                return;
            }
            const z0 = a.zona;
            let nova;
            if (a.modo === 'mover') {
                nova = { ...z0, x: z0.x + dx, y: z0.y + dy };
            } else {
                const largura = Math.max(ZONA_MIN_PCT, z0.largura + dx);
                const altura = Math.max(ZONA_MIN_PCT, z0.altura + dy);
                nova = { x: z0.x - z0.largura / 2 + largura / 2, y: z0.y - z0.altura / 2 + altura / 2, largura, altura };
            }
            setZonas((atual) => ({
                ...atual,
                [a.quantidade]: atual[a.quantidade].map((z, i) => (i === a.indice ? nova : z)),
            }));
        }
        function soltar() {
            arrasteRef.current = null;
        }
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);
        return () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            window.removeEventListener('pointercancel', soltar);
        };
    }, []);

    function comecarArraste(e, indice, modo) {
        e.preventDefault();
        e.stopPropagation();
        const zona = modo === 'melada' ? melada : zonas[quantidade][indice];
        arrasteRef.current = { indice, modo, quantidade, x0: e.clientX, y0: e.clientY, zona };
    }

    function limparTimers() {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }

    function novaCarta(indice) {
        const ponto = sortearPontoNaZona(zonas[quantidade][indice]);
        return { id: ++proximoIdRef.current, indice, ...ponto, rot: Math.random() * 360, ...cartaAleatoria() };
    }

    function tacarRodada() {
        limparTimers();
        setCartas([]);
        for (let i = 0; i < quantidade; i++) {
            timersRef.current.push(setTimeout(() => setCartas((atual) => [...atual, novaCarta(i)]), (i + 1) * RODADA_INTERVALO_MS));
        }
    }

    function espalhar() {
        limparTimers();
        const novas = [];
        for (let i = 0; i < quantidade; i++) {
            for (let c = 0; c < CARTAS_POR_ASSENTO_ESPALHAR; c++) novas.push(novaCarta(i));
        }
        setCartas(novas);
    }

    function limpar() {
        limparTimers();
        setCartas([]);
    }

    function trocarQuantidade(q) {
        limpar();
        setQuantidade(q);
    }

    function restaurarDoArquivo() {
        limpar();
        setZonas((atual) => ({ ...atual, [quantidade]: ZONAS_POUSO_MOBILE[quantidade].map((z) => ({ ...z })) }));
    }

    function restaurarMelada() {
        setMelada({ ...MELADA_POUSO_MOBILE });
    }

    const codigo = gerarCodigoZonas(zonas, escala, melada);

    async function copiar() {
        try {
            await navigator.clipboard.writeText(codigo);
        } catch {
            textoRef.current?.select();
            document.execCommand('copy');
        }
        setCopiado(true);
        timersRef.current.push(setTimeout(() => setCopiado(false), 1500));
    }

    const assentos = calcularAssentosMobile(quantidade, mesa);
    const zonasAtuais = zonas[quantidade];

    return (
        <div className="mesa-exp-tela mf1 mf1-mobile mf1-lab-pouso">
            <div className="mesa-exp-mesa" ref={mesaRef}>
                {mesa && assentos.map((assento, i) => (assento.eVoce ? null : (
                    <div key={i} className="mesa-exp-assento" style={{ left: `${assento.x}%`, top: `${assento.y}%` }}>
                        <CaixaFantasma ativa>
                            <Fantasminha hue={hueDoAssento(i, quantidade)} />
                        </CaixaFantasma>
                        <div className="mf1-bandeja-fichas" />
                        <span className="mesa-exp-assento-legenda" style={{ color: corDoAssento(i, quantidade) }}>{i + 1}</span>
                    </div>
                )))}
                <div className="mesa-exp-baralho" style={{ left: '50%', top: '50%', transform: `scale(${ESCALA_BARALHO})` }}>
                    {BARALHO.map((carta, i) => (
                        <div
                            key={i}
                            className="mesa-exp-baralho-carta"
                            style={{ transform: `translate(calc(-50% + ${carta.x}px), calc(-50% + ${carta.y}px)) rotate(${carta.rotacao}deg)` }}
                        >
                            <Carta virada />
                        </div>
                    ))}
                </div>
            </div>

            <div className="mf1-seu-fantasminha">
                <CaixaFantasma ativa>
                    <Fantasminha hue={hueDoAssento(0, quantidade)} />
                </CaixaFantasma>
            </div>
            <span className="mf1-seu-fantasminha-nome" style={{ color: corDoAssento(0, quantidade) }}>1 · Você</span>
            <div className="mf1-lab-faixa-baixo">timer + fichas + vida</div>

            <div className="mf1-lab-camada">
                {cartas.map((c) => (
                    <div
                        key={c.id}
                        className={`mf1-lab-carta${corDono ? ' mf1-lab-carta-dono' : ''}`}
                        style={{
                            left: `${c.x}%`,
                            top: `${c.y}%`,
                            '--rot': `${c.rot}deg`,
                            '--escala': escala,
                            '--cor-dono': corDoAssento(c.indice, quantidade),
                        }}
                    >
                        <Carta rank={c.rank} naipe={c.naipe} />
                    </div>
                ))}
                <div className="mf1-lab-melada" style={{ left: `${melada.x}%`, top: `${melada.y}%` }}>
                    <span className="mf1-lab-melada-rotulo">meladas</span>
                    {MELADAS_EXEMPLO.map((m, i) => {
                        const desvio = deslocamentoMelada(m.grupo, m.indice);
                        return (
                            <div
                                key={i}
                                className="mf1-lab-melada-carta mesa-exp-carta-jogada-melada"
                                style={{ transform: `translate(calc(-50% + ${desvio.x}px), calc(-50% + ${desvio.y}px)) rotate(${m.rot}deg) scale(${escala})` }}
                                onPointerDown={(e) => comecarArraste(e, 0, 'melada')}
                            >
                                <Carta rank={m.rank} naipe={m.naipe} />
                            </div>
                        );
                    })}
                </div>
                {mostrarZonas && zonasAtuais.map((z, i) => (
                    <div
                        key={i}
                        className="mf1-lab-zona"
                        style={{
                            left: `${z.x - z.largura / 2}%`,
                            top: `${z.y - z.altura / 2}%`,
                            width: `${z.largura}%`,
                            height: `${z.altura}%`,
                            '--cor': corDoAssento(i, quantidade),
                        }}
                        onPointerDown={(e) => comecarArraste(e, i, 'mover')}
                    >
                        <span className="mf1-lab-zona-numero">{i + 1}</span>
                        <div className="mf1-lab-zona-alca" onPointerDown={(e) => comecarArraste(e, i, 'redimensionar')} />
                    </div>
                ))}
            </div>

            {painelAberto ? (
                <div className="mf1-lab-painel">
                    <div className="mf1-lab-linha">
                        <span className="mf1-lab-rotulo">Jogadores</span>
                        {QUANTIDADES.map((q) => (
                            <button key={q} type="button" className={`mf1-lab-btn${q === quantidade ? ' mf1-lab-btn-ativo' : ''}`} onClick={() => trocarQuantidade(q)}>
                                {q}
                            </button>
                        ))}
                    </div>
                    <div className="mf1-lab-linha">
                        <button type="button" className="mf1-lab-btn" onClick={tacarRodada}>Tacar rodada</button>
                        <button type="button" className="mf1-lab-btn" onClick={espalhar}>Tacar {CARTAS_POR_ASSENTO_ESPALHAR} cada</button>
                        <button type="button" className="mf1-lab-btn" onClick={limpar}>Limpar</button>
                    </div>
                    <div className="mf1-lab-linha">
                        <label className="mf1-lab-check">
                            <input type="checkbox" checked={mostrarZonas} onChange={(e) => setMostrarZonas(e.target.checked)} /> Zonas
                        </label>
                        <label className="mf1-lab-check">
                            <input type="checkbox" checked={corDono} onChange={(e) => setCorDono(e.target.checked)} /> Cor do dono
                        </label>
                        <button type="button" className="mf1-lab-btn" onClick={restaurarDoArquivo}>Restaurar {quantidade}</button>
                        <button type="button" className="mf1-lab-btn" onClick={restaurarMelada}>Restaurar meladas</button>
                    </div>
                    <div className="mf1-lab-linha">
                        <span className="mf1-lab-rotulo">Carta</span>
                        <input type="range" min="0.3" max="0.8" step="0.02" value={escala} onChange={(e) => setEscala(Number(e.target.value))} />
                        <span className="mf1-lab-valor">{escala.toFixed(2)}</span>
                        <span className="mf1-lab-valor">{tela.largura}×{tela.altura}</span>
                    </div>
                    <div className="mf1-lab-linha">
                        <span className="mf1-lab-rotulo">Meladas</span>
                        <span className="mf1-lab-valor">x {melada.x.toFixed(1)} · y {melada.y.toFixed(1)}</span>
                        <span className="mf1-lab-nota">arraste as cartas pretas</span>
                    </div>
                    {!mobile && <div className="mf1-lab-aviso">Janela larga: estreite pra ≤639px pra ver como no celular.</div>}
                    <textarea ref={textoRef} className="mf1-lab-codigo" readOnly value={codigo} onFocus={(e) => e.target.select()} />
                    <div className="mf1-lab-linha">
                        <button type="button" className="mf1-lab-btn mf1-lab-btn-ativo" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar'}</button>
                        <button type="button" className="mf1-lab-btn" onClick={() => setPainelAberto(false)}>Esconder</button>
                        <button type="button" className="mf1-lab-btn" onClick={onVoltar}>Voltar</button>
                    </div>
                </div>
            ) : (
                <button type="button" className="mf1-lab-btn mf1-lab-abrir" onClick={() => setPainelAberto(true)}>Lab</button>
            )}
        </div>
    );
}
