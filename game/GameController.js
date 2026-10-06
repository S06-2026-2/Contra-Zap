// GameController.js
// Dona da sala de espera (lista de jogadores antes da partida começar) e
// orquestra a partida inteira (Game -> Rodada -> Mesa) quando ela
// começa, expondo o andamento como eventos em vez de console.log espalhado.
//
// Isso serve dois consumidores ao mesmo tempo, sem duplicar a lógica de regras:
//  - Main.js: assina os eventos e imprime no console (harness de teste local)
//  - Server.js (futuro): assina os eventos e faz io.emit(...) para os clientes via socket.io
import { EventEmitter } from 'node:events';
import { Game, MAX_DECK_SEM_LIMITE } from './Game.js';
import { PlayerGame } from './PlayerGame.js';
import { registrarPartidaIniciada, registrarPartidaFinalizada } from '../observabilidade/metricas.js';
import { escolherCarta, escolherAposta } from '../bots/BotBrain.js';
import {
    duracaoApostaFeita, duracaoCartaJogada, duracaoVazaFinalizada, duracaoRodadaFinalizada,
    duracaoEliminacao, duracaoDistribuicaoEVira,
} from './animacoesFront.js';

// Quando a última vaga de gente de verdade expira (ver _expirarVaga) e só
// sobra bot jogando contra bot, não faz sentido segurar o atrasoBotMs normal
// só pra ninguém ver — encolhe pra isso aqui, a partida termina sozinha em
// poucos ticks, e a sala já saiu do SalaManager na mesma hora (ver
// 'salaAbandonada').
const ATRASO_BOT_MS_SALA_ABANDONADA = 50;

// Margem pra lag de rede em cima da linha do tempo do front (ver
// _esperarDistribuicao).
const DISTRIBUICAO_FOLGA_MS = 800;

export class GameController extends EventEmitter {
    constructor({ numberPlayers, roundStart, randomShuffle, maxDeck, seed, modeloBot, tempoTurnoMs, limiteInatividadeMs, atrasoBotMs, tempoReservaMs, pausaVazaMs, pausaRodadaMs, limiteSeguraMs, limiteSeguraTotalMs, duracaoDistribuicaoMs } = {}) {
        super();
        this.numberPlayers = numberPlayers || 4;
        // Qual bot decide as jogadas automáticas desta sala (id de
        // bots/modelosBot.js). Só bots/BotBrain.js lê; undefined = modelo
        // padrão. A validação do id é da camada de sala (SalaManager).
        this.modeloBot = modeloBot;
        this.roundStart = roundStart || 1;
        this.randomShuffle = randomShuffle;
        // Máximo de baralhos por rodada (ver Game.proximaRodada). Sem valor na
        // config = "Sem Limite" (MAX_DECK_SEM_LIMITE). A validação de que
        // roundStart cabe nesse teto é da camada de sala (SalaManager).
        this.maxDeck = maxDeck ?? MAX_DECK_SEM_LIMITE;
        // Seed opcional pro embaralhamento (ver game/rng.js). undefined =
        // Math.random de sempre; um inteiro torna a partida reproduzível.
        this.seed = seed;
        // Quanto tempo esperar a jogada real antes de cair pro automático
        // (ver _aguardarJogadaOuTimeout). Campo público de propósito — dá
        // pra ajustar por sala (ex.: testes usam um valor bem menor).
        this.tempoTurnoMs = tempoTurnoMs ?? 20_000;
        // Quanto tempo (real, não em turnos) sem nenhuma ação de verdade até
        // o jogador ser expulso do socket da sala (ver _registrarTimeout /
        // jogadorExpulsoPorInatividade) — a vaga na partida continua, só o
        // socket sai. Campo público pelo mesmo motivo de tempoTurnoMs acima.
        this.limiteInatividadeMs = limiteInatividadeMs ?? 90_000;
        // Pausa artificial antes de qualquer jogada/aposta decidida por
        // bots/BotBrain.js (bot de verdade ou assento tomado por timeout,
        // ver PlayerGame.bot) — sem isso a mesa inteira de bots resolve uma
        // vaza inteira no mesmo tick, rápido demais pra acompanhar na UI.
        this.atrasoBotMs = atrasoBotMs ?? 2_000;
        // Quanto tempo (real) uma vaga fica reservada depois de virar bot
        // (jogadorExpulsoPorInatividade, por inatividade real ou
        // abandonarPartida) antes de expirar de vez — ver
        // _iniciarContadorReserva/_expirarVaga. Depois disso, reconectar não
        // funciona mais pra esse jogador (CodigosErro.VAGA_EXPIRADA).
        this.tempoReservaMs = tempoReservaMs ?? 150_000;
        // Pausa depois de finalizarVaza() (antes de começar a próxima vaza da
        // mesma rodada) pra dar tempo do front terminar a animação de "quem
        // levou" antes da próxima carta cair — mesmo problema do atrasoBotMs
        // acima, mas do lado do front em vez do de bots resolvendo rápido
        // demais. Valor pareado com PAUSA_VAZA_MS em
        // public/app/src/components/novo/Partida.jsx; mudou um lado, muda o
        // outro. Só entra ANTES de uma próxima vaza de verdade dentro da
        // MESMA rodada (ver _jogarUmaRodada) — a última vaza de uma rodada
        // usa pausaRodadaMs logo abaixo em vez desta (a suposição antiga de
        // que apostas/distribuição da rodada seguinte já dava folga sozinha
        // se provou errada: nada segura isso, ver pausaRodadaMs).
        this.pausaVazaMs = pausaVazaMs ?? 1_600;
        // Pausa depois de emitir rodadaFinalizada, antes de começar a
        // distribuir a rodada seguinte (ver _jogarUmaRodada) — cobre a
        // MESMA lacuna do pausaVazaMs acima, só que na borda entre rodadas:
        // sem isso, cartasDistribuidas/manilhaVirada da rodada nova saíam
        // colados em rodadaFinalizada, e o front (revelação da carta
        // vencedora da última vaza + cartas de dano do placar, ver
        // danoRodadaAtivoRef em MesaExperimento.jsx) tinha que segurar TUDO
        // isso sozinho só na base de refs — funciona no papel, mas dá zero
        // folga de verdade pra absorver qualquer corrida que escape daquela
        // trava. Não precisa cobrir a animação inteira (isso já é
        // responsabilidade do front) — só evitar o "murro" de eventos
        // colados que o Henrique via especificamente na vaza final da
        // rodada.
        this.pausaRodadaMs = pausaRodadaMs ?? 2_000;
        // Segurar pelas animações do front (ver _segurarPelasAnimacoes):
        // teto de quanto um turno espera os clientes terminarem de animar
        // SEM notícia deles — cada "ainda animando" (registrarAnimando)
        // renova esse prazo, então uma sequência longa (revelação + dano +
        // distribuição + vira) segura o tempo que precisar; um cliente que
        // trava ou cai para de avisar e o turno começa mesmo assim. O total
        // nunca passa de limiteSeguraTotalMs, pra um cliente preso em
        // "animando" (ou mal-intencionado) não congelar a sala.
        this.limiteSeguraMs = limiteSeguraMs ?? 10_000;
        this.limiteSeguraTotalMs = limiteSeguraTotalMs ?? 60_000;
        // Tempo fixo da distribuição (ver _esperarDistribuicao). null = calcula
        // do tamanho da rodada; um número fixa (testes usam um valor curto).
        this.duracaoDistribuicaoMs = duracaoDistribuicaoMs ?? null;
        // Até quando (Date.now()) o front ainda está animando o que já foi
        // emitido — estimativa do servidor, somando a duração de cada evento
        // que anima (ver animacoesFront.js e _somarAnimacaoFront).
        this._frenteOcupadaAte = 0;
        // Número do último evento emitido (ver emit abaixo) e, por jogador
        // que aderiu ao segurar, até qual número ele já terminou de animar.
        this._seq = 0;
        this._animacoesEmDia = new Map();
        this._segura = null;
        this.jogadores = [];
        this.game = null;
        this.rodada = null;
        this.numeroRodada = 0;
        // Cartas (valorInt*4+naipeInt) ja jogadas na rodada atual — memoria
        // que bots/BotBrain.js usa na observacao da rede. Zerada a cada
        // rodada nova em _jogarUmaRodada; so BotBrain le.
        this._cartasJogadasRodada = new Set();
        // playerId de quem já apostou na rodada atual — o valor de aposta 0
        // não distingue "apostou 0" de "ainda não apostou", então quem
        // reconecta (estadoDeReconexao) precisa disto pra saber quais apostas
        // já valem. Zerada junto com _cartasJogadasRodada em _jogarUmaRodada;
        // preenchida em _registrarAposta.
        this._apostasFeitasRodada = new Set();
        // Resultado da última rodadaFinalizada (mesmo payload do evento) —
        // resetarApostasSteaks zera aposta/steak na virada de rodada, então
        // quem reconecta na rodada seguinte não teria mais como remontar o
        // "Placar (última rodada)" sem isto. [] até a primeira rodada fechar.
        this._ultimoPlacar = [];
        // Nome do vencedor depois de jogoFinalizado (ver _resolverFimDeJogo) —
        // guardado pra quem reconecta DEPOIS do fim da partida (blip de rede
        // no último lance) receber o vencedor no ack em vez de uma mesa
        // aparentemente viva. null enquanto a partida não acabou.
        this._vencedor = null;
        this._timerInicio = null;
        // segundos passados pro último agendarInicio — só pra quem chega
        // depois do broadcast de partidaIniciandoEm (ex.: o cliente que
        // criou a sala e só monta a tela depois do ack) conseguir semear o
        // contador. null enquanto não há início agendado.
        this._segundosParaIniciar = null;
        this._jogadaEsperada = null;
        this._apostaEsperada = null;
        // true só depois que jogoFinalizado dispara (ver _resolverFimDeJogo)
        // — diferente de `game !== null` (que já é true desde o início da
        // partida), é o que permite distinguir "partida em andamento" de
        // "partida acabou" de fora (ver SalaManager.jogarDeNovo).
        this._finalizada = false;
        // true depois de destruir() — a sala saiu do sistema e este controller
        // não deve mais rodar nada. O loop da partida checa isso nos pontos de
        // re-entrada pra desenrolar em vez de seguir emitindo pra uma sala que
        // não existe mais.
        this._encerrado = false;
        // playerId -> timer do contador de reserva (ver _iniciarContadorReserva).
        this._timersReserva = new Map();
    }

    // Início já agendado (sala lotou) mas partida ainda não começou — o
    // estado entre agendarInicio e iniciarPartida. `segundosParaIniciar` é
    // o valor que foi (ou seria) emitido em partidaIniciandoEm; null quando
    // não há nada agendado.
    get inicioAgendado() { return this._timerInicio !== null; }
    get segundosParaIniciar() { return this._segundosParaIniciar; }
    get finalizada() { return this._finalizada; }

    // Sala de espera: transforma o Player que entrou num PlayerGame e guarda
    // na lista até a partida começar. Ordem de chegada é a própria posição
    // no array — nenhum campo à parte guarda isso.
    entrarNaSala(player) {
        this.jogadores.push(new PlayerGame(player));
        this.emit('jogadorEntrou', { id: player.id, nome: player.nome });
        return this;
    }

    // Chamado quando a sala lota: dá um tempo de espera antes de começar de
    // verdade (dá chance de cancelar via forcarInicio, ou simplesmente pra
    // não começar no instante exato que a última pessoa entra). Idempotente
    // — chamar de novo com a partida já agendada ou já iniciada não faz nada.
    agendarInicio(tempoEsperaMs) {
        if (this.game || this._timerInicio) return;

        this._timerInicio = setTimeout(() => this.iniciarPartida(), tempoEsperaMs);
        this._timerInicio.unref?.(); // não deve segurar o processo vivo (testes, shutdown)
        this._segundosParaIniciar = tempoEsperaMs / 1000;
        this.emit('partidaIniciandoEm', { segundos: this._segundosParaIniciar });
    }

    // Pura consulta — não lança, não muda estado. Quem decide se isso vira
    // um erro de protocolo (NAO_AUTORIZADO) é a camada de sala, não aqui.
    jogadorEhAdm(playerId) {
        return this.jogadores.some(jogador => jogador.id === playerId && jogador.adm);
    }

    // Sala de espera, ao contrário: tira o jogador da lista. Só faz sentido
    // antes da partida começar (quem chama garante isso, olhando `game`).
    // Se quem saiu era o adm e sobrou gente, o próximo da lista assume — a
    // sala nunca fica sem ninguém que possa forçar início. Cancela um
    // início agendado, já que a sala deixou de estar cheia. Devolve false
    // se o jogador nem estava na lista (chamador decide se isso é erro).
    removerJogador(playerId) {
        const indice = this.jogadores.findIndex(jogador => jogador.id === playerId);
        if (indice === -1) return false;

        const eraAdm = this.jogadores[indice].adm;
        const nome = this.jogadores[indice].nome;
        this.jogadores.splice(indice, 1);
        if (eraAdm && this.jogadores.length > 0) {
            this.jogadores[0].adm = true;
        }

        if (this._timerInicio) {
            clearTimeout(this._timerInicio);
            this._timerInicio = null;
            this._segundosParaIniciar = null;
        }

        this.emit('jogadorSaiu', { id: playerId, nome });
        return true;
    }

    // Pula a espera de agendarInicio e começa na hora. Quem valida se quem
    // pediu tem permissão é a camada de sala (via jogadorEhAdm), antes de
    // chamar isto.
    forcarInicio() {
        if (this._timerInicio) {
            clearTimeout(this._timerInicio);
            this._timerInicio = null;
            this._segundosParaIniciar = null;
        }
        this.iniciarPartida();
    }

    iniciarPartida() {
        if (this.game) return this; // idempotente — evita reiniciar se o timer e um forcarInicio colidirem

        if (this._timerInicio) {
            clearTimeout(this._timerInicio);
            this._timerInicio = null;
            this._segundosParaIniciar = null;
        }

        this.game = new Game({
            numberPlayers: this.numberPlayers,
            roundStart: this.roundStart,
            randomShuffle: this.randomShuffle,
            maxDeck: this.maxDeck,
            seed: this.seed,
            jogadores: [...this.jogadores],
        });
        this.game.setstartsequence();
        registrarPartidaIniciada();

        // O relógio de inatividade só passa a valer a partir daqui — tempo
        // parado na sala de espera não deve contar contra ninguém.
        const agora = Date.now();
        for (const jogador of this.jogadores) {
            jogador.ultimaAcaoEm = agora;
            jogador.expulsoPorInatividade = false;
        }

        this.numeroRodada = 1;
        this.rodada = this.game.newRodada();
        this.emit('novaRodadaIniciada', { numero: this.numeroRodada, cartas: this.rodada.round, ordem: this._ordemAssentos() });

        // A partir daqui a partida roda em segundo plano, pausando pra
        // esperar cada jogada real (ver _aguardarJogada/jogarCarta) — pode
        // levar segundos, minutos, o tempo que for. iniciarPartida() não
        // espera nada disso, só dispara e devolve na hora. O .catch aqui
        // garante que um erro inesperado no meio da partida vira
        // _abortarPartida (avisa a sala) em vez de um unhandled rejection
        // que derruba o processo.
        this._rodarPartida().catch(erro => this._abortarPartida(erro));
        return this;
    }

    // Chamado quando o loop da partida lança um erro inesperado (ex.: baralho
    // vazio / Rodada impossível — invariantes que "não deviam acontecer", ver
    // Baralho.js e Rodada). Não tenta recuperar de propósito: marca a partida
    // como encerrada, corta os timers soltos e emite 'partidaAbortada' pra
    // sala inteira, pra ninguém ficar olhando uma mesa congelada sem saber
    // por quê. O estado fica de pé (não desmonta a sala) pra dar pra
    // investigar.
    _abortarPartida(erro) {
        console.error('Partida abortada por erro interno:', erro);

        this._limparTimers();

        // Mesmo efeito de jogoFinalizado pra quem olha de fora (SalaManager,
        // "jogar de novo"): a partida não está mais "em andamento".
        this._finalizada = true;
        registrarPartidaFinalizada();
        this.emit('partidaAbortada', { motivo: 'erro_interno', erro: erro?.message ?? String(erro) });
    }

    // Cancela todo timer que este controller possa ter em aberto: o de início
    // de partida e todos os contadores de reserva de vaga. Idempotente.
    _limparTimers() {
        if (this._timerInicio) {
            clearTimeout(this._timerInicio);
            this._timerInicio = null;
            this._segundosParaIniciar = null;
        }
        for (const timer of this._timersReserva.values()) {
            clearTimeout(timer);
        }
        this._timersReserva.clear();
    }

    // Teardown: chamado por SalaManager.removerSala quando a sala sai do
    // sistema. Sem isto, um controller de sala já removida seguiria com o loop
    // da partida rodando, os listeners de socket presos (memória) e os timers
    // de reserva disparando `_expirarVaga` num objeto solto. Depois daqui o
    // controller não emite mais nada e o loop, se estiver no ar, desenrola no
    // próximo ponto de re-entrada (ver o guard de _encerrado em
    // _rodarPartida/_jogarUmaRodada).
     destruir() {
        // Cobre o caso de a sala ser removida (SalaManager) com uma partida
        // ainda em andamento, sem ter passado por jogoFinalizado nem
        // partidaAbortada — sem isso, "partidas ativas" ficaria superestimado
        // pra sempre nesse cenário. O guard evita decrementar de novo se a
        // partida já tinha terminado normalmente antes disso.
        if (this.game && !this._finalizada) {
            registrarPartidaFinalizada();
        }
        this._encerrado = true;
        this._limparTimers();
        // Desbloqueia o loop se ele estiver parado num await esperando jogada
        // ou aposta real — resolve com null; o guard de _encerrado logo depois
        // do await faz o loop retornar sem tocar nesse valor.
        this._jogadaEsperada?.resolver(null);
        this._apostaEsperada?.resolver(null);
        this._jogadaEsperada = null;
        this._apostaEsperada = null;

        this.removeAllListeners();
    }

    // Devolve uma Promise que só resolve quando jogarCarta(jogador.id, ...)
    // for chamado com sucesso pra esse jogador específico — é a pausa real
    // que faltava. Guardar { jogadorId, resolver } ANTES de emitir
    // turnoJogador (chamado por quem usa isto) é o que permite um listener
    // síncrono (ex.: o auto-play do Main.js) responder na hora, dentro do
    // próprio emit, sem cair numa corrida onde a espera ainda nem existe.
    _aguardarJogada(jogador) {
        return new Promise((resolve) => {
            this._jogadaEsperada = { jogadorId: jogador.id, resolver: resolve };
        });
    }

    // Chamado sempre que um jogador faz alguma ação real (jogar carta,
    // apostar ou reconectar) — desliga a flag de "no automático" (inclusive
    // `bot`, que só um jogador de verdade pode ter ligado; um Bot de
    // bots/Bot.js nunca passa por aqui) e reseta o relógio de inatividade
    // usado por _registrarTimeout, pra turnos que já não são mais dele não
    // contarem contra ele.
    _registrarAtividade(jogador) {
        jogador.desconectado = false;
        jogador.bot = false;
        jogador.expulsoPorInatividade = false;
        jogador.ultimaAcaoEm = Date.now();
        // Voltou antes da vaga expirar (ver _iniciarContadorReserva) — cancela
        // o contador, senão ele dispararia mesmo com o jogador já de volta.
        this._cancelarContadorReserva(jogador.id);
    }

    // Começa a contar tempoReservaMs pra essa vaga — chamado nos dois lugares
    // que emitem jogadorExpulsoPorInatividade (_registrarTimeout e
    // abandonarPartida). Cancela um contador anterior antes de recomeçar, pra
    // nunca ter dois rodando pro mesmo jogador ao mesmo tempo.
    _iniciarContadorReserva(jogador) {
        this._cancelarContadorReserva(jogador.id);
        const timer = setTimeout(() => this._expirarVaga(jogador), this.tempoReservaMs);
        timer.unref?.();
        this._timersReserva.set(jogador.id, timer);
    }

    _cancelarContadorReserva(playerId) {
        const timer = this._timersReserva.get(playerId);
        if (timer) {
            clearTimeout(timer);
            this._timersReserva.delete(playerId);
        }
    }

    // tempoReservaMs estourou sem reconectar/jogar de verdade: a vaga não
    // pode mais ser reclamada (ver vagaExpirada/SalaManager.reconectar) — o
    // assento continua jogando como bot pelo resto da partida, só que agora
    // pra sempre. Se essa era a última vaga de gente de verdade (eraBot já
    // identifica quem nasceu bot de bots/Bot.js, ver PlayerGame), não sobrou
    // ninguém que possa voltar: encolhe o atraso de bot pra terminar rápido e
    // avisa quem gerencia o Map de salas (SalaManager) pra tirar esta sala do
    // sistema na hora, via evento interno — GameController não sabe (nem
    // precisa saber) o que é um SalaManager.
    _expirarVaga(jogador) {
        this._timersReserva.delete(jogador.id);
        this._marcarVagaExpirada(jogador);
    }

    // Núcleo compartilhado por _expirarVaga (o contador de reserva estourou)
    // e desistir (o jogador pediu pra sair de vez): marca a vaga como
    // não-reclamável, avisa a sala, passa o adm adiante se era dele, e
    // descarta a sala se não sobrou mais ninguém de verdade. NÃO mexe no
    // timer de reserva — quem chama cuida disso (delete direto no
    // _expirarVaga, _cancelarContadorReserva no desistir).
    _marcarVagaExpirada(jogador) {
        jogador.vagaExpirada = true;
        this.emit('vagaExpirada', { id: jogador.id, jogador: jogador.nome });

        // Sucessão de adm: só transfere quando a vaga expira de vez, não já
        // quando ele só virou bot temporário — enquanto durar a reserva ele
        // continua adm normalmente e recupera isso sozinho ao reconectar,
        // porque a flag nunca chegou a sair dele.
        if (jogador.adm) {
            this._transferirAdm(jogador);
        }

        if (this.jogadores.every(j => j.eraBot || j.vagaExpirada)) {
            this.atrasoBotMs = ATRASO_BOT_MS_SALA_ABANDONADA;
            this.emit('salaAbandonada', {});
        }
    }

    // Passa o posto de adm pro próximo jogador de verdade (nem `eraBot`, nem
    // com `vagaExpirada`) a partir da posição de quem está saindo, na ordem
    // de entrada — mesma ideia de removerJogador (sala de espera), só que
    // aqui o assento nunca é removido da lista depois que a partida começa,
    // então é preciso pular quem já nasceu bot ou já teve a vaga expirada. O
    // laço sempre volta a examinar o próprio `antigoAdm` por último (ele já
    // está com `vagaExpirada`, então nunca é escolhido de novo) — se ninguém
    // mais for elegível, ninguém vira adm, e tudo bem: só acontece quando
    // não sobra gente de verdade, caso em que a sala inteira é descartada
    // logo em seguida (ver a checagem de 'salaAbandonada' que roda depois).
    _transferirAdm(antigoAdm) {
        antigoAdm.adm = false;
        const indiceAtual = this.jogadores.indexOf(antigoAdm);
        for (let passo = 1; passo <= this.jogadores.length; passo++) {
            const candidato = this.jogadores[(indiceAtual + passo) % this.jogadores.length];
            if (!candidato.eraBot && !candidato.vagaExpirada) {
                candidato.adm = true;
                this.emit('novoAdm', { id: candidato.id, jogador: candidato.nome });
                return;
            }
        }
    }

    // Pura consulta (mesmo estilo de jogadorEhAdm) — usada por
    // SalaManager.reconectar pra distinguir "vaga expirada de vez"
    // (CodigosErro.VAGA_EXPIRADA) de "nunca fez parte dessa partida"
    // (NAO_ESTA_NA_SALA).
    vagaExpirada(playerId) {
        return this.jogadores.some(jogador => jogador.id === playerId && jogador.vagaExpirada);
    }

    // Chamado por todo timeout de turno (aposta ou carta): liga desconectado
    // — só essa falta específica é decidida por bots/BotBrain.js, os turnos
    // seguintes continuam esperando tempoTurnoMs normalmente (pode ter sido
    // só uma demora, sem querer). Só quando a inatividade real dele passa de
    // limiteInatividadeMs (várias faltas seguidas, não uma só) é que ele é
    // considerado desconectado de verdade: expulsa o socket da sala — ver
    // jogadorExpulsoPorInatividade, tratado em conexao/socketServer.js — E
    // liga `bot`, que é o que faz esse assento parar de esperar e passar a
    // jogar na hora a partir daí (ver _aguardarJogadaOuTimeout/
    // _aguardarApostaOuTimeout), até ele reconectar ou jogar de verdade
    // (_registrarAtividade desliga as duas flags de novo). A vaga na partida
    // não muda, só a presença do socket na room; o guard de
    // expulsoPorInatividade evita reemitir isso a cada novo timeout enquanto
    // ele continuar sumido.
    _registrarTimeout(jogador) {
        jogador.desconectado = true;
        if (!jogador.expulsoPorInatividade && Date.now() - jogador.ultimaAcaoEm >= this.limiteInatividadeMs) {
            jogador.expulsoPorInatividade = true;
            jogador.bot = true;
            this.emit('jogadorExpulsoPorInatividade', { id: jogador.id, jogador: jogador.nome });
            this._iniciarContadorReserva(jogador);
        }
    }

    // Pausa artificial (atrasoBotMs) antes de uma decisão de bots/BotBrain.js
    // — ver o comentário no construtor.
    _atrasoBot() {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, this.atrasoBotMs);
            timer.unref?.();
        });
    }

    // Mesma ideia de _atrasoBot, mas pra segurar o back depois de uma vaza
    // (ver pausaVazaMs no construtor).
    _pausaVaza() {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, this.pausaVazaMs);
            timer.unref?.();
        });
    }

    // Mesma ideia, mas pra segurar o back depois de fechar uma rodada
    // inteira (ver pausaRodadaMs no construtor).
    _pausaRodada() {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, this.pausaRodadaMs);
            timer.unref?.();
        });
    }

    // Depois que a partida começa, todo evento com payload de objeto sai
    // numerado (`seq`, crescente até o fim) — é a referência de "até onde" o
    // front diz que já terminou de animar (ver registrarAnimacoes). Na sala
    // de espera não há o que animar, então nada sai numerado. Payload em
    // array (cartasDistribuidas) sai sem número: sempre vem seguido de
    // manilhaVirada, que carrega um maior.
    emit(evento, dados, ...resto) {
        if (this.game && dados && typeof dados === 'object' && !Array.isArray(dados)) {
            dados = { ...dados, seq: ++this._seq };
        }
        return super.emit(evento, dados, ...resto);
    }

    // O front avisa que terminou de animar tudo até o evento `seq` (null =
    // sai do segurar, ex.: trocou pra uma tela sem animação). Só quem já
    // mandou isto alguma vez conta em _segurarPelasAnimacoes — um cliente que
    // nunca avisa (tela de debug, testes) não segura nada.
    registrarAnimacoes(playerId, seq) {
        if (!this.jogadores.some(j => j.id === playerId)) return false;
        if (seq == null) {
            this._animacoesEmDia.delete(playerId);
        } else if (Number.isInteger(seq)) {
            this._animacoesEmDia.set(playerId, Math.max(this._animacoesEmDia.get(playerId) ?? 0, seq));
        } else {
            return false;
        }
        if (this._segura && this._clientesEmDia(this._segura.alvo)) this._segura.soltar();
        return true;
    }

    // O front ainda está animando o que já chegou (ver "Segurar pelas
    // animações" no PROTOCOLO.md) — renova o prazo da espera em andamento,
    // até o teto total.
    registrarAnimando(playerId) {
        if (!this._animacoesEmDia.has(playerId) || !this._segura) return false;
        this._segura.renovar();
        return true;
    }

    // Distribuir cartas é a animação mais longa e a que mais sofre com lag
    // (depende de todos os fronts confirmarem): em vez de esperar as
    // confirmações, o servidor espera a própria estimativa de até quando o
    // front está ocupado — tudo o que ainda está na fila da tela (manilha da
    // última carta, revelação da última vaza, dano, mortes) mais a
    // distribuição e a vira desta rodada, mais uma folga — e emite
    // distribuicaoConcluida, liberando todo mundo junto. Só quando algum
    // front aderiu ao segurar — sem ninguém animando, não há o que esperar.
    async _esperarDistribuicao(rodada) {
        this._somarAnimacaoFront(duracaoDistribuicaoEVira(rodada.gameOrder.length, rodada.round));
        if (!this._alguemSegurando()) return;
        const duracao = this.duracaoDistribuicaoMs
            ?? Math.max(0, this._frenteOcupadaAte - Date.now()) + DISTRIBUICAO_FOLGA_MS;
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, duracao);
            timer.unref?.();
        });
        if (this._encerrado) return;
        this.emit('distribuicaoConcluida', { numero: this.numeroRodada });
    }

    // O front toca as coreografias em fila, uma depois da outra: cada evento
    // que anima empurra a linha do tempo a partir de onde ela já estava (ou
    // de agora, se a tela já estava parada).
    _somarAnimacaoFront(duracaoMs) {
        if (!(duracaoMs > 0)) return;
        this._frenteOcupadaAte = Math.max(Date.now(), this._frenteOcupadaAte) + duracaoMs;
    }

    // Algum humano aderiu ao segurar pelas animações? (mesmo critério de
    // _clientesEmDia)
    _alguemSegurando() {
        for (const id of this._animacoesEmDia.keys()) {
            const jogador = this.jogadores.find(j => j.id === id);
            if (jogador && !jogador.bot) return true;
        }
        return false;
    }

    // Todo humano que aderiu já animou até `alvo`? Só fica de fora assento
    // que virou bot (expulso, saiu, desistiu — o socket saiu da sala). Um
    // timeout isolado liga `desconectado` mas a tela continua lá, animando:
    // se contasse, um único timeout fazia esse jogador parar de segurar a
    // partida pra sempre.
    _clientesEmDia(alvo) {
        for (const [id, seq] of this._animacoesEmDia) {
            const jogador = this.jogadores.find(j => j.id === id);
            if (!jogador || jogador.bot) continue;
            if (seq < alvo) return false;
        }
        return true;
    }

    // Antes de começar um turno (aposta ou jogada, humano ou bot), espera os
    // clientes que aderiram terminarem de animar tudo o que já foi emitido
    // — é o que impede o timer de alguém rodar enquanto a tela dele ainda
    // mostra a vaza/rodada anterior. Nunca mais que limiteSeguraMs.
    _segurarPelasAnimacoes() {
        const alvo = this._seq;
        if (this._clientesEmDia(alvo)) return Promise.resolve();
        return new Promise((resolve) => {
            const inicio = Date.now();
            let timer = null;
            const soltar = () => {
                clearTimeout(timer);
                this._segura = null;
                resolve();
            };
            const renovar = () => {
                clearTimeout(timer);
                const restanteTotal = this.limiteSeguraTotalMs - (Date.now() - inicio);
                timer = setTimeout(soltar, Math.max(0, Math.min(this.limiteSeguraMs, restanteTotal)));
                timer.unref?.();
            };
            renovar();
            this._segura = { alvo, soltar, renovar };
        });
    }

    // Avisa que o timer de `jogador` acabou de começar a correr — emitido
    // logo depois do setTimeout do turno, então `tempoMs` é exatamente o que
    // falta pro automático jogar por ele. Pra bot, sai logo antes do
    // _atrasoBot com `tempoMs` = atrasoBotMs: é quanto falta pra ele decidir.
    _emitirTimerTurno(jogador, tipo, tempoMs = this.tempoTurnoMs) {
        this.emit('timerTurno', { id: jogador.id, jogador: jogador.nome, tipo, tempoMs });
    }

    // Igual _aguardarJogada, mas com prazo: se tempoTurnoMs passar sem
    // jogarCarta() de verdade, joga por conta própria (ver bots/BotBrain.js)
    // e liga jogador.desconectado — é o sinal de que essa cadeira está no
    // automático até reconectar ou jogar de novo (ver marcarReconectado /
    // jogarCarta). O guard dentro do timeout existe pra não resolver duas
    // vezes se o timer disparar bem na hora que uma jogada real também
    // chegou.
    //
    // Um Bot de verdade (jogador.bot, ver bots/Bot.js) nunca tem um socket
    // do outro lado esperando — não faz sentido segurar tempoTurnoMs pra só
    // então jogar por ele, então decide e devolve na hora (com atrasoBotMs
    // de pausa, só pra não passar a vaza inteira num único tick), sem
    // passar pela espera/timeout que só existe pra dar chance de uma jogada
    // real chegar. Um jogador real só cai nesse mesmo atalho depois de ser
    // expulso por inatividade de verdade (várias faltas seguidas passando
    // de limiteInatividadeMs — ver _registrarTimeout), não já na primeira
    // vez que tempoTurnoMs estoura: uma falta isolada é só mais uma jogada
    // decidida automaticamente lá embaixo, sem ligar `bot` — o próximo
    // turno dele continua esperando normalmente.
    // O timer de um humano começa no MESMO instante em que sai o
    // timerTurno (ver _emitirTimerTurno) — é por ele que o front sabe
    // quanto tempo o jogador tem de verdade. O do bot é o atrasoBotMs.
    async _aguardarJogadaOuTimeout(jogador) {
        await this._segurarPelasAnimacoes();
        if (this._encerrado) return 0;
        if (jogador.bot) {
            this.emit('turnoJogador', { id: jogador.id, jogador: jogador.nome });
            if (jogador.desconectado) this.emit('jogadaAutomatica', { id: jogador.id, jogador: jogador.nome });
            this._emitirTimerTurno(jogador, 'jogada', this.atrasoBotMs);
            await this._atrasoBot();
            return escolherCarta(jogador, this);
        }

        const jogadaFeita = this._aguardarJogada(jogador);
        this.emit('turnoJogador', { id: jogador.id, jogador: jogador.nome });

        const timer = setTimeout(() => {
            if (this._jogadaEsperada?.jogadorId !== jogador.id) return;
            this._registrarTimeout(jogador);
            const resolver = this._jogadaEsperada.resolver;
            this._jogadaEsperada = null;
            this.emit('jogadaAutomatica', { id: jogador.id, jogador: jogador.nome });
            resolver(escolherCarta(jogador, this));
        }, this.tempoTurnoMs);
        timer.unref?.();
        this._emitirTimerTurno(jogador, 'jogada');

        const indice = await jogadaFeita;
        clearTimeout(timer);
        return indice;
    }

    // Chamado de fora (via protocolo) quando um jogador manda a carta que
    // quer jogar. `indice` é a posição na mão dele (0-based). Devolve
    // { ok: true } se aceita — e só então o índice é consumido e a espera
    // em _jogarUmaRodada é liberada — ou { ok: false, motivo } se não for
    // a vez desse jogador ou o índice não existir na mão dele; nesses casos
    // nada muda e a espera continua de pé.
    jogarCarta(playerId, indice) {
        if (!this._jogadaEsperada || this._jogadaEsperada.jogadorId !== playerId) {
            return { ok: false, motivo: 'NAO_E_SUA_VEZ' };
        }

        const jogador = this.jogadores.find(j => j.id === playerId);
        if (!Number.isInteger(indice) || indice < 0 || indice >= jogador.mao.length) {
            return { ok: false, motivo: 'CARTA_INVALIDA' };
        }

        this._registrarAtividade(jogador); // jogou de verdade — claramente está de volta
        const resolver = this._jogadaEsperada.resolver;
        this._jogadaEsperada = null;
        resolver(indice);
        return { ok: true };
    }

    // Fixa a aposta de um jogador e avisa a sala — chamado tanto por uma
    // aposta real (apostar) quanto pelo timeout (valor default). Único lugar
    // que escreve em jogador.aposta, pra sempre emitir apostaFeita junto.
    _registrarAposta(jogador, valor) {
        jogador.aposta = valor;
        this._apostasFeitasRodada.add(jogador.id);
        this.emit('apostaFeita', { jogador: jogador.nome, aposta: valor });
        this._somarAnimacaoFront(duracaoApostaFeita(valor));
    }

    // Mesma ideia de _aguardarJogada, mas pra aposta: só resolve quando
    // apostar(jogador.id, ...) for chamado com sucesso pra esse jogador.
    _aguardarAposta(jogador) {
        return new Promise((resolve) => {
            this._apostaEsperada = { jogadorId: jogador.id, resolver: resolve };
        });
    }

    // Soma das apostas já registradas pelos outros jogadores da rodada (o
    // próprio `jogador` fica de fora da soma, apostado ou não). Só faz
    // sentido chamar isso pelo último a apostar — pros demais, ainda tem
    // gente sem apostar (valor default 0), então a soma não representaria
    // "todo mundo menos eu".
    _somaApostasDosOutros(jogador) {
        return this.rodada.gameOrder.reduce((soma, j) => j === jogador ? soma : soma + j.aposta, 0);
    }

    // true só pro último jogador a apostar na rodada (ordem de
    // rodada.gameOrder, a mesma em que _jogarUmaRodada pede as apostas) —
    // é o único cuja aposta fecha (ou não) a soma de todo mundo, porque
    // todos os outros já apostaram quando chega a vez dele.
    _ehUltimoAApostar(jogador) {
        const ordem = this.rodada.gameOrder;
        return ordem[ordem.length - 1] === jogador;
    }

    // Aposta usada quando não há uma real (timeout, ou o turno de um Bot de
    // verdade) — delega pra bots/BotBrain.js, só calculando a única coisa
    // que ele não pode saber sozinho: se apostar 1 fecharia a soma da
    // rodada exatamente no número de cartas (só pode acontecer com o
    // último a apostar; 0 sempre é alternativa válida nesse caso, porque só
    // existe um valor proibido por vez — ver apostar()). Na rodada de 1
    // carta a regra nem entra em jogo — ver o comentário em apostar().
    _decidirApostaAutomatica(jogador) {
        const numCartas = this.rodada.round;
        const permiteAposta1 = !(numCartas > 1 && this._ehUltimoAApostar(jogador) && this._somaApostasDosOutros(jogador) + 1 === numCartas);
        return escolherAposta(jogador, { permiteAposta1, controller: this });
    }

    // Igual _aguardarJogadaOuTimeout: emite turnoAposta e dá tempoTurnoMs
    // pra uma aposta real chegar; estourou, registra a aposta automática
    // (ver _decidirApostaAutomatica) e liga desconectado — só depois de
    // expulso por inatividade de verdade é que `bot` liga e esse assento
    // passa a apostar na hora, pelo mesmo motivo de _aguardarJogadaOuTimeout.
    // `segurar: false` pula a espera pelas animações — a primeira aposta da
    // rodada já esperou a distribuição por tempo fixo (_esperarDistribuicao).
    async _aguardarApostaOuTimeout(jogador, { segurar = true } = {}) {
        if (segurar) await this._segurarPelasAnimacoes();
        if (this._encerrado) return;
        if (jogador.bot) {
            this.emit('turnoAposta', { id: jogador.id, jogador: jogador.nome });
            this._emitirTimerTurno(jogador, 'aposta', this.atrasoBotMs);
            await this._atrasoBot();
            this._registrarAposta(jogador, this._decidirApostaAutomatica(jogador));
            return;
        }

        const apostaFeita = this._aguardarAposta(jogador);
        this.emit('turnoAposta', { id: jogador.id, jogador: jogador.nome });

        const timer = setTimeout(() => {
            if (this._apostaEsperada?.jogadorId !== jogador.id) return;
            this._registrarTimeout(jogador);
            const resolver = this._apostaEsperada.resolver;
            this._apostaEsperada = null;
            this._registrarAposta(jogador, this._decidirApostaAutomatica(jogador));
            resolver();
        }, this.tempoTurnoMs);
        timer.unref?.();
        this._emitirTimerTurno(jogador, 'aposta');

        await apostaFeita;
        clearTimeout(timer);
    }

    // Chamado de fora (via protocolo) quando um jogador manda a aposta dele.
    // Mesmo formato de retorno de jogarCarta: { ok: true } se aceita, ou
    // { ok: false, motivo } se não for a vez dele ou o valor for inválido.
    // Dois limites: `valor` tem que estar entre 0 e o número de cartas da
    // rodada (fora disso, não faz sentido apostar mais vazas do que existem
    // cartas pra fazer); e o ÚLTIMO a apostar não pode escolher o valor que
    // fecha a soma de todo mundo exatamente no número de cartas — isso
    // garantiria que alguém acerta a aposta sem perder vida, o que não pode
    // (é justamente por isso que a ordem de aposta precisa ser aleatória:
    // ser o último é uma desvantagem real, então não pode ser sempre a
    // mesma pessoa por ter entrado por último na sala).
    //
    // Essa segunda trava fica DESLIGADA na rodada de 1 carta (numCartas ===
    // 1). Nela os únicos valores possíveis já são 0 e 1 — proibir um dos
    // dois não sobra "outra opção", trava o último jogador num valor único
    // e forçado, o dobro do aperto que a regra causa numa rodada normal (que
    // só descarta 1 de vários valores possíveis). Por isso ela só passa a
    // valer a partir da rodada de 2 cartas.
    apostar(playerId, valor) {
        if (!this._apostaEsperada || this._apostaEsperada.jogadorId !== playerId) {
            return { ok: false, motivo: 'NAO_E_SUA_VEZ' };
        }

        const numCartas = this.rodada.round;
        if (!Number.isInteger(valor) || valor < 0 || valor > numCartas) {
            return { ok: false, motivo: 'APOSTA_INVALIDA' };
        }

        const jogador = this.jogadores.find(j => j.id === playerId);
        if (numCartas > 1 && this._ehUltimoAApostar(jogador) && this._somaApostasDosOutros(jogador) + valor === numCartas) {
            return { ok: false, motivo: 'APOSTA_FECHA_RODADA' };
        }

        this._registrarAtividade(jogador); // apostou de verdade — claramente está de volta
        const resolver = this._apostaEsperada.resolver;
        this._apostaEsperada = null;
        this._registrarAposta(jogador, valor);
        resolver();
        return { ok: true };
    }

    // "Dica do bot": o que o bot desta sala (modeloBot) faria no lugar de
    // `playerId` AGORA, sem jogar nada — mesma chamada ao bots/BotBrain.js
    // que o automático faria no timeout (_decidirApostaAutomatica /
    // escolherCarta), então a dica é exatamente a jogada que ele faria. Só
    // responde na vez do próprio jogador (aposta OU carta); fora disso
    // devolve null. A decisão é determinística (argmax), então pedir de novo
    // na mesma vez dá a mesma resposta.
    sugestaoBot(playerId) {
        if (!this.game || this._finalizada) return null;
        const jogador = this.jogadores.find(j => j.id === playerId);
        if (!jogador) return null;

        if (this._apostaEsperada?.jogadorId === playerId) {
            return { tipo: 'aposta', valor: this._decidirApostaAutomatica(jogador) };
        }
        if (this._jogadaEsperada?.jogadorId === playerId) {
            const indice = escolherCarta(jogador, this);
            return { tipo: 'carta', indice, carta: jogador.mao[indice]?.toString() ?? null };
        }
        return null;
    }

    // Estado pra alguém que estava fora reencaixar numa partida já em
    // andamento e remontar a tela inteira sem depender dos broadcasts que já
    // passaram enquanto ele estava desconectado: a própria mão, de quem é a
    // vez (jogar carta OU apostar — as duas esperas nunca coexistem, a rodada
    // só chega na vaza depois que todo mundo apostou), a mesa da vaza em
    // curso, a vira/manilha, quem já apostou quanto, hp/placar da última
    // rodada, quem morreu, quem está no automático e — se a partida já
    // acabou — o vencedor. null se esse playerId não faz parte de uma partida
    // em andamento aqui (sala ainda não começou, ou ele nunca esteve nela).
    // Nomes na ordem dos assentos em volta da mesa — a sorteada no início da
    // partida (Game.ordemOriginal), que nunca muda nem encolhe: eliminado
    // continua no lugar dele. A vez sempre anda pra frente nesta lista (quem
    // começa gira a cada rodada, ver Game.girarOrdem), então é o que o front
    // precisa pra desenhar a mesa em ordem de jogo, sem depender da ordem
    // de entrada na sala.
    _ordemAssentos() {
        return this.game.ordemOriginal.map(j => j.nome);
    }

    estadoDeReconexao(playerId) {
        if (!this.game) return null;
        const jogador = this.jogadores.find(j => j.id === playerId);
        if (!jogador) return null;

        const idDaVez = this._jogadaEsperada?.jogadorId ?? null;
        const idDaVezAposta = this._apostaEsperada?.jogadorId ?? null;
        // Na rodada de 1 carta a tela precisa das mãos dos outros pra remontar
        // a "testa" (o broadcast de maosReveladas já passou antes de voltar).
        // Só as de quem ainda não jogou — a rodada tem uma vaza só.
        const maosReveladas = this.rodada.round === 1
            ? this.rodada.gameOrder
                .filter(j => j.id !== playerId && j.mao.length > 0)
                .map(j => ({ jogador: j.nome, mao: j.mao.map(c => c.toString()) }))
            : [];
        // Cartas já baixadas na vaza atual, na ordem em que caíram (mesmo
        // formato do evento cartaJogada). Vazio no começo de cada vaza.
        const mesa = (this.rodada.mesaAtiva?.cartasNaMesa ?? [])
            .map(({ carta, jogador: quem }) => ({ jogador: quem.nome, carta: carta.toString() }));
        // Só as apostas que já valem (ver _apostasFeitasRodada) — mesmo
        // formato acumulado do evento apostaFeita.
        const apostas = this.rodada.gameOrder
            .filter(j => this._apostasFeitasRodada.has(j.id))
            .map(j => ({ jogador: j.nome, aposta: j.aposta }));
        return {
            // Roster com adm — o ack de reconectar não passa por notificarSala,
            // então sem isto a tela remontada fica sem lista de jogadores até
            // o próximo evento que a mexa (novoAdm, alguém entrando/saindo).
            jogadores: this.jogadores.map(j => ({ nome: j.nome, adm: j.adm })),
            // Mesma lista do novaRodadaIniciada (ver _ordemAssentos).
            ordem: this._ordemAssentos(),
            mao: jogador.mao.map(c => c.toString()),
            cartasRodada: this.rodada.round,
            numeroRodada: this.numeroRodada,
            maosReveladas,
            mesa,
            // vira só existe depois de virarManilha (null no vão entre
            // novaRodadaIniciada e a manilha, que na prática é síncrono).
            vira: this.rodada.vira ? this.rodada.vira.toString() : null,
            viraValor: this.rodada.vira ? this.rodada.viraValor : null,
            apostas,
            // Assentos com hp zerado (this.jogadores nunca encolhe depois que
            // a partida começa, ao contrário de game.gameOrder).
            eliminados: this.jogadores.filter(j => j.hp <= 0).map(j => j.nome),
            // Assento humano jogando no automático agora (não um Bot de
            // verdade) — mesmo critério do evento jogadorExpulsoPorInatividade.
            // Sem o próprio: ele está reconectando exatamente agora.
            desconectados: this.jogadores
                .filter(j => j.id !== playerId && j.bot && !j.eraBot)
                .map(j => j.nome),
            ultimoPlacar: this._ultimoPlacar,
            suaVez: idDaVez === playerId,
            jogadorDaVez: idDaVez ? this.jogadores.find(j => j.id === idDaVez)?.nome ?? null : null,
            suaVezDaAposta: idDaVezAposta === playerId,
            jogadorDaVezAposta: idDaVezAposta ? this.jogadores.find(j => j.id === idDaVezAposta)?.nome ?? null : null,
            // Reconexão depois de jogoFinalizado (blip de rede no fim): a
            // partida não tem mais turno nenhum de pé, o vencedor é o estado.
            finalizada: this._finalizada,
            vencedor: this._vencedor,
        };
    }

    // Abandono voluntário de uma partida em andamento (botão "Sair da
    // partida" no front, via conexao/SalaManager.js). Diferente de uma falta
    // isolada por timeout — aqui a pessoa disse que vai embora, então o
    // assento já vira bot na hora, sem esperar limiteInatividadeMs acumular:
    // liga as mesmas flags que _registrarTimeout ligaria na expulsão por
    // inatividade (desconectado + bot + expulsoPorInatividade) e emite o
    // mesmo jogadorExpulsoPorInatividade, que a camada de socket usa pra
    // tirar o socket dele da room. A vaga em `jogadores` continua — volta a
    // ser humano se ele reconectar ou jogar/apostar de verdade
    // (_registrarAtividade). Devolve false se esse playerId não faz parte da
    // partida (ninguém com esse id, ou a partida nem começou).
    abandonarPartida(playerId) {
        if (!this.game) return false;
        const jogador = this.jogadores.find(j => j.id === playerId);
        if (!jogador) return false;

        jogador.desconectado = true;
        jogador.bot = true;
        jogador.expulsoPorInatividade = true;
        this.emit('jogadorExpulsoPorInatividade', { id: jogador.id, jogador: jogador.nome });
        this._iniciarContadorReserva(jogador);
        return true;
    }

    // Desistência DEFINITIVA de uma partida em andamento (botão "desistir e
    // entrar" da Lobby, quando JA_EM_PARTIDA barra a entrada numa segunda
    // sala). Ao contrário de abandonarPartida (vira bot, vaga reservada, dá
    // pra reconectar), aqui:
    //  - o jogador perde na hora: hp a zero garante a eliminação na próxima
    //    virada de rodada (_avancarParaProximaRodada -> eliminarZerados),
    //    sem caso especial — e _resolverFimDeJogo já decide W.O. sozinho se
    //    isso deixar um único vivo;
    //  - a vaga expira já (_marcarVagaExpirada): reconectar passa a devolver
    //    VAGA_EXPIRADA e minhaSalaAtiva/o guard de entrada param de contar
    //    essa sala — o jogador fica livre pra entrar em outra.
    // O bot termina a rodada atual no lugar dele. Devolve false se esse
    // playerId não faz parte de uma partida em andamento aqui.
    desistir(playerId) {
        if (!this.game || this._finalizada) return false;
        const jogador = this.jogadores.find(j => j.id === playerId);
        if (!jogador || jogador.vagaExpirada) return false;

        jogador.hp = 0;
        jogador.desistiu = true;
        jogador.desconectado = true;
        jogador.bot = true;
        jogador.expulsoPorInatividade = true;
        this.emit('jogadorDesistiu', { id: jogador.id, jogador: jogador.nome });

        // Destrava o loop se ele estava parado esperando justamente a ação
        // dele agora — mesmo padrão do timeout de turno, senão a partida
        // congelava numa espera que nunca vai ser respondida.
        if (this._jogadaEsperada?.jogadorId === playerId) {
            const resolver = this._jogadaEsperada.resolver;
            this._jogadaEsperada = null;
            this.emit('jogadaAutomatica', { id: jogador.id, jogador: jogador.nome });
            resolver(escolherCarta(jogador, this));
        }
        if (this._apostaEsperada?.jogadorId === playerId) {
            const resolver = this._apostaEsperada.resolver;
            this._apostaEsperada = null;
            this._registrarAposta(jogador, this._decidirApostaAutomatica(jogador));
            resolver();
        }

        // _cancelarContadorReserva cobre o caso de ele já ter uma reserva
        // rolando (um sairDaPartida anterior nesta mesma partida).
        this._cancelarContadorReserva(jogador.id);
        this._marcarVagaExpirada(jogador);
        return true;
    }

    // Chamado quando o jogador reconecta de verdade (ver conexao/SalaManager.js)
    // — só desliga a flag de "jogando no automático". O resto do estado
    // (mão, hp, vez) já sobrevive à desconexão por natureza, não precisa
    // reconstruir nada.
    marcarReconectado(playerId) {
        const jogador = this.jogadores.find(j => j.id === playerId);
        if (!jogador) return false;

        this._registrarAtividade(jogador);
        // `jogador` (não `nome`) é o campo de todos os outros eventos de
        // partida — ver conexao/eventos.js e PROTOCOLO.md, que documentam
        // { salaId, id, jogador }, e Partida.jsx, que lê `p.jogador` pra tirar
        // a marca de "desconectado" de quem voltou.
        this.emit('jogadorReconectou', { id: jogador.id, jogador: jogador.nome });
        return true;
    }

    // Loop da partida: uma rodada por volta, até alguém vencer (ou a sala ser
    // removida, ver destruir/_encerrado). While raso — um frame só pra
    // partida inteira, não um por rodada.
    async _rodarPartida() {
        while (!this._encerrado) {
            await this._jogarUmaRodada();
            if (this._encerrado) return;      // sala removida no meio da rodada
            if (this._resolverFimDeJogo()) return; // emitiu jogoFinalizado
            this._avancarParaProximaRodada();
        }
    }

    // Joga a rodada atual de ponta a ponta: distribui, vira manilha, colhe as
    // apostas em ordem, roda todas as vazas e fecha a rodada (perda de hp +
    // rodadaFinalizada). Não decide fim de jogo nem monta a próxima — isso é
    // do _rodarPartida.
    async _jogarUmaRodada() {
        if (this._encerrado) return; // sala removida no meio da partida (ver destruir)
        const rodada = this.rodada;

        rodada.darCartas();
        this._cartasJogadasRodada = new Set();
        this._apostasFeitasRodada = new Set();
        const maos = rodada.gameOrder.map(j => ({
            id: j.id,
            nome: j.nome,
            mao: j.mao.map(c => c.toString())
        }));
        this.emit('cartasDistribuidas', maos);

        // Rodada de 1 carta ("testa"/rodada cega): cada jogador aposta sem
        // saber a própria carta, mas vendo a de todo mundo. A camada de
        // socket recorta por destinatário (cada um recebe `maos` menos a
        // própria entrada, por causa de `ocultarProprio`). Evento genérico —
        // `cartasDistribuidas`/`suaMao` continuam saindo normalmente (o
        // cliente é quem esconde o valor da própria carta nessa rodada).
        if (rodada.round === 1) {
            this.emit('maosReveladas', { maos, ocultarProprio: true });
        }

        rodada.virarManilha();
        this.emit('manilhaVirada', { vira: rodada.vira.toString(), viraValor: rodada.viraValor });

        // A primeira aposta não espera a confirmação dos fronts: segura um
        // tempo fixo do tamanho da distribuição e libera todo mundo junto
        // (ver _esperarDistribuicao).
        await this._esperarDistribuicao(rodada);
        if (this._encerrado) return;

        // Ordem da rodada, um de cada vez — a resposta de quem aposta antes
        // pode (e deve) influenciar quem vem depois, então não dá pra
        // paralelizar isso: cada apostaFeita só sai depois da anterior.
        let primeira = true;
        for (const jogador of rodada.gameOrder) {
            await this._aguardarApostaOuTimeout(jogador, { segurar: !primeira });
            primeira = false;
            if (this._encerrado) return;
        }

        for (let v = 0; v < rodada.round; v++) {
            if (v > 0) rodada.novaVaza();

            const ordem = rodada.ordemDaVaza();
            for (const jogador of ordem) {
                const indice = await this._aguardarJogadaOuTimeout(jogador);
                if (this._encerrado) return;

                const carta = jogador.mao.splice(indice, 1)[0];
                this._cartasJogadasRodada.add(carta.valorInt * 4 + carta.naipeInt);
                const status = rodada.registrarJogada(jogador, carta);
                this.emit('cartaJogada', { jogador: jogador.nome, carta: carta.toString(), status });
                this._somarAnimacaoFront(duracaoCartaJogada(carta.valorInt === rodada.viraValor ? carta.nomeNaipe : null));
            }

            const vencedor = rodada.finalizarVaza();
            this.emit('vazaFinalizada', {
                vencedor: vencedor ? vencedor.nome : null,
                carta: vencedor ? rodada.mesaAtiva.melhorJogada.carta.toString() : null
            });
            this._somarAnimacaoFront(duracaoVazaFinalizada(Boolean(vencedor)));

            // Só espera se AINDA vem outra vaza nesta rodada — a última
            // emenda em apostas/distribuição da próxima rodada, que já
            // segura o próximo lance por conta própria (ver pausaVazaMs).
            if (v < rodada.round - 1) {
                await this._pausaVaza();
                if (this._encerrado) return;
            }
        }

        const apostas = new Map(rodada.gameOrder.map(j => [j, j.aposta]));
        const steaks = new Map(rodada.gameOrder.map(j => [j, j.steak]));
        rodada.finalizarRodada();
        this._ultimoPlacar = rodada.gameOrder.map(j => ({
            nome: j.nome,
            aposta: apostas.get(j),
            steak: steaks.get(j),
            diferenca: Math.abs(apostas.get(j) - steaks.get(j)),
            hp: j.hp
        }));
        this._somarAnimacaoFront(duracaoRodadaFinalizada(this._ultimoPlacar));
        this.emit('rodadaFinalizada', {
            numero: this.numeroRodada,
            resultado: this._ultimoPlacar
        });

        // Ver pausaRodadaMs no construtor — dá folga antes que _rodarPartida
        // (fora daqui) sequer tenha a chance de montar a rodada seguinte ou
        // de emitir jogoFinalizado, os dois igualmente rápidos demais em
        // cima da revelação/dano da última vaza sem isso.
        await this._pausaRodada();
    }

    // Fim de jogo? Devolve true (e emite jogoFinalizado) quando só sobra um
    // vivo (hp > 0). Se TODOS morrerem na mesma rodada (vivos === 0), vence
    // quem ficou com o hp mais perto de 0 — perdeu menos vida, errou menos.
    // Empate nesse hp (ex.: dois em -1): vence quem chegou nele primeiro, que
    // é quem finalizarRodada processou antes — a ordem de rodada.gameOrder.
    // Critério provisório (ver DEV.md, seção PIN): o definitivo o time ainda
    // vai decidir. Devolve false quando a partida continua.
    _resolverFimDeJogo() {
        const vivos = this.game.gameOrder.filter(j => j.hp > 0);
        if (vivos.length === 1) {
            this._finalizada = true;
            this._vencedor = vivos[0].nome;
            registrarPartidaFinalizada();
            this.emit('jogoFinalizado', { vencedor: this._vencedor });
            return true;
        }
        if (vivos.length === 0) {
            const candidatos = this.rodada.gameOrder.filter(jogador => !jogador.desistiu);
            const baseDesempate = candidatos.length > 0 ? candidatos : this.rodada.gameOrder;
            // rodada.gameOrder já está na ordem em que finalizarRodada aplicou
            // a perda de hp; o `>` estrito mantém o primeiro em caso de empate.
            let vencedor = baseDesempate[0];
            for (const jogador of baseDesempate) {
                if (jogador.hp > vencedor.hp) vencedor = jogador;
            }
            this._finalizada = true;
            this._vencedor = vencedor.nome;
             registrarPartidaFinalizada();
            this.emit('jogoFinalizado', { vencedor: this._vencedor });
            return true;
        }
        return false;
    }

    // Prepara a próxima rodada: tira os eliminados, zera aposta/steak, gira a
    // ordem, incrementa o contador e monta a Rodada nova (respeitando maxDeck,
    // ver Game.proximaRodada).
    _avancarParaProximaRodada() {
        const eliminados = this.game.eliminarZerados();
        if (eliminados.length > 0) {
            this.emit('jogadoresEliminados', { eliminados: eliminados.map(j => ({ nome: j.nome, hp: j.hp })) });
            this._somarAnimacaoFront(duracaoEliminacao());
        }
        this.rodada.resetarApostasSteaks();
        this.game.girarOrdem();

        this.numeroRodada++;
        this.rodada = this.game.proximaRodada();
        this.emit('novaRodadaIniciada', { numero: this.numeroRodada, cartas: this.rodada.round, ordem: this._ordemAssentos() });
    }
}
