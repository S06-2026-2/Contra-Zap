import { useEffect, useRef, useState } from 'react';
import Fantasminha, { TIPOS_PENSAMENTO } from './Fantasminha.jsx';
import { MaoEmLeque } from './MesaExperimento.jsx';
import { CHAPEUS_COM_ID } from '../../chapeus.js';

// Vitrine de estudo do design do fantasminha (aberta pelo botão do Login):
// um fantasminha só, grande no meio da tela, e na esquerda um botão pra
// cada coisa que mexe na aparência/animação dele — cor, chapéu, cartas na
// mão, dano, morte e os estados de mesa (vez, hover, bot). Tudo local, sem
// socket nenhum.

const MAX_CARTAS = 7;
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
// Mesmos tempos da morte na mesa (MORTE_IMPACTO_MS/MORTE_DESINTEGRAR_MS em
// MesaExperimento.jsx).
const MORTE_IMPACTO_MS = 1500;
const MORTE_DESINTEGRAR_MS = 900;

function cartaAleatoria() {
    return {
        rank: RANKS[Math.floor(Math.random() * RANKS.length)],
        naipe: NAIPES[Math.floor(Math.random() * NAIPES.length)],
    };
}

export default function VitrineFantasminha({ onVoltar }) {
    const [hue, setHue] = useState(() => Math.random() * 360);
    // -1 = sem chapéu; senão índice em CHAPEUS_COM_ID.
    const [indiceChapeu, setIndiceChapeu] = useState(0);
    const [cartas, setCartas] = useState([]);
    const [reveladas, setReveladas] = useState(false);
    const [danoVersao, setDanoVersao] = useState(0);
    const [estadoMorte, setEstadoMorte] = useState(null);
    // Fantasminha sorteia partículas/onda/fase uma vez só no mount — reviver
    // monta um novo (key) pra morrer de novo do zero.
    const [vida, setVida] = useState(0);
    const [naVez, setNaVez] = useState(false);
    const [destacado, setDestacado] = useState(false);
    const [bot, setBot] = useState(false);
    const [pixelado, setPixelado] = useState(false);
    // null = automático (aparece sozinho depois de 10s com "Na vez" ligado).
    const [pensamentoForcado, setPensamentoForcado] = useState(null);
    const timersRef = useRef([]);

    useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

    const chapeu = indiceChapeu >= 0 ? CHAPEUS_COM_ID[indiceChapeu] : null;

    function trocarChapeu(passo) {
        const total = CHAPEUS_COM_ID.length;
        setIndiceChapeu((i) => ((i < 0 ? 0 : i) + passo + total) % total);
    }

    function morrer() {
        if (estadoMorte) return;
        setEstadoMorte('impacto');
        setDanoVersao((v) => v + 1);
        timersRef.current.push(
            setTimeout(() => setEstadoMorte('desintegrando'), MORTE_IMPACTO_MS),
            setTimeout(() => setEstadoMorte('morto'), MORTE_IMPACTO_MS + MORTE_DESINTEGRAR_MS),
        );
    }

    function reviver() {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        setEstadoMorte(null);
        setVida((v) => v + 1);
    }

    return (
        <div className="vitrine-tela">
            <aside className="vitrine-painel">
                <button type="button" className="vitrine-btn vitrine-voltar" onClick={onVoltar}>← Voltar</button>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Cor</div>
                    <input
                        type="range"
                        min="0"
                        max="360"
                        value={Math.round(hue)}
                        onChange={(e) => setHue(Number(e.target.value))}
                        className="vitrine-slider"
                        style={{ '--vitrine-hue': hue }}
                        aria-label="Cor"
                    />
                    <button type="button" className="vitrine-btn" onClick={() => setHue(Math.random() * 360)}>Cor aleatória</button>
                </div>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Chapéu {chapeu ? `#${chapeu.id}` : '(nenhum)'}</div>
                    <div className="vitrine-linha">
                        <button type="button" className="vitrine-btn" onClick={() => trocarChapeu(-1)}>◀</button>
                        <button type="button" className="vitrine-btn" onClick={() => trocarChapeu(1)}>▶</button>
                        <button type="button" className="vitrine-btn" onClick={() => setIndiceChapeu(Math.floor(Math.random() * CHAPEUS_COM_ID.length))}>?</button>
                    </div>
                    <button type="button" className="vitrine-btn" onClick={() => setIndiceChapeu(-1)} disabled={!chapeu}>Tirar chapéu</button>
                </div>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Cartas na mão: {cartas.length}</div>
                    <div className="vitrine-linha">
                        <button type="button" className="vitrine-btn" onClick={() => setCartas((c) => c.slice(0, -1))} disabled={cartas.length === 0}>− Carta</button>
                        <button type="button" className="vitrine-btn" onClick={() => setCartas((c) => [...c, cartaAleatoria()])} disabled={cartas.length >= MAX_CARTAS}>+ Carta</button>
                    </div>
                    <button type="button" className={`vitrine-btn${reveladas ? ' vitrine-btn-ligado' : ''}`} onClick={() => setReveladas((v) => !v)}>
                        Cartas reveladas: {reveladas ? 'ON' : 'OFF'}
                    </button>
                </div>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Estado na mesa</div>
                    <button type="button" className={`vitrine-btn${naVez ? ' vitrine-btn-ligado' : ''}`} onClick={() => setNaVez((v) => !v)}>Na vez / pensando: {naVez ? 'ON' : 'OFF'}</button>
                    <button type="button" className={`vitrine-btn${destacado ? ' vitrine-btn-ligado' : ''}`} onClick={() => setDestacado((v) => !v)}>Hover: {destacado ? 'ON' : 'OFF'}</button>
                    <button type="button" className={`vitrine-btn${bot ? ' vitrine-btn-ligado' : ''}`} onClick={() => setBot((v) => !v)}>Bot: {bot ? 'ON' : 'OFF'}</button>
                    <button type="button" className={`vitrine-btn${pixelado ? ' vitrine-btn-ligado' : ''}`} onClick={() => setPixelado((v) => !v)}>Contorno pixelado: {pixelado ? 'ON' : 'OFF'}</button>
                </div>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Pensamento</div>
                    <button type="button" className={`vitrine-btn${pensamentoForcado == null ? ' vitrine-btn-ligado' : ''}`} onClick={() => setPensamentoForcado(null)}>Automático (10s na vez)</button>
                    {TIPOS_PENSAMENTO.map((tipo) => (
                        <button
                            key={tipo}
                            type="button"
                            className={`vitrine-btn${pensamentoForcado === tipo ? ' vitrine-btn-ligado' : ''}`}
                            onClick={() => setPensamentoForcado(tipo)}
                        >
                            {{ interrogacao: '? ?', engrenagens: 'Engrenagens', lampada: 'Lâmpada' }[tipo]}
                        </button>
                    ))}
                </div>

                <div className="vitrine-grupo">
                    <div className="vitrine-rotulo">Dano</div>
                    <button type="button" className="vitrine-btn vitrine-btn-perigo" onClick={() => setDanoVersao((v) => v + 1)} disabled={estadoMorte != null}>Tomar dano</button>
                    {estadoMorte
                        ? <button type="button" className="vitrine-btn" onClick={reviver}>Reviver</button>
                        : <button type="button" className="vitrine-btn vitrine-btn-perigo" onClick={morrer}>Morrer</button>}
                </div>
            </aside>

            <main className="vitrine-palco">
                {estadoMorte === 'morto' ? (
                    <span className="mesa-exp-assento-eliminado">💀<br />Eliminado</span>
                ) : (
                    <div className="vitrine-escala">
                        <Fantasminha
                            key={vida}
                            destacado={destacado}
                            danoVersao={danoVersao}
                            bot={bot}
                            hue={hue}
                            chapeu={chapeu?.src}
                            ajusteChapeuPct={chapeu?.ajuste ?? 0}
                            naVez={naVez}
                            contornoPixelado={pixelado}
                            pensamentoForcado={pensamentoForcado}
                            estadoMorte={estadoMorte}
                        >
                            <MaoEmLeque quantidade={cartas.length} cartas={reveladas ? cartas : undefined} />
                        </Fantasminha>
                    </div>
                )}
            </main>
        </div>
    );
}
