import { useEffect, useMemo, useRef, useState } from 'react';
import Fantasminha from './Fantasminha.jsx';
import Carta from './Carta.jsx';
import Ficha from './Ficha.jsx';
import { sortearChapeu } from '../../chapeus.js';
import { MENSAGENS_CHAT } from '../../../../../conexao/chat/mensagensChat.js';

// Mesa de Partida "de verdade" — era um sandbox 100% desligado do socket
// (botões de debug simulando cada evento), virou um componente de
// APRESENTAÇÃO: recebe `estado` (o mesmo estado que Partida.jsx já monta a
// partir dos handlers de socket, ver conexao/PROTOCOLO.md) e `acoes`
// (funções que chamam o servidor de verdade), e reage a MUDANÇA de prop —
// via useEffect — em vez de reagir a clique de botão. A camada de socket
// inteira continua morando só em Partida.jsx (novo/Partida.jsx); este
// arquivo nunca chama `chamar`/`socket.on` diretamente. `acoes` ainda pode
// vir undefined (ver novo/Partida.jsx) — Fatia 1 deste plugue é só
// exibição, suas própias ações (jogar carta, apostar, chat) ainda não
// existem; todo controle que dependeria de `acoes` fica inerte/oculto
// enquanto isso.

const CARTAS_DO_BARALHO = [
    { rotacao: -6, x: -3, y: 2 },
    { rotacao: -2, x: -1, y: 1 },
    { rotacao: 1, x: 1, y: -1 },
    { rotacao: 4, x: 2, y: -2 },
    { rotacao: 7, x: 3, y: -3 },
];

// Animação de "dar as cartas": o baralho gira pra apontar pro jogador da
// vez, sai um pouco do centro em direção a ele, "solta" as cartas da
// rodada (ver `estado.cartasRodada` — antes era um número fixo de teste,
// agora é o tamanho de verdade da mão desta rodada) uma a uma até esse
// assento, e só então segue (sentido horário) pro próximo.
const VELOCIDADE = 2;
const DURACAO_DECK_MS = 200;
const DURACAO_CARTA_MS = 380;
const FOLGA_APOS_BARALHO_MS = 120;
const ATRASO_ENTRE_CARTAS_MS = Math.round(140 / VELOCIDADE);
const PAUSA_POS_ENTREGA_MS = Math.round(250 / VELOCIDADE);
const ALCANCE_BARALHO = 0.35;
const ESCALA_BARALHO_REPOUSO = 0.55;
const ESCALA_BARALHO_ENTREGANDO = 0.72;
const ESCALA_CARTA_VOANDO_INICIAL = ESCALA_BARALHO_ENTREGANDO;
const ESCALA_CARTA_VOANDO_FINAL = 0.36;
const ESCALA_CARTA_VOANDO_INICIAL_VOCE = 0.32;
const ESCALA_CARTA_VOANDO_FINAL_VOCE = 0.95;

const DURACAO_SAIDA_MAO_MS = 220;
const DURACAO_JOGADA_MS = Math.round(650 / VELOCIDADE);
const ESCALA_CARTA_JOGADA_INICIAL = 0.34;
const ESCALA_CARTA_JOGADA_FINAL = 0.6;
const ALCANCE_JOGADA = 0.3;
const ESPALHAMENTO_JOGADA = 9;
function calcularAlvoJogada(assento) {
    return {
        x: 50 + (assento.x - 50) * ALCANCE_JOGADA + (Math.random() * 2 - 1) * ESPALHAMENTO_JOGADA,
        y: 50 + (assento.y - 50) * ALCANCE_JOGADA + (Math.random() * 2 - 1) * ESPALHAMENTO_JOGADA,
    };
}

const MELADA_CANTO_X = 18;
const MELADA_CANTO_Y = 20;
const MELADA_CANTO_ESPACAMENTO_PX = 10;
const MELADA_GRUPO_ESPACAMENTO_PX = 60;
const MELADA_PRIMEIRO_GRUPO_EXTRA_PX = 20;

// Bot de verdade (bots/Bot.js sempre nomeia "Bot N" e nunca entra em
// `desconectados`) ou humano jogando no automático (entra em
// `desconectados`) — os dois ganham o visual de robozinho e a tag.
function assentoEhBot(nome, desconectados) {
    if (!nome) return false;
    return /^Bot \d+$/.test(nome) || (desconectados ?? []).includes(nome);
}

function esperar(ms) {
    return new Promise((resolver) => setTimeout(resolver, ms));
}

// Mesmo valor de `this.hp = 3` em game/PlayerGame.js.
const VIDA_MAXIMA = 3;
const VIDA_TEMPORARIA_MS = 1500;
const RODADA_FIM_REVELACAO_MS = 2800;

const MORTE_IMPACTO_MS = 1500;
const MORTE_DESINTEGRAR_MS = 900;
// Segura a morte por esse tanto DEPOIS que a revelação da vaza/o dano do
// placar (ver danoRodadaAtivoRef) já tiverem liberado — só pra dar aquele
// último respiro depois do coração apagar de vez, antes do fantasminha cair
// (pedido do Henrique: "uns 1s depois que a animação de dano tocar").
const PAUSA_MORTE_APOS_DANO_MS = 1000;

const FICHA_TAMANHO_PX = 64;
const ESCALA_FICHA_CANTO = 0.62;
const FICHA_EMPILHA_POPUP_PX = 10;
// Espaçamento entre fichas no seu leque (canto inferior esquerdo) — folgado
// o bastante pra caber a carta de vaza ganha (110x154 * VAZA_POUSO_ESCALA,
// rotacionada 90°, ~52px de largura) espiando atrás de UMA ficha sem tocar
// a ficha VIZINHA (ver render de cartasVazaGanhas mais abaixo).
const FICHA_LEQUE_ESPACAMENTO_PX = 52;
const FICHA_EMPILHA_FANTASMA_PX = 30;
const FICHA_FANTASMA_OFFSET_LADO_PX = 55;
const FICHA_FORCA_SUBIDA_MIN = 70;
const FICHA_FORCA_SUBIDA_MAX = 190;
const ESCALA_FICHA_PICO_MIN = 1.35;
const ESCALA_FICHA_PICO_MAX = 1.75;
const FICHA_VOLTAS_MIN = 3;
const FICHA_VOLTAS_MAX = 5.5;
const FICHA_DURACAO_MIN_MS = 750;
const FICHA_DURACAO_MAX_MS = 1150;
const FICHA_DESVIO_LATERAL_PX = 26;
const FICHA_ATRASO_ENTRE_MS = 90;
const FICHA_ASSENTAMENTO_MS = 320;

// Segura a mesa parada (as cartas já jogadas, sem destaque nenhum) antes de
// começar a revelação em si — sem isso a carta vencedora começava a
// crescer/voar na hora EXATA que a última carta da vaza pousava, rápido
// demais pra dar tempo de ver a vaza fechada (pedido do Henrique).
const VAZA_SEGURAR_ULTIMA_CARTA_MS = 1500;
const VAZA_REVELACAO_X_FRACAO = 0.42;
const VAZA_REVELACAO_TEXTO_X_FRACAO = 0.66;
const VAZA_REVELACAO_Y_FRACAO = 0.5;
const VAZA_REVELACAO_ESCALA = 2.4;
const VAZA_REVELACAO_TRANSICAO_MS = 550;
const VAZA_REVELACAO_PAUSA_MS = 1100;
const VAZA_IMPACTO_QUEDA_PX = 26;
const VAZA_IMPACTO_ESCALA = 0.7;
const VAZA_IMPACTO_DURACAO_MS = 220;
// VAZA_IMPACTO_DURACAO_MS + VAZA_IMPACTO_PAUSA_MS tem que bater com
// VAZA_EXPLOSAO_DURACAO_MS (mesmo tempo que a transition de
// .mesa-exp-carta-jogada-explodindo leva no CSS) — é quanto tempo o fluxo
// de vaza vencida espera antes de tirar as cartas explodindo do DOM.
const VAZA_IMPACTO_PAUSA_MS = 680;
const VAZA_VIAGEM_DURACAO_MS = 600;
const VAZA_POUSO_ESCALA = 0.34;
// Sua carta pousa RETA (sem giro nenhum) — só a do fantasminha gira 90°
// (ver .mesa-exp-carta-vaza-ganha/-voce no CSS, os valores aqui têm que
// bater com o rotate() fixo de cada uma). A carta já chega VIAJANDO nessa
// rotação final (ver iniciarRevelacaoVazaComVencedora), senão trocar pro
// elemento estático da pilha no fim da viagem "gira instantâneo".
const VAZA_POUSO_ROT_GRAUS = 0;
const VAZA_POUSO_ROT_FANTASMA_GRAUS = 90;
const VAZA_EXPLOSAO_FATOR = 2.6;
// Piso de distância (independe de `distancia * FATOR`): sem isso, uma carta
// que caiu perto do centro da mesa (distância pequena) só andava um pouco
// mesmo multiplicada — ficava só girando no lugar, sem realmente sair da
// tela. Com o piso, TODA carta perdedora voa pelo menos essa distância (em
// % da mesa) na direção que já tinha, então sempre escapa do campo de
// visão antes de a `.mesa-exp-carta-jogada-explodindo` sumir (ver CSS) —
// era o "as cartas somem" que o Henrique via, pedido pra virar "voam pra
// longe, saem do campo de visão" antes de desaparecer.
const VAZA_EXPLOSAO_DISTANCIA_MIN = 260;
const VAZA_EXPLOSAO_ESCALA_MULT = 1.35;
// Voltas mais baixas que o normal de propósito (pediu pra ficar "menos
// violento, mais devagar") — gira e flipa visivelmente sem virar um
// redemoinho.
const VAZA_EXPLOSAO_VOLTAS_MIN = 1;
const VAZA_EXPLOSAO_VOLTAS_MAX = 2;
// Flip 3D (rotateY) somado ao giro 2D (rotate) de sempre — "como se
// estivessem levantando voo": perspective() entra no transform só pra essa
// carta (ver render em cartasNaMesa), sem precisar de perspective no pai.
const VAZA_EXPLOSAO_FLIP_VOLTAS_MIN = 0.5;
const VAZA_EXPLOSAO_FLIP_VOLTAS_MAX = 1.5;
const VAZA_EXPLOSAO_DURACAO_MS = 900;
// Vaza melada (ninguém pontua, ver vazaFinalizada/PROTOCOLO.md — vencedor
// null): mesma pausa/overlay da revelação normal, só que sem carta nenhuma
// crescendo/viajando — todo mundo que estava na mesa "explode" junto.
const VAZA_MELADA_PAUSA_MS = 1400;

// "Sisteminha" de dano do fim de rodada (ver dispararCartasDeDano): sempre
// `diferenca` cartas (MESMA conta de `hp -= diferenca` em game/Rodada.js),
// uma por coração perdido. Se `steak > aposta`, são as ÚLTIMAS
// `steak - aposta` cartas que esse assento tinha empilhado como vaza ganha
// nesta rodada — voltam voando, fez vaza DEMAIS. Se `aposta > steak`, não
// existe carta de verdade pra essas (nunca foram ganhas) — voam viradas pra
// baixo, saindo do mesmo canto onde as fichas da aposta nasceram (a aposta
// que não se cumpriu "vira" o dano). Física em arco igual FichaVoando
// (sobe/gira/desce), só que o alvo é um coração específico, não um canto
// fixo — ver CartaDanoVoando/obterCentroCoracao.
const DANO_CARTA_VOO_DURACAO_MS = 640;
const DANO_CARTA_ATRASO_ENTRE_MS = 260;
const DANO_CARTA_FORCA_SUBIDA_PX = 90;
const DANO_CARTA_ESCALA_PICO = 1.1;
const DANO_CARTA_ESCALA_POUSO = 0.4;
const CORACAO_IMPACTO_DURACAO_MS = 380;

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
const ANGULO_ENTRE_CARTAS = 8;
const DESLOCAMENTO_ENTRE_CARTAS = 22;
const ATRASO_ENTRADA_CARTA_MS = 90;
const ANGULO_ENTRE_CARTAS_VOCE = 10;
const DESLOCAMENTO_ENTRE_CARTAS_VOCE = 70;

const DURACAO_BOLHA_MS = 3200;

// Ordem de rank IGUAL valorInt de game/Baralho.js (4,5,6,7,Q,J,K,A,2,3) —
// só usada pra comparar força/identidade AO VIVO na mesa (analiseMesa,
// enquanto a vaza ainda está rolando). A manilha em si (qual VALOR vale
// mais) não é mais calculada aqui — o servidor já manda pronta em
// `vira.valor` (ver manilhaVirada em PROTOCOLO.md).
const ORDEM_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES = ['Ouros', 'Espadas', 'Copas', 'Paus'];
const NAIPE_INT = { Ouros: 0, Espadas: 1, Copas: 2, Paus: 3 };

// Cartas chegam do servidor como a string "[4 de Ouros]" (Carta.toString(),
// ver conexao/PROTOCOLO.md) — mesmo parser que novo/Partida.jsx usa
// (lerCarta lá).
function lerCarta(texto) {
    const m = /^\[(.+) de (.+)]$/.exec(String(texto ?? '').trim());
    return m ? { rank: m[1], naipe: m[2] } : null;
}

// Mesmo critério de game/Mesa.js (saoIdenticas/compararForca) — decide
// contorno verde (mais forte agora) e preto (melada) na mesa AO VIVO,
// enquanto a vaza ainda não fechou (o servidor só informa o resultado
// FINAL em vazaFinalizada, não quem tá "ganhando" a cada carta jogada).
function saoIdenticasMesa(c1, c2, viraValor) {
    if (c1.valorInt !== c2.valorInt) return false;
    if (c1.valorInt === viraValor) return c1.naipeInt === c2.naipeInt;
    return true;
}

function compararForcaMesa(c1, c2, viraValor) {
    const c1EhManilha = c1.valorInt === viraValor;
    const c2EhManilha = c2.valorInt === viraValor;
    if (c1EhManilha && !c2EhManilha) return 1;
    if (!c1EhManilha && c2EhManilha) return -1;
    if (c1EhManilha && c2EhManilha) return c1.naipeInt - c2.naipeInt;
    return c1.valorInt - c2.valorInt;
}

const VIRA_IDA_X = 50 - 16;
const VIRA_IDA_Y = 50 - 3;
const VIRA_ROT_MEIO_GRAUS = 82;
const DURACAO_VIRA_IDA_MS = 280;
const DURACAO_VIRA_VOLTA_MS = 300;
const ROTACAO_VIRA_POUSADA_GRAUS = -60;
const VIRA_POUSADA_X = 50 - 3;
const VIRA_POUSADA_Y = 50;
const ESCALA_VIRA = 0.55;

function calcularEstadoVira(fase) {
    if (fase === 'indo') return { x: VIRA_IDA_X, y: VIRA_IDA_Y, rotY: VIRA_ROT_MEIO_GRAUS, rotZ: 0 };
    if (fase === 'voltando' || fase === 'pousada') {
        return { x: VIRA_POUSADA_X, y: VIRA_POUSADA_Y, rotY: 180, rotZ: ROTACAO_VIRA_POUSADA_GRAUS };
    }
    return { x: 50, y: 50, rotY: 0, rotZ: 0 };
}

const VIRA_LEGENDA_ANGULO_ENTRE_CARTAS = 12;
const VIRA_LEGENDA_DESLOCAMENTO_ENTRE_CARTAS = 20;

// "Você" sempre no ângulo de baixo — ver ordemAssentos mais abaixo pra como
// isso é garantido mesmo quando `estado.jogadores` não te lista primeiro.
const RAIO_X_OUTROS = 62;
const RAIO_Y_OUTROS = 68;
const RAIO_X_VOCE = 62;
const RAIO_Y_VOCE = 80;

function calcularAssentos(quantidade) {
    return Array.from({ length: quantidade }, (_, i) => {
        const eVoce = i === 0;
        const angulo = (Math.PI / 2) + i * ((2 * Math.PI) / quantidade);
        const raioX = eVoce ? RAIO_X_VOCE : RAIO_X_OUTROS;
        const raioY = eVoce ? RAIO_Y_VOCE : RAIO_Y_OUTROS;
        return {
            eVoce,
            x: 50 + raioX * Math.cos(angulo),
            y: 50 + raioY * Math.sin(angulo),
        };
    });
}

// `escondida` (ver iniciarRodadaNova, rodada de 1 carta): a SUA própria
// carta viajando até você continua carregando o valor de VERDADE em
// `carta` (aoChegarCarta precisa dele pra popular suaMao direito), mas o
// voo em si tem que mostrar as costas — senão dava pra ver a própria carta
// ANTES dela pousar escondida em SuaMaoEmLeque, exatamente o vazamento que
// a rodada cega existe pra evitar.
function CartaVoando({ de, para, anguloInicial, anguloFinal, escalaInicial, escalaFinal, duracaoMs, carta, escondida, onChegou }) {
    const [pos, setPos] = useState(de);
    const [escala, setEscala] = useState(escalaInicial);
    const [angulo, setAngulo] = useState(anguloInicial);

    useEffect(() => {
        const quadro = requestAnimationFrame(() => {
            setPos(para);
            setEscala(escalaFinal);
            setAngulo(anguloFinal);
        });
        const fim = setTimeout(() => onChegou(), duracaoMs);
        return () => {
            cancelAnimationFrame(quadro);
            clearTimeout(fim);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- de/para/escala.../angulo.../onChegou são fixos por instância (cada carta voa uma vez só)
    }, []);

    return (
        <div
            className="mesa-exp-carta-voando"
            style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transitionDuration: `${duracaoMs}ms`,
                '--angulo-carta': `${angulo}deg`,
                '--escala-carta': escala,
            }}
        >
            {carta && !escondida ? <Carta rank={carta.rank} naipe={carta.naipe} /> : <Carta virada />}
        </div>
    );
}

function FichaVoando({ de, para, atrasoMs, onChegou, hue }) {
    const [posBase, setPosBase] = useState(de);
    const [alturaExtra, setAlturaExtra] = useState(0);
    const [escala, setEscala] = useState(1);
    const [rotY, setRotY] = useState(0);
    const [pousada, setPousada] = useState(false);

    const params = useMemo(() => ({
        forcaSubida: FICHA_FORCA_SUBIDA_MIN + Math.random() * (FICHA_FORCA_SUBIDA_MAX - FICHA_FORCA_SUBIDA_MIN),
        escalaPico: ESCALA_FICHA_PICO_MIN + Math.random() * (ESCALA_FICHA_PICO_MAX - ESCALA_FICHA_PICO_MIN),
        voltas: Math.round((FICHA_VOLTAS_MIN + Math.random() * (FICHA_VOLTAS_MAX - FICHA_VOLTAS_MIN)) * 2) / 2,
        duracaoMs: FICHA_DURACAO_MIN_MS + Math.random() * (FICHA_DURACAO_MAX_MS - FICHA_DURACAO_MIN_MS),
        desvioLateral: (Math.random() * 2 - 1) * FICHA_DESVIO_LATERAL_PX,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sorteia uma vez só, na criação desta ficha
    }), []);

    useEffect(() => {
        let raf;
        let cancelado = false;
        let timerAssentar;

        const quadro = (inicio, agora) => {
            if (cancelado) return;
            const t = Math.min((agora - inicio) / params.duracaoMs, 1);
            const naSubida = t < 0.5;
            const fase = naSubida ? t / 0.5 : (t - 0.5) / 0.5;
            const altura = naSubida
                ? -params.forcaSubida * easeOutCubic(fase)
                : -params.forcaSubida * (1 - easeInCubic(fase));
            const escalaAtual = naSubida
                ? 1 + (params.escalaPico - 1) * easeOutCubic(fase)
                : params.escalaPico - (params.escalaPico - 1) * easeInCubic(fase);
            const desvio = Math.sin(t * Math.PI) * params.desvioLateral;

            setPosBase({ x: de.x + (para.x - de.x) * t + desvio, y: de.y + (para.y - de.y) * t });
            setAlturaExtra(altura);
            setEscala(escalaAtual);
            setRotY(params.voltas * 360 * t);

            if (t < 1) {
                raf = requestAnimationFrame((prox) => quadro(inicio, prox));
            } else {
                setPousada(true);
                setEscala(ESCALA_FICHA_CANTO);
                timerAssentar = setTimeout(onChegou, FICHA_ASSENTAMENTO_MS);
            }
        };

        const inicioTimer = setTimeout(() => {
            raf = requestAnimationFrame((inicio) => quadro(inicio, inicio));
        }, atrasoMs);

        return () => {
            cancelado = true;
            clearTimeout(inicioTimer);
            clearTimeout(timerAssentar);
            cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- de/para/atrasoMs/onChegou são fixos por instância (cada ficha voa uma vez só)
    }, []);

    const sombraEscala = Math.max(0.35, 1 - Math.abs(alturaExtra) / (FICHA_FORCA_SUBIDA_MAX * 1.3));

    return (
        <>
            <div
                className="mesa-exp-ficha-sombra"
                style={{
                    left: `${posBase.x}px`,
                    top: `${posBase.y}px`,
                    transform: `translate(-50%, -50%) scale(${sombraEscala})`,
                    opacity: sombraEscala * 0.55,
                }}
            />
            <div
                className={`mesa-exp-ficha-voando${pousada ? ' mesa-exp-ficha-pousada' : ''}`}
                style={{
                    left: `${posBase.x}px`,
                    top: `${posBase.y + alturaExtra}px`,
                    transform: `translate(-50%, -50%) scale(${escala}) rotateY(${rotY}deg)`,
                }}
            >
                <Ficha destacada={pousada} hue={hue} />
            </div>
        </>
    );
}

// Carta de dano em voo (ver dispararCartasDeDano) — mesmo arco de
// sobe/desce por easing de FichaVoando acima, só que o alvo NÃO vem pronto
// em `para`: é medido NA HORA (`obterDestino`, chamado só depois de
// `atrasoMs`, nunca antes de disparar o rAF) porque o coração-alvo só existe
// garantidamente montado no DOM depois que `mostrarVidaTemporaria`/o estado
// "sempre visível" (Você) já comitou — pedir o rect ANTES (junto com o
// resto dos dados da carta, ainda dentro do efeito de fim de rodada) podia
// pegar `coracaoRefs` com a entrada antiga (ou nenhuma, no primeiro round).
// Sem coração encontrado mesmo assim (não devia acontecer), cai pro centro
// do próprio assento.
//
// `carta` null identifica dano de aposta NÃO cumprida (fez menos vazas do
// que apostou) — nunca existiu carta de verdade pra essa parte do dano, e
// quem "bate" no coração agora é a própria `Ficha` (girando igual moeda no
// rotateY em vez de virar carta), não mais uma carta virada pra baixo. `hue`
// só se aplica a esse caso (cor da ficha do fantasminha, ver Ficha.jsx).
function CartaDanoVoando({ de, obterDestino, atrasoMs, carta, hue, onChegou }) {
    const [posBase, setPosBase] = useState(de);
    const [alturaExtra, setAlturaExtra] = useState(0);
    const [escala, setEscala] = useState(1);
    const [rotY, setRotY] = useState(0);

    useEffect(() => {
        let raf;
        let cancelado = false;

        const quadro = (para, inicio, agora) => {
            if (cancelado) return;
            const t = Math.min((agora - inicio) / DANO_CARTA_VOO_DURACAO_MS, 1);
            const naSubida = t < 0.5;
            const fase = naSubida ? t / 0.5 : (t - 0.5) / 0.5;
            const altura = naSubida
                ? -DANO_CARTA_FORCA_SUBIDA_PX * easeOutCubic(fase)
                : -DANO_CARTA_FORCA_SUBIDA_PX * (1 - easeInCubic(fase));
            const escalaAtual = naSubida
                ? 1 + (DANO_CARTA_ESCALA_PICO - 1) * easeOutCubic(fase)
                : DANO_CARTA_ESCALA_PICO - (DANO_CARTA_ESCALA_PICO - DANO_CARTA_ESCALA_POUSO) * easeInCubic(fase);

            setPosBase({ x: de.x + (para.x - de.x) * t, y: de.y + (para.y - de.y) * t });
            setAlturaExtra(altura);
            setEscala(escalaAtual);
            setRotY(720 * t);

            if (t < 1) {
                raf = requestAnimationFrame((prox) => quadro(para, inicio, prox));
            } else {
                onChegou();
            }
        };

        const inicioTimer = setTimeout(() => {
            const para = obterDestino() ?? de;
            raf = requestAnimationFrame((inicio) => quadro(para, inicio, inicio));
        }, atrasoMs);

        return () => {
            cancelado = true;
            clearTimeout(inicioTimer);
            cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- de/obterDestino/atrasoMs/carta/onChegou são fixos por instância (cada carta voa uma vez só)
    }, []);

    return (
        <div
            className={`mesa-exp-carta-dano-voando${carta ? '' : ' mesa-exp-carta-dano-voando-ficha'}`}
            style={{
                left: `${posBase.x}px`,
                top: `${posBase.y + alturaExtra}px`,
                transform: `translate(-50%, -50%) scale(${escala}) rotateY(${rotY}deg)`,
            }}
        >
            {carta ? <Carta rank={carta.rank} naipe={carta.naipe} /> : <Ficha hue={hue} />}
        </div>
    );
}

function calcularEstadoRevelacaoVaza(fase, destino) {
    if (fase === 'impacto') {
        return {
            x: window.innerWidth * VAZA_REVELACAO_X_FRACAO,
            y: window.innerHeight * VAZA_REVELACAO_Y_FRACAO + VAZA_IMPACTO_QUEDA_PX,
            rot: 0,
            escala: VAZA_IMPACTO_ESCALA,
        };
    }
    if (fase === 'viajando' || fase === 'pousada') {
        return { x: destino.x, y: destino.y, rot: destino.rot ?? VAZA_POUSO_ROT_GRAUS, escala: VAZA_POUSO_ESCALA };
    }
    return {
        x: window.innerWidth * VAZA_REVELACAO_X_FRACAO,
        y: window.innerHeight * VAZA_REVELACAO_Y_FRACAO,
        rot: 0,
        escala: VAZA_REVELACAO_ESCALA,
    };
}

function duracaoFaseRevelacaoVaza(fase) {
    if (fase === 'impacto') return VAZA_IMPACTO_DURACAO_MS;
    if (fase === 'viajando' || fase === 'pousada') return VAZA_VIAGEM_DURACAO_MS;
    return VAZA_REVELACAO_TRANSICAO_MS;
}

function CartaRevelando({ origem, destino, fase, carta }) {
    const [estado, setEstado] = useState({ x: origem.x, y: origem.y, rot: origem.rot, escala: origem.escala });
    const primeiraFaseRef = useRef(fase);

    useEffect(() => {
        const quadro = requestAnimationFrame(() => {
            setEstado(calcularEstadoRevelacaoVaza(fase, destino));
        });
        return () => cancelAnimationFrame(quadro);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só o alvo da fase de NASCIMENTO, mudanças de fase depois são o efeito de baixo
    }, []);

    useEffect(() => {
        if (fase === primeiraFaseRef.current) return;
        setEstado(calcularEstadoRevelacaoVaza(fase, destino));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- destino é fixo por instância
    }, [fase]);

    return (
        <div
            className="mesa-exp-carta-revelando"
            style={{
                left: `${estado.x}px`,
                top: `${estado.y}px`,
                transform: `translate(-50%, -50%) rotate(${estado.rot}deg) scale(${estado.escala})`,
                transitionDuration: `${duracaoFaseRevelacaoVaza(fase)}ms`,
            }}
        >
            <Carta rank={carta.rank} naipe={carta.naipe} />
        </div>
    );
}

// `registrarRef`/`assentoIndice` (ver coracaoRefs em MesaExperimento):
// registra o <span> de CADA coração — é o que dispararCartasDeDano usa pra
// medir onde cada carta de dano tem que pousar (getBoundingClientRect NA
// HORA, não um cálculo de layout feito à mão). `coracaoImpactado` (índice
// do coração que acabou de ser atingido, ou null) liga um flash rápido nele
// só — os outros corações da fileira ficam de fora da classe.
function Coracoes({ vida, assentoIndice, registrarRef, coracaoImpactado }) {
    return (
        <div className="mesa-exp-coracoes">
            {Array.from({ length: VIDA_MAXIMA }, (_, i) => (
                <span
                    key={i}
                    ref={registrarRef ? (el) => registrarRef(assentoIndice, i, el) : undefined}
                    className={`mesa-exp-coracao${coracaoImpactado === i ? ' mesa-exp-coracao-impacto' : ''}`}
                >
                    {i < vida ? '❤️' : '🖤'}
                </span>
            ))}
        </div>
    );
}

function MaoEmLeque({ quantidade, cartas }) {
    const total = cartas ? cartas.length : quantidade;
    if (total <= 0) return null;
    const meio = (total - 1) / 2;

    return (
        <div className="mesa-exp-mao-leque">
            {Array.from({ length: total }, (_, i) => {
                const offset = i - meio;
                const carta = cartas?.[i];
                return (
                    <div
                        key={i}
                        className="mesa-exp-mao-carta"
                        style={{
                            '--rotacao-carta': `${offset * ANGULO_ENTRE_CARTAS}deg`,
                            '--deslocamento-carta': `${offset * DESLOCAMENTO_ENTRE_CARTAS}px`,
                        }}
                    >
                        <div
                            className="mesa-exp-mao-carta-entrada"
                            style={{ animationDelay: `${i * ATRASO_ENTRADA_CARTA_MS}ms` }}
                        >
                            {carta ? <Carta rank={carta.rank} naipe={carta.naipe} /> : <Carta virada />}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// `onJogar` pode vir undefined (ver `acoes` em MesaExperimento — Fatia 1
// ainda não pluga suas próprias ações): `?.()` deixa a mão clicável sem
// quebrar nada enquanto isso, o clique simplesmente não faz nada ainda.
function SuaMaoEmLeque({ cartas, idSaindo, onJogar, escondida }) {
    if (cartas.length === 0) return null;
    const meio = (cartas.length - 1) / 2;

    return (
        <div className="mesa-exp-sua-mao">
            {cartas.map((carta, i) => {
                const offset = i - meio;
                const saindo = carta.id === idSaindo;
                return (
                    <div
                        key={carta.id}
                        className="mesa-exp-sua-mao-carta"
                        style={{
                            '--rotacao-carta': `${offset * ANGULO_ENTRE_CARTAS_VOCE}deg`,
                            '--deslocamento-carta': `${offset * DESLOCAMENTO_ENTRE_CARTAS_VOCE}px`,
                        }}
                        onClick={() => onJogar?.(carta)}
                    >
                        <div
                            className={`mesa-exp-sua-mao-carta-entrada${saindo ? ' mesa-exp-sua-mao-carta-saindo' : ''}`}
                            style={{ animationDelay: saindo ? '0ms' : `${i * ATRASO_ENTRADA_CARTA_MS}ms` }}
                        >
                            {escondida ? <Carta virada /> : <Carta rank={carta.rank} naipe={carta.naipe} />}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function LequeManilha({ rank }) {
    const meio = (NAIPES.length - 1) / 2;
    return (
        <div className="mesa-exp-vira-legenda-leque">
            {NAIPES.map((naipe, i) => {
                const offset = i - meio;
                return (
                    <div
                        key={naipe}
                        className="mesa-exp-vira-legenda-carta"
                        style={{
                            '--rotacao-carta': `${offset * VIRA_LEGENDA_ANGULO_ENTRE_CARTAS}deg`,
                            '--deslocamento-carta': `${offset * VIRA_LEGENDA_DESLOCAMENTO_ENTRE_CARTAS}px`,
                        }}
                    >
                        <Carta rank={rank} naipe={naipe} efeitoManilha />
                    </div>
                );
            })}
        </div>
    );
}

// `estado`: o mesmo estado bruto que novo/Partida.jsx já monta a partir dos
// handlers de socket (ver conexao/PROTOCOLO.md) — { salaId, meuNome,
// iniciada, jogadores, ordem, segundosParaIniciar, senha, chatAberto, mao,
// cartasRodada, numeroRodada, maosReveladas, mesa, vira, jogadorDaVez,
// jogadorDaVezAposta, apostas, eliminados, desconectados, ultimoPlacar,
// vencedor, vazaResultado, mensagensChat, erro }. `acoes` (opcional, ainda
// não usado na Fatia 1): funções que chamam o servidor de verdade.
export default function MesaExperimento({ estado, acoes, onFechar }) {
    // Assentos na ordem de JOGO (`estado.ordem`, de novaRodadaIniciada — a
    // vez sempre anda pra frente nela), não na de entrada na sala de
    // `estado.jogadores`, que só serve de fallback antes da primeira rodada.
    // "Você" sempre no assento 0 (embaixo): gira a lista pra começar em
    // você, preservando a ordem relativa dos outros — como calcularAssentos
    // anda em sentido horário a partir de baixo, o próximo a jogar depois
    // de você fica à sua esquerda, e assim por diante.
    const ordemAssentos = useMemo(() => {
        const roster = estado.jogadores ?? [];
        const jogadores = estado.ordem?.length
            ? estado.ordem.map((nome) => roster.find((j) => j.nome === nome) ?? { nome })
            : roster;
        const meuIndice = jogadores.findIndex((j) => j.nome === estado.meuNome);
        if (meuIndice <= 0) return jogadores;
        return [...jogadores.slice(meuIndice), ...jogadores.slice(0, meuIndice)];
    }, [estado.jogadores, estado.ordem, estado.meuNome]);

    const assentos = useMemo(() => calcularAssentos(Math.max(ordemAssentos.length, 1)), [ordemAssentos.length]);
    const huesPorAssento = useMemo(
        () => Array.from({ length: ordemAssentos.length }, () => Math.random() * 360),
        [ordemAssentos.length]
    );
    // Cada entrada é { id, src, ajuste } (ver sortearChapeu/CHAPEUS_COM_ID em
    // chapeus.js) — `ajuste` é o nudge vertical calibrado pra ESSE chapéu
    // específico (a maioria não nasceu desenhada pro mesmo lugar, ver
    // assets/chapeus/calibracao-chapeus.csv), repassado pro Fantasminha via
    // ajusteChapeuPct nos dois usos abaixo.
    const chapeusPorAssento = useMemo(
        () => Array.from({ length: ordemAssentos.length }, () => sortearChapeu()),
        [ordemAssentos.length]
    );

    function indiceDoNome(nome) {
        if (nome == null) return -1;
        return ordemAssentos.findIndex((j) => j.nome === nome);
    }

    // Baralho/distribuir (ver iniciarRodadaNova) — mesmos estados de
    // sempre, só que agora disparados por `estado.mao`/`numeroRodada`
    // mudando, não por um botão.
    const [alvoIndex, setAlvoIndex] = useState(null);
    const [distribuindo, setDistribuindo] = useState(false);
    // Espelha `distribuindo`, mas gravado NA HORA (ref, não state) sempre
    // que `setDistribuindo` for chamado — ver os dois sites em
    // iniciarRodadaNova. Existe porque a vira/vaza chegam do servidor às
    // vezes no MESMO commit que `numeroRodada`/`mao` (que dispara
    // iniciarRodadaNova): um efeito lendo o STATE `distribuindo` ainda veria
    // o valor de ANTES desse commit (state só atualiza no PRÓXIMO render),
    // mesmo que `iniciarRodadaNova` já tenha rodado sua parte síncrona
    // (setDistribuindo(true) incluso) alguns instantes antes NO MESMO
    // commit — o ref não tem esse atraso.
    const distribuindoRef = useRef(false);
    const [cartasVoando, setCartasVoando] = useState([]);
    // Espelha `cartasVoando`, atualizado NA HORA (ver comentário de
    // distribuindoRef acima, mesmo motivo) — tentarIniciarRevelacaoVaza lê
    // este ref, não o state, pra saber se alguma carta de "jogar" ainda tá
    // no ar mesmo quando ela acabou de entrar/sair nESTE MESMO commit.
    const cartasVoandoRef = useRef([]);
    function atualizarCartasVoando(atualizador) {
        setCartasVoando((atuais) => {
            const novo = atualizador(atuais);
            cartasVoandoRef.current = novo;
            return novo;
        });
    }
    const proximoIdCarta = useRef(0);

    // Quantas cartas cada assento (que não seja "Você") tem na mão agora —
    // inicializado com `estado.cartasRodada` a cada rodada nova, decrementado
    // conforme cada um joga (ver processarJogada).
    const [maos, setMaos] = useState(() => Array(ordemAssentos.length).fill(0));

    const [danoPorAssento, setDanoPorAssento] = useState(() => Array(ordemAssentos.length).fill(0));
    const vidaAnteriorRef = useRef({});

    const [vidaPorAssento, setVidaPorAssento] = useState(() => Array(ordemAssentos.length).fill(VIDA_MAXIMA));
    const [assentosVidaTemporaria, setAssentosVidaTemporaria] = useState([]);
    const [suaVidaEmDestaque, setSuaVidaEmDestaque] = useState(false);

    const [jogoVencedorIndice, setJogoVencedorIndice] = useState(null);
    const [estadoMortePorAssento, setEstadoMortePorAssento] = useState(() => Array(ordemAssentos.length).fill(null));
    const mortesEmAndamentoRef = useRef(new Set());
    // Contador (não bool — mais de uma morte pode se sobrepor num empate) de
    // quantas coreografias de morte estão tocando AGORA — mesmo padrão
    // ref+state de danoRodadaAtivoRef/revelacaoVazaAtivaRef: trava
    // `iniciarRodadaNova`/a vira até TODAS as mortes em andamento
    // terminarem, senão a rodada nova começa a distribuir carta pro assento
    // que ainda tá desintegrando.
    const mortesAtivasRef = useRef(0);
    const [mortesAtivas, setMortesAtivas] = useState(0);

    const [suaMao, setSuaMao] = useState([]);
    const proximoIdSuaCarta = useRef(0);
    const [cartaSaindoId, setCartaSaindoId] = useState(null);
    const [cartasNaMesa, setCartasNaMesa] = useState([]);
    const cartaMesaRefs = useRef({});
    const [cartaEmHoverId, setCartaEmHoverId] = useState(null);

    const [vazaRevelando, setVazaRevelando] = useState(null);
    const [faseRevelacaoVaza, setFaseRevelacaoVaza] = useState(null);
    const [choqueVaza, setChoqueVaza] = useState(0);
    const [cartasVazaGanhas, setCartasVazaGanhas] = useState([]);
    const [cartasExplodindo, setCartasExplodindo] = useState({});
    const vazaProcessadaRef = useRef(null);
    // Guarda de ordem: a vaza que FECHA um round (última da rodada) tem que
    // terminar de revelar o vencedor ANTES da próxima rodada começar a
    // distribuir — sem isso `iniciarRodadaNova` (disparado por
    // numeroRodada/mao da rodada seguinte, que o servidor manda quase junto
    // com o resultado dessa última vaza) reseta `vazaRevelando`/
    // `faseRevelacaoVaza` no meio da coreografia, pulando a animação (era o
    // "carta vitoriosa cortada" que o Henrique via especificamente na vaza
    // que fecha o round). `revelacaoVazaAtivaRef` fica true desde que um
    // `estado.vazaResultado` novo chega até a coreografia de revelação
    // (melada ou com vencedora) terminar de verdade — ver
    // tentarIniciarRevelacaoVaza/iniciarRevelacaoVazaMelada/
    // iniciarRevelacaoVazaComVencedora. Mesmo padrão ref+state de
    // distribuindoRef/viraAnimandoRef: o ref é lido na hora (sem esperar
    // re-render), o state só existe pra reavaliar o efeito de "rodada nova"
    // quando a revelação acabar.
    const revelacaoVazaAtivaRef = useRef(false);
    const [revelacaoVazaAtiva, setRevelacaoVazaAtiva] = useState(false);
    // Jogadas de cartaJogada que chegaram ENQUANTO uma revelação de vaza já
    // estava em andamento — sem servidor isso nunca acontecia (os botões de
    // debug tinham guarda pra não sobrepor); com bot de verdade jogando por
    // timeout, uma vaza nova pode começar antes da revelação da anterior
    // terminar de animar. Fica em espera e é tocada assim que a revelação
    // atual acabar (ver fim de iniciarRevelacaoVaza).
    const filaJogadasRef = useRef([]);

    const [vira, setVira] = useState(null);
    const proximoIdVira = useRef(0);
    const [faseVira, setFaseVira] = useState(null);
    const [baralhoEmVira, setBaralhoEmVira] = useState(false);
    const [viraEmHover, setViraEmHover] = useState(false);
    // Guarda de ordem entre a vira e a revelação de vaza (ver
    // tentarIniciarRevelacaoVaza): a vaza não pode revelar o vencedor
    // enquanto a vira ainda estiver animando, senão tocam por cima uma da
    // outra. Mesmo motivo de `distribuindoRef` acima: `viraAnimandoRef` é
    // lido NA HORA (ref), `viraAnimando` (state) só existe pra disparar de
    // novo o efeito de retry da vaza quando a vira terminar.
    const viraAnimandoRef = useRef(false);
    const [viraAnimando, setViraAnimando] = useState(false);

    const [chatClicado, setChatClicado] = useState(false);
    const [bolhasFala, setBolhasFala] = useState([]);
    const proximoIdBolha = useRef(0);
    const chatHistoricoRef = useRef(null);
    const mensagensVistasRef = useRef(0);

    const [fichasVoando, setFichasVoando] = useState([]);
    const [fichasNoCanto, setFichasNoCanto] = useState([]);
    const [fichasFantasmaVoando, setFichasFantasmaVoando] = useState([]);
    const [fichasFantasmaNoCanto, setFichasFantasmaNoCanto] = useState([]);
    const proximoIdFicha = useRef(0);
    const cantoFichasRef = useRef(null);
    const assentoRefs = useRef([]);
    const apostasProcessadasRef = useRef(new Set());

    // Cartas de dano do fim de rodada (ver dispararCartasDeDano/Coracoes) —
    // `coracaoRefs.current[assentoIndice][heartIndice]` é o <span> de cada
    // coração, registrado por Coracoes via `registrarRefCoracao`;
    // `coracoesImpactados[assentoIndice]` é o índice do coração com o flash
    // de impacto ligado NAQUELE assento agora (ou null/ausente). Mesma
    // trava de ordem que revelacaoVazaAtivaRef/viraAnimandoRef acima
    // (ref+state): danoRodadaAtivoRef trava `iniciarRodadaNova`/a vira até a
    // sequência inteira de cartas voando + impacto terminar de verdade,
    // senão a rodada nova começa a distribuir (ou a vira gira) por cima das
    // cartas ainda voando pros corações.
    const coracaoRefs = useRef({});
    const [cartasDanoVoando, setCartasDanoVoando] = useState([]);
    const [coracoesImpactados, setCoracoesImpactados] = useState({});
    const proximoIdCartaDano = useRef(0);
    const danoRodadaAtivoRef = useRef(false);
    const [danoRodadaAtivo, setDanoRodadaAtivo] = useState(false);

    // Popup de aposta (ver Fatia 2 — suas ações): só o input/validação; o
    // arremesso de fichas em si já é 100% reativo (ver o efeito de
    // estado.apostas mais abaixo, que dispara pra QUALQUER nome novo,
    // inclusive o seu) — o popup só chama `acoes.apostar`, nunca anima
    // nada sozinho.
    const [apostaPopupAberto, setApostaPopupAberto] = useState(false);
    const [apostaValorPopup, setApostaValorPopup] = useState('0');
    const [apostaErro, setApostaErro] = useState(null);
    const [apostaEnviando, setApostaEnviando] = useState(false);

    const [assentoEmHoverIndex, setAssentoEmHoverIndex] = useState(null);

    const rodadaProcessadaRef = useRef(0);
    const placarProcessadoRef = useRef(null);

    // Rola o histórico pro fim sempre que chega mensagem nova.
    useEffect(() => {
        const el = chatHistoricoRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [estado.mensagensChat, chatClicado]);

    // A coreografia em si (ver constantes VIRA_*/calcularEstadoVira lá em
    // cima) — chamada tanto pela vira quanto (indiretamente) por nada mais
    // agora: no jogo de verdade só existe UMA vira por rodada.
    async function tocarVira() {
        viraAnimandoRef.current = true;
        setViraAnimando(true);
        setBaralhoEmVira(true);
        await esperar(DURACAO_DECK_MS + FOLGA_APOS_BARALHO_MS);
        setFaseVira('indo');
        await esperar(DURACAO_VIRA_IDA_MS);
        setFaseVira('voltando');
        await esperar(DURACAO_VIRA_VOLTA_MS);
        setFaseVira('pousada');
        setBaralhoEmVira(false);
        await esperar(DURACAO_DECK_MS);
        viraAnimandoRef.current = false;
        setViraAnimando(false);
    }

    const alvo = alvoIndex != null ? assentos[alvoIndex] : null;
    const anguloBaralho = alvo
        ? (Math.atan2(alvo.y - 50, alvo.x - 50) * 180) / Math.PI + 90
        : 0;
    const baralhoX = 50 + (alvo ? (alvo.x - 50) * ALCANCE_BARALHO : 0);
    const baralhoY = 50 + (alvo ? (alvo.y - 50) * ALCANCE_BARALHO : 0);
    const escalaBaralho = (alvo || baralhoEmVira) ? ESCALA_BARALHO_ENTREGANDO : ESCALA_BARALHO_REPOUSO;
    const estadoVira = vira ? calcularEstadoVira(faseVira) : null;
    const duracaoTransicaoVira = faseVira === 'indo' ? DURACAO_VIRA_IDA_MS : DURACAO_VIRA_VOLTA_MS;
    const cartaEmHover = cartasNaMesa.find((c) => c.id === cartaEmHoverId);

    // Quem está "ganhando" a vaza AO VIVO (contorno verde) e quais cartas
    // estão "meladas" (contorno preto) — só decoração enquanto a vaza ainda
    // não fechou; o resultado FINAL vem de `estado.vazaResultado`, não daqui.
    const analiseMesa = useMemo(() => {
        const viraValor = vira ? vira.valorInt : -1;
        const cartas = cartasNaMesa.map((c) => ({
            id: c.id,
            valorInt: ORDEM_RANKS.indexOf(c.rank),
            naipeInt: NAIPE_INT[c.naipe],
        }));

        const idsMeladas = new Set();
        const validas = cartas.filter((carta) => {
            const repeticoes = cartas.filter((outra) => saoIdenticasMesa(carta, outra, viraValor));
            if (repeticoes.length > 1) {
                idsMeladas.add(carta.id);
                return false;
            }
            return true;
        });

        let idVencedora = null;
        if (validas.length > 0) {
            let melhor = validas[0];
            for (let i = 1; i < validas.length; i++) {
                if (compararForcaMesa(validas[i], melhor, viraValor) > 0) melhor = validas[i];
            }
            idVencedora = melhor.id;
        }

        const porValor = new Map();
        for (const carta of cartas) {
            if (!idsMeladas.has(carta.id)) continue;
            if (!porValor.has(carta.valorInt)) porValor.set(carta.valorInt, []);
            porValor.get(carta.valorInt).push(carta.id);
        }
        const gruposMeladas = [...porValor.values()];

        return { idVencedora, idsMeladas, gruposMeladas };
    }, [cartasNaMesa, vira]);

    function localizarGrupoMelada(id) {
        for (let g = 0; g < analiseMesa.gruposMeladas.length; g++) {
            const indice = analiseMesa.gruposMeladas[g].indexOf(id);
            if (indice !== -1) return { grupo: g, indice };
        }
        return { grupo: 0, indice: 0 };
    }

    function aoChegarCarta(voo) {
        atualizarCartasVoando((atuais) => atuais.filter((c) => c.id !== voo.id));
        if (voo.tipo === 'jogar') {
            setCartasNaMesa((atual) => [
                ...atual,
                {
                    id: voo.id,
                    jogador: voo.jogador,
                    rank: voo.carta.rank,
                    naipe: voo.carta.naipe,
                    x: voo.para.x,
                    y: voo.para.y,
                    rot: voo.anguloFinal,
                    escala: voo.escalaFinal,
                },
            ]);
        } else if (voo.seatIndex === 0) {
            setSuaMao((atual) => [...atual, { id: ++proximoIdSuaCarta.current, rank: voo.carta.rank, naipe: voo.carta.naipe }]);
        } else {
            setMaos((atual) => atual.map((qtd, i) => (i === voo.seatIndex ? qtd + 1 : qtd)));
        }
    }

    // Alguém jogou uma carta (ver `estado.mesa`/processarJogada) — vale
    // tanto pra "Você" (jogada automática por timeout, ver PROTOCOLO.md,
    // já que a Fatia 1 não pluga clique próprio ainda) quanto pra qualquer
    // fantasminha: mesmo CartaVoando "jogar", só a origem muda.
    function animarJogada(jogada) {
        const nome = jogada.jogador;
        const indice = indiceDoNome(nome);
        if (indice === -1) return;
        const assento = assentos[indice];
        const carta = lerCarta(jogada.carta);
        if (!assento || !carta) return;

        // A carta que saiu da SUA mão (pra remover de vez depois da saída,
        // ver `disparar` abaixo) — lida direto do closure de `suaMao`
        // (estado desta mesma renderização), não via updater funcional:
        // aqui só precisamos LER o id, quem MUDA o estado é o filter lá
        // embaixo, depois que a animação de saída terminar.
        const suaCartaJogada = indice === 0
            ? suaMao.find((c) => c.rank === carta.rank && c.naipe === carta.naipe)
            : null;

        if (indice === 0) {
            if (suaCartaJogada) setCartaSaindoId(suaCartaJogada.id);
        } else {
            setMaos((atual) => atual.map((qtd, i) => (i === indice ? Math.max(0, qtd - 1) : qtd)));
        }

        const disparar = () => {
            setCartaSaindoId(null);
            // Só agora ela sai de vez da mão — sem isto a contagem nunca
            // diminuía (a carta ficava presa em suaMao pra sempre, só com
            // a classe CSS de "saindo" ligada, ver bug relatado pelo
            // Henrique).
            if (suaCartaJogada) {
                setSuaMao((atual) => atual.filter((c) => c.id !== suaCartaJogada.id));
            }
            const giroInicial = 360 + Math.random() * 360;
            const rotFinal = Math.random() * 360;
            const id = ++proximoIdCarta.current;
            atualizarCartasVoando((atuais) => [
                ...atuais,
                {
                    id,
                    tipo: 'jogar',
                    jogador: nome,
                    de: assento,
                    para: calcularAlvoJogada(assento),
                    anguloInicial: rotFinal + giroInicial,
                    anguloFinal: rotFinal,
                    escalaInicial: ESCALA_CARTA_JOGADA_INICIAL,
                    escalaFinal: ESCALA_CARTA_JOGADA_FINAL,
                    carta,
                },
            ]);
        };

        if (indice === 0) {
            setTimeout(disparar, DURACAO_SAIDA_MAO_MS);
        } else {
            disparar();
        }
    }

    function processarJogada(jogada) {
        if (vazaRevelando) {
            filaJogadasRef.current.push(jogada);
            return;
        }
        animarJogada(jogada);
    }

    // Mesa (vaza atual) mudou — o ÚLTIMO elemento do array é sempre a carta
    // que acabou de ser jogada e causou esta mudança, tanto quando ela só
    // ENTRA numa vaza em andamento quanto quando ela abre uma vaza NOVA (ver
    // cartaJogada em novo/Partida.jsx: `abrindoVazaNova` troca o array
    // inteiro por um array de 1 elemento só — esse elemento continua sendo
    // "a jogada que aconteceu agora"). Array vazio = novaRodadaIniciada
    // limpou a mesa; quem cuida disso é o efeito de rodada, não este.
    const ultimaMesaRef = useRef(estado.mesa);
    useEffect(() => {
        if (estado.mesa === ultimaMesaRef.current) return;
        ultimaMesaRef.current = estado.mesa;
        const ultima = estado.mesa[estado.mesa.length - 1];
        if (!ultima) return;
        processarJogada(ultima);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- processarJogada fecha sobre estado local (vazaRevelando/assentos/...) que muda a cada render; ler direto no corpo já pega o valor atual
    }, [estado.mesa]);

    // Fim de vaza — mesma coreografia de 4 fases de sempre (crescendo /
    // impacto / viajando / pousada), só que agora o vencedor e a carta vêm
    // do SERVIDOR (estado.vazaResultado), não de analiseMesa local. Vaza
    // melada (vencedor null) cai num caminho mais simples: mensagem +
    // explode tudo, sem carta viajando pra pilha de ninguém.
    // DECLARADO ANTES do efeito de "Rodada nova" logo abaixo de propósito:
    // quando essa vaza é a que FECHA o round, o servidor manda o resultado
    // dela e a mão/numeroRodada da rodada seguinte quase juntos — os dois
    // efeitos rodam no MESMO commit, na ordem em que aparecem no arquivo.
    // Precisa que `tentarIniciarRevelacaoVaza` já tenha marcado
    // `revelacaoVazaAtivaRef` como true ANTES do efeito de "Rodada nova"
    // ler esse ref, senão a rodada nova começava a distribuir na hora — pra
    // logo em seguida `iniciarRodadaNova` (que reseta vazaRevelando/
    // faseRevelacaoVaza) apagar a revelação que nem tinha começado a
    // animar. Era o "pula a animação de carta vitoriosa na vaza que fecha o
    // round" que o Henrique reportou — mesma família do bug da vira.
    useEffect(() => {
        if (!estado.vazaResultado || estado.vazaResultado === vazaProcessadaRef.current) return;
        vazaProcessadaRef.current = estado.vazaResultado;
        tentarIniciarRevelacaoVaza(estado.vazaResultado);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tentarIniciarRevelacaoVaza fecha sobre cartasNaMesa/assentos atuais
    }, [estado.vazaResultado]);

    // Fim de rodada (ver estado.ultimoPlacar) — revela o coração de todos
    // com o HP REAL vindo do servidor (não recalculado aqui) e dispara a
    // reação de dano (danoPorAssento) em quem perdeu vida desde o placar
    // anterior. Quem tem `diferenca > 0` (aposta != vazas feitas, ver
    // game/Rodada.js) NÃO tem a vida travada em `linha.hp` direto aqui — ver
    // dispararCartasDeDano, que decrementa coração por coração conforme as
    // cartas de dano pousam. Só quem bateu a aposta em cheio (`diferenca ===
    // 0`, sem carta nenhuma pra voar) atualiza a vida na hora, como sempre.
    //
    // Espera `revelacaoVazaAtivaRef` (mesma trava do efeito de vaza acima)
    // ficar false ANTES de disparar qualquer coisa — sem isso, a vaza que
    // fecha a rodada e `estado.ultimoPlacar` chegam quase juntos (o servidor
    // não segura nada entre `vazaFinalizada` da última vaza e
    // `rodadaFinalizada`, ver pausaVazaMs em GameController), e as cartas de
    // dano saíam voando ANTES da carta vencedora dessa última vaza terminar
    // de pousar do lado do fantasminha — era o "dano antes da última carta
    // vitoriosa" que o Henrique reportou, mesma família dos bugs da vira/
    // rodada nova. Em vez de marcar `placarProcessadoRef` na hora, sai sem
    // marcar nada enquanto a revelação ainda tá ativa — o efeito roda de
    // novo (mesmo `estado.ultimoPlacar`, ainda não marcado como processado)
    // quando `revelacaoVazaAtiva` (state, ver deps) virar false de verdade.
    //
    // DECLARADO ANTES do efeito de "Rodada nova" (e da vira) logo abaixo de
    // propósito, MESMA razão do efeito de vaza acima: quando a revelação da
    // última vaza termina, os efeitos de vaza/fim de rodada/rodada nova/vira
    // TODOS reavaliam no MESMO commit (todos têm `revelacaoVazaAtiva` nas
    // deps) — precisa que este efeito já tenha rodado sua parte síncrona
    // (`dispararCartasDeDano`, que liga `danoRodadaAtivoRef`) ANTES do
    // efeito de "Rodada nova" ler esse ref. Se este efeito ficasse DEPOIS no
    // arquivo, "Rodada nova" via `danoRodadaAtivoRef` ainda false (as cartas
    // de dano nem tinham sido despachadas ainda) e começava a distribuir por
    // cima delas mesmo assim.
    useEffect(() => {
        if (!estado.ultimoPlacar || estado.ultimoPlacar.length === 0) return;
        if (estado.ultimoPlacar === placarProcessadoRef.current) return;
        if (revelacaoVazaAtivaRef.current) return;
        placarProcessadoRef.current = estado.ultimoPlacar;

        let duracaoRevelacao = RODADA_FIM_REVELACAO_MS;
        let temCartasDeDano = false;
        const atualizacoesImediatas = [];

        for (const linha of estado.ultimoPlacar) {
            const indice = indiceDoNome(linha.nome);
            if (indice === -1) continue;
            const antes = vidaAnteriorRef.current[linha.nome] ?? VIDA_MAXIMA;
            if (linha.hp < antes && indice !== 0) {
                setDanoPorAssento((v) => v.map((d, i) => (i === indice ? d + 1 : d)));
            }
            vidaAnteriorRef.current[linha.nome] = linha.hp;

            if (linha.diferenca > 0) {
                temCartasDeDano = true;
                dispararCartasDeDano(indice, linha, antes);
                duracaoRevelacao = Math.max(
                    duracaoRevelacao,
                    linha.diferenca * DANO_CARTA_ATRASO_ENTRE_MS + DANO_CARTA_VOO_DURACAO_MS + CORACAO_IMPACTO_DURACAO_MS + 400
                );
            } else {
                atualizacoesImediatas.push([indice, linha.hp]);
            }
        }

        if (atualizacoesImediatas.length > 0) {
            setVidaPorAssento((atual) => {
                const novo = [...atual];
                for (const [indice, hp] of atualizacoesImediatas) novo[indice] = hp;
                return novo;
            });
        }

        if (temCartasDeDano) {
            danoRodadaAtivoRef.current = true;
            setDanoRodadaAtivo(true);
            setTimeout(() => {
                danoRodadaAtivoRef.current = false;
                setDanoRodadaAtivo(false);
            }, duracaoRevelacao);
        }

        assentos.forEach((assento, i) => {
            if (!assento.eVoce) mostrarVidaTemporaria(i, duracaoRevelacao);
        });
        setSuaVidaEmDestaque(true);
        setTimeout(() => setSuaVidaEmDestaque(false), duracaoRevelacao);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `revelacaoVazaAtiva` só nas deps pra reavaliar quando a trava soltar (a leitura de verdade é revelacaoVazaAtivaRef); indiceDoNome/assentos/dispararCartasDeDano são lidos frescos a cada chamada
    }, [estado.ultimoPlacar, revelacaoVazaAtiva]);

    // Eliminados (ver estado.eliminados — só cresce, nunca esquece quem já
    // morreu): qualquer nome NOVO nesta lista dispara a coreografia de
    // morte pro assento dele. Pode disparar VÁRIAS de uma vez (um empate no
    // fim da partida elimina mais de um jogador no mesmo instante).
    //
    // Espera `revelacaoVazaAtivaRef`/`danoRodadaAtivoRef` (mesmas travas do
    // efeito de "Rodada nova"/vira/fim de rodada acima) — `jogadoresEliminados`
    // chega de `_avancarParaProximaRodada`, JÁ depois de `pausaRodadaMs`,
    // mas sem esperar a revelação da última vaza (que pode ainda estar
    // tocando: eliminação só é possível com `diferenca > 0`, ou seja,
    // sempre que alguém morre TEM carta de dano voando pra ele). Sem essa
    // trava, o fantasminha caía duro no meio da própria carta vitoriosa ou
    // das próprias cartas de dano — era o "morte tocando durante a carta
    // ganha/o dano" que o Henrique reportou, mesma família dos outros bugs
    // de ordem. Marca `mortesEmAndamentoRef`/`mortesAtivasRef` NA HORA mesmo
    // assim (fora do gate) — é só pra não reagendar a mesma morte de novo a
    // cada re-render enquanto ainda tá esperando, não precisa reavaliar
    // sozinho depois: esperar `revelacaoVazaAtiva`/`danoRodadaAtivo` nas
    // deps já cobre isso.
    //
    // DECLARADO ANTES do efeito de "Rodada nova" (e da vira) logo abaixo,
    // MESMA razão do efeito de fim de rodada acima: quando as travas de vaza/
    // dano soltam, este efeito e "Rodada nova" reavaliam no MESMO commit —
    // precisa que `mortesAtivasRef` já esteja incrementado (se alguém
    // morreu) ANTES do efeito de "Rodada nova" ler esse ref. Se este efeito
    // ficasse DEPOIS no arquivo, "Rodada nova" via `mortesAtivasRef` ainda
    // 0 (a morte nem tinha sido despachada ainda) e começava a distribuir
    // por cima da desintegração.
    useEffect(() => {
        if (revelacaoVazaAtivaRef.current || danoRodadaAtivoRef.current) return;
        for (const nome of estado.eliminados ?? []) {
            if (mortesEmAndamentoRef.current.has(nome)) continue;
            const indice = indiceDoNome(nome);
            if (indice <= 0) continue; // "Você" nunca é <Fantasminha> aqui, não tem o que desintegrar
            mortesEmAndamentoRef.current.add(nome);
            mortesAtivasRef.current += 1;
            setMortesAtivas((v) => v + 1);
            animarMorte(indice);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `revelacaoVazaAtiva`/`danoRodadaAtivo` só nas deps pra reavaliar quando as travas soltarem (a leitura de verdade é sempre pelos refs); animarMorte fecha sobre estado local, indiceDoNome lido fresco
    }, [estado.eliminados, revelacaoVazaAtiva, danoRodadaAtivo]);

    async function animarMorte(indice) {
        // Ver PAUSA_MORTE_APOS_DANO_MS lá em cima — o último respiro depois
        // que o coração já apagou, antes do fantasminha cair de vez.
        await esperar(PAUSA_MORTE_APOS_DANO_MS);
        setEstadoMortePorAssento((atual) => atual.map((v, i) => (i === indice ? 'impacto' : v)));
        setDanoPorAssento((atual) => atual.map((v, i) => (i === indice ? v + 1 : v)));

        await esperar(MORTE_IMPACTO_MS);
        setEstadoMortePorAssento((atual) => atual.map((v, i) => (i === indice ? 'desintegrando' : v)));

        await esperar(MORTE_DESINTEGRAR_MS);
        setEstadoMortePorAssento((atual) => atual.map((v, i) => (i === indice ? 'morto' : v)));

        // Solta a trava (ver mortesAtivasRef lá em cima) — só agora que a
        // coreografia inteira (impacto + desintegrar) terminou de verdade.
        mortesAtivasRef.current -= 1;
        setMortesAtivas((v) => v - 1);
    }

    // Rodada nova: `estado.mao` (sua mão de verdade) é o sinal de que já dá
    // pra montar a coreografia de distribuir — novaRodadaIniciada chega
    // ANTES de suaMao (ver PROTOCOLO.md), então só reage quando as DUAS
    // coisas já bateram (numeroRodada mudou E a mão já tem conteúdo —
    // `mao.length === 0` sozinho não serve de sinal porque também é o
    // estado normal de "já joguei todas as cartas desta rodada"). Também
    // espera `revelacaoVazaAtivaRef` (ver efeito de vaza acima) ficar
    // false — a última vaza do round precisa terminar de revelar o
    // vencedor antes da próxima rodada começar a distribuir. Espera também
    // `danoRodadaAtivoRef` (ver dispararCartasDeDano/efeito de fim de
    // rodada acima) pelo MESMO motivo: as cartas de dano do placar ainda
    // podem estar voando pros corações quando o servidor já manda a mão/
    // numeroRodada seguinte — sem essa trava a rodada nova começava a
    // distribuir (e limpar a mesa) por cima delas. `mortesAtivasRef` (ver
    // efeito de eliminados acima) pelo mesmo motivo: um fantasminha
    // eliminado nesta rodada pode ainda estar no meio da própria
    // desintegração.
    // DECLARADO ANTES do efeito da vira logo abaixo de propósito: quando o
    // servidor manda mao/numeroRodada E vira no mesmo evento (o caso comum,
    // ver comentário da vira), os dois efeitos rodam no MESMO commit, na
    // ORDEM em que aparecem no arquivo. Precisa que `iniciarRodadaNova`
    // (que zera `viraProcessadaRef` e marca `distribuindoRef` como true)
    // já tenha rodado sua parte síncrona ANTES do efeito da vira ler
    // `distribuindoRef`. Sem essa ordem, a vira de uma rodada nova achava a
    // distribuição "livre" (ref ainda com o valor da rodada anterior) e
    // disparava na hora, pra logo em seguida o reset de `iniciarRodadaNova`
    // (que roda no mesmo commit) apagar ela do nada — sem nunca mais
    // reprocessar, porque `viraProcessadaRef` já tinha marcado aquele
    // `estado.vira` como visto. Era exatamente o bug "a vira só funciona da
    // primeira vez" que o Henrique reportou.
    useEffect(() => {
        if (estado.numeroRodada === rodadaProcessadaRef.current) return;
        // Eliminado não recebe suaMao (o servidor só dá carta pra quem está
        // vivo) — esperar a mão aqui travaria a rodada pra sempre pra quem
        // ficou assistindo. Nesse caso numeroRodada sozinho já é o sinal.
        const euEliminado = (estado.eliminados ?? []).includes(estado.meuNome);
        if (!euEliminado && estado.cartasRodada > 0 && estado.mao.length === 0) return;
        if (revelacaoVazaAtivaRef.current || danoRodadaAtivoRef.current || mortesAtivasRef.current > 0) return;
        rodadaProcessadaRef.current = estado.numeroRodada;
        iniciarRodadaNova();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- iniciarRodadaNova fecha sobre ordemAssentos/assentos atuais, recriada a cada render — não precisa entrar nas deps porque só disparamos pela mudança de numeroRodada/mao
    }, [estado.numeroRodada, estado.mao, estado.cartasRodada, estado.eliminados, revelacaoVazaAtiva, danoRodadaAtivo, mortesAtivas]);

    // Vira: dispara assim que `estado.vira` chegar E a distribuição já
    // tiver terminado — se `distribuindoRef` ainda estiver true, este MESMO
    // efeito roda de novo quando `distribuindo` (state, ver dependências)
    // virar false, com `viraProcessadaRef` ainda não marcado (só marca
    // depois de decidir disparar). `distribuindoRef` em vez do state
    // `distribuindo` direto é o que evita a corrida de mesmo commit descrita
    // no efeito de "Rodada nova" acima.
    //
    // Também espera `revelacaoVazaAtivaRef` E `danoRodadaAtivoRef` (mesmas
    // travas do efeito de "Rodada nova") — SEM ISSO, na vaza que fecha o
    // round, `estado.vira` da rodada seguinte chega enquanto a revelação da
    // carta vencedora (ou as cartas de dano do placar, ver
    // dispararCartasDeDano) ainda está tocando (o servidor não segura isso,
    // ver pausaVazaMs em GameController — só se aplica ENTRE vazas da mesma
    // rodada, não depois da última). Nesse instante `iniciarRodadaNova`
    // ainda nem rodou (está bloqueado pelas mesmas travas, ver efeito de
    // "Rodada nova"), então `distribuindoRef` ainda está false — não porque
    // a distribuição terminou, mas porque ela nem começou. Sem checar essas
    // duas travas aqui também, esse efeito lia esse falso "terminou" e
    // disparava a vira na hora, pulando a revelação da carta vencedora, o
    // dano do placar E a distribuição — era o "vira não respeita a ordem"
    // que o Henrique reportou. `revelacaoVazaAtiva`/`danoRodadaAtivo`
    // (state) entram nas deps pelo mesmo motivo de `distribuindo`: reavaliar
    // quando cada travar acabar e `iniciarRodadaNova` (chamado pelo efeito
    // de "Rodada nova", declarado ANTES deste no arquivo — mesma ordem
    // dentro do commit) já tiver marcado `distribuindoRef` true, pra este
    // efeito continuar esperando a distribuição de verdade em vez de
    // disparar direto.
    function dispararVira(viraDoServidor) {
        const carta = lerCarta(viraDoServidor.carta);
        if (!carta) return;
        setViraEmHover(false);
        setVira({ id: ++proximoIdVira.current, rank: carta.rank, naipe: carta.naipe, valorInt: viraDoServidor.valor });
        setFaseVira('subindo');
        tocarVira();
    }

    const viraProcessadaRef = useRef(null);
    useEffect(() => {
        if (!estado.vira || viraProcessadaRef.current === estado.vira || distribuindoRef.current || revelacaoVazaAtivaRef.current || danoRodadaAtivoRef.current || mortesAtivasRef.current > 0) return;
        viraProcessadaRef.current = estado.vira;
        dispararVira(estado.vira);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `distribuindo`/`revelacaoVazaAtiva`/`danoRodadaAtivo`/`mortesAtivas` só nas deps pra reavaliar quando mudarem (a leitura de verdade é sempre pelos refs); dispararVira é recriada a cada render mas estável o bastante pra não precisar entrar
    }, [estado.vira, distribuindo, revelacaoVazaAtiva, danoRodadaAtivo, mortesAtivas]);

    async function iniciarRodadaNova() {
        setDistribuindo(true);
        distribuindoRef.current = true;
        setCartasNaMesa([]);
        setCartaEmHoverId(null);
        setCartaSaindoId(null);
        setVira(null);
        setFaseVira(null);
        setBaralhoEmVira(false);
        setViraEmHover(false);
        // Solta a trava de "já processei esta vira" — sem isto a vira da
        // rodada NOVA nunca dispararia (o ref continuaria apontando pro
        // objeto `estado.vira` da rodada anterior, que só é substituído
        // pelo próximo manilhaVirada de verdade, ainda por vir).
        viraProcessadaRef.current = null;
        viraAnimandoRef.current = false;
        setViraAnimando(false);
        // Já devia estar false a essa altura (é precondição do efeito de
        // "Rodada nova" pra sequer chamar iniciarRodadaNova) — reset aqui
        // é só defensivo, mesmo padrão dos outros refs de coreografia.
        revelacaoVazaAtivaRef.current = false;
        setRevelacaoVazaAtiva(false);
        setVazaRevelando(null);
        setFaseRevelacaoVaza(null);
        setCartasExplodindo({});
        setCartasVazaGanhas([]);
        // Mesmo padrão defensivo — já devia estar false/vazio a essa altura
        // (precondição do efeito de "Rodada nova", ver danoRodadaAtivoRef).
        danoRodadaAtivoRef.current = false;
        setDanoRodadaAtivo(false);
        setCartasDanoVoando([]);
        setCoracoesImpactados({});
        // MESMO padrão defensivo pra `mortesAtivasRef` — só a CONTAGEM de
        // mortes em andamento, nunca `estadoMortePorAssento`/
        // `mortesEmAndamentoRef` (esses são permanentes, ver comentário do
        // efeito de eliminados: um fantasminha morto continua morto pro
        // resto da partida, não ressuscita na rodada nova).
        mortesAtivasRef.current = 0;
        setMortesAtivas(0);
        setFichasNoCanto([]);
        setFichasFantasmaNoCanto([]);
        setFichasVoando([]);
        setFichasFantasmaVoando([]);
        apostasProcessadasRef.current = new Set();
        filaJogadasRef.current = [];
        vazaAguardandoRef.current = null;
        setSuaMao([]);
        setMaos(Array(ordemAssentos.length).fill(0));

        const cartas = estado.cartasRodada;
        const suasCartas = estado.mao.map(lerCarta).filter(Boolean);
        // Assento de quem já foi eliminado continua na mesa (o fantasminha
        // morto fica lá), mas não recebe carta — o baralho pula direto pro
        // próximo vivo.
        const eliminados = new Set(estado.eliminados ?? []);
        const comIndice = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((a) => !eliminados.has(ordemAssentos[a.indice]?.nome));
        const ordem = [...comIndice.filter((a) => !a.eVoce).reverse(), ...comIndice.filter((a) => a.eVoce)];

        for (const assento of ordem) {
            setAlvoIndex(assento.indice);
            await esperar(DURACAO_DECK_MS + FOLGA_APOS_BARALHO_MS);

            const dePos = {
                x: 50 + (assento.x - 50) * ALCANCE_BARALHO,
                y: 50 + (assento.y - 50) * ALCANCE_BARALHO,
            };
            const anguloNestaParada = (Math.atan2(assento.y - 50, assento.x - 50) * 180) / Math.PI + 90;
            for (let c = 0; c < cartas; c++) {
                const id = ++proximoIdCarta.current;
                const cartaDeVerdade = assento.indice === 0 ? suasCartas[c] : undefined;
                atualizarCartasVoando((atuais) => [
                    ...atuais,
                    {
                        id,
                        tipo: 'dar',
                        de: dePos,
                        para: { x: assento.x, y: assento.y },
                        anguloInicial: anguloNestaParada,
                        anguloFinal: anguloNestaParada,
                        seatIndex: assento.indice,
                        escalaInicial: assento.eVoce ? ESCALA_CARTA_VOANDO_INICIAL_VOCE : ESCALA_CARTA_VOANDO_INICIAL,
                        escalaFinal: assento.eVoce ? ESCALA_CARTA_VOANDO_FINAL_VOCE : ESCALA_CARTA_VOANDO_FINAL,
                        carta: cartaDeVerdade,
                        // Rodada de 1 carta: a SUA própria carta não pode
                        // aparecer nem durante o voo (ver escondida em
                        // CartaVoando) — os fantasminhas já voam sempre
                        // viradas (cartaDeVerdade nem existe pra eles).
                        escondida: assento.indice === 0 && estado.cartasRodada === 1,
                    },
                ]);
                await esperar(ATRASO_ENTRE_CARTAS_MS);
            }
            await esperar(DURACAO_CARTA_MS + PAUSA_POS_ENTREGA_MS);
        }

        setAlvoIndex(null);
        await esperar(DURACAO_DECK_MS);
        distribuindoRef.current = false;
        setDistribuindo(false);
    }

    function explodirCartasDaMesa() {
        setCartasExplodindo(() => {
            const explosoes = {};
            for (const carta of cartasNaMesa) {
                const dx = carta.x - 50;
                const dy = carta.y - 50;
                const distancia = Math.hypot(dx, dy) || 1;
                const angulo = Math.atan2(dy, dx);
                const novaDistancia = Math.max(distancia * VAZA_EXPLOSAO_FATOR, VAZA_EXPLOSAO_DISTANCIA_MIN);
                const voltas = VAZA_EXPLOSAO_VOLTAS_MIN + Math.random() * (VAZA_EXPLOSAO_VOLTAS_MAX - VAZA_EXPLOSAO_VOLTAS_MIN);
                const sentido = Math.random() < 0.5 ? 1 : -1;
                const flipVoltas = VAZA_EXPLOSAO_FLIP_VOLTAS_MIN + Math.random() * (VAZA_EXPLOSAO_FLIP_VOLTAS_MAX - VAZA_EXPLOSAO_FLIP_VOLTAS_MIN);
                const flipSentido = Math.random() < 0.5 ? 1 : -1;
                explosoes[carta.id] = {
                    x: 50 + Math.cos(angulo) * novaDistancia,
                    y: 50 + Math.sin(angulo) * novaDistancia,
                    rot: carta.rot + voltas * 360 * sentido,
                    flip: flipVoltas * 360 * flipSentido,
                    escala: carta.escala * VAZA_EXPLOSAO_ESCALA_MULT,
                };
            }
            return explosoes;
        });
    }

    async function drenarFilaJogadas() {
        const pendentes = filaJogadasRef.current;
        filaJogadasRef.current = [];
        for (const jogada of pendentes) animarJogada(jogada);
    }

    // Tenta achar a carta vencedora em `cartasNaMesa` e, se conseguir, já
    // dispara a coreografia inteira. Existe pra cobrir corridas reais:
    //   - QUALQUER carta desta vaza (não só a vencedora) pode ainda estar
    //     voando da mão até a mesa quando `vazaFinalizada` chega — não só
    //     quando é a SUA última carta que vence (caso já coberto pelo
    //     lookup de `vencedora` abaixo), mas também quando você é o
    //     ÚLTIMO a jogar e NÃO vence: a carta vencedora (de outro
    //     assento) já estava plantada na mesa há um tempo, então o lookup
    //     abaixo acha ela na hora — só que a SUA última carta (perdedora)
    //     ainda está no meio do próprio voo (~550ms, ver
    //     DURACAO_SAIDA_MAO_MS + DURACAO_JOGADA_MS em animarJogada). Sem
    //     esperar isso aqui, a revelação (que mexe em z-index/limpa a mesa)
    //     começava a tocar por cima da sua carta ainda no ar — cortava a
    //     animação de jogar dela e ia direto pra revelação/dano, o "pulou a
    //     animação de jogar a carta" que o Henrique reportou.
    //   - `distribuindo` (a distribuição da mão ainda rolando — ver
    //     iniciarRodadaNova) pode muito bem ainda estar de pé quando a
    //     PRIMEIRA vaza da rodada se resolve: o servidor não espera a
    //     animação de distribuir/apostar do cliente terminar pra seguir
    //     jogando (bots respondem em ~2s cada, ver atrasoBotMs), então com
    //     uma mão grande (mais assentos/mais cartas) o cliente pode ainda
    //     estar entregando carta quando a primeira vaza já fechou de
    //     verdade. Tocar a revelação (que mexe na mesa/baralho/z-index)
    //     por cima do baralho ainda se deslocando é a composição
    //     "quebrada" que o Henrique via.
    // Sem essa espera, a busca falhava (`vencedora` undefined) e a função
    // voltava sem limpar NADA: a mesa ficava com lixo da vaza anterior, a
    // vaza seguinte se empilhava em cima, e o estado geral da mesa ficava
    // visualmente quebrado dali pra frente. `vazaAguardandoRef` guarda o
    // resultado enquanto isso — o efeito de baixo tenta de novo a cada
    // carta que pousa OU quando a distribuição termina, o que vier primeiro.
    const vazaAguardandoRef = useRef(null);

    function tentarIniciarRevelacaoVaza(resultado) {
        const { vencedor, carta: cartaTexto } = resultado;
        // Marca ATIVO assim que um resultado chega (mesmo que ainda não dê
        // pra animar — ver guardas abaixo) e só desliga quando a revelação
        // termina de verdade (fim de iniciarRevelacaoVazaMelada/
        // ComVencedora) — é o que impede a PRÓXIMA rodada de começar a
        // distribuir por cima (ver efeito de "Rodada nova").
        revelacaoVazaAtivaRef.current = true;
        setRevelacaoVazaAtiva(true);
        // Mesma trava de `distribuindoRef`, agora somada à vira (ver
        // viraAnimandoRef lá em cima): a vaza só revela o vencedor depois
        // das DUAS coreografias anteriores acabarem, senão tocam por cima
        // uma da outra. Lê os REFS (não os states `distribuindo`/
        // `viraAnimando`) pelo mesmo motivo do efeito da vira — esta função
        // também pode ser chamada no mesmo commit em que outro efeito
        // acabou de settar um desses states, e o state só reflete no
        // PRÓXIMO render. O efeito de baixo tenta de novo quando
        // `distribuindo`/`viraAnimando` (states) mudarem.
        if (distribuindoRef.current || viraAnimandoRef.current) {
            vazaAguardandoRef.current = resultado;
            return;
        }
        // Nenhuma carta de "jogar" pode ainda estar no ar (ver comentário
        // grande acima) — lê `cartasVoandoRef` (não o state `cartasVoando`
        // direto) pelo mesmo motivo dos outros refs desta função: pode
        // rodar no mesmo commit em que `aoChegarCarta` acabou de tirar a
        // ÚLTIMA carta voando, com o state só refletindo no PRÓXIMO render.
        if (cartasVoandoRef.current.some((c) => c.tipo === 'jogar')) {
            vazaAguardandoRef.current = resultado;
            return;
        }
        if (!vencedor) {
            vazaAguardandoRef.current = null;
            iniciarRevelacaoVazaMelada();
            return;
        }

        const cartaVencedora = lerCarta(cartaTexto);
        const vencedora = cartasNaMesa.find((c) => c.jogador === vencedor && c.rank === cartaVencedora?.rank && c.naipe === cartaVencedora?.naipe);
        if (!vencedora || !cartaVencedora) {
            vazaAguardandoRef.current = resultado;
            return;
        }

        const el = cartaMesaRefs.current[vencedora.id];
        if (!el) {
            // Achou a carta no estado mas o <div> ainda não montou (mesmo
            // motivo — corrida com a animação de pouso) — tenta de novo no
            // próximo pouso também.
            vazaAguardandoRef.current = resultado;
            return;
        }

        vazaAguardandoRef.current = null;
        iniciarRevelacaoVazaComVencedora(vencedor, vencedora, el);
    }

    // Reavalia um resultado pendente sempre que uma carta nova pousa em
    // cartasNaMesa, quando alguma carta de "jogar" termina de voar
    // (cartasVoando — ver comentário grande de tentarIniciarRevelacaoVaza),
    // quando a distribuição termina, OU quando a vira termina de animar
    // (ver comentário de vazaAguardandoRef acima).
    useEffect(() => {
        if (vazaAguardandoRef.current) tentarIniciarRevelacaoVaza(vazaAguardandoRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a cartasNaMesa/cartasVoando/distribuindo/viraAnimando mudarem; tentarIniciarRevelacaoVaza lê o resto fresco
    }, [cartasNaMesa, cartasVoando, distribuindo, viraAnimando]);

    async function iniciarRevelacaoVazaMelada() {
        // Melada: ninguém pontuou — sem carta crescendo/viajando, só o
        // aviso + a mesa inteira explodindo junto.
        setFaseRevelacaoVaza('melada');
        await esperar(VAZA_MELADA_PAUSA_MS);
        setChoqueVaza((v) => v + 1);
        explodirCartasDaMesa();
        await esperar(VAZA_EXPLOSAO_DURACAO_MS);
        setCartasNaMesa([]);
        setCartasExplodindo({});
        setCartaEmHoverId(null);
        setFaseRevelacaoVaza(null);
        revelacaoVazaAtivaRef.current = false;
        setRevelacaoVazaAtiva(false);
        drenarFilaJogadas();
    }

    async function iniciarRevelacaoVazaComVencedora(vencedor, vencedora, el) {
        const rect = el.getBoundingClientRect();

        const assentoIndice = indiceDoNome(vencedor);
        const destino = calcularAncoraFichaAssento(assentoIndice);
        if (!destino) {
            // Não devia acontecer (o assento já está montado a essa altura
            // do jogo), mas se acontecer não pode deixar `revelacaoVazaAtivaRef`
            // preso em true pra sempre — isso travaria a rodada seguinte de
            // vez (ver guarda no efeito de "Rodada nova").
            revelacaoVazaAtivaRef.current = false;
            setRevelacaoVazaAtiva(false);
            return;
        }

        // `slotIndice` decidido JÁ AQUI (mesma conta de sempre, ver push em
        // `cartasVazaGanhas` mais abaixo) pra poder mirar a viagem no local
        // FINAL de verdade (ver calcularPosicaoCartaVazaGanha), não só na
        // ancora genérica do assento — é o que faz a carta já chegar pousada
        // certa, sem "tp" de trocar de lugar na hora que troca do componente
        // viajando pro card estático da pilha.
        const slotIndice = cartasVazaGanhas.filter((c) => c.assentoIndice === assentoIndice).length;
        const apostaVencedor = estado.apostas?.[vencedor] ?? 0;
        const destinoViagem = {
            ...calcularPosicaoCartaVazaGanha(assentoIndice, slotIndice, destino.x, destino.y, apostaVencedor),
            rot: destino.rot,
        };

        const origem = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            rot: vencedora.rot,
            escala: vencedora.escala,
        };

        // `vazaRevelando` liga JÁ AQUI (trava jogadas novas em
        // processarJogada, ver o guard lá) mas `faseRevelacaoVaza` continua
        // null por VAZA_SEGURAR_ULTIMA_CARTA_MS — a mesa fica exatamente
        // como o jogador acabou de ver (as 4 cartas jogadas, nenhuma em
        // destaque) por esse tempo, só DEPOIS é que o resto da coreografia
        // (crescendo/impacto/viajando) começa de verdade. Sem travar aqui
        // (antes da pausa), uma jogada rápida da vaza seguinte podia pousar
        // na mesa no meio da pausa, contaminando o "quadro parado".
        setVazaRevelando({ cartaId: vencedora.id, jogador: vencedor, assentoIndice, rank: vencedora.rank, naipe: vencedora.naipe, origem, destino: destinoViagem });
        await esperar(VAZA_SEGURAR_ULTIMA_CARTA_MS);

        setCartasNaMesa((atual) => atual.filter((c) => c.id !== vencedora.id));
        setFaseRevelacaoVaza('crescendo');

        await esperar(VAZA_REVELACAO_TRANSICAO_MS);
        await esperar(VAZA_REVELACAO_PAUSA_MS);

        setFaseRevelacaoVaza('impacto');
        setChoqueVaza((v) => v + 1);
        explodirCartasDaMesa();

        await esperar(VAZA_IMPACTO_DURACAO_MS + VAZA_IMPACTO_PAUSA_MS);

        setCartasNaMesa([]);
        setCartasExplodindo({});
        setCartaEmHoverId(null);
        setFaseRevelacaoVaza('viajando');

        await esperar(VAZA_VIAGEM_DURACAO_MS);

        setCartasVazaGanhas((atual) => [
            ...atual,
            {
                id: vencedora.id,
                assentoIndice,
                rank: vencedora.rank,
                naipe: vencedora.naipe,
                x: destino.x,
                y: destino.y,
                slotIndice,
                apostaValor: apostaVencedor,
            },
        ]);
        setVazaRevelando(null);
        setFaseRevelacaoVaza(null);
        revelacaoVazaAtivaRef.current = false;
        setRevelacaoVazaAtiva(false);
        drenarFilaJogadas();
    }

    function calcularAncoraFichaAssento(assentoIndice) {
        const assento = assentos[assentoIndice];
        if (!assento) return null;
        if (assento.eVoce) {
            const rect = cantoFichasRef.current?.getBoundingClientRect();
            return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rot: VAZA_POUSO_ROT_GRAUS } : null;
        }
        const el = assentoRefs.current[assentoIndice];
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const lado = assento.x < 50 ? -1 : 1;
        return {
            x: (lado === -1 ? rect.left : rect.right) - lado * FICHA_FANTASMA_OFFSET_LADO_PX,
            y: rect.top + rect.height / 2,
            rot: VAZA_POUSO_ROT_FANTASMA_GRAUS,
        };
    }

    // Onde a carta de uma vaza ganha FICA de verdade, em cima da ficha de
    // mesmo número (`slotIndice`) — mesma fórmula pra você e pro
    // fantasminha, só o EIXO que muda: sua fileira de fichas é horizontal
    // (desloca em x, ver FICHA_LEQUE_ESPACAMENTO_PX), a pilha do
    // fantasminha é vertical (desloca em y, ver FICHA_EMPILHA_FANTASMA_PX).
    // `ancoraX`/`ancoraY` são o ponto SEM deslocamento nenhum (a mesma
    // ancora guardada em `cartasVazaGanhas.x/y`, ver
    // iniciarRevelacaoVazaComVencedora) — usada tanto pro render final
    // quanto (com o MESMO resultado) pro alvo da viagem, então a carta já
    // chega pousada no lugar certo, sem "tp" nenhum na troca do componente
    // viajando pro card estático.
    function calcularPosicaoCartaVazaGanha(assentoIndice, slotIndice, ancoraX, ancoraY, apostaValor) {
        const meio = (apostaValor - 1) / 2;
        const offset = slotIndice - meio;
        if (assentoIndice === 0) {
            return { x: ancoraX + offset * FICHA_LEQUE_ESPACAMENTO_PX, y: ancoraY };
        }
        return { x: ancoraX, y: ancoraY - offset * FICHA_EMPILHA_FANTASMA_PX };
    }

    // Aposta feita (ver estado.apostas): dispara o arremesso de fichas
    // assim que um NOME NOVO aparece no mapa — vale pra "Você" (o servidor
    // aposta por timeout enquanto a Fatia 1 não pluga o popup de verdade)
    // e pra qualquer fantasminha, mesma origem/destino calculados a partir
    // do PRÓPRIO assento (ver calcularAncoraFichaAssento) nos dois casos.
    useEffect(() => {
        const apostas = estado.apostas ?? {};
        for (const [nome, valor] of Object.entries(apostas)) {
            if (apostasProcessadasRef.current.has(nome)) continue;
            apostasProcessadasRef.current.add(nome);
            animarAposta(nome, valor);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- animarAposta fecha sobre assentos/huesPorAssento atuais
    }, [estado.apostas]);

    function animarAposta(nome, valor) {
        const indice = indiceDoNome(nome);
        if (indice === -1 || valor <= 0) return;
        const el = assentoRefs.current[indice];
        const ancora = calcularAncoraFichaAssento(indice);
        if (!el || !ancora) return;
        const rect = el.getBoundingClientRect();
        const de = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const ehVoce = assentos[indice]?.eVoce;
        const hue = ehVoce ? undefined : huesPorAssento[indice];
        const meio = (valor - 1) / 2;

        const novasFichas = Array.from({ length: valor }, (_, i) => ({
            id: ++proximoIdFicha.current,
            de,
            para: ehVoce
                ? { x: ancora.x + (i - meio) * FICHA_LEQUE_ESPACAMENTO_PX, y: ancora.y }
                : { x: ancora.x, y: ancora.y - (i - meio) * FICHA_EMPILHA_FANTASMA_PX },
            atrasoMs: i * FICHA_ATRASO_ENTRE_MS,
            hue,
            assentoIndice: indice,
        }));

        if (ehVoce) {
            setFichasVoando((atuais) => [...atuais, ...novasFichas]);
        } else {
            setFichasFantasmaVoando((atuais) => [...atuais, ...novasFichas]);
        }
    }

    function aoChegarFicha(ficha) {
        setFichasVoando((atuais) => atuais.filter((f) => f.id !== ficha.id));
        setFichasNoCanto((atual) => [...atual, ficha]);
    }

    function aoChegarFichaFantasma(ficha) {
        setFichasFantasmaVoando((atuais) => atuais.filter((f) => f.id !== ficha.id));
        setFichasFantasmaNoCanto((atual) => [...atual, ficha]);
    }

    function abrirPopupAposta() {
        setApostaValorPopup('0');
        setApostaErro(null);
        setApostaPopupAberto(true);
    }

    function ajustarApostaValorPopup(novoValor) {
        setApostaValorPopup(String(Math.max(0, Math.min(estado.cartasRodada, novoValor))));
        setApostaErro(null);
    }

    function digitarApostaValorPopup(texto) {
        setApostaValorPopup(texto);
        setApostaErro(null);
    }

    // Confirmar só CHAMA o servidor e fecha o popup — não anima ficha
    // nenhuma aqui (ver comentário do estado lá em cima): o arremesso
    // acontece quando `apostaFeita` chegar de verdade (estado.apostas), do
    // MESMO jeito pra você e pra qualquer fantasminha.
    async function confirmarApostaPopup() {
        const texto = apostaValorPopup.trim();
        const valor = Number(texto);
        if (texto === '' || !Number.isInteger(valor) || valor < 0 || valor > estado.cartasRodada) {
            setApostaErro(`Aposta precisa ser um número inteiro entre 0 e ${estado.cartasRodada}.`);
            return;
        }
        setApostaEnviando(true);
        const resultado = await acoes.apostar(valor);
        setApostaEnviando(false);
        if (!resultado.ok) {
            setApostaErro(resultado.mensagem);
            return;
        }
        setApostaPopupAberto(false);
    }

    function mostrarVidaTemporaria(indice, duracaoMs = VIDA_TEMPORARIA_MS) {
        setAssentosVidaTemporaria((atual) => (atual.includes(indice) ? atual : [...atual, indice]));
        setTimeout(() => {
            setAssentosVidaTemporaria((atual) => atual.filter((i) => i !== indice));
        }, duracaoMs);
    }

    // Dispara as cartas de dano de UM assento (ver constantes DANO_CARTA_*
    // lá em cima) — sempre `linha.diferenca` cartas, uma por coração que
    // esse assento vai perder nesta rodada. `excesso` (vazas feitas além da
    // aposta) usa as ÚLTIMAS cartas que esse assento tinha empilhado em
    // `cartasVazaGanhas` NESTA rodada (slotIndice crescente = ordem que
    // ganhou — as mais recentes saem primeiro) e as REMOVE da pilha (saem
    // voando de verdade, não ficam duplicadas). O resto (aposta não
    // cumprida — nunca existiu carta de verdade) é a própria FICHA que voa
    // até o coração (ver `carta: null` abaixo e o render de `Ficha` em
    // CartaDanoVoando) — MESMA lógica de remover da pilha de fichas pousadas
    // (`fichasNoCanto`/`fichasFantasmaNoCanto`), senão a ficha "antiga"
    // continuava parada no canto enquanto uma outra (nova, desconectada da
    // pilha) voava pro coração — parecia duplicada em vez de uma ficha da
    // pilha se soltando pra atacar.
    function dispararCartasDeDano(indice, linha, vidaAntes) {
        const diferenca = linha.diferenca;
        if (!diferenca) return;

        const excesso = Math.max(0, linha.steak - linha.aposta);
        const cartasDoAssento = cartasVazaGanhas.filter((c) => c.assentoIndice === indice);
        const cartasExcedentes = excesso > 0 ? cartasDoAssento.slice(Math.max(0, cartasDoAssento.length - excesso)) : [];
        if (cartasExcedentes.length > 0) {
            const idsExcedentes = new Set(cartasExcedentes.map((c) => c.id));
            setCartasVazaGanhas((atual) => atual.filter((c) => !idsExcedentes.has(c.id)));
        }

        const ehVoce = assentos[indice]?.eVoce;
        const hue = ehVoce ? undefined : huesPorAssento[indice];
        const origemFallback = calcularAncoraFichaAssento(indice) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

        const numFichasDano = diferenca - cartasExcedentes.length;
        const fichasDoAssento = (ehVoce ? fichasNoCanto : fichasFantasmaNoCanto).filter((f) => f.assentoIndice === indice);
        const fichasRemovidas = numFichasDano > 0 ? fichasDoAssento.slice(Math.max(0, fichasDoAssento.length - numFichasDano)) : [];
        if (fichasRemovidas.length > 0) {
            const idsFichasRemovidas = new Set(fichasRemovidas.map((f) => f.id));
            if (ehVoce) {
                setFichasNoCanto((atual) => atual.filter((f) => !idsFichasRemovidas.has(f.id)));
            } else {
                setFichasFantasmaNoCanto((atual) => atual.filter((f) => !idsFichasRemovidas.has(f.id)));
            }
        }

        const novasCartas = Array.from({ length: diferenca }, (_, i) => {
            const cartaPilha = cartasExcedentes[i];
            if (cartaPilha) {
                return {
                    id: ++proximoIdCartaDano.current,
                    de: { x: cartaPilha.x, y: cartaPilha.y },
                    carta: { rank: cartaPilha.rank, naipe: cartaPilha.naipe },
                    atrasoMs: i * DANO_CARTA_ATRASO_ENTRE_MS,
                    assentoIndice: indice,
                    heartIndice: vidaAntes - 1 - i,
                };
            }
            const fichaPilha = fichasRemovidas[i - cartasExcedentes.length];
            return {
                id: ++proximoIdCartaDano.current,
                de: fichaPilha?.para ?? origemFallback,
                carta: null,
                hue,
                atrasoMs: i * DANO_CARTA_ATRASO_ENTRE_MS,
                assentoIndice: indice,
                heartIndice: vidaAntes - 1 - i,
            };
        });

        setCartasDanoVoando((atual) => [...atual, ...novasCartas]);
    }

    // Mede o coração-alvo NA HORA (ver comentário de CartaDanoVoando) — cai
    // pro centro do próprio assento se o coração ainda não tiver ref (não
    // devia acontecer, mas evita a carta sumir sem destino nenhum).
    function obterCentroCoracao(assentoIndice, heartIndice) {
        const el = coracaoRefs.current[assentoIndice]?.[heartIndice];
        if (el) {
            const rect = el.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        const assentoEl = assentoRefs.current[assentoIndice];
        if (assentoEl) {
            const rect = assentoEl.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
    }

    function registrarRefCoracao(assentoIndice, heartIndice, el) {
        if (!coracaoRefs.current[assentoIndice]) coracaoRefs.current[assentoIndice] = [];
        coracaoRefs.current[assentoIndice][heartIndice] = el;
    }

    // Carta de dano chegou no coração: some da lista de voo, desliga um
    // coração a mais (Math.min contra o valor atual — proteção só contra
    // uma ordem de chegada fora de ordem por jank do navegador, não devia
    // acontecer no caminho normal) e liga o flash de impacto nele por
    // CORACAO_IMPACTO_DURACAO_MS.
    function aoChegarCartaDano(carta) {
        setCartasDanoVoando((atual) => atual.filter((c) => c.id !== carta.id));
        setVidaPorAssento((atual) => {
            if (atual[carta.assentoIndice] <= carta.heartIndice) return atual;
            const novo = [...atual];
            novo[carta.assentoIndice] = carta.heartIndice;
            return novo;
        });
        setCoracoesImpactados((atual) => ({ ...atual, [carta.assentoIndice]: carta.heartIndice }));
        setTimeout(() => {
            setCoracoesImpactados((atual) => (
                atual[carta.assentoIndice] === carta.heartIndice
                    ? { ...atual, [carta.assentoIndice]: null }
                    : atual
            ));
        }, CORACAO_IMPACTO_DURACAO_MS);
    }

    // Fim de jogo (ver estado.vencedor) — mesma família dos bugs de
    // "animação cortada" já caçados nesta mesa (vira/vaza/rodada nova):
    // .mesa-exp-vitoria é z-index:47, EXATAMENTE igual ao da carta de
    // revelação de vaza (.mesa-exp-carta-revelando) — empate de z-index
    // decide pela ordem no DOM, e a tela de vitória vem DEPOIS no JSX, logo
    // cobre a carta inteira (+ o fundo escurecido, +47 o fantasminha
    // gigante). Quando a última vaza da PARTIDA fecha o placar e elimina
    // todo mundo menos um de uma vez (o caso mais comum de "perder vida" e
    // a animação sumir junto, ver relato do Henrique), `estado.vencedor`
    // chega enquanto a revelação daquela vaza ainda está tocando —
    // `revelacaoVazaAtivaRef` (ver tentarIniciarRevelacaoVaza lá em cima)
    // segura a tela de VENCEU até a revelação acabar de verdade, mesma
    // guarda que já usamos pra não deixar a rodada nova começar em cima.
    useEffect(() => {
        if (!estado.vencedor || jogoVencedorIndice != null || revelacaoVazaAtivaRef.current) return;
        const indice = indiceDoNome(estado.vencedor);
        if (indice !== -1) setJogoVencedorIndice(indice);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- indiceDoNome lido fresco; revelacaoVazaAtiva só pra reavaliar quando a revelação acabar (leitura de verdade é o ref)
    }, [estado.vencedor, revelacaoVazaAtiva]);

    // Balão de fala em cima de um assento — some sozinho depois de
    // DURACAO_BOLHA_MS.
    function mostrarBolhaFala(assentoIndex, texto) {
        const id = ++proximoIdBolha.current;
        setBolhasFala((atuais) => [...atuais, { id, assentoIndex, texto }]);
        setTimeout(() => {
            setBolhasFala((atuais) => atuais.filter((b) => b.id !== id));
        }, DURACAO_BOLHA_MS);
    }

    // Chat (ver estado.mensagensChat — só cresce): qualquer mensagem NOVA
    // (não de sistema) ganha um balão em cima de quem mandou, além de já
    // aparecer no histórico (renderizado direto de estado.mensagensChat,
    // sem espelho local nenhum — ver JSX).
    useEffect(() => {
        const mensagens = estado.mensagensChat ?? [];
        const novas = mensagens.slice(mensagensVistasRef.current);
        mensagensVistasRef.current = mensagens.length;
        for (const mensagem of novas) {
            if (mensagem.tipo === 'sistema') continue;
            const indice = indiceDoNome(mensagem.jogador);
            if (indice !== -1) mostrarBolhaFala(indice, mensagem.texto);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- indiceDoNome lido fresco
    }, [estado.mensagensChat]);

    if (!estado.iniciada) {
        return (
            <div className="mesa-exp-tela mesa-exp-tela-espera">
                <h1 className="mesa-exp-cabecalho-titulo">Sala {estado.salaId}</h1>
                {onFechar && (
                    <button type="button" className="mesa-exp-fechar" onClick={onFechar}>← Voltar</button>
                )}
                <div className="mesa-exp-espera-cartao">
                    {estado.senha && <p>🔒 Senha: <strong>{estado.senha}</strong></p>}
                    <h2>Aguardando ({(estado.jogadores ?? []).length})</h2>
                    <ul>
                        {(estado.jogadores ?? []).map((j) => (
                            <li key={j.nome}>{j.nome}{j.nome === estado.meuNome ? ' (você)' : ''}</li>
                        ))}
                    </ul>
                    {estado.segundosParaIniciar != null && (
                        <>
                            <p>Sala cheia — começa sozinha em {estado.segundosParaIniciar}s.</p>
                            {/* Mesmo evento forcarInicio de sempre (ver botão
                                equivalente em novo/Partida.jsx, e forcarInicio
                                em `acoes` lá) — só essa tela (front
                                provisório) ainda não tinha o botão. */}
                            <button type="button" onClick={acoes.forcarInicio}>Forçar início agora</button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    const nomeDaVez = estado.jogadorDaVezAposta ?? estado.jogadorDaVez;
    const turnoAssentoIndex = nomeDaVez != null ? indiceDoNome(nomeDaVez) : -1;
    const rodadaCegaAtiva = estado.cartasRodada === 1;

    return (
        <div className={`mesa-exp-tela${faseRevelacaoVaza === 'impacto' ? ' mesa-exp-tela-tremendo' : ''}`}>
            <h1 className="mesa-exp-cabecalho-titulo">Sala {estado.salaId}</h1>
            <div className="mesa-exp-cabecalho-direita">
                <button type="button" className="secundario" onClick={() => acoes?.sair?.()} disabled={!acoes?.sair}>
                    Sair da partida
                </button>
            </div>

            {onFechar && (
                <button type="button" className="mesa-exp-fechar" onClick={onFechar}>← Voltar</button>
            )}

            {/* Indicação de vez (ver DEV-front.md — item que faltava: quando é
                a SUA vez, o seu assento não tem fantasminha nenhum pra ganhar
                o contorno azul de sempre, então esse banner cobre os dois
                casos — sua vez OU vez de alguém — no topo-centro da tela. */}
            {nomeDaVez && !estado.vencedor && (
                <div className="mesa-exp-turno-banner">
                    {nomeDaVez === estado.meuNome
                        ? (estado.jogadorDaVezAposta ? 'Sua vez de apostar!' : 'Sua vez! Escolha uma carta.')
                        : `Vez de ${nomeDaVez}${estado.jogadorDaVezAposta ? ' apostar' : ''}`}
                </div>
            )}

            {/* Só chama de verdade na SUA vez — o servidor recusaria fora
                dela mesmo (NAO_E_SUA_VEZ, ver PROTOCOLO.md), isto aqui só
                evita a chamada de rede/erro confuso por engano. */}
            <SuaMaoEmLeque
                cartas={suaMao}
                idSaindo={cartaSaindoId}
                onJogar={(carta) => estado.jogadorDaVez === estado.meuNome && acoes?.jogar?.(carta)}
                escondida={rodadaCegaAtiva}
            />

            {estado.jogadorDaVezAposta === estado.meuNome && acoes?.apostar && !apostaPopupAberto && (
                <button type="button" className="mesa-exp-aposta-botao" onClick={abrirPopupAposta}>
                    Apostar
                </button>
            )}

            {apostaPopupAberto && (() => {
                const numero = Number(apostaValorPopup);
                const valorPreview = Math.max(0, Math.min(estado.cartasRodada, Number.isFinite(numero) ? Math.trunc(numero) : 0));
                return (
                    <div className="mesa-exp-aposta-overlay" onClick={() => !apostaEnviando && setApostaPopupAberto(false)}>
                        <div className="mesa-exp-aposta-popup" onClick={(e) => e.stopPropagation()}>
                            <h3>Quantas vazas você vai fazer?</h3>

                            <div className="mesa-exp-aposta-pilha">
                                {valorPreview === 0
                                    ? <span className="mesa-exp-aposta-pilha-vazia">nenhuma ficha ainda</span>
                                    : Array.from({ length: valorPreview }, (_, i) => (
                                        <div key={i} className="mesa-exp-aposta-ficha-pilha" style={{ '--indice-pilha': i }}>
                                            <Ficha />
                                        </div>
                                    ))}
                            </div>

                            <div className={`mesa-exp-aposta-campo${apostaErro ? ' mesa-exp-aposta-campo-erro' : ''}`}>
                                <button
                                    type="button"
                                    onClick={() => ajustarApostaValorPopup(valorPreview - 1)}
                                    disabled={valorPreview <= 0 || apostaEnviando}
                                >
                                    −
                                </button>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={apostaValorPopup}
                                    onChange={(e) => digitarApostaValorPopup(e.target.value)}
                                    disabled={apostaEnviando}
                                />
                                <button
                                    type="button"
                                    onClick={() => ajustarApostaValorPopup(valorPreview + 1)}
                                    disabled={valorPreview >= estado.cartasRodada || apostaEnviando}
                                >
                                    +
                                </button>
                            </div>

                            {apostaErro && <p className="mesa-exp-aposta-erro">{apostaErro}</p>}

                            <button type="button" className="mesa-exp-aposta-confirmar" onClick={confirmarApostaPopup} disabled={apostaEnviando}>
                                {apostaEnviando ? 'Enviando...' : 'Apostar'}
                            </button>
                        </div>
                    </div>
                );
            })()}

            <div className="mesa-exp-chat">
                <button
                    type="button"
                    className="mesa-exp-chat-botao"
                    onClick={() => setChatClicado((v) => !v)}
                    aria-expanded={chatClicado}
                >
                    💬
                </button>
                {chatClicado && (
                    <div className="mesa-exp-chat-linha">
                        <div className="mesa-exp-chat-painel">
                            <div className="mesa-exp-chat-prontas">
                                {MENSAGENS_CHAT.map((mensagem) => (
                                    <button
                                        key={mensagem.id}
                                        type="button"
                                        className="secundario"
                                        disabled={!acoes?.enviarChatPronta}
                                        onClick={() => acoes?.enviarChatPronta?.(mensagem.id)}
                                    >
                                        {mensagem.texto}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mesa-exp-chat-historico">
                            <h3>Histórico</h3>
                            <div className="mesa-exp-chat-historico-feed" ref={chatHistoricoRef}>
                                {(estado.mensagensChat ?? []).length === 0
                                    ? <span className="mesa-exp-chat-vazio">(sem mensagens)</span>
                                    : estado.mensagensChat.map((mensagem, i) => (
                                        mensagem.tipo === 'sistema'
                                            ? (
                                                <div key={i} className="mesa-exp-chat-msg mesa-exp-chat-msg-sistema">
                                                    <em>{mensagem.jogador} {mensagem.texto}</em>
                                                </div>
                                            )
                                            : (
                                                <div key={i} className="mesa-exp-chat-msg">
                                                    <strong>{mensagem.jogador === estado.meuNome ? 'Você' : mensagem.jogador}:</strong> {mensagem.texto}
                                                </div>
                                            )
                                    ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className={`mesa-exp-coracoes-suas${suaVidaEmDestaque ? ' mesa-exp-coracoes-destaque' : ''}`}>
                <Coracoes
                    vida={vidaPorAssento[0] ?? VIDA_MAXIMA}
                    assentoIndice={0}
                    registrarRef={registrarRefCoracao}
                    coracaoImpactado={coracoesImpactados[0] ?? null}
                />
            </div>

            <div className="mesa-exp-mesa">
                {assentos.map((assento, i) => {
                    const nomeAssento = ordemAssentos[i]?.nome;
                    const rotuloAssento = assento.eVoce ? 'Você' : nomeAssento ?? '';
                    const destacado = cartaEmHover?.jogador === nomeAssento || assentoEmHoverIndex === i;
                    const bolha = [...bolhasFala].reverse().find((b) => b.assentoIndex === i);
                    const ehBot = !assento.eVoce && assentoEhBot(nomeAssento, estado.desconectados);
                    const apostaDele = !assento.eVoce ? estado.apostas?.[nomeAssento] ?? null : null;
                    const naVez = turnoAssentoIndex === i;
                    const ladoFichas = assento.x < 50 ? 'esquerda' : 'direita';
                    const ladoVida = ladoFichas === 'esquerda' ? 'direita' : 'esquerda';
                    const estadoMorte = estadoMortePorAssento[i] ?? null;
                    return (
                        <div
                            key={i}
                            ref={(el) => { assentoRefs.current[i] = el; }}
                            className={`mesa-exp-assento${assento.eVoce ? ' mesa-exp-assento-voce' : ''}`}
                            style={{ left: `${assento.x}%`, top: `${assento.y}%` }}
                            onMouseEnter={() => !assento.eVoce && setAssentoEmHoverIndex(i)}
                            onMouseLeave={() => !assento.eVoce && setAssentoEmHoverIndex(null)}
                        >
                            {bolha && (
                                <div
                                    key={bolha.id}
                                    className="mesa-exp-bolha-fala"
                                    style={{ '--duracao-bolha': `${DURACAO_BOLHA_MS}ms` }}
                                >
                                    {bolha.texto}
                                </div>
                            )}
                            {assento.eVoce ? (
                                'Você'
                            ) : estadoMorte === 'morto' ? (
                                <span className="mesa-exp-assento-eliminado">💀<br />Eliminado</span>
                            ) : (
                                <>
                                    <Fantasminha destacado={destacado} danoVersao={danoPorAssento[i] ?? 0} bot={ehBot} monitor hue={huesPorAssento[i]} chapeu={chapeusPorAssento[i].src} ajusteChapeuPct={chapeusPorAssento[i].ajuste} naVez={naVez} estadoMorte={estadoMorte}>
                                        {/* `maos[i] > 0` é o que já chegou de VERDADE (via
                                            CartaVoando/aoChegarCarta) — sem essa trava a carta
                                            revelada (estado.maosReveladas) aparecia na hora que o
                                            evento chegava, ANTES da animação de dar carta terminar
                                            de voar, e continuava revelada mesmo depois dele já ter
                                            jogado a carta embora (maosReveladas nunca "esquece" a
                                            mão de ninguém, é um retrato tirado uma vez por rodada). */}
                                        <MaoEmLeque
                                            quantidade={maos[i] ?? 0}
                                            cartas={rodadaCegaAtiva && (maos[i] ?? 0) > 0 && estado.maosReveladas?.[nomeAssento] ? estado.maosReveladas[nomeAssento].map(lerCarta).filter(Boolean) : undefined}
                                        />
                                    </Fantasminha>
                                    <span className="mesa-exp-assento-legenda">
                                        {rotuloAssento}
                                        {ehBot && <span className="mesa-exp-assento-bot-tag"> 🤖 bot</span>}
                                    </span>
                                    {naVez ? (
                                        <span className="mesa-exp-assento-aposta-legenda mesa-exp-assento-turno-legenda">
                                            Vez de {rotuloAssento}
                                        </span>
                                    ) : assentoEmHoverIndex === i && apostaDele != null && (
                                        <span className="mesa-exp-assento-aposta-legenda">
                                            Aposta: {apostaDele}
                                        </span>
                                    )}
                                    {(assentoEmHoverIndex === i || assentosVidaTemporaria.includes(i)) && (
                                        <div className={`mesa-exp-assento-vida mesa-exp-assento-vida-${ladoVida}`}>
                                            <Coracoes
                                                vida={vidaPorAssento[i] ?? VIDA_MAXIMA}
                                                assentoIndice={i}
                                                registrarRef={registrarRefCoracao}
                                                coracaoImpactado={coracoesImpactados[i] ?? null}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}

                {vira && (
                    <div
                        key={vira.id}
                        className={`mesa-exp-vira${viraEmHover ? ' mesa-exp-vira-hover' : ''}`}
                        style={{
                            left: `${estadoVira.x}%`,
                            top: `${estadoVira.y}%`,
                            '--escala-vira': ESCALA_VIRA,
                            '--vira-rot-z': `${estadoVira.rotZ}deg`,
                            transitionDuration: `${duracaoTransicaoVira}ms`,
                        }}
                        onMouseEnter={() => setViraEmHover(true)}
                        onMouseLeave={() => setViraEmHover(false)}
                    >
                        <div
                            className="mesa-exp-vira-miolo"
                            style={{
                                '--vira-rot-y': `${estadoVira.rotY}deg`,
                                transitionDuration: `${duracaoTransicaoVira}ms`,
                            }}
                        >
                            <div className="mesa-exp-vira-face mesa-exp-vira-face-verso">
                                <Carta virada />
                            </div>
                            <div className="mesa-exp-vira-face mesa-exp-vira-face-frente">
                                <Carta rank={vira.rank} naipe={vira.naipe} />
                            </div>
                        </div>
                    </div>
                )}

                {viraEmHover && vira && (
                    <div className="mesa-exp-vira-legenda" style={{ left: `${estadoVira.x}%`, top: `${estadoVira.y}%` }}>
                        <strong>Vira</strong>
                        <span>Manilha:</span>
                        <LequeManilha rank={ORDEM_RANKS[vira.valorInt] ?? vira.rank} />
                    </div>
                )}

                <div
                    className="mesa-exp-baralho"
                    style={{
                        left: `${baralhoX}%`,
                        top: `${baralhoY}%`,
                        transform: `scale(${escalaBaralho}) rotate(${anguloBaralho}deg)`,
                        transitionDuration: `${DURACAO_DECK_MS}ms`,
                    }}
                >
                    {CARTAS_DO_BARALHO.map((carta, i) => (
                        <div
                            key={i}
                            className="mesa-exp-baralho-carta"
                            style={{ transform: `translate(calc(-50% + ${carta.x}px), calc(-50% + ${carta.y}px)) rotate(${carta.rotacao}deg)` }}
                        >
                            <Carta virada />
                        </div>
                    ))}
                </div>

                {cartasNaMesa.map((carta) => {
                    const vencendo = carta.id === analiseMesa.idVencedora;
                    const melada = analiseMesa.idsMeladas.has(carta.id);
                    const { grupo: grupoMelada, indice: indiceMelada } = melada
                        ? localizarGrupoMelada(carta.id)
                        : { grupo: 0, indice: 0 };
                    const jogadorHover = assentoEmHoverIndex != null
                        ? ordemAssentos[assentoEmHoverIndex]?.nome
                        : null;
                    const explosao = cartasExplodindo[carta.id];
                    const classes = ['mesa-exp-carta-jogada'];
                    if (carta.id === cartaEmHoverId || carta.jogador === jogadorHover) classes.push('mesa-exp-carta-jogada-hover');
                    if (vencendo) classes.push('mesa-exp-carta-jogada-vencendo');
                    if (melada) classes.push('mesa-exp-carta-jogada-melada');
                    if (explosao) classes.push('mesa-exp-carta-jogada-explodindo');
                    return (
                        <div
                            key={carta.id}
                            ref={(el) => { cartaMesaRefs.current[carta.id] = el; }}
                            className={classes.join(' ')}
                            style={explosao ? {
                                left: `${explosao.x}%`,
                                top: `${explosao.y}%`,
                                transform: `translate(-50%, -50%) perspective(700px) rotate(${explosao.rot}deg) rotateY(${explosao.flip}deg) scale(${explosao.escala})`,
                            } : melada ? {
                                left: `${MELADA_CANTO_X}%`,
                                top: `${MELADA_CANTO_Y}%`,
                                transform: `translate(calc(-50% + ${grupoMelada * MELADA_GRUPO_ESPACAMENTO_PX + indiceMelada * MELADA_CANTO_ESPACAMENTO_PX - (grupoMelada === 0 ? MELADA_PRIMEIRO_GRUPO_EXTRA_PX : 0)}px), calc(-50% + ${indiceMelada * MELADA_CANTO_ESPACAMENTO_PX}px)) rotate(${carta.rot}deg) scale(${carta.escala})`,
                            } : {
                                left: `${carta.x}%`,
                                top: `${carta.y}%`,
                                transform: `translate(-50%, -50%) rotate(${carta.rot}deg) scale(${carta.escala})`,
                            }}
                            onMouseEnter={() => setCartaEmHoverId(carta.id)}
                            onMouseLeave={() => setCartaEmHoverId(null)}
                        >
                            <Carta rank={carta.rank} naipe={carta.naipe} />
                        </div>
                    );
                })}

                {cartaEmHover && (() => {
                    const melada = analiseMesa.idsMeladas.has(cartaEmHover.id);
                    const vencendo = cartaEmHover.id === analiseMesa.idVencedora;
                    const pos = melada
                        ? { x: MELADA_CANTO_X, y: MELADA_CANTO_Y }
                        : { x: cartaEmHover.x, y: cartaEmHover.y };
                    return (
                        <div
                            className="mesa-exp-carta-jogada-legenda"
                            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                        >
                            <strong>{cartaEmHover.jogador === estado.meuNome ? 'Você' : cartaEmHover.jogador}</strong>
                            <span>{cartaEmHover.rank} de {cartaEmHover.naipe}</span>
                            {vencendo && <span className="mesa-exp-carta-jogada-legenda-vencendo">👑 Carta mais forte</span>}
                            {melada && <span className="mesa-exp-carta-jogada-legenda-melada">🤝 Melada (anulada)</span>}
                        </div>
                    );
                })()}

                {cartasVoando.map((carta) => (
                    <CartaVoando
                        key={carta.id}
                        de={carta.de}
                        para={carta.para}
                        anguloInicial={carta.anguloInicial}
                        anguloFinal={carta.anguloFinal}
                        escalaInicial={carta.escalaInicial}
                        escalaFinal={carta.escalaFinal}
                        carta={carta.carta}
                        escondida={carta.escondida}
                        duracaoMs={carta.tipo === 'jogar' ? DURACAO_JOGADA_MS : DURACAO_CARTA_MS}
                        onChegou={() => aoChegarCarta(carta)}
                    />
                ))}
            </div>

            <div className="mesa-exp-ficha-camada">
                {fichasVoando.map((ficha) => (
                    <FichaVoando
                        key={ficha.id}
                        de={ficha.de}
                        para={ficha.para}
                        atrasoMs={ficha.atrasoMs}
                        onChegou={() => aoChegarFicha(ficha)}
                    />
                ))}
                {fichasFantasmaVoando.map((ficha) => (
                    <FichaVoando
                        key={ficha.id}
                        de={ficha.de}
                        para={ficha.para}
                        atrasoMs={ficha.atrasoMs}
                        onChegou={() => aoChegarFichaFantasma(ficha)}
                        hue={ficha.hue}
                    />
                ))}
                {cartasDanoVoando.map((carta) => (
                    <CartaDanoVoando
                        key={carta.id}
                        de={carta.de}
                        obterDestino={() => obterCentroCoracao(carta.assentoIndice, carta.heartIndice)}
                        atrasoMs={carta.atrasoMs}
                        carta={carta.carta}
                        hue={carta.hue}
                        onChegou={() => aoChegarCartaDano(carta)}
                    />
                ))}
            </div>

            {fichasFantasmaNoCanto.map((ficha) => (
                <div
                    key={ficha.id}
                    className="mesa-exp-aposta-ficha-canto"
                    style={{ left: `${ficha.para.x}px`, top: `${ficha.para.y}px` }}
                >
                    <Ficha hue={ficha.hue} />
                </div>
            ))}

            <div className="mesa-exp-aposta-canto" ref={cantoFichasRef} />

            {/* Sua ficha pousada, MESMA classe/posição fixa (`ficha.para`)
                da ficha do fantasminha (ver fichasFantasmaNoCanto acima) —
                nada de flex/largura variável: uma vez pousada, a ficha
                nunca mais se move (é o que deixa a chegada de carta lisa
                igual a do fantasminha, sem reajuste nenhum nas vizinhas). */}
            {fichasNoCanto.map((ficha) => (
                <div
                    key={ficha.id}
                    className="mesa-exp-aposta-ficha-canto"
                    style={{ left: `${ficha.para.x}px`, top: `${ficha.para.y}px` }}
                >
                    <Ficha />
                </div>
            ))}

            {estado.apostas?.[estado.meuNome] != null && (
                <div className="mesa-exp-aposta-linha-legenda-ancora">
                    <span
                        className="mesa-exp-aposta-linha-legenda"
                        style={{
                            // Deixa uma folga de um `espaçamento` de ficha depois
                            // da ÚLTIMA ficha do leque antes do texto começar.
                            marginLeft: `${FICHA_LEQUE_ESPACAMENTO_PX + ((estado.apostas[estado.meuNome] - 1) / 2) * FICHA_LEQUE_ESPACAMENTO_PX}px`,
                        }}
                    >
                        Sua aposta: {estado.apostas[estado.meuNome]}
                    </span>
                </div>
            )}

            {cartasVazaGanhas.map((carta) => {
                // Mesmo sistema pra você e pro fantasminha (ver
                // calcularPosicaoCartaVazaGanha): a carta pousa em cima da
                // ficha de mesmo número (`slotIndice`) ao redor da ancora
                // `carta.x/y` guardada sem deslocamento nenhum — sem isso
                // todas as cartas de um mesmo assento pousavam no MESMO
                // pixel, cobrindo umas às outras (e a pilha/fileira de
                // fichas inteira). Aposta 0 (ou mais vazas que apostou) não
                // precisa de caso especial — é só uma fórmula contínua, a
                // carta extra extrapola na mesma direção, além de onde a
                // última ficha pararia. `carta.apostaValor` é a aposta
                // CONGELADA no momento em que a carta pousou (ver
                // iniciarRevelacaoVazaComVencedora) — nunca lida de
                // `estado.apostas` ao vivo, porque isso já pode ter sido
                // zerado pelo `novaRodadaIniciada` da rodada seguinte
                // enquanto essas cartas ainda estão na mesa esperando a
                // animação de dano (era o "shift" estranho de carta/ficha
                // que o Henrique via no fim de rodada).
                const pos = calcularPosicaoCartaVazaGanha(carta.assentoIndice, carta.slotIndice, carta.x, carta.y, carta.apostaValor);
                return (
                    <div
                        key={carta.id}
                        className={`mesa-exp-carta-vaza-ganha${carta.assentoIndice === 0 ? ' mesa-exp-carta-vaza-ganha-voce' : ''}`}
                        style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
                    >
                        <Carta rank={carta.rank} naipe={carta.naipe} />
                    </div>
                );
            })}

            {vazaRevelando && (
                <div className={`mesa-exp-vaza-overlay${faseRevelacaoVaza === 'crescendo' ? ' mesa-exp-vaza-overlay-escuro' : ''}`} />
            )}
            {vazaRevelando && faseRevelacaoVaza === 'crescendo' && (
                <div className="mesa-exp-vaza-texto">
                    <strong>Fim de Vaza: {vazaRevelando.jogador === estado.meuNome ? 'Você' : vazaRevelando.jogador}</strong>
                    <span>{vazaRevelando.rank} de {vazaRevelando.naipe}</span>
                </div>
            )}
            {!vazaRevelando && faseRevelacaoVaza === 'melada' && (
                <>
                    <div className="mesa-exp-vaza-overlay mesa-exp-vaza-overlay-escuro" />
                    <div className="mesa-exp-vaza-texto">
                        <strong>Vaza melada</strong>
                        <span>ninguém pontuou</span>
                    </div>
                </>
            )}
            {faseRevelacaoVaza && faseRevelacaoVaza !== 'crescendo' && (
                <div
                    key={choqueVaza}
                    className="mesa-exp-vaza-onda-choque"
                    style={{
                        left: `${window.innerWidth * VAZA_REVELACAO_X_FRACAO}px`,
                        top: `${window.innerHeight * VAZA_REVELACAO_Y_FRACAO + VAZA_IMPACTO_QUEDA_PX}px`,
                    }}
                />
            )}
            {vazaRevelando && faseRevelacaoVaza && (
                <CartaRevelando
                    key={vazaRevelando.cartaId}
                    origem={vazaRevelando.origem}
                    destino={vazaRevelando.destino}
                    fase={faseRevelacaoVaza}
                    carta={{ rank: vazaRevelando.rank, naipe: vazaRevelando.naipe }}
                />
            )}

            {jogoVencedorIndice != null && (
                <div className="mesa-exp-vaza-overlay mesa-exp-vaza-overlay-escuro" />
            )}
            {jogoVencedorIndice != null && (
                <div className="mesa-exp-vitoria">
                    <div className="mesa-exp-vitoria-fantasminha">
                        <div className="mesa-exp-vitoria-fantasminha-escala">
                            <Fantasminha
                                hue={huesPorAssento[jogoVencedorIndice]}
                                chapeu={chapeusPorAssento[jogoVencedorIndice].src}
                                ajusteChapeuPct={chapeusPorAssento[jogoVencedorIndice].ajuste}
                                bot={jogoVencedorIndice === 0 ? false : assentoEhBot(ordemAssentos[jogoVencedorIndice]?.nome, estado.desconectados)}
                                monitor
                            />
                        </div>
                    </div>
                    <div className="mesa-exp-vitoria-texto">
                        <strong>
                            {(jogoVencedorIndice === 0 ? 'Você' : ordemAssentos[jogoVencedorIndice]?.nome)} VENCEU!
                        </strong>
                        {acoes?.jogarDeNovo && (
                            <button type="button" onClick={acoes.jogarDeNovo}>Jogar de novo</button>
                        )}
                        {/* Convite de revanche (ver conviteRevanche em
                            novo/Partida.jsx) — chega só pra quem NÃO é o
                            adm, quando o adm já chamou "Jogar de novo" logo
                            acima. "Não" reaproveita o mesmo acoes.sair de
                            sempre: recusar É só sair da sala, sem chamada de
                            servidor própria. */}
                        {estado.conviteRevanche && (
                            <div className="mesa-exp-vitoria-convite">
                                <p>{estado.conviteRevanche.jogador} está te chamando pra outra partida.</p>
                                <div className="botoes">
                                    <button type="button" onClick={() => acoes?.aceitarConviteRevanche?.()} disabled={!acoes?.aceitarConviteRevanche}>
                                        Sim
                                    </button>
                                    <button type="button" onClick={() => acoes?.sair?.()} disabled={!acoes?.sair} className="secundario">
                                        Não
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
