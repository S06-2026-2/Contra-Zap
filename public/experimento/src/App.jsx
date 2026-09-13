import { useState } from 'react';
import Ideia1Atual from './ideias/Ideia1Atual.jsx';
import Ideia2Baralho from './ideias/Ideia2Baralho.jsx';
import Ideia3Neon from './ideias/Ideia3Neon.jsx';
import Ideia4Editorial from './ideias/Ideia4Editorial.jsx';

// Nome fixo só pra ter algo na tela — nenhuma ideia aqui chama `chamar()`
// nem toca em conexao/*. É playground de layout, não fluxo de verdade.
const NOME_ESTATICO = 'Henrique';

const IDEIAS = [
    { chave: 'atual', rotulo: 'Atual (referência)', Componente: Ideia1Atual },
    { chave: 'baralho', rotulo: 'Baralho', Componente: Ideia2Baralho },
    { chave: 'neon', rotulo: 'Neon arcade', Componente: Ideia3Neon },
    { chave: 'editorial', rotulo: 'Editorial', Componente: Ideia4Editorial },
];

// Casca do playground: uma aba por ideia, cada uma renderiza a tela inicial
// (a etapa de nome do Login.jsx de verdade) do seu próprio jeito. Trocar de
// aba não perde nada porque não tem estado de verdade pra perder — é tudo
// estático.
export default function App() {
    const [ideiaAtiva, setIdeiaAtiva] = useState(IDEIAS[0].chave);
    const { Componente } = IDEIAS.find((i) => i.chave === ideiaAtiva);

    return (
        <div className="experimento-shell">
            <nav className="experimento-abas">
                {IDEIAS.map(({ chave, rotulo }) => (
                    <button
                        key={chave}
                        type="button"
                        className={chave === ideiaAtiva ? 'ativa' : ''}
                        onClick={() => setIdeiaAtiva(chave)}
                    >
                        {rotulo}
                    </button>
                ))}
            </nav>
            <main className="experimento-palco">
                <Componente nome={NOME_ESTATICO} />
            </main>
            <p className="experimento-aviso">
                🎨 playground de layout — nome fixo ("{NOME_ESTATICO}"), nada aqui conecta com o servidor.
            </p>
        </div>
    );
}
