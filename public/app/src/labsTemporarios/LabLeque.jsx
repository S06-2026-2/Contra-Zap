import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Fantasminha from '../components/meetfront1/Fantasminha.jsx';
import Carta from '../components/meetfront1/Carta.jsx';
import { CaixaFantasma, MaoEmLeque, calcularAssentosMobile, medirMesa } from '../components/meetfront2/MesaExperimento.jsx';
import { useModoMobile } from '../components/meetfront1/modoMobile.js';
import '../components/meetfront2/meetfront2.css';
import './labs.css';

// Lab da mão revelada da primeira rodada (rota /lab-leque, ver main.jsx;
// lab temporário, não vai pra main):
// a mesa mobile com os fantasminhas nas posições de verdade, cada um com a
// carta dele à mostra na caixinha, como na rodada cega. O painel mexe no
// tamanho (scale) e na altura (translate) do leque revelado ao vivo, e
// sai como o bloco de CSS pronto pra colar no meetfront2.css
// (.mf2 .mf1-caixa-fantasma .mf2-leque-revelado). Fica salvo neste
// navegador. Abrir com a janela estreita (modo mobile).

const QUANTIDADES = [2, 3, 4, 5, 6];
const CHAVE_SALVO = 'mf1-lab-leque';
// Valores de hoje no meetfront2.css.
const PADRAO = { escala: 2.55, y: -178 };
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
const BARALHO = [
    { rotacao: -6, x: -3, y: 2 },
    { rotacao: -2, x: -1, y: 1 },
    { rotacao: 1, x: 1, y: -1 },
    { rotacao: 4, x: 2, y: -2 },
    { rotacao: 7, x: 3, y: -3 },
];
// Mesmo valor de ESCALA_BARALHO_REPOUSO em MesaExperimento.jsx.
const ESCALA_BARALHO = 0.55;

function carregarSalvo() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_SALVO));
        if (Number.isFinite(salvo?.escala) && Number.isFinite(salvo?.y)) return { escala: salvo.escala, y: salvo.y };
    } catch { /* sem armazenamento: começa do arquivo */ }
    return { ...PADRAO };
}

function hueDoAssento(indice, quantidade) {
    return (200 + (indice * 360) / quantidade) % 360;
}

function sortearMaos(quantidade) {
    return Array.from({ length: quantidade }, () => [{
        rank: RANKS[Math.floor(Math.random() * RANKS.length)],
        naipe: NAIPES[Math.floor(Math.random() * NAIPES.length)],
    }]);
}

function gerarCodigo({ escala, y }) {
    return [
        '.mf2 .mf1-caixa-fantasma .mf2-leque-revelado {',
        `    scale: ${Math.round(escala * 100) / 100};`,
        `    translate: 0 ${Math.round(y)}px;`,
        '}',
    ].join('\n');
}

export default function LabLeque() {
    const mobile = useModoMobile();
    const [ajuste, setAjuste] = useState(carregarSalvo);
    const [quantidade, setQuantidade] = useState(6);
    const [maos, setMaos] = useState(() => sortearMaos(6));
    const [painelAberto, setPainelAberto] = useState(true);
    const [copiado, setCopiado] = useState(false);
    const [mesa, setMesa] = useState(null);
    const mesaRef = useRef(null);
    const textoRef = useRef(null);
    const timerCopiadoRef = useRef(null);

    useLayoutEffect(() => {
        const el = mesaRef.current;
        const medir = () => setMesa(medirMesa(el));
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
            localStorage.setItem(CHAVE_SALVO, JSON.stringify(ajuste));
        } catch { /* sem armazenamento: o código do painel continua valendo */ }
    }, [ajuste]);

    useEffect(() => () => clearTimeout(timerCopiadoRef.current), []);

    function trocarQuantidade(q) {
        setQuantidade(q);
        setMaos(sortearMaos(q));
    }

    const codigo = gerarCodigo(ajuste);

    async function copiar() {
        try {
            await navigator.clipboard.writeText(codigo);
        } catch {
            textoRef.current?.select();
            document.execCommand('copy');
        }
        setCopiado(true);
        clearTimeout(timerCopiadoRef.current);
        timerCopiadoRef.current = setTimeout(() => setCopiado(false), 1500);
    }

    const assentos = calcularAssentosMobile(quantidade, mesa);

    return (
        <div className="mf2">
        <div
            className="mesa-exp-tela mf1 mf1-mobile mf1-lab-leque"
            style={{ '--lab-leque-escala': ajuste.escala, '--lab-leque-y': `${ajuste.y}px` }}
        >
            <div className="mesa-exp-mesa" ref={mesaRef}>
                {mesa && assentos.map((assento, i) => (assento.eVoce ? null : (
                    <div key={i} className="mesa-exp-assento" style={{ left: `${assento.x}%`, top: `${assento.y}%` }}>
                        <CaixaFantasma ativa>
                            <Fantasminha hue={hueDoAssento(i, quantidade)}>
                                <MaoEmLeque quantidade={1} cartas={maos[i]} />
                            </Fantasminha>
                        </CaixaFantasma>
                        <div className="mf1-bandeja-fichas" />
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

            {painelAberto ? (
                <div className="mf1-lab-painel">
                    <div className="mf1-lab-linha">
                        <span className="mf1-lab-rotulo">Jogadores</span>
                        {QUANTIDADES.map((q) => (
                            <button key={q} type="button" className={`mf1-lab-btn${q === quantidade ? ' mf1-lab-btn-ativo' : ''}`} onClick={() => trocarQuantidade(q)}>
                                {q}
                            </button>
                        ))}
                        <button type="button" className="mf1-lab-btn" onClick={() => setMaos(sortearMaos(quantidade))}>Sortear cartas</button>
                    </div>
                    <div className="mf1-lab-controle">
                        <span className="mf1-lab-controle-rotulo">Tamanho</span>
                        <input type="range" min="1" max="3" step="0.05" value={ajuste.escala} onChange={(e) => setAjuste((a) => ({ ...a, escala: Number(e.target.value) }))} />
                        <span className="mf1-lab-valor">{ajuste.escala.toFixed(2)}</span>
                    </div>
                    <div className="mf1-lab-controle">
                        <span className="mf1-lab-controle-rotulo">Altura (px)</span>
                        <input type="range" min="-200" max="60" step="1" value={ajuste.y} onChange={(e) => setAjuste((a) => ({ ...a, y: Number(e.target.value) }))} />
                        <span className="mf1-lab-valor">{ajuste.y}</span>
                    </div>
                    <div className="mf1-lab-linha">
                        <button type="button" className="mf1-lab-btn" onClick={() => setAjuste({ ...PADRAO })}>Restaurar</button>
                        <span className="mf1-lab-nota">altura negativa sobe a carta</span>
                    </div>
                    {!mobile && <div className="mf1-lab-aviso">Janela larga: estreite pra ≤639px pra ver como no celular.</div>}
                    <textarea ref={textoRef} className="mf1-lab-codigo" readOnly value={codigo} onFocus={(e) => e.target.select()} />
                    <div className="mf1-lab-linha">
                        <button type="button" className="mf1-lab-btn mf1-lab-btn-ativo" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar'}</button>
                        <button type="button" className="mf1-lab-btn" onClick={() => setPainelAberto(false)}>Esconder</button>
                        <button type="button" className="mf1-lab-btn" onClick={() => { window.location.href = '/'; }}>Voltar</button>
                    </div>
                </div>
            ) : (
                <button type="button" className="mf1-lab-btn mf1-lab-abrir" onClick={() => setPainelAberto(true)}>Lab</button>
            )}
        </div>
        </div>
    );
}
