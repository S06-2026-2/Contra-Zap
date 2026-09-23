const CHAVE_FRENTE = 'contrazap-frente';

// Escolha fica no localStorage (por navegador/aba, não pelo servidor) —
// cada pessoa escolhe o front que quiser sem afetar quem mais está
// conectado: as três frentes falam com o mesmo socket.js/sessao.js, então
// alguém no "novo", no "arcade" e no "debugging" jogam na mesma sala normalmente.
const FRENTES_VALIDAS = ['novo', 'arcade', 'debugging'];

export function lerFrenteSalva() {
    try {
        const valor = localStorage.getItem(CHAVE_FRENTE);
        return FRENTES_VALIDAS.includes(valor) ? valor : null;
    } catch {
        return null;
    }
}

export function salvarFrente(frente) {
    try {
        localStorage.setItem(CHAVE_FRENTE, frente);
    } catch {
        // sem localStorage (aba privada etc.) só volta a perguntar no próximo F5
    }
}

export default function SeletorFrente({ onEscolher }) {
    function escolher(frente) {
        salvarFrente(frente);
        onEscolher(frente);
    }

    return (
        <div className="cartao">
            <h1>Contra ZAP</h1>
            <p>Qual front você quer usar?</p>
            <div className="botoes">
                <button type="button" onClick={() => escolher('novo')}>✨ Novo</button>
                <button type="button" onClick={() => escolher('arcade')}>👾 Arcade</button>
                <button type="button" className="secundario" onClick={() => escolher('debugging')}>
                    🐞 Debugging
                </button>
            </div>
        </div>
    );
}
