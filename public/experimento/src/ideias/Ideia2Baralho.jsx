import { useState } from 'react';

const NAIPES = ['♠', '♥', '♦', '♣'];

// Ideia: mesa de baralho. Um leque de cartas viradas pra baixo atrás do
// painel (só decoração, `aria-hidden`) e o painel principal desenhado como
// uma carta virada pra cima, com os cantos marcados feito carta de baralho
// de verdade.
export default function Ideia2Baralho({ nome }) {
    const [enviando, setEnviando] = useState(false);

    function continuar(evento) {
        evento.preventDefault();
        setEnviando(true);
        setTimeout(() => setEnviando(false), 600);
    }

    return (
        <div className="ideia2-mesa">
            <div className="ideia2-leque" aria-hidden="true">
                {NAIPES.map((naipe, i) => {
                    const deslocamento = i - (NAIPES.length - 1) / 2; // -1.5, -0.5, 0.5, 1.5
                    return (
                        <span
                            key={naipe}
                            className="ideia2-carta-fundo"
                            style={{ transform: `rotate(${deslocamento * 10}deg) translateY(${Math.abs(deslocamento) * 6}px)` }}
                        >
                            🂠
                        </span>
                    );
                })}
            </div>
            <form className="ideia2-carta" onSubmit={continuar}>
                <span className="ideia2-canto ideia2-canto-topo" aria-hidden="true">A♣</span>
                <span className="ideia2-canto ideia2-canto-base" aria-hidden="true">A♣</span>
                <h1 className="ideia2-titulo">
                    Contra <span className="ideia2-naipe">♣</span>ZAP<span className="ideia2-naipe">♠</span>
                </h1>
                <label>
                    Nome do jogador
                    <input value={nome} readOnly maxLength={24} />
                </label>
                <button type="submit" disabled={enviando} className="ideia2-botao">
                    {enviando ? 'Embaralhando...' : 'Sentar na mesa'}
                </button>
            </form>
        </div>
    );
}
