import { useEffect, useRef, useState } from 'react';
import { socket, chamar } from '../../socket.js';
import { assinarSessaoRetomada } from '../../sessao.js';
import MesaExperimento from './MesaExperimento.jsx';
import { guardarInfoSala, lerInfoSala } from '../arcade/salasInfo.js';
import { tocarSom } from '../arcade/somArcade.js';
// Catálogo e cooldown vêm direto da fonte única do back — não há mais espelho
// no front (ver server.fs.allow em vite.config.js).
import { CHAT_COOLDOWN_MS } from '../../../../../conexao/chat/mensagensChat.js';

// Tela 3: uma sala inteira, da espera até o fim da partida. É um componente
// só (não um por fase) porque é uma assinatura contínua dos mesmos eventos
// do GameController, do início ao fim — ver conexao/PROTOCOLO.md pra tabela
// completa de eventos e payloads.
// `reconexao`, quando presente, vem do ack de "reconectar" (chamado pela
// Lobby depois de sair de uma partida em andamento) — { mao, cartasRodada,
// numeroRodada, maosReveladas, mesa, vira, viraValor, apostas, eliminados,
// desconectados, ultimoPlacar, suaVez, jogadorDaVez, suaVezDaAposta,
// jogadorDaVezAposta, finalizada, vencedor } — e é o que permite montar esta
// tela inteira já em andamento (mesa da vaza atual, manilha, apostas dos
// outros, placar, quem morreu, quem virou bot), sem esperar os
// novaRodadaIniciada/suaMao/manilhaVirada/turnoAposta/... que já aconteceram
// antes da gente voltar (a partida não pausa enquanto o assento está no
// automático). As duas frentes (aposta e carta) nunca vêm preenchidas ao
// mesmo tempo — no máximo uma delas reflete a espera de verdade, a outra
// some sozinha assim que a fase seguinte começar de verdade. O mesmo payload
// alimenta o ressincronizar() de depois de uma queda de rede (ver o efeito
// mais abaixo).

// Quanto tempo a vaza encerrada fica congelada na mesa (com a carta
// vencedora destacada) antes de limpar pra próxima — só pra dar tempo de
// ver quem levou. Cancelada na hora se a partida andar antes disso.
const PAUSA_VAZA_MS = 1600;

export default function Partida({ salaId, jogadoresIniciais, segundosIniciais, reconexao, chatAberto, senha, meuNome, onSairDaSala, onSairDaPartida, onEntrouNaSala }) {
    // Semeado do ack de criarSala/entrarSala (ou de reconectar, no caminho de
    // reconexão — o ack de reconectar não dispara listaJogadores), não do
    // broadcast de listaJogadores — o primeiro broadcast sai antes desta tela
    // existir (e o listener abaixo com ele), então dependeria de um evento que
    // já passou. Broadcasts seguintes (mais gente entrando) chegam normal.
    const [jogadores, setJogadores] = useState(jogadoresIniciais ?? reconexao?.jogadores ?? []);
    // Nomes na ordem dos assentos/de jogo (ver `ordem` em novaRodadaIniciada
    // no PROTOCOLO.md) — null até a primeira rodada, quando a mesa ainda
    // não tem ordem e o visual novo cai pra ordem de `jogadores`.
    const [ordem, setOrdem] = useState(reconexao?.ordem ?? null);
    // Semeado do ack de criarSala/entrarSala (não do broadcast de
    // partidaIniciandoEm): quando os bots — ou a última entrada — lotam a
    // sala, esse broadcast sai antes desta tela existir. Broadcasts
    // seguintes (ex.: forcarInicio cancelado não existe, mas outra lotação
    // depois de um sairSala, sim) chegam normal pelo handler abaixo.
    const [segundosParaIniciar, setSegundosParaIniciar] = useState(segundosIniciais ?? null);
    const [iniciada, setIniciada] = useState(!!reconexao);
    const [mao, setMao] = useState(reconexao?.mao ?? []);
    // { [nome]: string[] } — mãos dos outros que o servidor deixou este
    // jogador ver. Hoje só a rodada de 1 carta ("testa") preenche isto: cada
    // um vê a mão dos outros e esconde a sua. Zera a cada novaRodadaIniciada.
    const [maosReveladas, setMaosReveladas] = useState(
        () => Object.fromEntries((reconexao?.maosReveladas ?? []).map((m) => [m.jogador, m.mao]))
    );
    const [jogadorDaVezAposta, setJogadorDaVezAposta] = useState(reconexao?.jogadorDaVezAposta ?? null);
    const [cartasRodada, setCartasRodada] = useState(reconexao?.cartasRodada ?? 0);
    // Só pro visual novo (ver estado.numeroRodada em MesaExperimento.jsx —
    // é o sinal de "rodada NOVA começou" que dispara o reset/distribuição
    // de lá); o front de texto nunca precisou disso além do log.
    const [numeroRodada, setNumeroRodada] = useState(reconexao?.numeroRodada ?? 0);
    const [jogadorDaVez, setJogadorDaVez] = useState(reconexao?.jogadorDaVez ?? null);
    // Número do evento mais recente da partida (ver "Segurar pelas
    // animações" no PROTOCOLO.md) — o visual novo avisa o servidor quando
    // terminou de animar até ele.
    const [ultimoSeq, setUltimoSeq] = useState(0);
    // Prazo do turno atual: quem, quanto tempo (tempoMs do timerTurno, que
    // sai no instante em que o timer do servidor começa) e quando chegou
    // aqui — pro anel de timer do visual novo.
    const [prazoTurno, setPrazoTurno] = useState(null);
    // Último distribuicaoConcluida ({ numero, em }) — só pro log do histórico.
    const [distribuicaoLiberada, setDistribuicaoLiberada] = useState(null);
    const [mesa, setMesa] = useState(reconexao?.mesa ?? []);
    // Vaza recém-encerrada, segurada na tela por PAUSA_VAZA_MS antes de
    // limpar a mesa — { vencedor: string|null, carta: string|null }, ou
    // null quando não tem pausa rolando. O ref espelha o mesmo valor de
    // forma síncrona porque os handlers de socket (efeito com deps
    // [salaId]) capturam só o estado do primeiro render — sem o ref, um
    // cartaJogada da vaza seguinte não enxergaria a pausa em andamento.
    const [vazaResultado, setVazaResultado] = useState(null);
    const vazaResultadoRef = useRef(null);
    const limparVazaTimerRef = useRef(null);
    const [vira, setVira] = useState(
        reconexao?.vira ? { carta: reconexao.vira, valor: reconexao.viraValor } : null
    );
    const [ultimoPlacar, setUltimoPlacar] = useState(reconexao?.ultimoPlacar ?? []);
    const [vencedor, setVencedor] = useState(reconexao?.vencedor ?? null);
    // { novaSalaId, jogador } quando o adm da sala chama jogarDeNovo depois
    // do fim da partida — ver convidadoParaRevanche em PROTOCOLO.md. null
    // enquanto ninguém chamou (ou depois que este jogador já respondeu).
    const [conviteRevanche, setConviteRevanche] = useState(null);
    const [criandoRevanche, setCriandoRevanche] = useState(false);
    const [log, setLog] = useState([]);
    const [erro, setErro] = useState(null);
    // Espelha apostaFeita/jogadoresEliminados num formato fácil de olhar na
    // UI (o log de eventos já registra isso, mas em texto corrido — ruim
    // pra debugar de relance quem já apostou e quem já morreu). `apostas`
    // zera a cada novaRodadaIniciada; `eliminados` só cresce (eliminação é
    // definitiva na partida).
    const [apostas, setApostas] = useState(
        () => Object.fromEntries((reconexao?.apostas ?? []).map((a) => [a.jogador, a.aposta]))
    );
    const [eliminados, setEliminados] = useState(reconexao?.eliminados ?? []);
    // Vazas que cada um já fez na rodada em curso, contadas a cada
    // vazaFinalizada com vencedor (melada não conta pra ninguém); zera a
    // cada novaRodadaIniciada. O `reconectar` não traz isso, então quem
    // reconecta no meio da rodada recomeça a contar do zero.
    const [vazasFeitas, setVazasFeitas] = useState({});
    // Nomes de quem está jogando no automático agora (jogadorExpulsoPorInatividade
    // sem um jogadorReconectou depois) — flag visual pro front marcar "isso
    // aqui é um bot temporário", diferente de `eliminados` (não zera sozinha,
    // só sai daqui de novo se reconectar).
    const [desconectados, setDesconectados] = useState(reconexao?.desconectados ?? []);
    // Chat da sala (ver conexao/PROTOCOLO.md). `mensagensChat` acumula o que
    // chega em chatMensagem (broadcast, inclui o que eu mesmo mandei).
    // `cooldownAte` é o timestamp até quando os botões de envio ficam
    // travados — 3s depois de qualquer envio, pra não virar spam.
    const [mensagensChat, setMensagensChat] = useState([]);
    const [erroChat, setErroChat] = useState(null);
    const [cooldownAte, setCooldownAte] = useState(0);
    const [agora, setAgora] = useState(() => Date.now());
    const feedChatRef = useRef(null);

    useEffect(() => {
        const registrar = (linha) => setLog((anterior) => [...anterior.slice(-49), linha]);
        const daSala = (payload) => payload.salaId === salaId;
        // Corta a pausa da vaza na hora (timer + estado + ref) — usado
        // quando a partida anda antes do PAUSA_VAZA_MS acabar.
        const encerrarPausaVaza = () => {
            clearTimeout(limparVazaTimerRef.current);
            limparVazaTimerRef.current = null;
            vazaResultadoRef.current = null;
            setVazaResultado(null);
        };

        if (reconexao) {
            if (reconexao.jogadorDaVezAposta) {
                registrar(`🔌 Reconectado — ${reconexao.suaVezDaAposta ? 'sua vez de apostar agora' : `vez de ${reconexao.jogadorDaVezAposta} apostar`}`);
            } else {
                registrar(`🔌 Reconectado — ${reconexao.suaVez ? 'sua vez agora' : `vez de ${reconexao.jogadorDaVez ?? '...'}`}`);
            }
        }

        const handlers = {
            listaJogadores(p) {
                if (!daSala(p)) return;
                setJogadores(p.jogadores);
                registrar(`Sala: ${p.jogadores.map((j) => j.nome).join(', ')}`);
            },
            partidaIniciandoEm(p) {
                if (!daSala(p)) return;
                setSegundosParaIniciar(p.segundos);
                registrar(`Sala cheia — partida em ${p.segundos}s (ou "Forçar início")`);
            },
            novaRodadaIniciada(p) {
                if (!daSala(p)) return;
                setIniciada(true);
                setMesa([]);
                encerrarPausaVaza();
                setVira(null);
                setJogadorDaVezAposta(null);
                setCartasRodada(p.cartas);
                setNumeroRodada(p.numero);
                setOrdem(p.ordem);
                setApostas({});
                setVazasFeitas({});
                setMaosReveladas({});
                registrar(`Rodada ${p.numero} (${p.cartas} carta(s))`);
            },
            suaMao(p) {
                if (!daSala(p)) return;
                setMao(p.mao);
                registrar(`Sua mão: ${p.mao.join(', ')}`);
            },
            maosReveladas(p) {
                if (!daSala(p)) return;
                setMaosReveladas(Object.fromEntries(p.maos.map((m) => [m.jogador, m.mao])));
                registrar(`👁️ Rodada cega — ${p.maos.map((m) => `${m.jogador}: ${m.mao.join(', ')}`).join(' | ')}`);
            },
            manilhaVirada(p) {
                if (!daSala(p)) return;
                setVira({ carta: p.vira, valor: p.viraValor });
                registrar(`Vira: ${p.vira} — manilha valor ${p.viraValor}`);
            },
            turnoAposta(p) {
                if (!daSala(p)) return;
                setJogadorDaVezAposta(p.jogador);
                setPrazoTurno(null);
                registrar(`Vez de ${p.jogador} apostar`);
            },
            apostaFeita(p) {
                if (!daSala(p)) return;
                setJogadorDaVezAposta(null);
                setPrazoTurno((atual) => (atual?.jogador === p.jogador ? null : atual));
                setApostas((anterior) => ({ ...anterior, [p.jogador]: p.aposta }));
                registrar(`${p.jogador} apostou ${p.aposta}`);
            },
            distribuicaoConcluida(p) {
                if (!daSala(p)) return;
                registrar(`Distribuição da rodada ${p.numero} liberada`);
                setDistribuicaoLiberada({ numero: p.numero, em: Date.now() });
            },
            timerTurno(p) {
                if (!daSala(p)) return;
                setPrazoTurno({ jogador: p.jogador, tipo: p.tipo, tempoMs: p.tempoMs, inicio: Date.now() });
            },
            turnoJogador(p) {
                if (!daSala(p)) return;
                setJogadorDaVez(p.jogador);
                setPrazoTurno(null);
                registrar(`Vez de ${p.jogador}`);
            },
            cartaJogada(p) {
                if (!daSala(p)) return;
                setPrazoTurno((atual) => (atual?.jogador === p.jogador ? null : atual));
                // Jogou, a vez dele acabou — sem isto a vez (e o rosto
                // "pensando"/banner) ficava nele até o PRÓXIMO turnoJogador,
                // que na última carta da rodada só sai depois da revelação,
                // do dano e da distribuição seguinte.
                setJogadorDaVez((atual) => (atual === p.jogador ? null : atual));
                // Se a vaza anterior ainda está congelada na mesa (pausa
                // rodando), a primeira carta da vaza nova abre a mesa do
                // zero em vez de empilhar em cima da que acabou.
                const abrindoVazaNova = vazaResultadoRef.current != null;
                if (abrindoVazaNova) encerrarPausaVaza();
                setMesa((anterior) => [
                    ...(abrindoVazaNova ? [] : anterior),
                    { jogador: p.jogador, carta: p.carta },
                ]);
                // Cobre a jogada automática por timeout: nesse caso ninguém
                // chamou jogar() localmente, então a carta nunca saiu da
                // mão — sem isso ficava uma carta fantasma na UI. Pra
                // jogada manual (que já removeu por índice em jogar()) isso
                // não acha a carta de novo e não faz nada.
                if (p.jogador === meuNome) {
                    setMao((anterior) => {
                        const indice = anterior.indexOf(p.carta);
                        return indice === -1 ? anterior : anterior.filter((_, i) => i !== indice);
                    });
                }
                registrar(`${p.jogador} jogou ${p.carta}`);
            },
            vazaFinalizada(p) {
                if (!daSala(p)) return;
                // Não limpa na hora: segura a mesa por PAUSA_VAZA_MS com a
                // carta vencedora destacada (borda verde), pra dar tempo de
                // ver quem levou. cartaJogada / novaRodadaIniciada cancelam
                // o timer e limpam na hora se a partida andar antes disso.
                vazaResultadoRef.current = { vencedor: p.vencedor, carta: p.carta };
                if (p.vencedor) setVazasFeitas((anterior) => ({ ...anterior, [p.vencedor]: (anterior[p.vencedor] ?? 0) + 1 }));
                setVazaResultado(vazaResultadoRef.current);
                clearTimeout(limparVazaTimerRef.current);
                limparVazaTimerRef.current = setTimeout(() => {
                    limparVazaTimerRef.current = null;
                    vazaResultadoRef.current = null;
                    setMesa([]);
                    setVazaResultado(null);
                }, PAUSA_VAZA_MS);
                registrar(p.vencedor ? `Vaza: ${p.vencedor} venceu com ${p.carta}` : 'Vaza melada — ninguém pontuou');
            },
            rodadaFinalizada(p) {
                if (!daSala(p)) return;
                setUltimoPlacar(p.resultado);
                registrar(`Fim da rodada ${p.numero}`);
            },
            jogadoresEliminados(p) {
                if (!daSala(p)) return;
                const nomes = p.eliminados.map((j) => j.nome);
                setEliminados((anterior) => [...new Set([...anterior, ...nomes])]);
                registrar(`💀 Eliminado(s): ${nomes.join(', ')}`);
            },
            jogoFinalizado(p) {
                if (!daSala(p)) return;
                setVencedor(p.vencedor);
                registrar(`🏆 Vencedor: ${p.vencedor}`);
            },
            partidaAbortada(p) {
                if (!daSala(p)) return;
                // Erro interno inesperado no motor (ver partidaAbortada em
                // PROTOCOLO.md) — a partida parou e não volta. Sem vencedor:
                // só avisa e trava a mesa onde está.
                setErro(`A partida foi interrompida por um erro interno${p.erro ? `: ${p.erro}` : ''}.`);
                registrar(`⛔ Partida abortada (${p.motivo ?? 'erro interno'})`);
            },
            convidadoParaRevanche(p) {
                if (!daSala(p)) return;
                // Sou eu quem chamou jogarDeNovo — já sei pelo ack, e já vou
                // transicionar pra sala nova por ele; não preciso do meu
                // próprio convite (o broadcast inclui todo mundo da sala,
                // inclusive quem chamou).
                if (p.jogador === meuNome) return;
                setConviteRevanche({ novaSalaId: p.novaSalaId, jogador: p.jogador });
            },
            jogadaAutomatica(p) {
                if (!daSala(p)) return;
                registrar(`⏱️ ${p.jogador} não respondeu a tempo — jogada automática`);
            },
            jogadorReconectou(p) {
                if (!daSala(p)) return;
                setDesconectados((anterior) => anterior.filter((nome) => nome !== p.jogador));
                registrar(`🔌 ${p.jogador} reconectou`);
            },
            jogadorDesistiu(p) {
                if (!daSala(p)) return;
                // Desistência definitiva (ver DESISTIR em PROTOCOLO.md): o
                // assento joga como bot e será eliminado na virada de rodada
                // (aí vira 💀 pelo jogadoresEliminados). Até lá, marca 🤖.
                setDesconectados((anterior) => (anterior.includes(p.jogador) ? anterior : [...anterior, p.jogador]));
                registrar(`🏳️ ${p.jogador} desistiu da partida`);
            },
            chatMensagem(p) {
                if (!daSala(p)) return;
                setMensagensChat((anterior) => [
                    ...anterior.slice(-99),
                    { jogador: p.jogador, texto: p.texto, tipo: p.tipo },
                ]);
            },
            jogadorExpulsoPorInatividade(p) {
                if (!daSala(p)) return;
                // Mesmo evento pra inatividade de verdade e pra "Sair da
                // partida" (ver PROTOCOLO.md) — o cliente não distingue os
                // dois casos, e a mensagem serve pros dois igual.
                setDesconectados((anterior) => (anterior.includes(p.jogador) ? anterior : [...anterior, p.jogador]));
                if (p.jogador === meuNome) {
                    registrar('⏱️ Você foi desconectado da sala por inatividade');
                    onSairDaPartida(salaId);
                } else {
                    registrar(`🤖 ${p.jogador} desconectou — um bot assumiu o lugar dele até reconectar`);
                }
            },
            novoAdm(p) {
                if (!daSala(p)) return;
                setJogadores((anterior) => anterior.map((j) => ({ ...j, adm: j.nome === p.jogador })));
                registrar(p.jogador === meuNome ? '👑 Você virou o adm da sala' : `👑 ${p.jogador} virou o adm da sala`);
            },
        };

        // Loga todo evento recebido, com nome e payload — cobre qualquer
        // handler acima sem precisar espalhar console.log manual por dentro
        // de cada um. Confira o console do navegador (F12) pra debugar o
        // que chega ao abrir/jogar numa sala.
        const comLog = Object.fromEntries(
            Object.entries(handlers).map(([evento, handler]) => [
                evento,
                (payload) => {
                    console.log(`[socket] ${evento}`, payload);
                    handler(payload);
                    if (payload?.salaId === salaId && Number.isInteger(payload.seq)) {
                        setUltimoSeq((atual) => Math.max(atual, payload.seq));
                    }
                },
            ])
        );

        for (const [evento, handler] of Object.entries(comLog)) socket.on(evento, handler);
        return () => {
            for (const [evento, handler] of Object.entries(comLog)) socket.off(evento, handler);
            clearTimeout(limparVazaTimerRef.current);
        };
    }, [salaId]);

    // Reconexão de rede enquanto esta tela já estava aberta (ver App.jsx e
    // sessao.js): o socket muda de id, então o servidor não sabe mais que
    // este socket pertence a esta room — sem chamar `reconectar` de novo,
    // a tela continuaria parecendo viva, mas surda a qualquer evento novo
    // da partida. Assina `assinarSessaoRetomada`, não o `connect` cru do
    // socket.io — só dispara DEPOIS que o servidor já reautenticou o
    // socket (ver App.jsx), senão este `reconectar` chegaria cedo demais e
    // voltaria NAO_IDENTIFICADO. Antes da partida começar não faz sentido
    // tentar: uma queda de conexão nessa fase já tira o assento de verdade
    // (sairSala automático, ver PROTOCOLO.md) — não tem pra onde voltar.
    useEffect(() => {
        if (!iniciada) return;

        async function ressincronizar() {
            try {
                const resposta = await chamar('reconectar', { salaId });
                if (resposta.jogadores) setJogadores(resposta.jogadores);
                setMao(resposta.mao);
                setCartasRodada(resposta.cartasRodada);
                setNumeroRodada(resposta.numeroRodada);
                setMaosReveladas(Object.fromEntries((resposta.maosReveladas ?? []).map((m) => [m.jogador, m.mao])));
                setJogadorDaVez(resposta.jogadorDaVez);
                setJogadorDaVezAposta(resposta.jogadorDaVezAposta);
                setMesa(resposta.mesa ?? []);
                setVira(resposta.vira ? { carta: resposta.vira, valor: resposta.viraValor } : null);
                setApostas(Object.fromEntries((resposta.apostas ?? []).map((a) => [a.jogador, a.aposta])));
                // eliminados só cresce (eliminação é definitiva) — une com o
                // que já tínhamos; desconectados é o oposto: alguém pode ter
                // voltado enquanto estávamos fora, então o servidor manda.
                setEliminados((anterior) => [...new Set([...anterior, ...(resposta.eliminados ?? [])])]);
                setDesconectados(resposta.desconectados ?? []);
                setUltimoPlacar(resposta.ultimoPlacar ?? []);
                if (resposta.vencedor) setVencedor(resposta.vencedor);
                setLog((anterior) => [...anterior.slice(-49), '🔌 Conexão restabelecida — sincronizado com a partida']);
            } catch {
                // melhor esforço — se a sala não existir mais, ou a vaga já
                // tiver expirado enquanto estávamos fora (ver
                // PROTOCOLO.md), não tem o que sincronizar; a próxima ação
                // que falhar avisa o jogador do jeito de sempre.
            }
        }

        return assinarSessaoRetomada(ressincronizar);
    }, [iniciada, salaId]);

    // Contagem regressiva da sala de espera: o servidor só manda o número
    // de segundos uma vez (partidaIniciandoEm), a descida é daqui. Mesmo
    // tique de som da arcade nos últimos segundos.
    useEffect(() => {
        if (iniciada || segundosParaIniciar == null || segundosParaIniciar <= 0) return;
        const id = setTimeout(() => {
            const proxima = segundosParaIniciar - 1;
            if (proxima > 0) tocarSom(proxima <= 5 ? 'tiqueFinal' : 'tique');
            setSegundosParaIniciar(proxima);
        }, 1000);
        return () => clearTimeout(id);
    }, [segundosParaIniciar, iniciada]);

    // Enquanto o cooldown está de pé, um tiquetaque só pra atualizar o
    // contador na tela; para sozinho quando zera.
    useEffect(() => {
        if (cooldownAte <= Date.now()) return;
        const id = setInterval(() => setAgora(Date.now()), 250);
        return () => clearInterval(id);
    }, [cooldownAte]);

    // Rola o feed do chat pro fim sempre que chega mensagem nova.
    useEffect(() => {
        const el = feedChatRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [mensagensChat]);

    const segundosCooldown = Math.max(0, Math.ceil((cooldownAte - agora) / 1000));
    const chatEmCooldown = segundosCooldown > 0;

    // Um caminho só pros dois tipos de envio: manda, arma o cooldown de 3s no
    // sucesso, mostra o erro do ack no painel do chat.
    async function enviarChat(conteudo) {
        setErroChat(null);
        try {
            await chamar('chat', { salaId, ...conteudo });
            setCooldownAte(Date.now() + CHAT_COOLDOWN_MS);
            setAgora(Date.now());
            return true;
        } catch (erroDaChamada) {
            setErroChat(erroDaChamada.message);
            return false;
        }
    }

    function enviarChatPronta(id) {
        if (chatEmCooldown) return;
        enviarChat({ tipo: 'restrita', id });
    }

    // Texto livre (só em sala com chatAberto — o servidor recusa nas
    // outras). Devolve se foi aceito, pra o campo saber se limpa.
    async function enviarChatLivre(texto) {
        if (chatEmCooldown) return false;
        const limpo = texto.trim();
        if (!limpo) return false;
        return enviarChat({ tipo: 'aberta', texto: limpo });
    }

    async function jogar(indice) {
        setErro(null);
        try {
            await chamar('jogarCarta', { salaId, indice });
            setMao((anterior) => anterior.filter((_, i) => i !== indice));
        } catch (erroDaChamada) {
            setErro(erroDaChamada.message);
        }
    }

    // Mesma validação/chamada de `apostar` acima, só que pro popup do
    // visual novo (ver acoes.apostar em MesaExperimento.jsx): recebe o
    // VALOR já pronto (não um evento de form) e devolve { ok, mensagem }
    // em vez de escrever em `erro` — o popup mostra o erro dentro dele
    // mesmo, não no rodapé da tela de texto.
    async function apostarValor(valor) {
        if (!Number.isInteger(valor) || valor < 0 || valor > cartasRodada) {
            return { ok: false, mensagem: `Aposta precisa ser um número inteiro entre 0 e ${cartasRodada}.` };
        }
        try {
            await chamar('apostar', { salaId, valor });
            return { ok: true };
        } catch (erroDaChamada) {
            return { ok: false, mensagem: erroDaChamada.message };
        }
    }

    // Mesma ideia de `jogar` acima, só que pro clique numa carta do visual
    // novo (ver acoes.jogar em MesaExperimento.jsx): lá a carta clicada só
    // carrega { rank, naipe } (não o índice na mão) — acha o índice pelo
    // MESMO critério que cartaJogada já usa pra reconciliar jogada
    // automática (indexOf pela string, primeira ocorrência — só importa em
    // rodadas com baralhos repetidos, onde a MESMA carta pode aparecer mais
    // de uma vez na mão).
    function jogarCartaClicada({ rank, naipe }) {
        const indice = mao.indexOf(`[${rank} de ${naipe}]`);
        if (indice !== -1) jogar(indice);
    }

    async function forcarInicio() {
        setErro(null);
        try {
            await chamar('forcarInicio', { salaId });
        } catch (erroDaChamada) {
            setErro(erroDaChamada.message);
        }
    }

    // Só o adm vê o botão que chama isto (ver souDono mais abaixo) — cria
    // uma sala nova com a mesma config da que acabou e já entra nela; quem
    // mais estava aqui recebe o convite (convidadoParaRevanche) por fora.
    async function jogarDeNovo() {
        setErro(null);
        setCriandoRevanche(true);
        try {
            const resposta = await chamar('jogarDeNovo', { salaId });
            guardarInfoSala(resposta.salaId, { ...lerInfoSala(salaId), numberPlayers: resposta.numberPlayers, modeloBot: resposta.modeloBot });
            onEntrouNaSala(resposta.salaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto);
        } catch (erroDaChamada) {
            setErro(erroDaChamada.message);
            setCriandoRevanche(false);
        }
    }

    // Sim: primeiro sai de verdade da sala antiga (sairDaPartida,
    // best-effort — precisa vir ANTES de entrarSala na nova: o servidor só
    // tira o socket da room antiga se `salaPorSocket` ainda apontar pra ela
    // nesse momento; se a ordem fosse invertida, o socket já estaria
    // marcado como pertencendo à sala nova e a saída da antiga seria
    // ignorada, deixando a room velha presa pra sempre — ver
    // encerrarSeFinalizadaEVazia em conexao/socketServer.js). Só depois
    // entra na sala nova, igual um entrarSala normal (o convite não é mais
    // que isso — o adm já criou a sala, o resto do fluxo é o de sempre).
    async function aceitarConviteRevanche() {
        setErro(null);
        try {
            try {
                await chamar('sairDaPartida', { salaId });
            } catch {
                // melhor esforço — a sala antiga já terminou, o assento não importa mais
            }
            const resposta = await chamar('entrarSala', { salaId: conviteRevanche.novaSalaId });
            guardarInfoSala(conviteRevanche.novaSalaId, { ...lerInfoSala(salaId), numberPlayers: resposta.numberPlayers, modeloBot: resposta.modeloBot });
            onEntrouNaSala(conviteRevanche.novaSalaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto);
        } catch (erroDaChamada) {
            setErro(erroDaChamada.message);
            setConviteRevanche(null);
        }
    }

    // Botão de sair é sempre uma opção, antes ou depois da partida começar —
    // só muda o que significa "sair". Antes: sairSala de verdade (tira o
    // assento, ver PROTOCOLO.md). Depois: sairDaPartida — o assento vira bot
    // na hora no servidor (reaproveita o caminho da expulsão por
    // inatividade), em vez de esperar o timeout de inatividade acumular a
    // cada turno. Nos dois casos a gente volta pra tela de salas; se a
    // partida já tinha começado, a Lobby oferece reconectar (a vaga
    // continua reservada). O onSairDaPartida também é chamado pelo handler
    // de jogadorExpulsoPorInatividade quando o evento chega — chamar aqui
    // cobre o caso de a resposta demorar/falhar, e a dupla chamada é
    // idempotente (mesmo salaId, mesmo setSala(null)).
    async function sair() {
        if (!iniciada) {
            try {
                await chamar('sairSala', { salaId });
            } catch {
                // melhor esforço — se a partida começou bem nesse meio tempo, cai no caso abaixo
            }
            onSairDaSala();
            return;
        }
        try {
            await chamar('sairDaPartida', { salaId });
        } catch {
            // melhor esforço — mesmo se falhar, saímos da tela; o assento
            // acaba virando bot pelo timeout de inatividade de qualquer jeito
        }
        onSairDaPartida(salaId);
    }

    const souDono = jogadores.find((j) => j.nome === meuNome)?.adm === true;
    // A tela inteira (espera, mesa e fim) é o MesaExperimento. `estado` é
    // só uma leitura do que este componente JÁ monta a partir
    // dos handlers de socket lá em cima — nenhum evento novo é assinado
    // aqui, nenhuma lógica de jogo é duplicada. `acoes.jogar`/`acoes.apostar`
    // reaproveitam `jogar`/`apostarValor` de cima (mesma chamada de
    // verdade pro servidor) — chat livre ainda não está plugado (a tela
    // não tem form de texto livre, só as mensagens prontas via
    // acoes.enviarChatPronta).
    return (
        <MesaExperimento
            estado={{
                salaId, meuNome, senha, souDono, erro,
                // Vagas e regras da sala pra tela de espera (ver salasInfo.js
                // — a Lobby arcade anota antes de entrar).
                infoSala: lerInfoSala(salaId),
                iniciada, jogadores, ordem, segundosParaIniciar, chatAberto, chatEmCooldown, erroChat,
                ultimoSeq, prazoTurno, distribuicaoLiberada,
                mao, cartasRodada, numeroRodada, maosReveladas,
                mesa, vira, jogadorDaVez, jogadorDaVezAposta, apostas, vazasFeitas,
                eliminados, desconectados, ultimoPlacar, vencedor,
                vazaResultado, mensagensChat, conviteRevanche,
            }}
            acoes={{
                jogar: jogarCartaClicada,
                // Sem ack: é só um aviso de andamento da tela.
                animacoesConcluidas: (seq) => socket.emit('animacoesConcluidas', { salaId, seq }),
                aindaAnimando: () => socket.emit('aindaAnimando', { salaId }),
                apostar: apostarValor,
                // Só o adm pode forçar (o servidor recusa os outros com
                // NAO_AUTORIZADO) — pros outros o botão nem aparece.
                forcarInicio: souDono ? forcarInicio : undefined,
                enviarChatPronta,
                enviarChatLivre: chatAberto ? enviarChatLivre : undefined,
                sair,
                aceitarConviteRevanche,
                // Mesma regra da tela antiga (ver botão condicionado a
                // `souDono` lá embaixo, linha ~1075): só o adm pode
                // chamar jogarDeNovo de verdade (o servidor recusa quem
                // não é), então só passa a ação quando é o caso — sem
                // isso todo mundo veria o botão na tela de vitória e
                // levaria NAO_AUTORIZADO ao clicar.
                jogarDeNovo: souDono ? jogarDeNovo : undefined,
            }}
        />
    );
}
