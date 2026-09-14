import { useState } from 'react';

// Ideia: arcade dos anos 80 — fundo bem escuro, título com glow pulsante,
// scanlines por cima (mesmo truque do `.fx-scanlines` do app de verdade,
// só que fixo aqui, sem painel de ligar/desligar).
export default function Ideia3Neon({ nome }) {
    const [enviando, setEnviando] = useState(false);

    function continuar(evento) {
        evento.preventDefault();
        setEnviando(true);
        setTimeout(() => setEnviando(false), 600);
    }

    return (
        <div className="ideia3-arcade">
            <div className="ideia3-scanlines" aria-hidden="true" />
            <form className="ideia3-painel" onSubmit={continuar}>
                <h1 className="ideia3-titulo">CONTRA ZAP</h1>
                <p className="ideia3-subtitulo">INSIRA SEU NOME PRA JOGAR</p>
                <label>
                    <input value={nome} readOnly maxLength={24} className="ideia3-input" />
                </label>
                <button type="submit" disabled={enviando} className="ideia3-botao">
                    {enviando ? '⟩ CARREGANDO ⟨' : '⟩ CONTINUAR ⟨'}
                </button>
            </form>
        </div>
    );
}
