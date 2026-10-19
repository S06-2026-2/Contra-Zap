import { useEffect, useState, useSyncExternalStore } from 'react';
import Login from './components/Login.jsx';
import Lobby from './components/Lobby.jsx';
import Partida from './components/Partida.jsx';
import PartidaNovo from './components/novo/Partida.jsx';
import PartidaMeetfront1 from './components/meetfront1/Partida.jsx';
import PartidaMeetfront2 from './components/meetfront2/Partida.jsx';
import InicioMeetfront2 from './components/meetfront2/Inicio.jsx';
import CustomizacaoMeetfront2 from './components/meetfront2/Customizacao.jsx';
import AvisoFichas from './components/meetfront2/AvisoFichas.jsx';
import LoginArcade from './components/arcade/Login.jsx';
import LobbyArcade from './components/arcade/Lobby.jsx';
import PartidaArcade from './components/arcade/Partida.jsx';
import PartidaMescla from './components/mescla/Partida.jsx';
import Casca from './components/arcade/Casca.jsx';
import SeletorFrente, { lerFrenteSalva } from './components/SeletorFrente.jsx';
import { assinarConexao, chamar, obterConexao, socket } from './socket.js';
import { avisarSessaoRetomada, lerSessaoSalva, limparSessaoSalva, salvarSessao } from './sessao.js';

// Única rota de verdade do app: /front abre o seletor de frente (ver
// ROTA_FRENTE); o resto — frente, login, lobby, sala — é tudo estado em
// memória/localStorage, nunca a URL.
const ROTA_FRENTE = '/front';

// "novo" usa o Login e o Lobby da arcade e a Partida própria, que é sempre
// o front provisório (components/novo/MesaExperimento.jsx, alimentado pelo
// socket em components/novo/Partida.jsx) — ver SeletorFrente.jsx pra como a
// escolha de frente é lembrada por navegador.
//
// "meetfront1" é igual ao "novo", com a Partida de components/meetfront1/
// (cópia da mesa do novo onde entram as mudanças do encontro com o grupo).
//
// "meetfront2" é a frente das mudanças do segundo encontro, com a Partida
// de components/meetfront2/. No lugar do Login ela tem a tela inicial
// (`Inicio`: JOGAR e CUSTOMIZAÇÃO, com pop-up de login quando precisa) e a
// `Customizacao`.
//
// "arcade" é a casca de components/arcade/ (ver
// design_handoff_frente_arcade/README.md) — mesmas props das outras, mais
// `conectado`: ela desenha a própria faixa de conexão perdida, então o
// banner global some nas telas dela.
//
// "mescla" é a arcade inteira com a mesa trocada por components/mescla/ —
// o oval e os fantasminhas do "novo" com a interface da arcade.
const FRENTES = {
    novo: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaNovo },
    meetfront1: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaMeetfront1 },
    meetfront2: {
        Login: LoginArcade,
        Lobby: LobbyArcade,
        Partida: PartidaMeetfront2,
        Inicio: InicioMeetfront2,
        Customizacao: CustomizacaoMeetfront2,
    },
    arcade: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaArcade },
    mescla: { Login: LoginArcade, Lobby: LobbyArcade, Partida: PartidaMescla },
    debugging: { Login, Lobby, Partida },
};

// Máquina de estado bem simples. Sessão (nome + token) fica em memória
// aqui (`player`) mas é espelhada em sessionStorage (ver sessao.js) — o
// suficiente pra sobreviver a um F5 na mesma aba, sem virar algo
// compartilhado entre abas (localStorage) nem entre sessões do navegador
// (cookie persistente).
export default function App() {
    // Lembrada por navegador via localStorage; sem nada salvo, abre no
    // meetfront2 (ver SeletorFrente.jsx).
    const [frente, setFrente] = useState(lerFrenteSalva);
    // true quando a página abriu em /front: o seletor aparece no lugar de
    // tudo. Escolher (ou voltar) troca a URL pra / sem recarregar e segue
    // pro Login ou pras salas, conforme já havia sessão ou não.
    const [escolhendoFrente, setEscolhendoFrente] = useState(() => window.location.pathname === ROTA_FRENTE);
    // Marca o body na frente meetfront1: o CSS dela esconde o painel de
    // filtro de tela também no Login/Lobby, que são as telas da arcade
    // (ver .mf1-frente em meetfront1/meetfront1.css).
    useEffect(() => {
        document.body.classList.toggle('mf1-frente', frente === 'meetfront1' || frente === 'meetfront2');
    }, [frente]);
    const [player, setPlayer] = useState(null); // { nome, token }
    const [sala, setSala] = useState(null); // { salaId, jogadoresIniciais } ou { salaId, reconexao }
    // Só nas frentes com tela inicial (ver `Inicio` em FRENTES): null é a
    // própria tela inicial; 'jogar' (salas/partida) e 'customizar' só valem
    // com sessão — sem ela, cai de volta na tela inicial.
    const [destino, setDestino] = useState(null);
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

    // Sair do /front: a URL volta pra / (replaceState, sem recarregar —
    // a sessão retomada lá em cima continua valendo) e o fluxo normal
    // decide entre Login e salas. Trocar de frente não mexe em player/sala.
    function sairDoSeletor() {
        window.history.replaceState(null, '', '/');
        setEscolhendoFrente(false);
    }

    // Sair da conta: sem evento de logout no protocolo, o jeito de o
    // servidor esquecer quem somos é um socket novo — recarregar a página
    // sem a sessão salva faz isso e volta pra tela inicial deslogado.
    function sairDaConta() {
        limparSessaoSalva();
        window.location.assign('/');
    }

    if (escolhendoFrente) {
        return (
            <SeletorFrente
                atual={frente}
                onEscolher={(escolhida) => {
                    setFrente(escolhida);
                    sairDoSeletor();
                }}
                onVoltar={sairDoSeletor}
                conectado={conectado}
            />
        );
    }

    if (restaurandoSessao) {
        if (frente !== 'debugging') {
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

    const {
        Login: TelaLogin,
        Lobby: TelaLobby,
        Partida: TelaPartida,
        Inicio: TelaInicio,
        Customizacao: TelaCustomizacao,
    } = FRENTES[frente];
    const ehArcade = frente === 'arcade';
    // Tela desenhada pela casca da arcade (que tem a própria faixa de
    // conexão perdida): tudo na arcade e na mescla, e Login/Lobby no "novo",
    // no "meetfront1" e no "meetfront2".
    const telaArcade = ehArcade || frente === 'mescla'
        || ((frente === 'novo' || frente === 'meetfront1' || frente === 'meetfront2') && !sala);
    const propsConexao = telaArcade ? { conectado } : {};

    let tela;
    if (TelaInicio && !sala && (!player || destino === null)) {
        tela = (
            <TelaInicio
                meuNome={player?.nome}
                onAutenticado={autenticar}
                onIr={setDestino}
                onSair={sairDaConta}
                {...propsConexao}
            />
        );
    } else if (TelaCustomizacao && !sala && destino === 'customizar') {
        tela = <TelaCustomizacao meuNome={player.nome} onVoltar={() => setDestino(null)} {...propsConexao} />;
    } else if (!player) {
        tela = <TelaLogin onAutenticado={autenticar} {...propsConexao} />;
    } else if (!sala) {
        tela = (
            <TelaLobby
                meuNome={player.nome}
                onVoltar={TelaInicio ? () => setDestino(null) : undefined}
                salaParaReconectar={salaParaReconectar}
                onEntrouNaSala={entrarNaSala}
                onReconectou={(salaId, reconexao) => {
                    setSalaParaReconectar(null);
                    setSala({ salaId, reconexao });
                }}
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
                {frente === 'novo' ? '✨ Novo' : frente === 'meetfront1' ? '🤝 Meetfront1' : frente === 'meetfront2' ? '🧭 Meetfront2' : ehArcade ? '👾 Arcade' : frente === 'mescla' ? '🃏 Mescla' : '🐞 Debugging'}
            </div>
            {/* Independe da tela atual — some sozinho quando 'connect' disparar de novo (ver socket.js) */}
            {!conectado && !telaArcade && (
                <div className="banner-conexao">
                    🔌 Conexão perdida — tentando reconectar...
                </div>
            )}
            {tela}
            {/* Fichas ganhas aparecem em qualquer tela (ver avisoFichas.js). */}
            {TelaInicio && <AvisoFichas />}
        </>
    );
}
