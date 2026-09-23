import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { socket, chamar } from '../../socket.js';
import { assinarSessaoRetomada } from '../../sessao.js';
import { MENSAGENS_CHAT, CHAT_COOLDOWN_MS } from '../../../../../conexao/chat/mensagensChat.js';
import Casca from './Casca.jsx';
import { FaceCarta, VersoCarta } from './Carta.jsx';
import Modal from './Modal.jsx';
import {
    FORCA, ORDEM_RANKS, camadasDuelo, camadasGolpe, compararForca, lerCarta, saoIdenticas, somDoGolpe, temSprite,
} from './golpes.js';
import { guardarInfoSala, lerInfoSala } from './salasInfo.js';
import { tocarSom } from './somArcade.js';
import { HP_INICIAL, coracoes, corDoAssento, ehBot, inicial } from './tema.js';

// Tela 3 da frente arcade: sala de espera, mesa e fim de partida. A máquina
// de estados (handlers de socket, pausa da vaza, reconexão, chat, revanche)
// é a MESMA do components/novo/Partida.jsx — só o render é arcade, mais os
// golpes/duelos de manilha (ver golpes.js), que só DECORAM: o estado da
// mesa continua vindo do servidor.

// Quanto tempo a vaza encerrada fica congelada na mesa — pareado com
// `pausaVazaMs` do GameController (ver novo/Partida.jsx).
const PAUSA_VAZA_MS = 1600;
// Com um golpe de manilha ainda rodando quando a vaza fecha (a última carta
// da vaza e o vazaFinalizada chegam juntos), o overlay de "VAZA FECHADA"
// espera o golpe acabar e fica pelo menos isto na tela.
const VAZA_MIN_VISIVEL_MS = 1200;
const BALAO_MS = 3000;
const TREMOR_MS = 400;
const LOG_MAX = 60;
const ESTREITO_PX = 640;

const COR_LOG = {
    vaza: '#7fd6a5',
    jogada: '#8d93a6',
    dano: '#ff4b3e',
    rodada: '#f5c451',
    chat: '#cfe6fb',
    info: '#6f7488',
};

// Assentos em volta da mesa: à sua esquerda, topo, à sua direita.
const AREAS = {
    1: ['tc'],
    2: ['l', 'r'],
    3: ['l', 'tc', 'r'],
    4: ['l', 'tl', 'tr', 'r'],
    5: ['l', 'tl', 'tc', 'tr', 'r'],
};

const paraMapa = (lista, chave, valor) => Object.fromEntries((lista ?? []).map((item) => [item[chave], item[valor]]));

// Naipe da manilha que está ganhando a mesa agora (ou null) — mesmo
// critério de game/Mesa.recalcularMesa. Só usado pra semear `reinante` ao
// montar já em andamento (ack de reconectar), onde não há `status` de
// cartaJogada; nada aqui é animado.
function reinanteDaMesa(mesa, viraValor) {
    if (viraValor == null) return null;
    const cartas = (mesa ?? []).map((j) => lerCarta(j.carta)).filter(Boolean);
    const validas = cartas.filter((c) => cartas.filter((o) => saoIdenticas(c, o, viraValor)).length === 1);
    let melhor = null;
    for (const c of validas) if (!melhor || compararForca(c, melhor, viraValor) > 0) melhor = c;
    return melhor && melhor.valorInt === viraValor ? melhor.glifo : null;
}

// Uma camada de golpe: a string CSS vai direto em style.cssText (é assim
// que golpes.js monta tudo — custom properties, animation com delay etc.),
// aplicada uma vez só, antes da pintura. `key` do overlay troca a cada
// disparo, então camada nova = div nova = animação reiniciada.
function CamadaGolpe({ estilo }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        if (ref.current) ref.current.style.cssText = estilo;
    }, [estilo]);
    return <div ref={ref} />;
}

export default function Partida({
    salaId, jogadoresIniciais, segundosIniciais, reconexao, chatAberto, senha, meuNome,
    onSairDaSala, onSairDaPartida, onEntrouNaSala, conectado,
}) {
    const infoSala = lerInfoSala(salaId);

    // ---- Estado espelhado de novo/Partida.jsx ----
    const [jogadores, setJogadores] = useState(jogadoresIniciais ?? reconexao?.jogadores ?? []);
    // Nomes na ordem dos assentos (novaRodadaIniciada / ack de reconectar) —
    // a ordem de jogo, sorteada no início. `jogadores` é a ordem de ENTRADA
    // na sala, que não tem nada a ver com a vez; a mesa é desenhada por esta.
    const [ordem, setOrdem] = useState(reconexao?.ordem ?? null);
    // Contagem regressiva local a partir de partidaIniciandoEm; null = sala ainda não lotou.
    const [contagem, setContagem] = useState(segundosIniciais ?? null);
    const [iniciada, setIniciada] = useState(!!reconexao);
    const [mao, setMao] = useState(reconexao?.mao ?? []);
    const [maosReveladas, setMaosReveladas] = useState(() => paraMapa(reconexao?.maosReveladas, 'jogador', 'mao'));
    const [jogadorDaVezAposta, setJogadorDaVezAposta] = useState(reconexao?.jogadorDaVezAposta ?? null);
    const [cartasRodada, setCartasRodada] = useState(reconexao?.cartasRodada ?? 0);
    const [numeroRodada, setNumeroRodada] = useState(reconexao?.numeroRodada ?? 0);
    const [jogadorDaVez, setJogadorDaVez] = useState(reconexao?.jogadorDaVez ?? null);
    const [mesa, setMesa] = useState(reconexao?.mesa ?? []);
    const [vazaResultado, setVazaResultado] = useState(null);
    const [vira, setVira] = useState(reconexao?.vira ? { carta: reconexao.vira, valor: reconexao.viraValor } : null);
    // nome -> hp, do último rodadaFinalizada (ultimoPlacar no ack de reconectar).
    const [placar, setPlacar] = useState(() => paraMapa(reconexao?.ultimoPlacar, 'nome', 'hp'));
    const [vencedor, setVencedor] = useState(reconexao?.vencedor ?? null);
    const [abortada, setAbortada] = useState(null);
    const [conviteRevanche, setConviteRevanche] = useState(null);
    const [criandoRevanche, setCriandoRevanche] = useState(false);
    const [log, setLog] = useState([]);
    const [erro, setErro] = useState(null);
    const [apostas, setApostas] = useState(() => paraMapa(reconexao?.apostas, 'jogador', 'aposta'));
    const [eliminados, setEliminados] = useState(reconexao?.eliminados ?? []);
    // Ordem de eliminação pro pódio: [{ nome, rodada }] (rodada null quando
    // veio do ack de reconectar, que não diz em qual rodada foi).
    const [ordemEliminacao, setOrdemEliminacao] = useState(
        () => (reconexao?.eliminados ?? []).map((nome) => ({ nome, rodada: null }))
    );
    const [desconectados, setDesconectados] = useState(reconexao?.desconectados ?? []);
    // Vazas ganhas por jogador NESTA rodada (zera em novaRodadaIniciada). O
    // ack de reconectar não traz isso — volta de 0 depois de reconectar.
    const [vazasFeitas, setVazasFeitas] = useState({});
    const [textoChat, setTextoChat] = useState('');
    const [erroChat, setErroChat] = useState(null);
    const [cooldownAte, setCooldownAte] = useState(0);
    const [agora, setAgora] = useState(() => Date.now());

    // ---- Estado só da frente arcade ----
    const [golpe, setGolpe] = useState(null); // { key, camadas }
    const [tremendo, setTremendo] = useState(false);
    const [estreito, setEstreito] = useState(() => window.innerWidth < ESTREITO_PX);
    const [baloes, setBaloes] = useState({}); // nome -> { id, texto }
    const [expulso, setExpulso] = useState(false);
    const [reconectandoExpulso, setReconectandoExpulso] = useState(false);

    // Refs: os handlers de socket (efeito com deps [salaId]) enxergam só o
    // primeiro render — o que eles precisam ler "ao vivo" mora aqui.
    const mesaRef = useRef(mesa);
    const viraValorRef = useRef(vira?.valor ?? null);
    const numeroRodadaRef = useRef(numeroRodada);
    const vazaResultadoRef = useRef(null);
    const limparVazaTimerRef = useRef(null);
    const mostrarVazaTimerRef = useRef(null);
    // Naipe (glifo) da manilha que está ganhando a vaza atual, ou null.
    const reinanteRef = useRef(reinanteDaMesa(reconexao?.mesa, reconexao?.viraValor));
    const golpeAtivoRef = useRef(false);
    const golpeFimRef = useRef(0);
    const golpeSeqRef = useRef(0);
    const golpeTimerRef = useRef(null);
    const montarGolpeTimerRef = useRef(null);
    const tremorTimerRef = useRef(null);
    const pararTremorTimerRef = useRef(null);
    const baloesTimersRef = useRef({});
    const saindoRef = useRef(false);
    const logSeqRef = useRef(0);

    function definirMesa(lista) {
        mesaRef.current = lista;
        setMesa(lista);
    }

    function registrar(txt, tipo = 'info') {
        const id = ++logSeqRef.current;
        setLog((anterior) => [...anterior.slice(-(LOG_MAX - 1)), { id, txt, tipo }]);
    }

    function tremer() {
        setTremendo(true);
        clearTimeout(pararTremorTimerRef.current);
        pararTremorTimerRef.current = setTimeout(() => setTremendo(false), TREMOR_MS);
    }

    // Cancela golpe/tremida em andamento e zera `reinante` — vaza nova,
    // rodada nova ou ressincronização com o servidor.
    function cancelarGolpe() {
        clearTimeout(golpeTimerRef.current);
        clearTimeout(montarGolpeTimerRef.current);
        clearTimeout(tremorTimerRef.current);
        clearTimeout(pararTremorTimerRef.current);
        golpeAtivoRef.current = false;
        golpeFimRef.current = 0;
        reinanteRef.current = null;
        setGolpe(null);
        setTremendo(false);
    }

    // Monta as camadas via requestAnimationFrame E setTimeout(32) com guarda
    // `armado` (igual ao protótipo): rAF não dispara em aba sem pintura.
    function dispararGolpe(info, { duelo, supera, naipe, modo }) {
        clearTimeout(golpeTimerRef.current);
        clearTimeout(tremorTimerRef.current);
        golpeFimRef.current = Date.now() + 32 + info.dur;
        let armado = false;
        const montar = () => {
            if (armado) return;
            armado = true;
            golpeAtivoRef.current = true;
            setGolpe({ key: ++golpeSeqRef.current, camadas: info.camadas });
            if (duelo) {
                tocarSom(info.sfx);
            } else {
                if (supera) tocarSom('supera');
                tocarSom(somDoGolpe(naipe, modo));
            }
            if (naipe === '♣' || duelo) {
                tremorTimerRef.current = setTimeout(tremer, info.bate);
            }
            golpeTimerRef.current = setTimeout(() => {
                golpeAtivoRef.current = false;
                setGolpe(null);
            }, info.dur);
        };
        requestAnimationFrame(montar);
        montarGolpeTimerRef.current = setTimeout(montar, 32);
    }

    // Decide a animação de uma carta que ACABOU de chegar em cartaJogada
    // (inclusive a minha — anima no evento do servidor, não no clique, pra
    // todo mundo ver no mesmo instante) e depois atualiza `reinante` a
    // partir do `status` do servidor (Mesa.gerarStatus).
    function animarCarta(p, anteriores) {
        const viraValor = viraValorRef.current;
        const c = lerCarta(p.carta);
        const ehManilha = c && viraValor != null && c.valorInt === viraValor && temSprite(c.glifo);
        if (!ehManilha) {
            tocarSom('carta');
        } else {
            const identica = anteriores.some((j) => {
                const outra = lerCarta(j.carta);
                return outra && saoIdenticas(outra, c, viraValor);
            });
            const reinante = reinanteRef.current;
            const supera = golpeAtivoRef.current;
            if (identica) {
                dispararGolpe(camadasGolpe(c.glifo, 'anula', supera), { duelo: false, supera, naipe: c.glifo, modo: 'anula' });
            } else {
                const duelo = reinante && FORCA[c.glifo] > FORCA[reinante] ? camadasDuelo(c.glifo, reinante) : null;
                if (duelo) {
                    dispararGolpe(duelo, { duelo: true, supera, naipe: c.glifo, modo: 'solo' });
                } else {
                    dispararGolpe(camadasGolpe(c.glifo, 'solo', supera), { duelo: false, supera, naipe: c.glifo, modo: 'solo' });
                }
            }
        }
        // O servidor manda: quem está ganhando a mesa agora.
        const st = p.status;
        if (!st || st.status === 'MELADO') {
            reinanteRef.current = null;
        } else {
            const ganhando = lerCarta(st.cartaGanhando);
            reinanteRef.current = ganhando && viraValor != null && ganhando.valorInt === viraValor ? ganhando.glifo : null;
        }
    }

    function mostrarBalao(nome, texto) {
        const id = Date.now() + Math.random();
        setBaloes((atual) => ({ ...atual, [nome]: { id, texto } }));
        clearTimeout(baloesTimersRef.current[nome]);
        baloesTimersRef.current[nome] = setTimeout(() => {
            setBaloes((atual) => {
                if (atual[nome]?.id !== id) return atual;
                const { [nome]: _, ...resto } = atual;
                return resto;
            });
        }, BALAO_MS);
    }

    function encerrarPausaVaza() {
        clearTimeout(limparVazaTimerRef.current);
        clearTimeout(mostrarVazaTimerRef.current);
        limparVazaTimerRef.current = null;
        mostrarVazaTimerRef.current = null;
        vazaResultadoRef.current = null;
        setVazaResultado(null);
    }

    // Aplica o ack de `reconectar` por cima do estado atual (queda de rede
    // ou RECONECTAR do modal de expulsão). Não anima nada do que veio no ack.
    function aplicarResincronizacao(resposta) {
        cancelarGolpe();
        encerrarPausaVaza();
        if (resposta.jogadores) setJogadores(resposta.jogadores);
        setMao(resposta.mao ?? []);
        setCartasRodada(resposta.cartasRodada);
        setNumeroRodada(resposta.numeroRodada);
        if (resposta.ordem) setOrdem(resposta.ordem);
        numeroRodadaRef.current = resposta.numeroRodada;
        setMaosReveladas(paraMapa(resposta.maosReveladas, 'jogador', 'mao'));
        setJogadorDaVez(resposta.jogadorDaVez);
        setJogadorDaVezAposta(resposta.jogadorDaVezAposta);
        definirMesa(resposta.mesa ?? []);
        setVira(resposta.vira ? { carta: resposta.vira, valor: resposta.viraValor } : null);
        viraValorRef.current = resposta.vira ? resposta.viraValor : null;
        reinanteRef.current = reinanteDaMesa(resposta.mesa, resposta.viraValor);
        setApostas(paraMapa(resposta.apostas, 'jogador', 'aposta'));
        const eliminadosAgora = resposta.eliminados ?? [];
        setEliminados((anterior) => [...new Set([...anterior, ...eliminadosAgora])]);
        setOrdemEliminacao((anterior) => [
            ...anterior,
            ...eliminadosAgora.filter((nome) => !anterior.some((e) => e.nome === nome)).map((nome) => ({ nome, rodada: null })),
        ]);
        setDesconectados(resposta.desconectados ?? []);
        setPlacar(paraMapa(resposta.ultimoPlacar, 'nome', 'hp'));
        if (resposta.vencedor) setVencedor(resposta.vencedor);
    }

    async function ressincronizar() {
        try {
            const resposta = await chamar('reconectar', { salaId });
            aplicarResincronizacao(resposta);
            registrar('Conexão restabelecida — sincronizado com a partida', 'info');
            return true;
        } catch (erroDaChamada) {
            return erroDaChamada;
        }
    }

    useEffect(() => {
        const daSala = (payload) => payload.salaId === salaId;

        if (reconexao) {
            if (reconexao.jogadorDaVezAposta) {
                registrar(`Reconectado — ${reconexao.suaVezDaAposta ? 'sua vez de apostar' : `vez de ${reconexao.jogadorDaVezAposta} apostar`}`);
            } else {
                registrar(`Reconectado — ${reconexao.suaVez ? 'sua vez' : `vez de ${reconexao.jogadorDaVez ?? '...'}`}`);
            }
        }

        const handlers = {
            listaJogadores(p) {
                if (!daSala(p)) return;
                setJogadores(p.jogadores);
            },
            partidaIniciandoEm(p) {
                if (!daSala(p)) return;
                setContagem(p.segundos);
            },
            novaRodadaIniciada(p) {
                if (!daSala(p)) return;
                setIniciada(true);
                cancelarGolpe();
                encerrarPausaVaza();
                definirMesa([]);
                setVira(null);
                viraValorRef.current = null;
                setJogadorDaVezAposta(null);
                setCartasRodada(p.cartas);
                setNumeroRodada(p.numero);
                if (p.ordem) setOrdem(p.ordem);
                numeroRodadaRef.current = p.numero;
                setApostas({});
                setVazasFeitas({});
                setMaosReveladas({});
                registrar(`Rodada ${p.numero} — ${p.cartas} carta${p.cartas === 1 ? '' : 's'}`, 'rodada');
            },
            suaMao(p) {
                if (!daSala(p)) return;
                setMao(p.mao);
            },
            maosReveladas(p) {
                if (!daSala(p)) return;
                setMaosReveladas(paraMapa(p.maos, 'jogador', 'mao'));
            },
            manilhaVirada(p) {
                if (!daSala(p)) return;
                setVira({ carta: p.vira, valor: p.viraValor });
                viraValorRef.current = p.viraValor;
                const viraLida = lerCarta(p.vira);
                registrar(`Vira ${viraLida ? viraLida.rank + viraLida.glifo : p.vira} — manilha ${ORDEM_RANKS[p.viraValor] ?? '?'}`, 'rodada');
            },
            turnoAposta(p) {
                if (!daSala(p)) return;
                setJogadorDaVezAposta(p.jogador);
            },
            apostaFeita(p) {
                if (!daSala(p)) return;
                setJogadorDaVezAposta(null);
                setApostas((anterior) => ({ ...anterior, [p.jogador]: p.aposta }));
                if (p.jogador === meuNome) tocarSom('aposta');
                registrar(`${p.jogador === meuNome ? 'Você' : p.jogador} apostou ${p.aposta} vaza${p.aposta === 1 ? '' : 's'}`, 'jogada');
            },
            turnoJogador(p) {
                if (!daSala(p)) return;
                setJogadorDaVez(p.jogador);
            },
            cartaJogada(p) {
                if (!daSala(p)) return;
                // Primeira carta da vaza nova com a anterior ainda congelada
                // na mesa: abre a mesa do zero (ver novo/Partida.jsx).
                const abrindoVazaNova = vazaResultadoRef.current != null;
                if (abrindoVazaNova) encerrarPausaVaza();
                const anteriores = abrindoVazaNova ? [] : mesaRef.current;
                animarCarta(p, anteriores);
                definirMesa([...anteriores, { jogador: p.jogador, carta: p.carta }]);
                // Jogada automática por timeout: a carta nunca saiu da mão local.
                if (p.jogador === meuNome) {
                    setMao((anterior) => {
                        const indice = anterior.indexOf(p.carta);
                        return indice === -1 ? anterior : anterior.filter((_, i) => i !== indice);
                    });
                }
                const c = lerCarta(p.carta);
                registrar(`${p.jogador === meuNome ? 'Você' : p.jogador} jogou ${c ? c.rank + c.glifo : p.carta}`, 'jogada');
            },
            vazaFinalizada(p) {
                if (!daSala(p)) return;
                reinanteRef.current = null;
                const resultado = { vencedor: p.vencedor, carta: p.carta };
                vazaResultadoRef.current = resultado;
                if (p.vencedor) setVazasFeitas((a) => ({ ...a, [p.vencedor]: (a[p.vencedor] ?? 0) + 1 }));
                clearTimeout(limparVazaTimerRef.current);
                clearTimeout(mostrarVazaTimerRef.current);
                // Golpe da última carta ainda rodando: o overlay espera ele.
                const espera = Math.max(0, golpeFimRef.current - Date.now());
                const mostrar = () => {
                    mostrarVazaTimerRef.current = null;
                    if (vazaResultadoRef.current !== resultado) return;
                    setVazaResultado(resultado);
                    tocarSom('vaza');
                };
                if (espera > 0) mostrarVazaTimerRef.current = setTimeout(mostrar, espera);
                else mostrar();
                limparVazaTimerRef.current = setTimeout(() => {
                    limparVazaTimerRef.current = null;
                    vazaResultadoRef.current = null;
                    definirMesa([]);
                    setVazaResultado(null);
                }, Math.max(PAUSA_VAZA_MS, espera + VAZA_MIN_VISIVEL_MS));
                const c = lerCarta(p.carta);
                registrar(
                    p.vencedor
                        ? `${p.vencedor === meuNome ? 'Você levou' : `${p.vencedor} levou`} a vaza com ${c ? c.rank + c.glifo : p.carta}`
                        : 'Vaza melada — ninguém levou',
                    'vaza'
                );
            },
            rodadaFinalizada(p) {
                if (!daSala(p)) return;
                setPlacar(paraMapa(p.resultado, 'nome', 'hp'));
                for (const r of p.resultado ?? []) {
                    if (r.diferenca > 0) {
                        registrar(`${r.nome === meuNome ? 'Você perdeu' : `${r.nome} perdeu`} ${r.diferenca} ♥ (errou o palpite)`, 'dano');
                    }
                }
            },
            jogadoresEliminados(p) {
                if (!daSala(p)) return;
                const nomes = p.eliminados.map((j) => j.nome);
                setEliminados((anterior) => [...new Set([...anterior, ...nomes])]);
                setOrdemEliminacao((anterior) => [
                    ...anterior,
                    ...nomes
                        .filter((nome) => !anterior.some((e) => e.nome === nome))
                        .map((nome) => ({ nome, rodada: numeroRodadaRef.current })),
                ]);
                tocarSom('eliminado');
                registrar(`Fora da mesa: ${nomes.join(', ')}`, 'dano');
            },
            jogoFinalizado(p) {
                if (!daSala(p)) return;
                cancelarGolpe();
                setVencedor(p.vencedor);
                tocarSom('vitoria');
                registrar(`Vencedor: ${p.vencedor}`, 'rodada');
            },
            partidaAbortada(p) {
                if (!daSala(p)) return;
                cancelarGolpe();
                setAbortada(`A partida foi interrompida por um erro interno${p.erro ? `: ${p.erro}` : ''}.`);
                tocarSom('erro');
            },
            convidadoParaRevanche(p) {
                if (!daSala(p)) return;
                if (p.jogador === meuNome) return; // eu mesmo chamei — já sei pelo ack
                setConviteRevanche({ novaSalaId: p.novaSalaId, jogador: p.jogador });
            },
            jogadaAutomatica(p) {
                if (!daSala(p)) return;
                registrar(`${p.jogador} não respondeu a tempo — jogada automática`, 'info');
            },
            jogadorReconectou(p) {
                if (!daSala(p)) return;
                setDesconectados((anterior) => anterior.filter((nome) => nome !== p.jogador));
                registrar(`${p.jogador} reconectou`, 'info');
            },
            jogadorDesistiu(p) {
                if (!daSala(p)) return;
                setDesconectados((anterior) => (anterior.includes(p.jogador) ? anterior : [...anterior, p.jogador]));
                registrar(`${p.jogador} desistiu da partida`, 'dano');
            },
            chatMensagem(p) {
                if (!daSala(p)) return;
                tocarSom('chat');
                if (p.tipo === 'sistema') {
                    registrar(`${p.jogador} ${p.texto}`, 'info');
                    return;
                }
                mostrarBalao(p.jogador, p.texto);
                registrar(`${p.jogador === meuNome ? 'Você' : p.jogador}: ${p.texto}`, 'chat');
            },
            jogadorExpulsoPorInatividade(p) {
                if (!daSala(p)) return;
                setDesconectados((anterior) => (anterior.includes(p.jogador) ? anterior : [...anterior, p.jogador]));
                if (p.jogador === meuNome) {
                    // Mesmo evento do "Sair da partida" voluntário — aí já
                    // estamos saindo da tela, sem modal.
                    if (saindoRef.current) return;
                    tocarSom('erro');
                    setExpulso(true);
                } else {
                    registrar(`${p.jogador} desconectou — um bot assumiu até ele voltar`, 'info');
                }
            },
            novoAdm(p) {
                if (!daSala(p)) return;
                setJogadores((anterior) => anterior.map((j) => ({ ...j, adm: j.nome === p.jogador })));
                registrar(p.jogador === meuNome ? 'Você virou o dono da sala' : `${p.jogador} virou o dono da sala`, 'info');
            },
        };

        for (const [evento, handler] of Object.entries(handlers)) socket.on(evento, handler);
        const timersBaloes = baloesTimersRef.current;
        return () => {
            for (const [evento, handler] of Object.entries(handlers)) socket.off(evento, handler);
            clearTimeout(limparVazaTimerRef.current);
            clearTimeout(mostrarVazaTimerRef.current);
            clearTimeout(golpeTimerRef.current);
            clearTimeout(montarGolpeTimerRef.current);
            clearTimeout(tremorTimerRef.current);
            clearTimeout(pararTremorTimerRef.current);
            for (const t of Object.values(timersBaloes)) clearTimeout(t);
        };
    }, [salaId]);

    // Queda de rede com a partida já rodando (ver novo/Partida.jsx): volta
    // pra room via `reconectar` assim que a sessão for retomada.
    useEffect(() => {
        if (!iniciada) return;
        return assinarSessaoRetomada(() => { ressincronizar(); });
    }, [iniciada, salaId]);

    // Contagem regressiva da sala de espera, com tique a cada segundo.
    useEffect(() => {
        if (iniciada || contagem == null || contagem <= 0) return;
        const id = setTimeout(() => {
            const proxima = contagem - 1;
            if (proxima > 0) tocarSom(proxima <= 5 ? 'tiqueFinal' : 'tique');
            setContagem(proxima);
        }, 1000);
        return () => clearTimeout(id);
    }, [contagem, iniciada]);

    useEffect(() => {
        const medir = () => setEstreito(window.innerWidth < ESTREITO_PX);
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);

    useEffect(() => {
        if (cooldownAte <= Date.now()) return;
        const id = setInterval(() => setAgora(Date.now()), 250);
        return () => clearInterval(id);
    }, [cooldownAte]);

    const segundosCooldown = Math.max(0, Math.ceil((cooldownAte - agora) / 1000));
    const chatEmCooldown = segundosCooldown > 0;

    function falhar(erroDaChamada) {
        tocarSom('erro');
        setErro(erroDaChamada.message);
    }

    async function enviarChat(conteudo) {
        setErroChat(null);
        try {
            await chamar('chat', { salaId, ...conteudo });
            setCooldownAte(Date.now() + CHAT_COOLDOWN_MS);
            setAgora(Date.now());
            return true;
        } catch (erroDaChamada) {
            tocarSom('erro');
            setErroChat(erroDaChamada.message);
            return false;
        }
    }

    async function enviarChatLivre(evento) {
        evento.preventDefault();
        const texto = textoChat.trim();
        if (chatEmCooldown || !texto) return;
        if (await enviarChat({ tipo: 'aberta', texto })) setTextoChat('');
    }

    async function apostar(valor) {
        setErro(null);
        try {
            await chamar('apostar', { salaId, valor });
        } catch (erroDaChamada) {
            falhar(erroDaChamada);
        }
    }

    async function jogar(indice) {
        setErro(null);
        try {
            await chamar('jogarCarta', { salaId, indice });
            setMao((anterior) => anterior.filter((_, i) => i !== indice));
        } catch (erroDaChamada) {
            falhar(erroDaChamada);
        }
    }

    async function forcarInicio() {
        setErro(null);
        try {
            await chamar('forcarInicio', { salaId });
        } catch (erroDaChamada) {
            falhar(erroDaChamada);
        }
    }

    async function jogarDeNovo() {
        setErro(null);
        setCriandoRevanche(true);
        try {
            const resposta = await chamar('jogarDeNovo', { salaId });
            guardarInfoSala(resposta.salaId, { ...infoSala, numberPlayers: resposta.numberPlayers ?? infoSala.numberPlayers });
            onEntrouNaSala(resposta.salaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto);
        } catch (erroDaChamada) {
            falhar(erroDaChamada);
            setCriandoRevanche(false);
        }
    }

    // BORA: sairDaPartida na sala velha ANTES do entrarSala na nova (ordem
    // importa — ver aceitarConviteRevanche em novo/Partida.jsx).
    async function aceitarConviteRevanche() {
        setErro(null);
        try {
            try {
                await chamar('sairDaPartida', { salaId });
            } catch {
                // melhor esforço — a sala antiga já terminou
            }
            const resposta = await chamar('entrarSala', { salaId: conviteRevanche.novaSalaId });
            guardarInfoSala(conviteRevanche.novaSalaId, { ...infoSala, numberPlayers: resposta.numberPlayers ?? infoSala.numberPlayers });
            onEntrouNaSala(conviteRevanche.novaSalaId, resposta.jogadores, resposta.segundosParaIniciar, resposta.chatAberto);
        } catch (erroDaChamada) {
            falhar(erroDaChamada);
            setConviteRevanche(null);
        }
    }

    // Antes da partida: sairSala (libera o assento). Depois: sairDaPartida
    // (assento vira bot, a Lobby oferece reconectar) — ver novo/Partida.jsx.
    async function sair() {
        saindoRef.current = true;
        if (!iniciada) {
            try {
                await chamar('sairSala', { salaId });
            } catch {
                // melhor esforço
            }
            onSairDaSala();
            return;
        }
        try {
            await chamar('sairDaPartida', { salaId });
        } catch {
            // melhor esforço — o assento vira bot pelo timeout de qualquer jeito
        }
        onSairDaPartida(salaId);
    }

    async function reconectarDoModal() {
        setReconectandoExpulso(true);
        const resultado = await ressincronizar();
        setReconectandoExpulso(false);
        if (resultado === true) {
            setExpulso(false);
        } else {
            falhar(resultado);
        }
    }

    // ---- Derivados ----
    const souDono = jogadores.find((j) => j.nome === meuNome)?.adm === true;
    // Durante a pausa da vaza o jogadorDaVez ainda é quem fechou a vaza (o
    // próximo turnoJogador só sai depois da pausa) — não é vez de ninguém.
    const souEuNaVez = iniciada && jogadorDaVez === meuNome && !vencedor && !jogadorDaVezAposta && !vazaResultado;
    const souEuNaVezDaAposta = iniciada && jogadorDaVezAposta === meuNome && !vencedor;
    const rodadaCega = iniciada && cartasRodada === 1;
    const viraValor = vira?.valor ?? null;
    const indiceDe = (nome) => jogadores.findIndex((j) => j.nome === nome);
    const hpDe = (nome) => (eliminados.includes(nome) ? 0 : (placar[nome] ?? HP_INICIAL));
    const jogouNaMesa = (nome) => mesa.some((j) => j.jogador === nome);
    const souEliminado = eliminados.includes(meuNome);

    const cabecaDireita = <span className="az-px az-topo-nome" title="Você">{meuNome}</span>;

    // ================= SALA DE ESPERA =================
    if (!iniciada) {
        const total = Math.max(infoSala.numberPlayers ?? jogadores.length, jogadores.length);
        const bots = jogadores.filter((j) => ehBot(j.nome)).length;
        const salaCheia = contagem != null;
        const regras = [
            infoSala.roundStart != null ? { k: 'CARTAS NA 1ª RODADA', v: String(infoSala.roundStart) } : null,
            { k: 'CORAÇÕES', v: '♥'.repeat(HP_INICIAL) },
            { k: 'CHAT', v: chatAberto ? 'ABERTO' : 'FRASES' },
            { k: 'BOTS', v: String(bots) },
        ].filter(Boolean);

        return (
            <Casca conectado={conectado} direita={cabecaDireita}>
                <div className="az-tela az-tela-espera" data-screen-label="Sala de espera">
                    <div className="az-cabeca-tela">
                        <div>
                            <div className="az-px az-titulo az-sombra-amarela">SALA {salaId}</div>
                            <div className="az-sub">
                                {salaCheia
                                    ? `Mesa cheia — ${jogadores.length}/${total} jogadores.`
                                    : `Esperando a mesa encher — ${jogadores.length}/${total} jogadores.`}
                            </div>
                        </div>
                        <div className="az-contagem">
                            <span className="az-px az-contagem-rotulo">COMEÇA EM</span>
                            <span className="az-px az-contagem-valor">{salaCheia ? contagem : '--'}</span>
                        </div>
                    </div>

                    {senha && (
                        <div className="az-senha">
                            <span className="az-px az-senha-rotulo">🔒 SENHA DA SALA</span>
                            <span className="az-px az-senha-valor">{senha}</span>
                            <span className="az-senha-nota">Repasse pra quem você for chamar — ela não aparece de novo.</span>
                        </div>
                    )}

                    <div className="az-grade-espera">
                        {Array.from({ length: total }, (_, i) => {
                            const j = jogadores[i];
                            if (!j) {
                                return (
                                    <div key={`vaga-${i}`} className="az-assento az-assento-vago">
                                        <div className="az-px az-avatar az-avatar-g" style={{ background: '#22252f' }}>?</div>
                                        <div className="az-min0">
                                            <div className="az-assento-nome az-apagado">aguardando</div>
                                            <div className="az-px az-assento-rotulo" style={{ color: '#4a4f60' }}>VAGA LIVRE</div>
                                        </div>
                                    </div>
                                );
                            }
                            const bot = ehBot(j.nome);
                            const rotulo = j.adm ? 'DONO DA SALA' : bot ? 'BOT' : 'PRONTO';
                            const corRotulo = j.adm ? '#f5c451' : bot ? '#8d93a6' : '#7fd6a5';
                            return (
                                <div key={j.nome} className="az-assento">
                                    <div className="az-px az-avatar az-avatar-g" style={{ background: bot ? '#4a4f60' : corDoAssento(i) }}>
                                        {inicial(j.nome)}
                                    </div>
                                    <div className="az-min0">
                                        <div className="az-assento-nome">
                                            {j.nome}{j.nome === meuNome ? ' (você)' : ''}
                                        </div>
                                        <div className="az-px az-assento-rotulo" style={{ color: corRotulo }}>{rotulo}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="az-chips">
                        {regras.map((r) => (
                            <div key={r.k} className="az-chip">
                                <span className="az-px az-chip-k">{r.k}</span>
                                <span className="az-px az-chip-v">{r.v}</span>
                            </div>
                        ))}
                    </div>

                    <div className="az-linha-botoes">
                        {souDono && (
                            <button
                                type="button"
                                className="az-b az-px az-btn az-btn-vermelho az-btn-gg az-cresce"
                                onClick={forcarInicio}
                                disabled={!salaCheia}
                            >
                                FORÇAR INÍCIO AGORA
                            </button>
                        )}
                        <button type="button" className="az-b az-px az-btn az-btn-cinza az-btn-gg az-btn-sair" onClick={sair}>
                            SAIR DA SALA
                        </button>
                    </div>
                    <div className="az-nota az-nota-espaco">
                        {souDono
                            ? 'Você é o dono — dá pra forçar o início assim que a mesa encher.'
                            : 'Só o dono da sala pode forçar o início depois que a mesa encher.'}
                    </div>
                    {erro && <div className="az-erro az-erro-caixa">{erro}</div>}
                </div>
            </Casca>
        );
    }

    // ================= FIM DE PARTIDA =================
    if (vencedor || abortada) {
        const podio = [...ordemEliminacao].reverse().filter((e) => e.nome !== vencedor);
        const souCampeao = vencedor === meuNome;
        return (
            <Casca conectado={conectado} direita={cabecaDireita}>
                <div className="az-tela az-tela-fim" data-screen-label="Fim de partida">
                    <div className="az-fim-cabeca">
                        <div className="az-px az-fim-rotulo">FIM DE PARTIDA</div>
                        {vencedor ? (
                            <div className="az-campeao">
                                <div className="az-campeao-carta">
                                    <span className="az-px">A</span>
                                </div>
                                <div className="az-px az-campeao-nome">{souCampeao ? 'VOCÊ' : vencedor.toUpperCase()}</div>
                                <div className="az-campeao-sub">último com coração na mesa</div>
                            </div>
                        ) : (
                            <div className="az-abortada">
                                <div className="az-px az-abortada-titulo">PARTIDA INTERROMPIDA</div>
                                <div className="az-abortada-texto">{abortada}</div>
                            </div>
                        )}
                    </div>

                    {podio.length > 0 && (
                        <div className="az-podio">
                            {podio.map((p, i) => (
                                <div key={p.nome} className="az-podio-linha">
                                    <span className="az-px az-podio-pos">{vencedor ? `${i + 2}º` : '—'}</span>
                                    <span className="az-podio-nome">{p.nome === meuNome ? 'Você' : p.nome}</span>
                                    <span className="az-podio-detalhe">
                                        {p.rodada != null ? `eliminado na rodada ${p.rodada}` : 'eliminado'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {vencedor && souDono && (
                        <>
                            <div className="az-linha-botoes">
                                <button
                                    type="button"
                                    className="az-b az-px az-btn az-btn-amarelo az-btn-gg az-cresce"
                                    onClick={jogarDeNovo}
                                    disabled={criandoRevanche}
                                >
                                    {criandoRevanche ? 'CRIANDO SALA...' : 'JOGAR DE NOVO'}
                                </button>
                                <button type="button" className="az-b az-px az-btn az-btn-cinza az-btn-gg az-btn-sair" onClick={sair}>
                                    VOLTAR ÀS SALAS
                                </button>
                            </div>
                            <div className="az-nota az-nota-espaco">Você é o dono — criar a revanche convida todo mundo que ficou.</div>
                        </>
                    )}

                    {vencedor && !souDono && conviteRevanche && (
                        <div className="az-convite">
                            <div className="az-convite-texto">
                                <strong>{conviteRevanche.jogador}</strong> está te chamando pra outra partida.
                            </div>
                            <div className="az-linha-botoes">
                                <button type="button" className="az-b az-px az-btn az-btn-azul az-cresce" onClick={aceitarConviteRevanche}>
                                    BORA
                                </button>
                                <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => setConviteRevanche(null)}>
                                    AGORA NÃO
                                </button>
                            </div>
                        </div>
                    )}

                    {(!vencedor || !souDono) && (
                        <div className="az-linha-botoes az-nota-espaco">
                            <button type="button" className="az-b az-px az-btn az-btn-cinza az-btn-gg az-cresce" onClick={sair}>
                                VOLTAR ÀS SALAS
                            </button>
                        </div>
                    )}
                    {erro && <div className="az-erro az-erro-caixa">{erro}</div>}
                </div>
            </Casca>
        );
    }

    // ================= MESA =================
    const meuIndice = indiceDe(meuNome);
    // Sentido horário pra qualquer um: você embaixo, e a vez anda pra
    // esquerda -> topo -> direita. Então os oponentes entram na ordem dos
    // assentos começando por quem joga DEPOIS de você. Sem `ordem` (servidor
    // antigo) cai na ordem da sala, que ao menos é a mesma pra todo mundo.
    const assentos = ordem?.length ? ordem : jogadores.map((j) => j.nome);
    const minhaPosicao = assentos.indexOf(meuNome);
    const oponentes = (minhaPosicao >= 0
        ? [...assentos.slice(minhaPosicao + 1), ...assentos.slice(0, minhaPosicao)]
        : assentos.filter((nome) => nome !== meuNome)
    ).map((nome) => ({ nome }));
    const areas = AREAS[Math.min(5, oponentes.length)] ?? AREAS[5];
    // Estreito (2 colunas, todo mundo acima do feltro): um "U" invertido —
    // a coluna da esquerda sobe, a da direita desce — pra continuar horário.
    const naEsquerda = Math.ceil(oponentes.length / 2);
    const linhasEstreito = Math.max(naEsquerda, oponentes.length - naEsquerda);
    const posicaoEstreita = (i) => (i < naEsquerda
        ? { gridColumn: 1, gridRow: linhasEstreito - i }
        : { gridColumn: 2, gridRow: 1 + (i - naEsquerda) });
    const maxVersos = estreito ? 2 : 3;
    // Cartas na mão de cada oponente: todo mundo joga uma por vaza, então é
    // a minha mão ajustada por quem já jogou na vaza atual.
    const restanteDe = (nome) => {
        if (eliminados.includes(nome)) return 0;
        const base = souEliminado ? cartasRodada : mao.length + (jogouNaMesa(meuNome) ? 1 : 0);
        return Math.max(0, base - (jogouNaMesa(nome) ? 1 : 0));
    };

    const somaApostas = Object.values(apostas).reduce((s, v) => s + v, 0);
    const vivos = jogadores.filter((j) => !eliminados.includes(j.nome)).length;
    const souUltimoAApostar = Object.keys(apostas).length === vivos - 1;
    const palpiteProibido = souUltimoAApostar && cartasRodada > 1 ? cartasRodada - somaApostas : null;

    let dica;
    if (jogadorDaVezAposta) {
        dica = souEuNaVezDaAposta ? 'SUA MÃO — APOSTE PRIMEIRO' : `AGUARDANDO ${jogadorDaVezAposta.toUpperCase()} APOSTAR`;
    } else if (souEuNaVez) {
        dica = 'SUA VEZ — CLIQUE NUMA CARTA';
    } else if (jogadorDaVez) {
        dica = `AGUARDANDO ${jogadorDaVez.toUpperCase()}`;
    } else {
        dica = 'SUA MÃO';
    }
    if (rodadaCega) dica += ' · SUA CARTA ESTÁ VIRADA';
    if (souEliminado) dica = 'VOCÊ ESTÁ FORA — ASSISTINDO';

    const vaza = vazaResultado;
    const vazaCarta = vaza?.carta ? lerCarta(vaza.carta) : null;
    const viraCarta = vira ? lerCarta(vira.carta) : null;

    const gradeEstilo = estreito
        ? { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gridAutoRows: 'auto', gap: 8, alignItems: 'stretch' }
        : {
            display: 'grid',
            gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
            gridTemplateRows: 'auto minmax(230px,auto)',
            gridTemplateAreas: "'l tl tc tr r' 'l felt felt felt r'",
            gap: 'clamp(4px,1vw,10px)',
            alignItems: 'center',
        };

    return (
        <Casca conectado={conectado} direita={cabecaDireita}>
            <div className="az-tela az-tela-mesa" data-screen-label="Mesa de partida">
                <div className="az-mesa-cabeca">
                    <div className="az-px az-mesa-info">SALA <span className="az-claro">{salaId}</span></div>
                    <div className="az-divisor" />
                    <div className="az-px az-mesa-info">
                        RODADA <span className="az-claro">{numeroRodada || '—'}</span> · <span className="az-claro">{cartasRodada}</span> CARTA{cartasRodada === 1 ? '' : 'S'}
                    </div>
                    <div className="az-mesa-cabeca-dir">
                        <button type="button" className="az-b az-px az-btn-mini" onClick={sair}>SAIR DA PARTIDA</button>
                        <div className="az-pilula-manilha">
                            <span className="az-px az-pilula-rotulo">MANILHA</span>
                            <span className="az-px az-pilula-valor">{viraValor != null ? ORDEM_RANKS[viraValor] ?? '?' : '—'}</span>
                        </div>
                    </div>
                </div>

                <div style={gradeEstilo}>
                    {oponentes.map((op, i) => {
                        const nome = op.nome;
                        const morto = eliminados.includes(nome);
                        const bot = desconectados.includes(nome);
                        const daVez = !vaza && (jogadorDaVezAposta ? jogadorDaVezAposta === nome : jogadorDaVez === nome);
                        const revelada = maosReveladas[nome];
                        const nVersos = Math.min(maxVersos, restanteDe(nome));
                        const balao = baloes[nome];
                        return (
                            <div
                                key={nome}
                                className="az-oponente"
                                style={estreito ? posicaoEstreita(i) : { gridArea: areas[i] }}
                            >
                                {balao && <div key={balao.id} className="az-balao">{balao.texto}</div>}

                                <div className="az-oponente-mao">
                                    {revelada && revelada.length > 0
                                        ? revelada.slice(0, maxVersos).map((carta, k) => <FaceCarta key={k} texto={carta} tamanho="mini" />)
                                        : Array.from({ length: nVersos }, (_, k) => <VersoCarta key={k} />)}
                                    {!revelada && nVersos === 0 && <span className="az-oponente-sem-mao" />}
                                </div>

                                <div className="az-oponente-id">
                                    <div className="az-px az-avatar az-avatar-p" style={{ background: corDoAssento(indiceDe(nome)) }}>
                                        {inicial(nome)}
                                    </div>
                                    <div className="az-min0 az-cresce">
                                        <div className="az-oponente-nome">{nome}</div>
                                        <div className="az-px az-coracoes">{coracoes(hpDe(nome))}</div>
                                    </div>
                                </div>

                                <div className="az-poco">
                                    <span className="az-px az-poco-k">APOSTA</span>
                                    <span className="az-px az-poco-v az-amarelo">{apostas[nome] ?? '—'}</span>
                                    <span className="az-px az-poco-k">FEZ</span>
                                    <span className="az-px az-poco-v az-verde">{vazasFeitas[nome] ?? 0}</span>
                                </div>

                                {bot && !morto && <div className="az-px az-oponente-tag">NO AUTOMÁTICO</div>}
                                {daVez && !morto && <div className="az-anel-vez" />}
                                {morto && (
                                    <div className="az-fora">
                                        <div className="az-px az-carimbo">FORA</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <div
                        className="az-feltro"
                        style={estreito ? { gridColumn: '1 / 3', gridRow: linhasEstreito + 1 } : { gridArea: 'felt' }}
                    >
                        <div className="az-feltro-borda" />

                        {viraCarta && (
                            <div className="az-vira">
                                <FaceCarta texto={vira.carta} tamanho="vira" />
                                <div className="az-px az-vira-rotulo">VIRA</div>
                            </div>
                        )}

                        <div className="az-mesa-cartas" style={{ animation: tremendo ? 'cz-tremor 380ms steps(3)' : 'none' }}>
                            {mesa.map((j, i) => (
                                <div key={`${i}-${j.jogador}-${j.carta}`} className="az-jogada">
                                    <FaceCarta texto={j.carta} tamanho="mesa" />
                                    <div className="az-px az-jogada-nome">{j.jogador === meuNome ? 'VOCÊ' : j.jogador.toUpperCase()}</div>
                                </div>
                            ))}
                            {mesa.length === 0 && <div className="az-px az-mesa-vazia">MESA VAZIA</div>}
                        </div>

                        {golpe && !vaza && (
                            <div className="az-golpe" key={golpe.key}>
                                {golpe.camadas.map((camada, i) => <CamadaGolpe key={i} estilo={camada.estilo} />)}
                            </div>
                        )}

                        {vaza && (
                            <div className="az-vaza">
                                <div className="az-px az-vaza-rotulo">{vaza.vencedor ? 'VAZA FECHADA' : 'VAZA MELADA'}</div>
                                <div className="az-vaza-corpo">
                                    {vazaCarta && vaza.vencedor && (
                                        <div className="az-vaza-carta">
                                            <FaceCarta texto={vaza.carta} tamanho="vaza" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="az-px az-vaza-nome">
                                            {vaza.vencedor ? (vaza.vencedor === meuNome ? 'VOCÊ' : vaza.vencedor.toUpperCase()) : 'MELOU'}
                                        </div>
                                        <div className="az-vaza-sub">
                                            {vaza.vencedor
                                                ? `levou a vaza — ${vazasFeitas[vaza.vencedor] ?? 1} no total`
                                                : 'cartas iguais se anularam — ninguém leva'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="az-minha-area">
                    <div className="az-voce">
                        {baloes[meuNome] && <div key={baloes[meuNome].id} className="az-balao">{baloes[meuNome].texto}</div>}
                        <div className="az-voce-id">
                            <div className="az-px az-avatar az-avatar-m" style={{ background: corDoAssento(meuIndice) }}>
                                {inicial(meuNome)}
                            </div>
                            <div>
                                <div className="az-voce-nome">Você</div>
                                <div className="az-px az-coracoes az-coracoes-g">{coracoes(hpDe(meuNome))}</div>
                            </div>
                        </div>
                        <div className="az-voce-pocos">
                            <div className="az-poco-g">
                                <div className="az-px az-poco-k">APOSTA</div>
                                <div className="az-px az-poco-gv az-amarelo">{apostas[meuNome] ?? '—'}</div>
                            </div>
                            <div className="az-poco-g">
                                <div className="az-px az-poco-k">FEZ</div>
                                <div className="az-px az-poco-gv az-verde">{vazasFeitas[meuNome] ?? 0}</div>
                            </div>
                        </div>
                        {(souEuNaVez || souEuNaVezDaAposta) && <div className="az-anel-vez az-anel-voce" />}
                    </div>

                    <div className="az-mao-bloco">
                        <div className="az-px az-dica">{dica}</div>
                        <div className="az-mao">
                            {mao.map((carta, indice) => {
                                const c = lerCarta(carta);
                                const manilha = !rodadaCega && c && viraValor != null && c.valorInt === viraValor;
                                return (
                                    <button
                                        key={`${indice}-${carta}`}
                                        type="button"
                                        data-som="mudo"
                                        className="az-b az-carta-botao"
                                        disabled={!souEuNaVez}
                                        onClick={() => jogar(indice)}
                                        aria-label={rodadaCega ? 'Sua carta (virada)' : carta}
                                    >
                                        {rodadaCega ? <VersoCarta tamanho="mao" /> : <FaceCarta texto={carta} tamanho="mao" />}
                                        {manilha && <span className="az-px az-selo-manilha">MANILHA</span>}
                                    </button>
                                );
                            })}
                            {mao.length === 0 && <div className="az-px az-sem-cartas">SEM CARTAS</div>}
                        </div>
                    </div>

                    {souEuNaVezDaAposta && (
                        <div className="az-palpite">
                            <div className="az-px az-palpite-titulo">QUANTAS VAZAS VOCÊ FAZ?</div>
                            <div className="az-palpite-botoes">
                                {Array.from({ length: cartasRodada + 1 }, (_, n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        data-som="mudo"
                                        className="az-b az-px az-palpite-botao"
                                        disabled={n === palpiteProibido}
                                        title={n === palpiteProibido ? 'Esse valor fecharia a soma das apostas' : undefined}
                                        onClick={() => apostar(n)}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <div className="az-palpite-nota">
                                {palpiteProibido != null && palpiteProibido >= 0 && palpiteProibido <= cartasRodada
                                    ? `Você é o último: ${palpiteProibido} fecharia a soma e não vale. `
                                    : ''}
                                Errar o palpite tira coração — pra mais ou pra menos.
                            </div>
                        </div>
                    )}
                </div>

                {erro && <div className="az-erro az-erro-caixa">{erro}</div>}

                <div className="az-rodape-mesa">
                    <div className="az-chat">
                        <div className="az-frases">
                            {MENSAGENS_CHAT.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    data-som="mudo"
                                    className="az-b az-frase"
                                    disabled={chatEmCooldown}
                                    onClick={() => enviarChat({ tipo: 'restrita', id: m.id })}
                                >
                                    {m.texto}
                                </button>
                            ))}
                        </div>
                        {chatAberto && (
                            <form className="az-chat-livre" onSubmit={enviarChatLivre}>
                                <input
                                    className="az-input az-input-chat"
                                    type="text"
                                    maxLength={200}
                                    placeholder="Mensagem..."
                                    value={textoChat}
                                    onChange={(e) => setTextoChat(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    data-som="mudo"
                                    className="az-b az-px az-btn az-btn-azul az-btn-p"
                                    disabled={chatEmCooldown || !textoChat.trim()}
                                >
                                    ENVIAR
                                </button>
                            </form>
                        )}
                        {chatEmCooldown && <div className="az-nota">aguarde {segundosCooldown}s pra mandar de novo</div>}
                        {erroChat && <div className="az-erro">{erroChat}</div>}
                    </div>

                    <div className="az-log">
                        <div className="az-px az-log-titulo">LOG DA PARTIDA</div>
                        <div className="az-log-linhas">
                            {log.length === 0 && <div className="az-log-linha" style={{ color: '#4a4f60' }}>Nada ainda.</div>}
                            {[...log].reverse().map((l) => (
                                <div key={l.id} className="az-log-linha" style={{ color: COR_LOG[l.tipo] ?? COR_LOG.info }}>
                                    {l.txt}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {expulso && (
                <Modal>
                    <div className="az-px az-modal-titulo">VOCÊ SAIU DA MESA</div>
                    <div className="az-modal-texto">
                        Ficou tempo demais sem jogar e perdeu o turno. Sua vaga continua reservada — volte antes que a partida acabe.
                    </div>
                    <div className="az-linha-botoes">
                        <button
                            type="button"
                            className="az-b az-px az-btn az-btn-vermelho az-cresce"
                            onClick={reconectarDoModal}
                            disabled={reconectandoExpulso}
                        >
                            {reconectandoExpulso ? 'RECONECTANDO...' : 'RECONECTAR'}
                        </button>
                        <button type="button" className="az-b az-px az-btn az-btn-cinza" onClick={() => onSairDaPartida(salaId)}>
                            SALAS
                        </button>
                    </div>
                    {erro && <div className="az-erro">{erro}</div>}
                </Modal>
            )}
        </Casca>
    );
}
