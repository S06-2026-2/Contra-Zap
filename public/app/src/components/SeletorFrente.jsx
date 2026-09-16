const CHAVE_FRENTE = 'contrazap-frente';

// Escolha fica no localStorage (por navegador/aba, não pelo servidor) —
// cada pessoa escolhe o front que quiser sem afetar quem mais está
// conectado: as duas frentes falam com o mesmo socket.js/sessao.js, então
// alguém no "novo" e alguém no "debugging" jogam na mesma sala normalmente.
export function lerFrenteSalva() {
    try {
        const valor = localStorage.getItem(CHAVE_FRENTE);
        return valor === 'novo' || valor === 'debugging' ? valor : null;
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

export default function SeletorFrente({ onEscolher, onAbrirExperimento }) {
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
                <button type="button" className="secundario" onClick={() => escolher('debugging')}>
                    🐞 Debugging
                </button>
            </div>
            {/* Não é uma "frente" de verdade (não tem Login/Lobby/Partida, não
                mexe em sessão/sala) — só um atalho pra ver o sandbox de
                layout da mesa (ver components/novo/MesaExperimento.jsx)
                rodando sem precisar editar código. */}
            {onAbrirExperimento && (
                <div className="botoes">
                    <button type="button" className="secundario" onClick={onAbrirExperimento}>
                        🃏 Experimento: mesa
                    </button>
                </div>
            )}
        </div>
    );
}
