import { useState } from 'react';

// Ideia: editorial/minimalista, no espírito do Pokémon Showdown que já
// inspirou o fluxo em etapas do Login.jsx (ver comentário lá) — mas levado
// mais longe no visual: sem "cartão", tipografia enorme carregando o peso
// da tela, input só com sublinhado, botão como link.
export default function Ideia4Editorial({ nome }) {
    const [enviando, setEnviando] = useState(false);

    function continuar(evento) {
        evento.preventDefault();
        setEnviando(true);
        setTimeout(() => setEnviando(false), 600);
    }

    return (
        <form className="ideia4-pagina" onSubmit={continuar}>
            <span className="ideia4-eyebrow">contra zap</span>
            <h1 className="ideia4-titulo">Olá, quem é você?</h1>
            <input value={nome} readOnly maxLength={24} className="ideia4-input" />
            <button type="submit" disabled={enviando} className="ideia4-botao">
                {enviando ? 'um instante…' : 'continuar →'}
            </button>
        </form>
    );
}
