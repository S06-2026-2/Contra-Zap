import { useEffect, useRef, useState } from 'react';
import { SeuFantasminha, SuaMaoEmLeque } from './MesaExperimento.jsx';
import { CHAPEUS_COM_ID } from '../../chapeus.js';
import { useModoMobile } from './modoMobile.js';
import { MAO_REATIVA_MOBILE, calcularLayoutMao, gerarCodigoMao } from './maoReativa.js';
import './meetfront1.css';

// Lab do leque da SUA mão no mobile (aberto pelo botão do Login): a mão de
// verdade (SuaMaoEmLeque) e o seu fantasminha na caixinha, em cima da mesa
// mobile, com um controle pra cada ajuste de MAO_REATIVA_MOBILE. Muda a
// quantidade de cartas (ou clica numa carta pra "jogar" e ver a mão
// diminuindo, com o fantasminha lançando) e o estado da vez. O ajuste fica
// salvo neste navegador e sai como código pronto no painel, no formato de
// maoReativa.js. Abrir com a janela estreita (modo mobile).

const CHAVE_SALVO = 'mf1-lab-mao';
const MAX_CARTAS = 13;
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
const CONTROLES = [
    { chave: 'escalaBase', rotulo: 'Escala base', min: 0.4, max: 1.4, passo: 0.01 },
    { chave: 'subida', rotulo: 'Subir/descer (px)', min: -150, max: 200, passo: 1 },
    { chave: 'subidaMaxima', rotulo: 'Subida máx. (px)', min: -150, max: 200, passo: 1 },
    { chave: 'limiarSubida', rotulo: 'Subida máx. em (cartas)', min: 1, max: MAX_CARTAS, passo: 1 },
    { chave: 'anguloBase', rotulo: 'Ângulo entre cartas', min: 0, max: 20, passo: 0.5 },
    { chave: 'deslocamentoBase', rotulo: 'Distância entre cartas', min: 10, max: 120, passo: 1 },
    { chave: 'deslocamentoMinimo', rotulo: 'Distância mínima', min: 0, max: 80, passo: 1 },
    { chave: 'limiar', rotulo: 'Limiar (cartas)', min: 1, max: MAX_CARTAS, passo: 1 },
    { chave: 'encolhimentoPorCarta', rotulo: 'Encolhe por carta', min: 0, max: 0.1, passo: 0.005 },
    { chave: 'escalaMinima', rotulo: 'Escala mínima', min: 0.3, max: 1, passo: 0.01 },
    { chave: 'larguraMaxima', rotulo: 'Largura máx. (fração)', min: 0.3, max: 1.3, passo: 0.01 },
    { chave: 'aberturaMaxima', rotulo: 'Abertura máx. (graus)', min: 0, max: 120, passo: 1 },
    { chave: 'escalaForaDaVez', rotulo: 'Escala fora da vez', min: 0.4, max: 1, passo: 0.01 },
    { chave: 'larguraCarta', rotulo: 'Largura da carta (px)', min: 50, max: 250, passo: 1 },
];
const ESTADOS_VEZ = [
    { id: 'fora', rotulo: 'Fora da vez' },
    { id: 'jogar', rotulo: 'Sua vez' },
    { id: 'apostar', rotulo: 'Apostando' },
];

function carregarSalvo() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_SALVO));
        if (salvo && typeof salvo === 'object') return { ...MAO_REATIVA_MOBILE, ...salvo };
    } catch { /* sem armazenamento: começa do arquivo */ }
    return { ...MAO_REATIVA_MOBILE };
}

function formatar(valor, passo) {
    const casas = passo >= 1 ? 0 : String(passo).split('.')[1].length;
    return Number(valor).toFixed(casas);
}

export default function LabMao({ onVoltar }) {
    const mobile = useModoMobile();
    const [ajustes, setAjustes] = useState(carregarSalvo);
    const [cartas, setCartas] = useState([]);
    const [estadoVez, setEstadoVez] = useState('jogar');
    const [painelAberto, setPainelAberto] = useState(true);
    const [copiado, setCopiado] = useState(false);
    const [largura, setLargura] = useState(window.innerWidth);
    const [lancamento, setLancamento] = useState(0);
    const [fantasma] = useState(() => ({
        hue: Math.random() * 360,
        chapeu: CHAPEUS_COM_ID[Math.floor(Math.random() * CHAPEUS_COM_ID.length)],
    }));
    const textoRef = useRef(null);
    const proximoIdRef = useRef(0);
    const timerCopiadoRef = useRef(null);

    function novaCarta() {
        return {
            id: ++proximoIdRef.current,
            rank: RANKS[Math.floor(Math.random() * RANKS.length)],
            naipe: NAIPES[Math.floor(Math.random() * NAIPES.length)],
        };
    }

    function definirQuantidade(q) {
        setCartas((atual) => (q <= atual.length
            ? atual.slice(0, q)
            : [...atual, ...Array.from({ length: q - atual.length }, novaCarta)]));
    }

    useEffect(() => {
        definirQuantidade(9);
        const medir = () => setLargura(window.innerWidth);
        window.addEventListener('resize', medir);
        return () => {
            window.removeEventListener('resize', medir);
            clearTimeout(timerCopiadoRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mão inicial uma vez só
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(CHAVE_SALVO, JSON.stringify(ajustes));
        } catch { /* sem armazenamento: o código do painel continua valendo */ }
    }, [ajustes]);

    const codigo = gerarCodigoMao(ajustes);

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

    // Leitura do layout de agora (a mão se ancora na tela inteira, então a
    // largura disponível é a da janela) e a escala pra cada quantidade.
    const escalaVez = estadoVez === 'fora' ? ajustes.escalaForaDaVez : 1;
    const atual = calcularLayoutMao(cartas.length, largura, ajustes);
    const larguraLeque = Math.max(0, cartas.length - 1) * atual.deslocamento + ajustes.larguraCarta * atual.escala * escalaVez;
    const porQuantidade = Array.from({ length: MAX_CARTAS }, (_, i) => ({ q: i + 1, ...calcularLayoutMao(i + 1, largura, ajustes) }));

    return (
        <div className="mesa-exp-tela mf1 mf1-mobile mf1-lab-mao">
            <div className="mesa-exp-mesa" />
            <SuaMaoEmLeque
                cartas={cartas}
                onJogar={(carta) => {
                    setCartas((atuais) => atuais.filter((c) => c.id !== carta.id));
                    setLancamento((v) => v + 1);
                }}
                naVez={estadoVez === 'jogar'}
                apostando={estadoVez === 'apostar'}
                onApostar={estadoVez === 'apostar' ? () => {} : undefined}
                ajustes={ajustes}
            />
            <SeuFantasminha
                hue={fantasma.hue}
                chapeu={fantasma.chapeu}
                danoVersao={0}
                estadoMorte={null}
                pensando={estadoVez !== 'fora'}
                quantidade={cartas.length}
                lancamento={lancamento}
                mobile
            />
            <div className="mf1-lab-faixa-baixo">timer + fichas + vida</div>

            {painelAberto ? (
                <div className="mf1-lab-painel mf1-lab-painel-topo">
                    <div className="mf1-lab-linha">
                        <span className="mf1-lab-rotulo">Cartas</span>
                        <input type="range" min="1" max={MAX_CARTAS} step="1" value={cartas.length || 1} onChange={(e) => definirQuantidade(Number(e.target.value))} />
                        <span className="mf1-lab-valor">{cartas.length}</span>
                        <button type="button" className="mf1-lab-btn" onClick={() => setCartas(Array.from({ length: cartas.length || 1 }, novaCarta))}>Embaralhar</button>
                    </div>
                    <div className="mf1-lab-linha">
                        {ESTADOS_VEZ.map((e) => (
                            <button key={e.id} type="button" className={`mf1-lab-btn${estadoVez === e.id ? ' mf1-lab-btn-ativo' : ''}`} onClick={() => setEstadoVez(e.id)}>
                                {e.rotulo}
                            </button>
                        ))}
                    </div>
                    <div className="mf1-lab-leitura">
                        escala {(atual.escala * escalaVez).toFixed(2)} · subida {atual.subida.toFixed(0)}px · ângulo {atual.angulo.toFixed(1)}° · distância {atual.deslocamento.toFixed(0)}px · leque {larguraLeque.toFixed(0)} de {largura}px
                    </div>
                    <div className="mf1-lab-tabela">
                        {porQuantidade.map((l) => (
                            <span key={l.q} className={l.q === cartas.length ? 'mf1-lab-tabela-atual' : ''}>
                                {l.q}: {l.escala.toFixed(2)} / {l.deslocamento.toFixed(0)} / {l.subida.toFixed(0)}
                            </span>
                        ))}
                    </div>
                    <div className="mf1-lab-nota">tabela: cartas: escala / distância / subida (na sua vez). Clique numa carta pra jogar.</div>
                    {CONTROLES.map((c) => (
                        <div key={c.chave} className="mf1-lab-controle">
                            <span className="mf1-lab-controle-rotulo">{c.rotulo}</span>
                            <input
                                type="range"
                                min={c.min}
                                max={c.max}
                                step={c.passo}
                                value={ajustes[c.chave]}
                                onChange={(e) => setAjustes((a) => ({ ...a, [c.chave]: Number(e.target.value) }))}
                            />
                            <span className="mf1-lab-valor">{formatar(ajustes[c.chave], c.passo)}</span>
                        </div>
                    ))}
                    {!mobile && <div className="mf1-lab-aviso">Janela larga: estreite pra ≤639px pra ver como no celular.</div>}
                    <textarea ref={textoRef} className="mf1-lab-codigo" readOnly value={codigo} onFocus={(e) => e.target.select()} />
                    <div className="mf1-lab-linha">
                        <button type="button" className="mf1-lab-btn mf1-lab-btn-ativo" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar'}</button>
                        <button type="button" className="mf1-lab-btn" onClick={() => setAjustes({ ...MAO_REATIVA_MOBILE })}>Restaurar</button>
                        <button type="button" className="mf1-lab-btn" onClick={() => setPainelAberto(false)}>Esconder</button>
                        <button type="button" className="mf1-lab-btn" onClick={onVoltar}>Voltar</button>
                    </div>
                </div>
            ) : (
                <button type="button" className="mf1-lab-btn mf1-lab-abrir mf1-lab-abrir-topo" onClick={() => setPainelAberto(true)}>Lab</button>
            )}
        </div>
    );
}
