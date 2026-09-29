import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFiltros } from './filtros.js';
import { DefsFiltro, PainelFiltro } from './PainelFiltro.jsx';
import { alternarSom, assinarSom, instalarSomDeClique, somLigado, tocarSom } from './somArcade.js';
import './arcade.css';

// Casca comum das três telas da frente arcade: fundo, barra de cima (logo +
// SOM ON/OFF), faixa de "conexão perdida" e o painel de filtro de tela.
// Cada tela (Login/Lobby/Partida) monta a sua — o que precisa sobreviver à
// troca de tela (som ligado, filtro escolhido) mora fora do React (ver
// somArcade.js e filtros.js).
//
// `conectado` vem do App só pra esta frente (as outras usam o banner-conexao
// global, que o App esconde quando a frente é arcade).
//
// `cheia`: no celular a tela ocupa exatamente a altura da janela, sem
// rolagem de página (a mesa — ver .az-app-cheia em arcade.css).
export default function Casca({ conectado = true, direita, cheia = false, children }) {
    const f = useFiltros();
    const ligado = useSyncExternalStore(assinarSom, somLigado);
    const [filtroAberto, setFiltroAberto] = useState(false);
    const alternarFiltro = () => setFiltroAberto((a) => !a);

    // O index.css prende o #root numa coluna de 720px com padding — a frente
    // arcade ocupa a largura toda e desenha o próprio fundo.
    useEffect(() => {
        document.body.classList.add('az-body');
        return () => document.body.classList.remove('az-body');
    }, []);

    useEffect(() => instalarSomDeClique(), []);

    const estavaConectado = useRef(conectado);
    useEffect(() => {
        if (estavaConectado.current && !conectado) tocarSom('erro');
        estavaConectado.current = conectado;
    }, [conectado]);

    return (
        <>
            <DefsFiltro f={f} />
            <div
                className={`az-raiz az-app${cheia ? ' az-app-cheia' : ''}`}
                style={{
                    filter: f.filtroCss || undefined,
                    transform: f.overscan !== 1 ? `scale(${f.overscan})` : undefined,
                }}
            >
                <div className="az-fixo-topo">
                    <div className="az-topo">
                        <div className="az-px az-logo">CONTRA ZAP</div>
                        <div className="az-topo-dir">
                            {direita}
                            {/* Só no celular (ver arcade.css): lá o painel de filtro
                                recolhido some do canto da tela, que é onde fica a mão. */}
                            <button
                                type="button"
                                className={`az-b az-px az-topo-btn az-topo-filtro${filtroAberto ? ' az-ativo' : ''}`}
                                onClick={alternarFiltro}
                                aria-expanded={filtroAberto}
                                aria-label="Filtro de tela"
                                title="Filtro de tela"
                            >
                                FX
                            </button>
                            <button
                                type="button"
                                data-som="mudo"
                                className={`az-b az-px az-som${ligado ? ' az-ativo' : ''}`}
                                onClick={alternarSom}
                                title={ligado ? 'Som ligado' : 'Som desligado'}
                            >
                                <span className="az-som-quadrado" />
                                <span className="az-rotulo-largo">SOM </span>{ligado ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>
                    {!conectado && (
                        <div className="az-queda">
                            <span className="az-queda-bolinha" />
                            <span className="az-px">CONEXÃO PERDIDA — TENTANDO RECONECTAR</span>
                        </div>
                    )}
                </div>
                {children}
                {f.scanlines > 0 && (
                    <div className="az-scanlines" style={{ background: f.scanlineBg, opacity: f.scanlineOp }} />
                )}
            </div>
            <PainelFiltro f={f} aberto={filtroAberto} onAlternar={alternarFiltro} />
        </>
    );
}
