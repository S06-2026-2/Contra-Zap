import { useEffect, useState } from 'react';
import { chamar } from '../../socket.js';
import Casca from './Casca.jsx';
import Modal from './Modal.jsx';
import { guardarInfoSala } from './salasInfo.js';
import { tocarSom } from './somArcade.js';
import { corDoAssento } from './tema.js';

const INTERVALO_ATUALIZACAO_MS = 10_000;

const OPCOES_JOGADORES = [2, 3, 4, 5, 6];
const OPCOES_CARTAS = [1, 2, 3, 4, 5];

// Lista de salas + criar sala (duas "vistas" da mesma tela) + reconexão
// numa partida em andamento. A lógica de entrada (JA_EM_PARTIDA, sala
// privada com senha, reconectar/desistir) é a mesma do novo/Lobby.jsx —
// só a casca visual é arcade.
export default function Lobby({ meuNome, salaParaReconectar, onEntrouNaSala, onReconectou, onTrocarFrente, conectado }) {
    const [vista, setVista] = useState('salas'); // 'salas' | 'criar'
    const [salas, setSalas] = useState(null); // null = ainda não buscou
    const [numberPlayers, setNumberPlayers] = useState(4);
    const [roundStart, setRoundStart] = useState(1);
    const [botNumber, setBotNumber] = useState(0);
    const [chatAberto, setChatAberto] = useState(false);
    const [privada, setPrivada] = useState(false);
    const [reconectando, setReconectando] = useState(false);
    const [criando, setCriando] = useState(false);
    const [erro, setErro] = useState(null);
    // Sala privada clicada: popup pedindo a senha antes do entrarSala.
    const [salaPedindoSenha, setSalaPedindoSenha] = useState(null); // { salaId, numberPlayers, senha, erro }
    // JA_EM_PARTIDA: { salaAtivaId, retomar } — ver novo/Lobby.jsx.
    const [colisaoPartida, setColisaoPartida] = useState(null);

    function mostrarErro(mensagem) {
        tocarSom('erro');
        setErro(mensagem);
    }

    async function tentarEntrada(acao) {
        setErro(null);
        try {
            await acao();
        } catch (erroDaChamada) {
            if (erroDaChamada.codigo === 'JA_EM_PARTIDA') {
                setColisaoPartida({ salaAtivaId: erroDaChamada.resposta?.salaId, retomar: acao });
            } else {
                mostrarErro(erroDaChamada.message);
            }
        }
    }

    async function atualizarLista() {
        try {
            const resposta = await chamar('listarSalas');
            setSalas(resposta.salas);
        } catch (erroDaChamada) {
            setErro(erroDaChamada.message);
        }
    }

    useEffect(() => {
        atualizarLista();
        const intervalo = setInterval(atualizarLista, INTERVALO_ATUALIZACAO_MS);
        return () => clearInterval(intervalo);
    }, []);

    // Menos jogadores do que bots escolhidos: puxa os bots pro teto novo.
    function escolherJogadores(n) {
        setNumberPlayers(n);
        setBotNumber((b) => Math.min(b, n - 1));
    }

    function partidaRapida() {
        return tentarEntrada(async () => {
            const resposta = await chamar('partidaRapida');
            guardarInfoSala(resposta.salaId, { numberPlayers: resposta.numberPlayers });
            onEntrouNaSala(resposta.salaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto);
        });
    }

    async function criarSala(evento) {
        evento.preventDefault();
        setCriando(true);
        await tentarEntrada(async () => {
            const resposta = await chamar('criarSala', { numberPlayers, roundStart, botNumber, chatAberto, privada });
            guardarInfoSala(resposta.salaId, { numberPlayers: resposta.numberPlayers ?? numberPlayers, roundStart, botNumber });
            // `senha` só vem quando a sala é privada — é a única vez que o
            // servidor a mostra (ver PROTOCOLO.md), a espera repassa pro criador.
            onEntrouNaSala(resposta.salaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto, resposta.senha);
        });
        setCriando(false);
    }

    async function entrarSalaComSenha(salaId, numberPlayersDaLista, senhaDigitada) {
        const resposta = await chamar('entrarSala', { salaId, senha: senhaDigitada });
        guardarInfoSala(salaId, { numberPlayers: resposta.numberPlayers ?? numberPlayersDaLista });
        onEntrouNaSala(salaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto);
    }

    function entrarSala(sala) {
        if (sala.privada) {
            setSalaPedindoSenha({ salaId: sala.salaId, numberPlayers: sala.numberPlayers, senha: '', erro: null });
            return;
        }
        tentarEntrada(() => entrarSalaComSenha(sala.salaId, sala.numberPlayers));
    }

    // Erro de senha aparece DENTRO do popup; JA_EM_PARTIDA vira a colisão de sempre.
    async function confirmarSenhaEEntrar(evento) {
        evento.preventDefault();
        const { salaId, numberPlayers: np, senha: senhaDigitada } = salaPedindoSenha;
        try {
            await entrarSalaComSenha(salaId, np, senhaDigitada);
            setSalaPedindoSenha(null);
        } catch (erroDaChamada) {
            tocarSom('erro');
            if (erroDaChamada.codigo === 'JA_EM_PARTIDA') {
                setSalaPedindoSenha(null);
                setColisaoPartida({
                    salaAtivaId: erroDaChamada.resposta?.salaId,
                    retomar: () => entrarSalaComSenha(salaId, np, senhaDigitada),
                });
            } else {
                setSalaPedindoSenha((atual) => atual && { ...atual, erro: erroDaChamada.message });
            }
        }
    }

    async function reconectarEm(salaId) {
        const resposta = await chamar('reconectar', { salaId });
        onReconectou(salaId, resposta);
    }

    async function reconectarNaColisao() {
        setErro(null);
        try {
            await reconectarEm(colisaoPartida.salaAtivaId);
        } catch (erroDaChamada) {
            mostrarErro(erroDaChamada.message);
            setColisaoPartida(null);
        }
    }

    async function desistirEEntrar() {
        const { salaAtivaId, retomar } = colisaoPartida;
        setColisaoPartida(null);
        setErro(null);
        try {
            await chamar('desistir', { salaId: salaAtivaId });
        } catch (erroDaChamada) {
            mostrarErro(erroDaChamada.message);
            return;
        }
        tentarEntrada(retomar);
    }

    // A sala em andamento nunca aparece em listarSalas — só dá pra voltar
    // pelo salaId guardado no App (ver novo/Lobby.jsx).
    async function reconectar() {
        setErro(null);
        setReconectando(true);
        try {
            await reconectarEm(salaParaReconectar);
        } catch (erroDaChamada) {
            mostrarErro(erroDaChamada.message);
            setReconectando(false);
        }
    }

    const cabecaDireita = (
        <>
            <span className="az-px az-topo-nome" title="Você">{meuNome}</span>
            <button
                type="button"
                data-som="aba"
                className="az-b az-px az-topo-btn"
                onClick={onTrocarFrente}
                title="Trocar de frente visual"
            >
                🔄 FRENTE
            </button>
        </>
    );

    const avisos = (
        <>
            {colisaoPartida && (
                <div className="az-aviso az-aviso-amarelo">
                    <div className="az-aviso-texto">
                        <div className="az-px az-aviso-titulo">VOCÊ JÁ ESTÁ NUMA PARTIDA</div>
                        <div className="az-aviso-sub">
                            Tem uma partida em andamento
                            {colisaoPartida.salaAtivaId ? ` (sala ${colisaoPartida.salaAtivaId})` : ''}.
                            Reconecte nela, ou desista de vez (você perde na hora) pra entrar em outra.
                        </div>
                    </div>
                    <div className="az-linha-botoes">
                        <button type="button" className="az-b az-px az-btn az-btn-azul az-btn-p" onClick={reconectarNaColisao}>
                            RECONECTAR
                        </button>
                        <button type="button" className="az-b az-px az-btn az-btn-vermelho az-btn-p" onClick={desistirEEntrar}>
                            DESISTIR E ENTRAR
                        </button>
                        <button type="button" className="az-b az-px az-btn az-btn-cinza az-btn-p" onClick={() => setColisaoPartida(null)}>
                            CANCELAR
                        </button>
                    </div>
                </div>
            )}
            {erro && <div className="az-erro az-erro-caixa">{erro}</div>}
        </>
    );

    if (vista === 'criar') {
        const seletor = (valores, atual, escolher) => (
            <div className="az-seletor">
                {valores.map((n) => (
                    <button
                        key={n}
                        type="button"
                        className={`az-b az-px az-opcao${n === atual ? ' az-ativo' : ''}`}
                        onClick={() => escolher(n)}
                    >
                        {n}
                    </button>
                ))}
            </div>
        );
        const chave = (titulo, desc, ligado, alternar) => (
            <div className="az-chave">
                <div className="az-chave-texto">
                    <div className="az-chave-titulo">{titulo}</div>
                    <div className="az-chave-desc">{desc}</div>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={ligado}
                    aria-label={titulo}
                    className="az-b az-trilho"
                    style={{ background: ligado ? '#7fd6a5' : '#22252f' }}
                    onClick={alternar}
                >
                    <span className="az-trilho-bola" style={{ left: ligado ? 30 : 2 }} />
                </button>
            </div>
        );

        return (
            <Casca conectado={conectado} direita={cabecaDireita}>
                <form className="az-tela az-tela-criar" data-screen-label="Criar sala" onSubmit={criarSala}>
                    <div className="az-px az-titulo az-sombra-azul az-titulo-criar">NOVA MESA</div>
                    <div className="az-sub az-sub-criar">Configure e chame a galera.</div>

                    {avisos}

                    <div className="az-painel az-painel-criar">
                        <div>
                            <div className="az-px az-rotulo">JOGADORES</div>
                            {seletor(OPCOES_JOGADORES, numberPlayers, escolherJogadores)}
                        </div>
                        <div>
                            <div className="az-px az-rotulo">BOTS PRA COMPLETAR</div>
                            {seletor(Array.from({ length: numberPlayers }, (_, i) => i), botNumber, setBotNumber)}
                        </div>
                        <div>
                            <div className="az-px az-rotulo">CARTAS NA 1ª RODADA</div>
                            {seletor(OPCOES_CARTAS, roundStart, setRoundStart)}
                        </div>
                        <div>
                            <div className="az-px az-rotulo">CORAÇÕES INICIAIS <span className="az-em-breve">EM BREVE</span></div>
                            <div className="az-seletor">
                                <button type="button" className="az-b az-px az-opcao az-opcao-larga az-ativo" disabled>
                                    {'♥♥♥'}
                                </button>
                            </div>
                        </div>
                        {chave('Chat aberto', 'Além das frases prontas, libera texto livre na mesa.', chatAberto, () => setChatAberto((v) => !v))}
                        {chave('Sala privada', 'Só entra quem tiver a senha — ela aparece na sala de espera.', privada, () => setPrivada((v) => !v))}
                        <button type="submit" className="az-b az-px az-btn az-btn-vermelho az-btn-gg" disabled={criando}>
                            {criando ? 'ABRINDO...' : 'ABRIR MESA'}
                        </button>
                        <button type="button" data-som="aba" className="az-b az-btn-fantasma" onClick={() => setVista('salas')}>
                            Voltar pras salas
                        </button>
                    </div>
                </form>
            </Casca>
        );
    }

    return (
        <Casca conectado={conectado} direita={cabecaDireita}>
            <div className="az-tela az-tela-lobby" data-screen-label="Lobby de salas">
                <div className="az-cabeca-tela">
                    <div>
                        <div className="az-px az-titulo az-sombra-vermelha">SALAS ABERTAS</div>
                        <div className="az-sub">Entre numa mesa ou abra a sua.</div>
                    </div>
                    <button
                        type="button"
                        data-som="aba"
                        className="az-b az-px az-btn az-btn-vermelho az-btn-criar"
                        onClick={() => { setErro(null); setVista('criar'); }}
                    >
                        + CRIAR SALA
                    </button>
                </div>

                {salaParaReconectar && (
                    <div className="az-aviso az-aviso-azul">
                        <div className="az-aviso-texto">
                            <div className="az-px az-aviso-titulo">VOCÊ SAIU DA SALA {salaParaReconectar}</div>
                            <div className="az-aviso-sub">Sua vaga na partida continua reservada.</div>
                        </div>
                        <button
                            type="button"
                            className="az-b az-px az-btn az-btn-azul az-btn-p"
                            onClick={reconectar}
                            disabled={reconectando}
                        >
                            {reconectando ? 'RECONECTANDO...' : 'RECONECTAR'}
                        </button>
                    </div>
                )}

                {avisos}

                <button type="button" className="az-b az-px az-btn-rapida" onClick={partidaRapida}>
                    PARTIDA RÁPIDA
                </button>

                <div className="az-lista-cabeca">
                    <span className="az-px az-rotulo">{salas ? `${salas.length} SALA${salas.length === 1 ? '' : 'S'}` : 'BUSCANDO SALAS...'}</span>
                    <button type="button" className="az-b az-px az-btn-mini" onClick={atualizarLista}>
                        ATUALIZAR
                    </button>
                </div>

                {salas?.length === 0 && (
                    <div className="az-vazio az-px">NENHUMA SALA ABERTA — ABRA A SUA</div>
                )}

                <div className="az-grade-salas">
                    {salas?.map((sala) => {
                        const cheia = sala.jogadoresAtual >= sala.numberPlayers;
                        const tags = [
                            sala.chatAberto ? 'CHAT ABERTO' : 'SÓ FRASES',
                            sala.privada ? '🔒 PRIVADA' : null,
                        ].filter(Boolean);
                        return (
                            <div key={sala.salaId} className="az-sala">
                                <div className="az-sala-topo">
                                    <div className="az-px az-sala-nome">{sala.salaId}</div>
                                    <div className="az-px az-sala-vagas" style={{ color: cheia ? '#ff4b3e' : '#7fd6a5' }}>
                                        {sala.jogadoresAtual}/{sala.numberPlayers}
                                    </div>
                                </div>
                                <div className="az-tags">
                                    {tags.map((t) => <span key={t} className="az-px az-tag">{t}</span>)}
                                </div>
                                <div className="az-assentos-mini">
                                    {Array.from({ length: sala.numberPlayers }, (_, i) => (
                                        <div
                                            key={i}
                                            className="az-assento-mini"
                                            style={{ background: i < sala.jogadoresAtual ? corDoAssento(i) : '#22252f' }}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="az-b az-px az-btn-sala"
                                    style={{ background: cheia ? '#4a4f60' : '#f5c451' }}
                                    disabled={cheia}
                                    onClick={() => entrarSala(sala)}
                                >
                                    {cheia ? 'SALA CHEIA' : sala.privada ? 'ENTRAR COM SENHA' : 'ENTRAR'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {salaPedindoSenha && (
                <Modal borda="#f5c451" onFechar={() => setSalaPedindoSenha(null)}>
                    <form className="az-etapa" onSubmit={confirmarSenhaEEntrar}>
                        <div className="az-px az-modal-titulo" style={{ color: '#f5c451' }}>
                            🔒 SALA {salaPedindoSenha.salaId}
                        </div>
                        <div>
                            <div className="az-px az-rotulo">SENHA DA SALA</div>
                            <input
                                className="az-input az-input-amarelo"
                                type="password"
                                autoFocus
                                value={salaPedindoSenha.senha}
                                onChange={(e) => setSalaPedindoSenha((atual) => ({ ...atual, senha: e.target.value }))}
                            />
                            {salaPedindoSenha.erro && <div className="az-erro">{salaPedindoSenha.erro}</div>}
                        </div>
                        <div className="az-linha-botoes">
                            <button type="submit" className="az-b az-px az-btn az-btn-amarelo az-cresce">ENTRAR</button>
                            <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => setSalaPedindoSenha(null)}>
                                CANCELAR
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </Casca>
    );
}
