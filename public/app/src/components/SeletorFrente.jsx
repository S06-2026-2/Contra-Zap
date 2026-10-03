import Casca from './arcade/Casca.jsx';

const CHAVE_FRENTE = 'contrazap-frente';

// Escolha fica no localStorage (por navegador/aba, não pelo servidor) —
// cada pessoa escolhe o front que quiser sem afetar quem mais está
// conectado: as frentes falam todas com o mesmo socket.js/sessao.js, então
// alguém no "novo", no "meetfront1", no "arcade" e no "debugging" jogam na
// mesma sala normalmente.
const FRENTES_VALIDAS = ['novo', 'meetfront1', 'arcade', 'debugging'];

// Sem escolha salva (primeira visita, aba privada) abre direto na arcade —
// o seletor só aparece quando alguém pede pelo botão 🔄 FRONT.
export const FRENTE_PADRAO = 'arcade';

export function lerFrenteSalva() {
    try {
        const valor = localStorage.getItem(CHAVE_FRENTE);
        return FRENTES_VALIDAS.includes(valor) ? valor : FRENTE_PADRAO;
    } catch {
        return FRENTE_PADRAO;
    }
}

export function salvarFrente(frente) {
    try {
        localStorage.setItem(CHAVE_FRENTE, frente);
    } catch {
        // sem localStorage (aba privada etc.) volta pro padrão no próximo F5
    }
}

const OPCOES = [
    {
        id: 'arcade',
        icone: '👾',
        nome: 'ARCADE',
        desc: 'Pixel, chiptune e duelos de manilha animados na mesa.',
        tags: ['PIXEL', 'SOM', 'FILTRO CRT'],
        cor: '#ff4b3e',
        botao: 'az-btn-vermelho',
    },
    {
        id: 'novo',
        icone: '✨',
        nome: 'NOVO',
        desc: 'Login e salas da arcade, com a mesa nova (em construção) em toda partida.',
        tags: ['EM OBRAS'],
        cor: '#f5c451',
        botao: 'az-btn-amarelo',
    },
    {
        id: 'meetfront1',
        icone: '🤝',
        nome: 'MEETFRONT1',
        desc: 'Mesa do NOVO com as mudanças combinadas no encontro com o grupo.',
        tags: ['EM OBRAS', 'FEEDBACK'],
        cor: '#3d9be9',
        botao: 'az-btn-azul',
    },
    {
        id: 'debugging',
        icone: '🐞',
        nome: 'DEBUGGING',
        desc: 'Interface crua, com log de eventos, pra testar o protocolo.',
        tags: ['DEV'],
        cor: '#8d93a6',
        botao: 'az-btn-cinza',
    },
];

// Tela de trocar de front, sempre na casca arcade (é a frente padrão).
// Não mexe em sessão nem sala — ver trocarFrente no App.jsx.
export default function SeletorFrente({ atual, onEscolher, onVoltar, conectado }) {
    function escolher(frente) {
        salvarFrente(frente);
        onEscolher(frente);
    }

    return (
        <Casca conectado={conectado}>
            <div className="az-tela az-tela-frente" data-screen-label="Escolher front">
                <div className="az-login-cabeca">
                    <div className="az-px az-login-titulo">CONTRA<br />ZAP</div>
                    <div className="az-sub">Escolha a cara do jogo — dá pra trocar quando quiser.</div>
                </div>

                <div className="az-grade-frentes">
                    {OPCOES.map((op) => {
                        const ehAtual = op.id === atual;
                        return (
                            <div
                                key={op.id}
                                className={`az-frente${ehAtual ? ' az-ativo' : ''}`}
                                style={{ '--cor-frente': op.cor }}
                            >
                                <div className="az-sala-topo">
                                    <span className="az-frente-icone">{op.icone}</span>
                                    <div className="az-px az-sala-nome">{op.nome}</div>
                                    {ehAtual && <div className="az-px az-sala-vagas az-frente-atual">ATUAL</div>}
                                </div>
                                <div className="az-texto az-cresce">{op.desc}</div>
                                <div className="az-tags">
                                    {op.tags.map((t) => <span key={t} className="az-px az-tag">{t}</span>)}
                                </div>
                                <button
                                    type="button"
                                    className={`az-b az-px az-btn az-btn-p ${op.botao}`}
                                    onClick={() => escolher(op.id)}
                                >
                                    {ehAtual ? 'CONTINUAR' : 'USAR ESTE'}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {onVoltar && (
                    <button type="button" data-som="aba" className="az-b az-btn-fantasma az-frente-voltar" onClick={onVoltar}>
                        Voltar
                    </button>
                )}
            </div>
        </Casca>
    );
}
