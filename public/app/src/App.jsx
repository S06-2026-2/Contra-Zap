import { useEffect, useState, useSyncExternalStore } from 'react';
import Login from './components/Login.jsx';
import Lobby from './components/Lobby.jsx';
import Partida from './components/Partida.jsx';
import PartidaNovo from './components/novo/Partida.jsx';
import PartidaMeetfront1 from './components/meetfront1/Partida.jsx';
import LoginArcade from './components/arcade/Login.jsx';
import LobbyArcade from './components/arcade/Lobby.jsx';
import PartidaArcade from './components/arcade/Partida.jsx';
import Casca from './components/arcade/Casca.jsx';
import SeletorFrente, { lerFrenteSalva } from './components/SeletorFrente.jsx';
import { assinarConexao, chamar, obterConexao, socket } from './socket.js';
import { avisarSessaoRetomada, lerSessaoSalva, limparSessaoSalva, salvarSessao } from './sessao.js';

// Única "rota" de verdade do app (o resto — frente, login, lobby, sala —
// é tudo estado em memória/localStorage, nunca a URL).

// "novo" usa o Login e o Lobby da arcade e a Partida própria, que é sempre
// o front provisório (components/novo/MesaExperimento.jsx, alimentado pelo
// socket em components/novo/Partida.jsx) — ver SeletorFrente.jsx pra como a
// escolha de frente é lembrada por navegador.
//
// "meetfront1" é igual ao "novo", com a Partida de components/meetfront1/
// (cópia da mesa do novo onde entram as mudanças do encontro com o grupo).
//
// "arcade" é a casca de components/arcade/ (ver
// design_handoff_frente_arcade/README.md) — mesmas props das outras, mais
// `conectado`: ela desenha a própria faixa de conexão perdida, então o
// banner global some nas telas dela.
const FRENTES = {
    novo: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaNovo },
    meetfront1: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaMeetfront1 },
    arcade: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaArcade },
    debugging: { Login, Lobby, Partida },
};

// Máquina de estado bem simples. Sessão (nome + token) fica em memória
// aqui (`player`) mas é espelhada em sessionStorage (ver sessao.js) — o
// suficiente pra sobreviver a um F5 na mesma aba, sem virar algo
// compartilhado entre abas (localStorage) nem entre sessões do navegador
// (cookie persistente).
export default function App() {
    // Lembrada por navegador via localStorage; sem nada salvo, abre na
    // arcade (ver SeletorFrente.jsx).
    const [frente, setFrente] = useState(lerFrenteSalva);
    // true enquanto o SeletorFrente estiver aberto por cima de tudo (ver
    // trocarFrente) — `frente` continua valendo pra marcar a atual e pra
    // voltar sem escolher nada.
    const [escolhendoFrente, setEscolhendoFrente] = useState(false);
    const [player, setPlayer] = useState(null); // { nome, token }
    const [sala, setSala] = useState(null); // { salaId, jogadoresIniciais } ou { salaId, reconexao }
    // salaId de uma partida em andamento em que ainda temos assento mas cujo
    // socket não está mais na room — seja por expulsão por inatividade (ver
    // jogadorExpulsoPorInatividade em conexao/PROTOCOLO.md), seja por ter
    // clicado em "Sair da partida" (puramente client-side: cair da partida
    // não mexe no assento, ver PROTOCOLO.md). Só em memória, mesma filosofia
    // de socket.js de não persistir nada; some se a aba recarregar. É o que
    // permite a Lobby oferecer "reconectar" de volta especificamente pra
    // essa sala.
    const [salaParaReconectar, setSalaParaReconectar] = useState(null);
    // Estado de conexão do socket em si (ver socket.js) — independente de
    // `salaParaReconectar` acima, que é sobre a VAGA na partida. Uma queda
    // de rede aparece aqui na hora; o socket.io-client tenta reconectar
    // sozinho por baixo, mas isso não recupera sessão nenhuma (ver
    // socket.js) — só avisa que a rede caiu/voltou.
    const conectado = useSyncExternalStore(assinarConexao, obterConexao);
    // true só até a checagem de sessão salva (sessionStorage, ver sessao.js)
    // terminar — evita mostrar a tela de Login por uma fração de segundo
    // antes de saber se dá pra retomar uma sessão de antes de um F5.
    const [restaurandoSessao, setRestaurandoSessao] = useState(true);

    // Único lugar que autentica de verdade — login normal (Login.jsx),
    // retomada de uma sessão salva (useEffect logo abaixo) e retomada
    // depois de uma reconexão de rede (outro useEffect mais abaixo) passam
    // todos por aqui, pra `player` (memória) e a sessão salva
    // (sessionStorage) nunca dessincronizarem.
    function autenticar({ nome, token }) {
        const sessao = { nome, token };
        setPlayer(sessao);
        salvarSessao(sessao);
    }

    // Sessão salva de antes de um F5 na mesma aba (ver sessao.js): tenta
    // retomar assim que o socket conectar, ANTES de decidir se mostra a
    // tela de Login. Sem sessão salva, ou com um token que não serve mais
    // (expirou, ou o servidor reiniciou com outro segredo), cai pro Login
    // normal — sem isso, ficaria preso numa tela em branco esperando um
    // retomarSessao que nunca chegaria a acontecer.
    useEffect(() => {
        const sessaoSalva = lerSessaoSalva();
        if (!sessaoSalva) {
            setRestaurandoSessao(false);
            return;
        }
        let cancelado = false;
        chamar('retomarSessao', { token: sessaoSalva.token })
            .then((resposta) => {
                if (!cancelado) autenticar(resposta);
            })
            .catch(() => {
                if (!cancelado) limparSessaoSalva();
            })
            .finally(() => {
                if (!cancelado) setRestaurandoSessao(false);
            });
        return () => { cancelado = true; };
    }, []);

    // Já autenticados e a rede caiu e voltou sozinha (ver socket.js): o
    // socket.io-client reconecta com um socket.id NOVO, que o servidor
    // nunca autenticou — sem isto, a primeira ação depois da rede voltar
    // falharia com NAO_IDENTIFICADO do nada, mesmo com o banner de conexão
    // já tendo sumido. `avisarSessaoRetomada` (ver sessao.js) é o sinal pra
    // quem mais precisa voltar pra alguma room específica depois disso (ver
    // Partida.jsx) — só dispara DEPOIS do servidor já saber quem somos de
    // novo, nunca antes (diferente do `connect` cru do socket.io).
    useEffect(() => {
        if (!player) return;
        function aoReconectar() {
            chamar('retomarSessao', { token: player.token })
                .then((resposta) => {
                    autenticar(resposta);
                    avisarSessaoRetomada();
                })
                .catch(() => {
                    // Não dá mais pra recuperar sozinho (token expirou
                    // enquanto estávamos fora, ou o servidor reiniciou com
                    // outro segredo) — melhor voltar pro Login de propósito
                    // do que deixar a tela travada parecendo funcional sem
                    // estar autenticada de verdade no servidor.
                    limparSessaoSalva();
                    setPlayer(null);
                    setSala(null);
                    setSalaParaReconectar(null);
                });
        }
        socket.on('connect', aoReconectar);
        return () => socket.off('connect', aoReconectar);
    }, [player]);

    // Assim que o login termina (inclusive depois de retomar sessão salva
    // acima), pergunta pro servidor se esse jogador já tem assento nalguma
    // partida em andamento (ver minhaSalaAtiva em conexao/PROTOCOLO.md) — é
    // o único jeito de descobrir isso sem guardar salaId em lugar nenhum do
    // cliente entre recarregas. Só roda uma vez por login (não por sala): se
    // já estamos numa Partida quando isso resolve, não faz sentido pisar em
    // cima do estado dela.
    useEffect(() => {
        if (!player) return;
        let cancelado = false;
        chamar('minhaSalaAtiva')
            .then((resposta) => {
                if (!cancelado && resposta.salaId) setSalaParaReconectar(resposta.salaId);
            })
            .catch(() => {}); // melhor esforço — se falhar, só não pré-preenche o banner
        return () => { cancelado = true; };
    }, [player]);

    // Compartilhado entre Lobby (criar/entrar numa sala normal) e Partida
    // (aceitar um convite de revanche — ver convidadoParaRevanche): as duas
    // situações terminam do mesmo jeito, numa sala de espera nova. `senha`
    // só vem preenchida quando ESTA chamada criou uma sala privada (ver
    // Lobby.jsx) — entrarSala/jogarDeNovo nunca trazem, então fica undefined
    // e a tela de espera simplesmente não mostra o bloco de senha.
    function entrarNaSala(salaId, jogadoresIniciais, segundosParaIniciar, chatAberto, senha) {
        setSalaParaReconectar(null);
        setSala({ salaId, jogadoresIniciais, segundosParaIniciar, chatAberto, senha });
    }

    // Trocar de front (botão "🔄" na Lobby, e no Login da arcade) não mexe
    // em player/sala — só qual casca visual monta a partir daqui, a sessão e
    // a vaga continuam as mesmas.
    function trocarFrente() {
        setEscolhendoFrente(true);
    }

    if (escolhendoFrente) {
        return (
            <SeletorFrente
                atual={frente}
                onEscolher={(escolhida) => {
                    setFrente(escolhida);
                    setEscolhendoFrente(false);
                }}
                onVoltar={() => setEscolhendoFrente(false)}
                conectado={conectado}
            />
        );
    }

    if (restaurandoSessao) {
        if (frente === 'arcade' || frente === 'novo' || frente === 'meetfront1') {
            return (
                <Casca conectado={conectado}>
                    <div className="az-tela az-tela-login">
                        <div className="az-px az-vazio">CARREGANDO...</div>
                    </div>
                </Casca>
            );
        }
        return (
            <div className="cartao">
                <p>Carregando...</p>
            </div>
        );
    }

    const { Login: TelaLogin, Lobby: TelaLobby, Partida: TelaPartida } = FRENTES[frente];
    const ehArcade = frente === 'arcade';
    // Tela desenhada pela casca da arcade (que tem a própria faixa de
    // conexão perdida): tudo na arcade, e Login/Lobby no "novo"/"meetfront1".
    const telaArcade = ehArcade || ((frente === 'novo' || frente === 'meetfront1') && !sala);
    const propsConexao = telaArcade ? { conectado } : {};

    let tela;
    if (!player) {
        tela = <TelaLogin onAutenticado={autenticar} onTrocarFrente={trocarFrente} {...propsConexao} />;
    } else if (!sala) {
        tela = (
            <TelaLobby
                meuNome={player.nome}
                salaParaReconectar={salaParaReconectar}
                onEntrouNaSala={entrarNaSala}
                onReconectou={(salaId, reconexao) => {
                    setSalaParaReconectar(null);
                    setSala({ salaId, reconexao });
                }}
                onTrocarFrente={trocarFrente}
                {...propsConexao}
            />
        );
    } else {
        tela = (
            <TelaPartida
                // key força o React a montar uma instância NOVA sempre que
                // salaId muda — sem isso, trocar de sala rodando "jogar de
                // novo" (Partida -> Partida, sem passar pela Lobby no meio)
                // reaproveitaria a mesma instância e todo o estado local
                // (vencedor, jogadores, mão, mesa...) ficaria preso na sala
                // antiga, mesmo com salaId/título já mostrando a sala nova.
                key={sala.salaId}
                salaId={sala.salaId}
                jogadoresIniciais={sala.jogadoresIniciais}
                segundosIniciais={sala.segundosParaIniciar}
                reconexao={sala.reconexao}
                chatAberto={sala.chatAberto ?? sala.reconexao?.chatAberto ?? false}
                senha={sala.senha}
                meuNome={player.nome}
                onSairDaSala={() => setSala(null)}
                onSairDaPartida={(salaId) => {
                    setSalaParaReconectar(salaId);
                    setSala(null);
                }}
                onEntrouNaSala={entrarNaSala}
                {...propsConexao}
            />
        );
    }

    return (
        <>
            <div className="badge-frente">
                {frente === 'novo' ? '✨ Novo' : frente === 'meetfront1' ? '🤝 Meetfront1' : ehArcade ? '👾 Arcade' : '🐞 Debugging'}
            </div>
            {/* Independe da tela atual — some sozinho quando 'connect' disparar de novo (ver socket.js) */}
            {!conectado && !telaArcade && (
                <div className="banner-conexao">
                    🔌 Conexão perdida — tentando reconectar...
                </div>
            )}
            {tela}
        </>
    );
}
