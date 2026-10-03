import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BARRA_FICHAS_PADRAO, BarraFichas, MedalhaoVida, SuaMaoEmLeque, posicaoVagaFicha } from './MesaExperimento.jsx';
import { DanosDaMesa } from './MesaDanificada.jsx';
import Carta from './Carta.jsx';
import Ficha from './Ficha.jsx';
import { MAO_REATIVA_PADRAO } from './maoReativa.js';

// Laboratório da mão reativa (aberto pelo botão "🃏 MÃO" do Login): a tela
// da mesa do meetfront1 em tamanho real, só com a mesa vazia, a barra de
// fichas, os seus corações e a SUA mão — pra ver onde o leque bate em cada
// coisa. O painel fica por cima, à esquerda (dá pra esconder), com botões
// pra pôr/tirar cartas da mão, pôr fichas (com ou sem a carta de vaza
// ganha embaixo) na barra, trocar o momento (fora da vez / jogar /
// apostar) e um slider pra cada número de maoReativa.js e da barra
// (BARRA_FICHAS_PADRAO em MesaExperimento.jsx). Os valores saem prontos
// pra colar. A barra tem tantas vagas quanto o maior entre cartas na mão e
// itens na barra (na partida é `cartasRodada`). Tudo local, sem socket
// nenhum.

const MAX_CARTAS = 40;
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
// Bate com DURACAO_SAIDA_MAO_MS (animação .mesa-exp-sua-mao-carta-saindo).
const DURACAO_SAIDA_MS = 220;

const SLIDERS = [
    { chave: 'limiar', rotulo: 'Cartas sem mudança', min: 1, max: 15, passo: 1, formatar: (v) => `até ${v}` },
    { chave: 'encolhimentoPorCarta', rotulo: 'Encolhe por carta extra', min: 0, max: 0.1, passo: 0.005, formatar: (v) => `${(v * 100).toFixed(1)}%` },
    { chave: 'escalaMinima', rotulo: 'Tamanho mínimo', min: 0.3, max: 1, passo: 0.05, formatar: (v) => `${v.toFixed(2)}x` },
    { chave: 'larguraMaxima', rotulo: 'Largura máxima do leque', min: 0.2, max: 1, passo: 0.05, formatar: (v) => `${Math.round(v * 100)}% da tela` },
    { chave: 'aberturaMaxima', rotulo: 'Abertura máxima', min: 20, max: 140, passo: 5, formatar: (v) => `${v}°` },
    { chave: 'escalaForaDaVez', rotulo: 'Tamanho fora da vez', min: 0.5, max: 1, passo: 0.05, formatar: (v) => `${v.toFixed(2)}x` },
];

const SLIDERS_BARRA = [
    { chave: 'largura', rotulo: 'Largura da barra', min: 300, max: 900, passo: 10, formatar: (v) => `${v}px` },
    { chave: 'espacoVaga', rotulo: 'Distância entre fichas', min: 30, max: 90, passo: 1, formatar: (v) => `${v}px` },
];

const MOMENTOS = [
    { chave: 'fora', rotulo: 'Fora da vez' },
    { chave: 'jogar', rotulo: 'Vez de jogar' },
    { chave: 'apostar', rotulo: 'Vez de apostar' },
];

function cartaAleatoria() {
    return {
        rank: RANKS[Math.floor(Math.random() * RANKS.length)],
        naipe: NAIPES[Math.floor(Math.random() * NAIPES.length)],
    };
}

function GrupoSliders({ sliders, valores, onMudar }) {
    return sliders.map(({ chave, rotulo, min, max, passo, formatar }) => (
        <div key={chave} className="vitrine-grupo">
            <div className="vitrine-rotulo">{rotulo}: {formatar(valores[chave])}</div>
            <input
                type="range"
                className="vitrine-slider"
                min={min}
                max={max}
                step={passo}
                value={valores[chave]}
                onChange={(e) => onMudar({ ...valores, [chave]: Number(e.target.value) })}
            />
        </div>
    ));
}

function blocoCodigo(nome, valores) {
    return `export const ${nome} = {\n${Object.entries(valores).map(([k, v]) => `    ${k}: ${Number(v.toFixed(3))},`).join('\n')}\n};`;
}

export default function LabMao({ onVoltar }) {
    const [cartas, setCartas] = useState([]);
    const [idSaindo, setIdSaindo] = useState(null);
    const [momento, setMomento] = useState('fora');
    const [ajustes, setAjustes] = useState(MAO_REATIVA_PADRAO);
    const [painelAberto, setPainelAberto] = useState(true);
    const [ajustesBarra, setAjustesBarra] = useState(BARRA_FICHAS_PADRAO);
    // Cada item da barra é uma vaga ocupada: ficha (aposta) e/ou carta de
    // vaza ganha pousada embaixo dela.
    const [barra, setBarra] = useState([]);
    const [ancoraBarra, setAncoraBarra] = useState(null);
    const caixaCoracoesRef = useRef(null);
    const caixaFichasRef = useRef(null);
    const proximoIdRef = useRef(0);
    const timersRef = useRef([]);

    useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

    // Canto de cima à esquerda da barra na tela — as fichas e cartas
    // pousadas são position:fixed, igual na partida.
    useLayoutEffect(() => {
        function medir() {
            const rect = caixaFichasRef.current?.getBoundingClientRect();
            if (rect) setAncoraBarra({ x: rect.left, y: rect.top });
        }
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);

    function adicionarNaBarra(ficha, comCarta) {
        setBarra((atual) => (atual.length >= MAX_CARTAS ? atual : [
            ...atual,
            { id: `lab-barra-${proximoIdRef.current++}`, ficha, carta: comCarta ? cartaAleatoria() : null },
        ]));
    }

    function adicionar(quantas) {
        setCartas((atuais) => {
            const novas = [];
            for (let i = 0; i < quantas && atuais.length + novas.length < MAX_CARTAS; i++) {
                novas.push({ id: `lab-${proximoIdRef.current++}`, ...cartaAleatoria() });
            }
            return [...atuais, ...novas];
        });
    }

    // Clicar numa carta "joga": sai pelo mesmo caminho da mesa de verdade.
    function jogar(carta) {
        if (idSaindo) return;
        setIdSaindo(carta.id);
        timersRef.current.push(setTimeout(() => {
            setCartas((atuais) => atuais.filter((c) => c.id !== carta.id));
            setIdSaindo(null);
        }, DURACAO_SAIDA_MS));
    }

    const vagas = Math.max(cartas.length, barra.length, 1);
    const codigo = `${blocoCodigo('MAO_REATIVA_PADRAO', ajustes)}\n\n${blocoCodigo('BARRA_FICHAS_PADRAO', ajustesBarra)}`;

    return (
        <div className="mesa-exp-tela mf1">
            <div className="mesa-exp-mesa">
                <DanosDaMesa danos={[]} desgasteAtual={0} />
                {cartas.length === 0 && <span className="mf1-lab-vazio">Põe umas cartas aí ←</span>}
            </div>

            <MedalhaoVida
                caixaRef={caixaCoracoesRef}
                prazo={null}
                destaque={false}
                vida={3}
                assentoIndice={0}
                registrarRef={() => {}}
                coracaoImpactado={null}
            />

            <SuaMaoEmLeque
                cartas={cartas}
                idSaindo={idSaindo}
                onJogar={jogar}
                naVez={momento === 'jogar'}
                apostando={momento === 'apostar'}
                onApostar={() => setMomento('fora')}
                ajustes={ajustes}
            />

            <BarraFichas
                caixaRef={caixaFichasRef}
                podeApostar={momento === 'apostar'}
                aposta={null}
                ajustes={ajustesBarra}
            />

            {ancoraBarra && barra.map((item, i) => {
                const vaga = posicaoVagaFicha(i, vagas, ajustesBarra);
                const pos = { left: `${ancoraBarra.x + vaga.x}px`, top: `${ancoraBarra.y + vaga.y}px` };
                return (
                    <div key={item.id}>
                        {item.carta && (
                            <div className="mesa-exp-carta-vaza-ganha mesa-exp-carta-vaza-ganha-voce" style={pos}>
                                <Carta rank={item.carta.rank} naipe={item.carta.naipe} />
                            </div>
                        )}
                        {item.ficha && (
                            <div className="mesa-exp-aposta-ficha-canto" style={pos}>
                                <Ficha />
                            </div>
                        )}
                    </div>
                );
            })}

            {!painelAberto && (
                <button type="button" className="vitrine-btn mf1-lab-abrir" onClick={() => setPainelAberto(true)}>⚙ Painel</button>
            )}
            {painelAberto && (
            <aside className="vitrine-painel mf1-lab-painel">
                <div className="vitrine-linha">
                    <button type="button" className="vitrine-btn vitrine-voltar" onClick={onVoltar}>← Voltar</button>
                    <button type="button" className="vitrine-btn" onClick={() => setPainelAberto(false)}>Esconder</button>
                </div>
                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Cartas na mão: {cartas.length}</div>
                    <div className="vitrine-linha">
                        <button type="button" className="vitrine-btn" onClick={() => setCartas((c) => c.slice(0, -1))} disabled={cartas.length === 0}>− 1</button>
                        <button type="button" className="vitrine-btn" onClick={() => adicionar(1)} disabled={cartas.length >= MAX_CARTAS}>+ 1</button>
                        <button type="button" className="vitrine-btn" onClick={() => adicionar(5)} disabled={cartas.length >= MAX_CARTAS}>+ 5</button>
                    </div>
                    <button type="button" className="vitrine-btn" onClick={() => setCartas([])} disabled={cartas.length === 0}>Limpar mão</button>
                </div>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Na barra: {barra.length} ({vagas} vagas)</div>
                    <button type="button" className="vitrine-btn" onClick={() => adicionarNaBarra(true, true)} disabled={barra.length >= MAX_CARTAS}>+ Ficha com carta</button>
                    <button type="button" className="vitrine-btn" onClick={() => adicionarNaBarra(true, false)} disabled={barra.length >= MAX_CARTAS}>+ Só ficha</button>
                    <button type="button" className="vitrine-btn" onClick={() => adicionarNaBarra(false, true)} disabled={barra.length >= MAX_CARTAS}>+ Só carta</button>
                    <div className="vitrine-linha">
                        <button type="button" className="vitrine-btn" onClick={() => setBarra((b) => b.slice(0, -1))} disabled={barra.length === 0}>− 1</button>
                        <button type="button" className="vitrine-btn" onClick={() => setBarra([])} disabled={barra.length === 0}>Limpar</button>
                    </div>
                </div>

                <GrupoSliders sliders={SLIDERS_BARRA} valores={ajustesBarra} onMudar={setAjustesBarra} />

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Momento</div>
                    {MOMENTOS.map(({ chave, rotulo }) => (
                        <button
                            key={chave}
                            type="button"
                            className={`vitrine-btn${momento === chave ? ' vitrine-btn-ligado' : ''}`}
                            onClick={() => setMomento(chave)}
                        >
                            {rotulo}
                        </button>
                    ))}
                </div>

                <GrupoSliders sliders={SLIDERS} valores={ajustes} onMudar={setAjustes} />

                <div className="vitrine-grupo">
                    <button type="button" className="vitrine-btn" onClick={() => { setAjustes(MAO_REATIVA_PADRAO); setAjustesBarra(BARRA_FICHAS_PADRAO); }}>Voltar ao padrão</button>
                    <div className="vitrine-rotulo">Colar em maoReativa.js / MesaExperimento.jsx</div>
                    <pre className="mf1-lab-codigo">{codigo}</pre>
                </div>
            </aside>
            )}
        </div>
    );
}
