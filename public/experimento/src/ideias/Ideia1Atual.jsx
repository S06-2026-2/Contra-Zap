import { useState } from 'react';

// Referência: reproduz a etapa de nome do Login.jsx de verdade (mesmo
// visual do app hoje), só que com `nome` fixo e sem `chamar()` nenhum — serve
// pra comparar lado a lado com as outras ideias sem precisar alternar de aba
// pro app de verdade.
export default function Ideia1Atual({ nome }) {
    const [enviando, setEnviando] = useState(false);

    function continuar(evento) {
        evento.preventDefault();
        setEnviando(true);
        setTimeout(() => setEnviando(false), 600);
    }

    return (
        <form className="ideia1-cartao" onSubmit={continuar}>
            <h1>Contra ZAP</h1>
            <label>
                Nome
                <input value={nome} readOnly maxLength={24} />
            </label>
            <div className="ideia1-botoes">
                <button type="submit" disabled={enviando}>
                    {enviando ? 'Continuar...' : 'Continuar'}
                </button>
            </div>
        </form>
    );
}
