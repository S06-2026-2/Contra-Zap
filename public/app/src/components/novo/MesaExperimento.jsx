import { useEffect, useMemo, useRef, useState } from 'react';
import Fantasminha from './Fantasminha.jsx';
import Carta from './Carta.jsx';
import Ficha from './Ficha.jsx';
// Mesmo catálogo que o Partida.jsx de verdade usa (fonte única no back, ver
// comentário lá dentro) — os 4 tipos de mensagem pronta do chat "restrito".
import { MENSAGENS_CHAT, CHAT_COOLDOWN_MS } from '../../../../../conexao/chat/mensagensChat.js';

// Ordem fixa de rotação/deslocamento de cada carta do monte — estático de
// propósito (não sorteado): é só decoração, não precisa mudar a cada
// render nem ter estado nenhum por trás.
const CARTAS_DO_BARALHO = [
    { rotacao: -6, x: -3, y: 2 },
    { rotacao: -2, x: -1, y: 1 },
    { rotacao: 1, x: 1, y: -1 },
    { rotacao: 4, x: 2, y: -2 },
    { rotacao: 7, x: 3, y: -3 },
];

// Animação de "dar as cartas": o baralho gira pra apontar pro jogador da
// vez, sai um pouco do centro em direção a ele, "solta" um par de cartas
// que voam até o assento, e só então segue (sentido horário) pro próximo —
// sem voltar ao tamanho/ângulo original até todo mundo já ter recebido.
const CARTAS_POR_JOGADOR = 2;
// Atraso entre cartas e pausa pós-entrega ainda escalam em cima desta
// velocidade — 2x mais rápido que os números "base" (140/250ms) — mas
// DURACAO_DECK_MS e DURACAO_CARTA_MS viraram valores PRÓPRIOS, não mais
// derivados dela: o baralho girando/se deslocando entre jogadores deve ser
// rápido, e a carta voando do baralho até o assento deve ser mais devagar
// — as duas coisas precisavam poder mudar em direções opostas.
const VELOCIDADE = 2;
const DURACAO_DECK_MS = 200;
const DURACAO_CARTA_MS = 380;
// Folga extra depois que o baralho termina de girar/deslocar (DURACAO_DECK_MS)
// antes de soltar a primeira carta — sem isso ficava meio desalinhado,
// cartas saindo um instante antes do baralho realmente ter chegado.
const FOLGA_APOS_BARALHO_MS = 120;
const ATRASO_ENTRE_CARTAS_MS = Math.round(140 / VELOCIDADE);
const PAUSA_POS_ENTREGA_MS = Math.round(250 / VELOCIDADE);
// Fração do caminho até o assento que o baralho percorre — não vai até lá
// (quem completa o trajeto são as cartas voando, não o baralho inteiro).
const ALCANCE_BARALHO = 0.35;
const ESCALA_BARALHO_REPOUSO = 0.55;
const ESCALA_BARALHO_ENTREGANDO = 0.72;
// Escala da carta voando pros OUTROS jogadores: nasce do mesmo tamanho que
// o baralho está usando pra entregar (ESCALA_BARALHO_ENTREGANDO — "sai do
// tamanho da carta do baralho") e encolhe até bater com o tamanho da
// carta miniatura na mão do fantasminha (0.36 — mesmo valor de
// .mesa-exp-mao-carta-entrada no CSS, têm que ficar iguais pra não dar
// salto de tamanho quando ela "vira" carta de mão).
const ESCALA_CARTA_VOANDO_INICIAL = ESCALA_BARALHO_ENTREGANDO;
const ESCALA_CARTA_VOANDO_FINAL = 0.36;
// Pra "Você" ela CRESCE durante o voo — reforça a sensação de vir na sua
// direção, na "câmera" — antes de virar uma carta de verdade (ver
// SuaMaoEmLeque) quando chega.
const ESCALA_CARTA_VOANDO_INICIAL_VOCE = 0.32;
const ESCALA_CARTA_VOANDO_FINAL_VOCE = 0.95;

// "Jogar carta" (ver jogarCarta) — mesmo espírito do carta.jogar() de
// public/_intro/index.html (ângulo+distância aleatórios, giro que desacelera
// até um ângulo final também aleatório, escala que cresce um pouco), só que
// em cima da MESMA CartaVoando de dar carta (duas fases: nasce nos valores
// iniciais, um quadro depois pula pros finais, a transition CSS cuida do
// resto) em vez do loop de rAF manual do protótipo original.
const DURACAO_SAIDA_MAO_MS = 220; // bate com a animação de saída do CSS (ver mesa-exp-sua-carta-descer)
const DURACAO_JOGADA_MS = Math.round(650 / VELOCIDADE);
const ESCALA_CARTA_JOGADA_INICIAL = 0.34;
const ESCALA_CARTA_JOGADA_FINAL = 0.6;
// Pouso da carta jogada: um ponto entre o CENTRO da mesa e o PRÓPRIO
// assento de quem jogou (30% do caminho do centro em direção ao assento —
// por isso "mais perto do player", não sempre no meio da mesa pra todo
// mundo), mais um espalhamento pequeno (a "força" da tacada, ver pedido de
// diminuir) pra não empilhar sempre exatamente no mesmo pixel. Serve tanto
// pra "Você" (jogarCarta) quanto pra qualquer fantasminha
// (tacarCartaFantasma) — mesma conta pros dois.
const ALCANCE_JOGADA = 0.3;
const ESPALHAMENTO_JOGADA = 9;
function calcularAlvoJogada(assento) {
    return {
        x: 50 + (assento.x - 50) * ALCANCE_JOGADA + (Math.random() * 2 - 1) * ESPALHAMENTO_JOGADA,
        y: 50 + (assento.y - 50) * ALCANCE_JOGADA + (Math.random() * 2 - 1) * ESPALHAMENTO_JOGADA,
    };
}

// Canto de "cartas meladas" (ver analiseMesa/idsMeladas em
// MesaExperimento.jsx) — saem de onde pousaram e vão todas pro topo-
// esquerda da mesa, uma ligeiramente por cima da outra (mesmo espírito do
// pequeno escalonamento fixo de CARTAS_DO_BARALHO lá em cima, só que aqui
// por ÍNDICE de ordem de chegada entre as meladas, não por posição fixa
// num array — ver `indiceMelada` no JSX).
const MELADA_CANTO_X = 18;
const MELADA_CANTO_Y = 20;
const MELADA_CANTO_ESPACAMENTO_PX = 10;
// Distância extra ENTRE grupos de rank diferente (ex.: par de 6 vs par de
// Rei melados ao mesmo tempo) — só no eixo X, "um pouquinho pro lado" de
// propósito (não tão pronunciado quanto o espaçamento dentro do mesmo
// grupo): a legenda de hover já deixa claro qual é qual, não precisa
// separar bem longe.
const MELADA_GRUPO_ESPACAMENTO_PX = 60;
// O primeiro grupo (grupoMelada === 0) sai ainda mais pra esquerda, só ele —
// não mexe na posição dos outros grupos, só abre mais distância entre o
// primeiro e o segundo.
const MELADA_PRIMEIRO_GRUPO_EXTRA_PX = 20;

function esperar(ms) {
    return new Promise((resolver) => setTimeout(resolver, ms));
}

// Sandbox pro layout da tela de Partida — desligado do socket/protocolo de
// propósito, só o esqueleto visual (fundo, mesa oval estilo poker,
// retângulo de assento por jogador) pra fechar o arranjo antes de mexer no
// Partida.jsx de verdade. Este arquivo era o experimento de fichas/cartas
// arremessadas (ver public/_intro/, onde o original continua arquivado, e o
// commit "testando mecanica de carta e mesa aleatoria"); aposentado pra dar
// lugar a este.
//
// Elementos que o Partida.jsx de verdade (novo/ e o antigo, hoje idênticos)
// já precisam mostrar, levantados pra guiar os próximos passos deste
// protótipo:
//   - Sala: título com o salaId, botão sair (texto muda antes/depois de
//     iniciar), senha (só se privada e só pra quem criou).
//   - Espera: lista de quem já entrou, contador de "sala cheia, começa em
//     Xs", botão forçar início.
//   - Status por jogador durante a partida: 💀 morreu, 🤖 no automático
//     (desconectado), quanto já apostou nesta rodada.
//   - Cabeçalho de turno: de quem é a vez / quem venceu o jogo.
//   - Pós-vitória: botão "jogar de novo" (só o dono da sala) e convite de
//     revanche (aceitar/recusar) pros demais.
//   - Mesa (vaza atual): uma carta por jogador que já jogou nesta vaza, com
//     destaque na vencedora durante a pausa antes de limpar.
//   - Vira/manilha: a carta virada que define o naipe/valor que vale mais.
//   - Rodada cega ("testa", 1 carta): mostra a mão dos OUTROS jogadores,
//     nunca a própria.
//   - Aposta: input de quantas vazas você acha que vai fazer, só na sua
//     vez; mensagem de espera nas vezes dos outros.
//   - Sua mão: cartas clicáveis (só na sua vez), viradas na rodada cega.
//   - Placar da última rodada (hp de cada jogador).
//   - Chat: mensagens prontas, feed (sistema vs jogador), input livre
//     (quando habilitado), cooldown de envio.
//   - Erro de ação e log de eventos (debug).
// Este primeiro passo cobre só fundo + mesa + assentos; o resto entra por
// cima depois que o arranjo espacial estiver bom.

const MIN_JOGADORES = 2;
const MAX_JOGADORES = 8;

const MIN_CARTAS_TESTE = 0;
const MAX_CARTAS_TESTE = 4;

// Aposta (ver PROTOCOLO.md: `apostar` valida `valor` em [0, cartas da
// rodada] — APOSTA_VALOR_MAX reaproveita MAX_CARTAS_TESTE de propósito, é
// o MESMO limite de verdade, só que aqui fixo em vez de vir de
// `cartasRodada` de um servidor que não existe neste sandbox).
const APOSTA_VALOR_MAX = MAX_CARTAS_TESTE;
// Tamanho-base de UMA ficha (a div em si, ver .mesa-exp-ficha-voando no
// CSS) — tudo o resto (grande no popup/voando, pequena pousada no canto) é
// só `scale()` em cima deste tamanho fixo, nunca muda width/height de
// verdade.
const FICHA_TAMANHO_PX = 64;
const ESCALA_FICHA_CANTO = 0.62; // "diminuir" ao pousar no canto, mas não TANTO — pedido do Henrique
// Pilha DENTRO do popup (cresce com o valor digitado, ainda flutuando) —
// essa sim empilha pra CIMA, uma ficha em cima da outra.
const FICHA_EMPILHA_POPUP_PX = 10;
// Já as fichas que POUSAM no canto não empilham — ficam lado a lado, num
// leque horizontal (mesma altura, só espalhadas em X), pedido do Henrique
// depois de ver a pilha vertical. Espaçamento generoso de propósito ("um
// pouco mais separado") — bem mais que o antigo deslocamento de pilha.
const FICHA_LEQUE_ESPACAMENTO_PX = 34;
// Aposta dos FANTASMINHAS (ver fantasmaAposta) — essas sim empilham (pediu
// pra ser vertical mesmo, "um pouco espaçado" — mais que a pilha do popup,
// menos que o leque da sua). `FICHA_FANTASMA_OFFSET_LADO_PX` é a distância
// da BORDA do assento (não do centro) até onde a pilha nasce — PRA DENTRO
// do retângulo (pediu pra ficar mais perto do fantasminha), não mais pro
// lado de fora da mesa.
const FICHA_EMPILHA_FANTASMA_PX = 20;
const FICHA_FANTASMA_OFFSET_LADO_PX = 55;
// Arremesso (ver FichaVoando/criarFicha em public/_intro/index.html, de
// onde esta mecânica foi portada) — valores mais generosos que o
// experimento original de propósito ("dá um boost", pediu o Henrique):
// sobe mais alto, cresce mais no pico, gira mais vezes.
const FICHA_FORCA_SUBIDA_MIN = 70;
const FICHA_FORCA_SUBIDA_MAX = 190;
const ESCALA_FICHA_PICO_MIN = 1.35;
const ESCALA_FICHA_PICO_MAX = 1.75;
// Múltiplo de meia-volta (180°), senão a ficha pousa de perfil (mostrando
// a "quina" em vez da face) — mesmo motivo do comentário original.
const FICHA_VOLTAS_MIN = 3;
const FICHA_VOLTAS_MAX = 5.5;
const FICHA_DURACAO_MIN_MS = 750;
const FICHA_DURACAO_MAX_MS = 1150;
// Desvio lateral senoidal leve (pico no meio do voo, zero nas pontas) —
// só pra não ficar uma reta perfeita entre origem e destino, mais um
// capricho de movimento que o experimento original não tinha.
const FICHA_DESVIO_LATERAL_PX = 26;
// Atraso entre o início do voo de uma ficha e da próxima (efeito cascata,
// não todas saindo exatamente juntas).
const FICHA_ATRASO_ENTRE_MS = 90;
// Depois que a ficha CHEGA (t=1 do arremesso) ainda sobra este tempo de
// assentamento (encolhe de escala 1 pra ESCALA_FICHA_CANTO via transition
// CSS bouncy, ver .mesa-exp-ficha-pousada) antes de virar de vez uma ficha
// estática na pilha do canto.
const FICHA_ASSENTAMENTO_MS = 320;

// Revelação de fim de vaza (ver finalizarVaza/CartaRevelando) — no jogo de
// verdade é o servidor que manda `vazaFinalizada` já sabendo quem ganhou
// (ver PROTOCOLO.md); aqui quem dispara é o botão de debug "🏆 Finalizar
// vaza", mas a carta vencedora é a MESMA que analiseMesa já calcula ao
// vivo (idVencedora) — não é um sorteio novo. Coreografia em QUATRO fases
// (mesmo espírito de calcularEstadoVira/tocarVira lá embaixo — fase muda,
// a transition CSS sempre ligada anima sozinha até o alvo novo):
//   'crescendo' — sai de onde estava (px de verdade, capturado via
//     getBoundingClientRect no clique) e cresce até um ponto quase-central
//     da TELA (não da mesa oval, que é bem menor), já desgirada.
//   'impacto'   — "bate" na mesa: desce um pouco e encolhe rápido de volta
//     pro tamanho normal de carta. Dispara junto: overlay desescurece,
//     legenda some, onda de choque, tremor de tela, e as cartas PERDEDORAS
//     (ver cartasNaMesa) saem voando pra fora.
//   'viajando'  — some do centro da tela e viaja até a pilha de fichas de
//     aposta do vencedor (ver calcularAncoraFichaAssento).
//   'pousada'   — fica ali pro resto da rodada, embaixo da pilha de fichas
//     dele (ver cartasVazaGanhas) — "representa ele ter feito uma vaza".
const VAZA_REVELACAO_X_FRACAO = 0.42; // "quase no meio, mas não no meio" — um pouco pra esquerda
const VAZA_REVELACAO_TEXTO_X_FRACAO = 0.66; // do outro lado da carta, no espaço que sobrou
const VAZA_REVELACAO_Y_FRACAO = 0.5;
const VAZA_REVELACAO_ESCALA = 2.4; // "crescer até ficar grande na tela"
const VAZA_REVELACAO_TRANSICAO_MS = 550; // duração do CRESCIMENTO em si
// Depois de crescer, ainda segura um tempo PARADA grande/centralizada com
// a legenda — só então o impacto acontece. Sem essa pausa o crescimento
// emendava direto no impacto, sem dar tempo de ler "Fim de Vaza: ...".
const VAZA_REVELACAO_PAUSA_MS = 1100;
// Impacto: cai um pouco (px) e encolhe rápido pra escala ~normal de carta
// pousada na mesa — aqui é só visualmente "carta normal", não precisa
// bater o valor exato de nenhuma constante de jogada.
const VAZA_IMPACTO_QUEDA_PX = 26;
const VAZA_IMPACTO_ESCALA = 0.7;
const VAZA_IMPACTO_DURACAO_MS = 220; // rápido/seco de propósito ("violentamente")
// Depois do impacto, ainda segura um instante antes de viajar — sem isso a
// onda de choque/tremor mal dava tempo de aparecer.
const VAZA_IMPACTO_PAUSA_MS = 260;
const VAZA_VIAGEM_DURACAO_MS = 600;
const VAZA_POUSO_ESCALA = ESCALA_FICHA_CANTO; // mesmo tamanho pequeno da ficha pousada, "embaixo dela"
const VAZA_POUSO_ROT_GRAUS = -12; // leve inclinação, não fica reta atrás da ficha redonda
// Cartas PERDEDORAS "explodindo" pra fora no impacto — todo mundo sai
// radialmente AFASTANDO do centro da mesa (não uma direção aleatória
// solta), gira várias voltas ("uns flips") e cresce um pouco no caminho.
const VAZA_EXPLOSAO_FATOR = 2.6; // multiplica a distância atual até o centro (50,50) da mesa
const VAZA_EXPLOSAO_ESCALA_MULT = 1.35;
const VAZA_EXPLOSAO_VOLTAS_MIN = 2;
const VAZA_EXPLOSAO_VOLTAS_MAX = 4;
const VAZA_EXPLOSAO_DURACAO_MS = 480;

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
// Leque: ângulo/deslocamento entre cartas vizinhas — o resto (quantas
// cartas, ordem) vem de `quantidade` na hora de desenhar.
const ANGULO_ENTRE_CARTAS = 8;
const DESLOCAMENTO_ENTRE_CARTAS = 22;
// Entrada de cada carta na mão: bem sutil de propósito (poucos px, atraso
// curto) — é só um "assentar", não um efeito chamativo. As SUAS cartas
// reaproveitam o mesmo atraso escalonado entre uma e outra, só que a
// distância que cada uma sobe (ver @keyframes mesa-exp-sua-carta-subir no
// CSS) é bem maior — "de fora da tela", não um assentar sutil.
const ATRASO_ENTRADA_CARTA_MS = 90;
// Leque das SUAS cartas: cartas de verdade, bem maiores (tamanho natural
// do Carta.jsx, sem escala reduzida) — ângulo/deslocamento próprios, mais
// abertos que o leque em miniatura dos outros jogadores.
const ANGULO_ENTRE_CARTAS_VOCE = 10;
const DESLOCAMENTO_ENTRE_CARTAS_VOCE = 70;

// Cabeçalho da sala (ver checklist lá em cima, item 1): salaId/senha ainda
// não vêm do servidor aqui (sandbox desligado do protocolo), só placeholders
// pra fechar a posição/estilo antes de plugar o dado real.
const SALA_ID_TESTE = 'A3F9K2';
const SENHA_TESTE = '482913';

// Chat (item do checklist): quanto tempo o balãozinho de fala fica em cima
// do fantasminha antes de sumir sozinho.
const DURACAO_BOLHA_MS = 3200;

// Placeholder: ainda não existe "sua mão" de verdade vinda do servidor —
// só pra essas cartas não nascerem em branco, cada uma sorteia um
// rank/naipe qualquer na hora que chega.
const RANKS_TESTE = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const NAIPES_TESTE = ['Ouros', 'Copas', 'Espadas', 'Paus'];
function cartaAleatoria() {
    return {
        rank: RANKS_TESTE[Math.floor(Math.random() * RANKS_TESTE.length)],
        naipe: NAIPES_TESTE[Math.floor(Math.random() * NAIPES_TESTE.length)],
    };
}

// Vira/manilha (ver virarCarta/tocarVira mais abaixo): no jogo de verdade
// o servidor distribui as mãos e SÓ DEPOIS vira a manilha (ver ordem dos
// eventos em conexao/PROTOCOLO.md — novaRodadaIniciada/suaMao vêm antes de
// manilhaVirada) — por isso distribuirCartas ENCADEIA essa animação no
// próprio final, em vez de deixar só o botão manual solto. RANKS_TESTE já
// está na MESMA ordem de valorInt que game/Baralho.js (4,5,6,7,Q,J,K,A,2,3)
// — a manilha é sempre o rank SEGUINTE nessa sequência (com "3", o mais
// alto, virando pro "4" — mesma conta de Rodada.js: `viraValor === 9 ? 0 :
// viraValor + 1`), daí dar pra reusar esse mesmo array em vez de duplicar
// a sequência.
function rankDaManilha(rankVira) {
    const indice = RANKS_TESTE.indexOf(rankVira);
    return RANKS_TESTE[(indice + 1) % RANKS_TESTE.length];
}

// naipeInt na MESMA ordem de game/Baralho.js (Ouros=0, Espadas=1, Copas=2,
// Paus=3) — força de manilha por naipe usa essa ordem (ver
// compararForcaMesa abaixo). É DIFERENTE da ordem de NAIPES_TESTE
// (Ouros/Copas/Espadas/Paus) usada só pra exibição/sorteio ali em cima —
// não dá pra reusar aquele array aqui sem embaralhar a força real.
const NAIPE_INT = { Ouros: 0, Espadas: 1, Copas: 2, Paus: 3 };

// Mesmo critério de game/Mesa.js (saoIdenticas/compararForca), portado pra
// cá pra decidir contorno verde (mais forte) e preto (melada) na mesa do
// experimento — ver useMemo de analiseMesa em MesaExperimento. `viraValor`
// aqui é sempre o valorInt da MANILHA (rankDaManilha), não da vira em si.
function saoIdenticasMesa(c1, c2, viraValor) {
    if (c1.valorInt !== c2.valorInt) return false;
    // Manilha só anula com naipe TAMBÉM idêntico (caso de 2 baralhos — com
    // 1 baralho só nunca acontece, cada naipe só tem uma manilha).
    if (c1.valorInt === viraValor) return c1.naipeInt === c2.naipeInt;
    // Cartas normais anulam só pelo valor de face (ex.: 6 de Copas e 6 de
    // Paus), naipe não importa.
    return true;
}

// > 0 se c1 for mais forte que c2, < 0 se c2 for mais forte.
function compararForcaMesa(c1, c2, viraValor) {
    const c1EhManilha = c1.valorInt === viraValor;
    const c2EhManilha = c2.valorInt === viraValor;
    if (c1EhManilha && !c2EhManilha) return 1;
    if (!c1EhManilha && c2EhManilha) return -1;
    if (c1EhManilha && c2EhManilha) return c1.naipeInt - c2.naipeInt;
    return c1.valorInt - c2.valorInt;
}

// Coreografia de virar a vira (ver tocarVira): o baralho SOBE (mesma
// escala ENTREGANDO de quando dá carta — ver escalaBaralho — só que aqui
// sem alvo/ângulo nenhum, ele não se desloca, só "cresce"), a carta do
// topo sai pra ESQUERDA girando a metade do flip (0deg -> ~meio, quase de
// perfil), depois VOLTA pra direita completando o giro (meio -> 180deg,
// virada de vez) — e pousa de volta EXATAMENTE no centro (50,50), o MESMO
// ponto do baralho, não mais deslocada pro canto: literalmente embaixo
// dele (z-index, ver CSS), não do lado. Só que embaixo de verdade some
// inteira atrás do baralho — por isso ROTACAO_VIRA_POUSADA_GRAUS: gira a
// carta (2D, no próprio plano — nada a ver com o flip 3D em Y) uns 70°
// assim que ela assenta, e como o retângulo da carta é maior que a
// "sombra" do baralho por cima, só as pontas sobram pra fora, espiando.
const VIRA_IDA_X = 50 - 16;
const VIRA_IDA_Y = 50 - 3;
const VIRA_ROT_MEIO_GRAUS = 82; // "90 ou 70 por aí" — quase de perfil, some quase de todo
const DURACAO_VIRA_IDA_MS = 280;
const DURACAO_VIRA_VOLTA_MS = 300;
const ROTACAO_VIRA_POUSADA_GRAUS = -60;
// Pouso final: quase embaixo do baralho, só uns pixels pra ESQUERDA do
// centro exato (não fica em cima de verdade, "literalmente embaixo" era
// só a composição visual — ver ROTACAO_VIRA_POUSADA_GRAUS pra ainda dar
// pra ver as pontas mesmo assim).
const VIRA_POUSADA_X = 50 - 3;
const VIRA_POUSADA_Y = 50;
// Mesma escala de repouso do baralho (ESCALA_BARALHO_REPOUSO) — os dois
// precisam parecer do mesmo "baralho físico", não um maior que o outro.
const ESCALA_VIRA = 0.55;

// Onde a vira está (x/y em % da mesa), quanto já girou no flip 3D (rotY)
// e quanto está girada no próprio plano (rotZ — só diferente de 0 depois
// de já ter pousado, ver ROTACAO_VIRA_POUSADA_GRAUS), a cada fase da
// coreografia acima. null/'subindo' (carta ainda "debaixo" do baralho, no
// centro exato, sem girar nada) e 'pousada' (fica assim pro resto da
// rodada, ligeiramente à esquerda — ver VIRA_POUSADA_X/Y) são os dois
// estados de REPOUSO.
function calcularEstadoVira(fase) {
    if (fase === 'indo') return { x: VIRA_IDA_X, y: VIRA_IDA_Y, rotY: VIRA_ROT_MEIO_GRAUS, rotZ: 0 };
    // 'voltando' e 'pousada' são o MESMO alvo (a volta pra direita já
    // chega girada uns ROTACAO_VIRA_POUSADA_GRAUS — não é um passo extra
    // depois de já ter chegado) — só existem como fases separadas porque
    // tocarVira precisa de um instante pra desligar baralhoEmVira DEPOIS
    // que ela já tiver chegado.
    if (fase === 'voltando' || fase === 'pousada') {
        return { x: VIRA_POUSADA_X, y: VIRA_POUSADA_Y, rotY: 180, rotZ: ROTACAO_VIRA_POUSADA_GRAUS };
    }
    return { x: 50, y: 50, rotY: 0, rotZ: 0 };
}

// Leque de preview da manilha na legenda (ver GaleriaRanks pro mesmo
// espírito, mas ali é a grade de revisão — aqui é só decorativo dentro do
// popup de hover): os 4 naipes do MESMO rank, levemente abertos e
// sobrepostos, sem interação nenhuma (a legenda inteira já é
// pointer-events:none, ver .mesa-exp-carta-jogada-legenda).
const VIRA_LEGENDA_ANGULO_ENTRE_CARTAS = 12;
const VIRA_LEGENDA_DESLOCAMENTO_ENTRE_CARTAS = 20;

// "Você" sempre no ângulo de baixo (90°: em coordenadas de tela, com y
// crescendo pra baixo, sen(90°)=1 é o ponto mais embaixo da elipse); os
// outros N-1 assentos se espalham em partes iguais ao redor da mesma
// elipse. Com 2 jogadores isso já dá "cara a cara" (um embaixo, um em
// cima); com 3, um triângulo (você embaixo, os outros dois em cima); daí
// pra frente vai virando um leque cada vez mais fechado ao redor da mesa.
// Raios em % do próprio tamanho da mesa (não da tela). 50% cairia exatamente
// EM CIMA da borda da mesa (a elipse "cheia" que ela ocupa); qualquer coisa
// acima disso (62-80%) empurra o assento pra FORA dela, na mesma proporção
// largura/altura da mesa — o seu assento usa um raio ainda maior, pra ficar
// mais destacado/perto de quem está olhando a tela.
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

// Uma carta voando de um ponto a outro — nasce nos valores iniciais (sem
// transition) e, um quadro depois, pula pros finais com transition ligada:
// é o truque de sempre pra animar "de A até B" em cima de left/top/
// transform direto, sem depender de manter estado nenhum no componente pai
// além de "isso existe" / "isso já chegou". Serve pra dois casos: dar
// carta (do baralho pro assento — aí anguloInicial === anguloFinal, não
// gira; `carta` fica de fora, sempre virada) e jogar carta (da sua mão pra
// mesa — aí sim gira bastante, ver jogarCarta, e `carta` chega preenchida
// pra virar a carta de verdade que você jogou).
function CartaVoando({ de, para, anguloInicial, anguloFinal, escalaInicial, escalaFinal, duracaoMs, carta, onChegou }) {
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
            {carta ? <Carta rank={carta.rank} naipe={carta.naipe} /> : <Carta virada />}
        </div>
    );
}

// Ficha arremessada (ver confirmarAposta/FICHA_* lá em cima) — portada da
// mecânica de criarFicha em public/_intro/index.html, mas com rAF PRÓPRIO
// em vez de CSS transition: CartaVoando acima só pula de A pra B (um salto
// só, a transition cuida do resto); aqui o "arco" (sobe girando, desce
// crescendo depois encolhendo) precisa de controle quadro a quadro de
// verdade, então não dá pra terceirizar pro CSS. Posições em PIXELS (não %
// como CartaVoando) — a ficha viaja de um popup centralizado até um canto
// fixo da TELA, não um ponto relativo à mesa oval.
//
// Fases: 1) `atrasoMs` de espera (cascata entre fichas da mesma aposta);
// 2) o arremesso em si (sobe girando+crescendo até a metade, desce
// girando+encolhendo de volta pra escala 1 na outra metade — mesma curva
// dupla do experimento original, só que "boostada": sobe mais alto, gira
// mais, ganha um desvio lateral senoidal pra não ser uma reta perfeita);
// 3) ao pousar (t=1), `pousada` liga uma CSS transition bouncy que encolhe
// de escala 1 pra ESCALA_FICHA_CANTO (ver .mesa-exp-ficha-pousada) — só
// DEPOIS desse assentamento (FICHA_ASSENTAMENTO_MS) que `onChegou` roda de
// verdade, trocando esta ficha voando por uma estática na pilha do canto
// (ver fichasNoCanto), sem pulo nenhum entre uma e outra.
function FichaVoando({ de, para, atrasoMs, onChegou, hue }) {
    // `posBase` é só a trajetória NO CHÃO (interpolação linear de origem a
    // destino, sem o "pulo") — usada pra sombra, que não deve subir junto
    // com a ficha, só encolher/apagar enquanto ela sobe. `alturaExtra` é o
    // deslocamento vertical do pulo em si, somado só na ficha.
    const [posBase, setPosBase] = useState(de);
    const [alturaExtra, setAlturaExtra] = useState(0);
    const [escala, setEscala] = useState(1);
    const [rotY, setRotY] = useState(0);
    const [pousada, setPousada] = useState(false);

    const params = useMemo(() => ({
        forcaSubida: FICHA_FORCA_SUBIDA_MIN + Math.random() * (FICHA_FORCA_SUBIDA_MAX - FICHA_FORCA_SUBIDA_MIN),
        escalaPico: ESCALA_FICHA_PICO_MIN + Math.random() * (ESCALA_FICHA_PICO_MAX - ESCALA_FICHA_PICO_MIN),
        // Arredondado pro múltiplo de 0.5 mais próximo (meia-volta) — ver
        // comentário da função inteira.
        voltas: Math.round((FICHA_VOLTAS_MIN + Math.random() * (FICHA_VOLTAS_MAX - FICHA_VOLTAS_MIN)) * 2) / 2,
        duracaoMs: FICHA_DURACAO_MIN_MS + Math.random() * (FICHA_DURACAO_MAX_MS - FICHA_DURACAO_MIN_MS),
        desvioLateral: (Math.random() * 2 - 1) * FICHA_DESVIO_LATERAL_PX,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sorteia uma vez só, na criação desta ficha (mesmo espírito de chapeuImpacto em Fantasminha.jsx)
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
                // Pousou: liga a transition bouncy (ver .mesa-exp-ficha-
                // pousada) mudando só a escala pra ESCALA_FICHA_CANTO — x/y
                // já estão exatos em `para` (interpolação chegou em t=1) e
                // o rotY já para num múltiplo de 180°, nenhum dos dois
                // precisa de transition, só a escala "assentando".
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

    // Sombra: mesma base (posBase, sem o pulo) — encolhe/esmaece conforme
    // `alturaExtra` cresce (ficha mais alta = sombra menor/mais fraca),
    // dá a sensação de profundidade sem precisar de luz/3D de verdade.
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

// Alvo (px/rot/escala) de cada fase da revelação — ver comentário de
// VAZA_REVELACAO_X_FRACAO lá em cima pro que cada fase representa.
// `destino` só importa nas duas últimas fases (é a pilha de fichas de
// quem ganhou); nas duas primeiras a carta ainda tá "no meio da tela".
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
        return { x: destino.x, y: destino.y, rot: VAZA_POUSO_ROT_GRAUS, escala: VAZA_POUSO_ESCALA };
    }
    // 'crescendo' (a fase de nascimento) — qualquer outra coisa cai aqui,
    // não deveria acontecer na prática.
    return {
        x: window.innerWidth * VAZA_REVELACAO_X_FRACAO,
        y: window.innerHeight * VAZA_REVELACAO_Y_FRACAO,
        rot: 0,
        escala: VAZA_REVELACAO_ESCALA,
    };
}

// Duração da TRANSITION CSS pra cada fase — bem diferente uma da outra
// (crescendo é um voo mais longo, impacto é seco/rápido, viajando é
// médio), então não dá pra fixar uma duração só no CSS: vem inline (ver
// JSX) a cada render, sempre a da fase ATUAL.
function duracaoFaseRevelacaoVaza(fase) {
    if (fase === 'impacto') return VAZA_IMPACTO_DURACAO_MS;
    if (fase === 'viajando' || fase === 'pousada') return VAZA_VIAGEM_DURACAO_MS;
    return VAZA_REVELACAO_TRANSICAO_MS;
}

// Carta vencedora da vaza — coreografia de VÁRIAS fases (ver
// calcularEstadoRevelacaoVaza/finalizarVaza), não um "voo" só de A pra B
// como CartaVoando/FichaVoando. Ainda assim reaproveita o MESMO truque
// pro primeiro alvo (nasce em `origem` SEM transition — um quadro depois
// pula pro alvo da fase atual COM transition ligada, senão o navegador
// nunca chega a pintar `origem` e não tem de onde animar); fases
// SEGUINTES não precisam do truque porque o orquestrador (finalizarVaza)
// já espera de verdade (esperar()) entre uma e outra — o navegador teve
// tempo de sobra de pintar o estado anterior. `origem` vem em PIXELS de
// tela (getBoundingClientRect no clique), não % da mesa.
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
        if (fase === primeiraFaseRef.current) return; // já tratado pelo efeito de cima
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

// A mão de quem não somos nós: sempre viradas (nunca se vê a carta do
// outro) num leque centralizado embaixo do fantasminha. `key={i}` é de
// propósito aqui, não descuido — é o que faz uma carta NOVA (índice que
// não existia antes) entrar animada sozinha sem reiniciar a entrada das
// que já estavam ali (ver mesa-exp-mao-carta-entrada/@keyframes no CSS).
function MaoEmLeque({ quantidade }) {
    if (quantidade <= 0) return null;
    const meio = (quantidade - 1) / 2;

    return (
        <div className="mesa-exp-mao-leque">
            {Array.from({ length: quantidade }, (_, i) => {
                const offset = i - meio;
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
                            <Carta virada />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// A SUA mão: cartas de verdade (viradas pra cima, rank+naipe — ver
// cartaAleatoria, placeholder até existir mão de verdade vinda do
// servidor), bem maiores que as dos outros, ancoradas embaixo da TELA
// (não da mesa) e subindo "de fora dela" — ver .mesa-exp-sua-mao no CSS.
// `key={carta.id}` (não índice) porque aqui cada carta tem identidade
// própria (rank/naipe): usar índice reordenaria/reciclaria elementos por
// engano se a mão fosse editada no meio (não é o caso ainda, mas já fica
// certo pra quando for).
function SuaMaoEmLeque({ cartas, idSaindo, onJogar }) {
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
                        onClick={() => onJogar(carta)}
                    >
                        {/* saindo troca a animação de ENTRADA (subir) pela
                            de SAÍDA (descer, ver mesa-exp-sua-carta-descer)
                            — mesma ideia, sentido invertido: "sai da mão da
                            mesma forma que veio". Sem atraso escalonado
                            aqui: é só ESTA carta saindo, não um leque
                            inteiro entrando. */}
                        <div
                            className={`mesa-exp-sua-mao-carta-entrada${saindo ? ' mesa-exp-sua-mao-carta-saindo' : ''}`}
                            style={{ animationDelay: saindo ? '0ms' : `${i * ATRASO_ENTRADA_CARTA_MS}ms` }}
                        >
                            <Carta rank={carta.rank} naipe={carta.naipe} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Galeria SÓ DE REVISÃO — não faz parte da mesa de verdade, é pra ver
// todos os ranks do baralho (RANKS_TESTE, mesma ordem de game/Baralho.js)
// grandes lado a lado e decidir mudanças de design (ver botão "🃏 Ver
// ranks"). Naipe de cada uma cicla entre os 4 só pra também dar pra
// comparar cor/símbolo, não tem significado nenhum.
function GaleriaRanks({ onFechar }) {
    return (
        <div className="mesa-exp-galeria-ranks">
            <button type="button" className="mesa-exp-fechar" onClick={onFechar}>← Voltar</button>
            <div className="mesa-exp-galeria-ranks-grade">
                {RANKS_TESTE.map((rank, i) => (
                    <div key={rank} className="mesa-exp-galeria-ranks-item">
                        <Carta rank={rank} naipe={NAIPES_TESTE[i % NAIPES_TESTE.length]} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// Preview da manilha na legenda da vira (ver rotuloVira/hover mais abaixo)
// — os 4 naipes do mesmo rank em leque, só decorativo ("como uma foto"):
// sem key por identidade nem onClick nenhum, é sempre a MESMA renderização
// pro mesmo `rank`, recalculada a cada hover.
function LequeManilha({ rank }) {
    const meio = (NAIPES_TESTE.length - 1) / 2;
    return (
        <div className="mesa-exp-vira-legenda-leque">
            {NAIPES_TESTE.map((naipe, i) => {
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
                        <Carta rank={rank} naipe={naipe} />
                    </div>
                );
            })}
        </div>
    );
}

export default function MesaExperimento({ onFechar }) {
    // Cabeçalho da sala (item 1 do checklist): o botão de sair troca de
    // texto e a senha só aparece ANTES de iniciar (mesma regra do
    // Partida.jsx de verdade — depois de iniciada a senha nunca mais volta
    // a aparecer, nem num F5/reconexão). Default true porque o resto deste
    // sandbox já mostra a mesa em andamento; o botão de baixo troca pra
    // pré-visualizar o outro estado.
    const [iniciada, setIniciada] = useState(true);
    const [quantidade, setQuantidade] = useState(4);
    const assentos = useMemo(() => calcularAssentos(quantidade), [quantidade]);
    // Cor de cada fantasminha (ver Fantasminha.jsx — antes sorteava isso
    // sozinho por dentro, agora vem daqui) — precisa morar no PAI porque a
    // ficha de aposta dele (ver fantasmaAposta/Ficha.jsx) tem que usar a
    // MESMA cor do corpo. Regenera junto com `assentos` (mesma dependência
    // de `quantidade`), senão o índice 2 de uma mesa de 4 não seria o
    // MESMO fantasminha do índice 2 de uma mesa de 6 depois de mudar.
    const huesPorAssento = useMemo(
        () => Array.from({ length: quantidade }, () => Math.random() * 360),
        [quantidade]
    );
    // Só um contador — subir ele reamostra o chapéu de cada fantasminha
    // (ver `versaoChapeu` em Fantasminha.jsx) sem mexer em mais nada.
    const [versaoChapeu, setVersaoChapeu] = useState(0);
    // Galeria de revisão dos ranks (ver GaleriaRanks) — troca a mesa
    // inteira pela grade enquanto ativa, não sobrepõe.
    const [mostrarGaleria, setMostrarGaleria] = useState(false);

    // Índice (dentro de `assentos`) de quem está recebendo carta agora, ou
    // null quando o baralho está em repouso no centro. É a partir DISSO que
    // ângulo/posição/escala do baralho são calculados a cada render — nunca
    // guardados como estado próprio, pra nunca dessincronizar.
    const [alvoIndex, setAlvoIndex] = useState(null);
    const [distribuindo, setDistribuindo] = useState(false);
    const [cartasVoando, setCartasVoando] = useState([]);
    const proximoIdCarta = useRef(0);

    // Quantas cartas cada assento (que não seja "Você") tem na mão agora —
    // um número por assento (índice bate com `assentos`). Cresce sozinho
    // conforme as cartas voando chegam (ver aoChegarCarta) OU pelo
    // contador de teste abaixo, os dois mexem no mesmo estado.
    const [maos, setMaos] = useState(() => Array(quantidade).fill(0));
    // Qual fantasminha (índice dentro da lista de "não-você", não dentro de
    // `assentos` direto) taca a próxima carta ao clicar "🂠 Fantasma taca"
    // (ver tacarCartaFantasma) — avança um de cada vez, sentido normal.
    const [proximoFantasmaIndex, setProximoFantasmaIndex] = useState(0);
    // Mesma ideia, mas pro botão "💥 Fantasma leva dano" — contador
    // PRÓPRIO, não o mesmo de cima: dano e jogada de carta são ações
    // independentes, não precisam avançar em lockstep um do outro.
    const [proximoDanoIndex, setProximoDanoIndex] = useState(0);
    // Quantas vezes cada assento já apanhou (índice bate com `assentos`) —
    // só a MUDANÇA de valor interessa (ver danoVersao/machucado em
    // Fantasminha.jsx), o número em si não tem significado nenhum.
    const [danoPorAssento, setDanoPorAssento] = useState(() => Array(quantidade).fill(0));
    // Quem virou bot (desconectado, ver 🤖 no jogo de verdade em
    // Partida.jsx/`desconectados`) — booleano por assento, índice bate com
    // `assentos`. Sem servidor aqui, é o botão de debug
    // `alternarBotFantasma` que liga/desliga, ciclando um assento por vez
    // (mesmo espírito de proximoFantasmaIndex/proximoDanoIndex).
    const [botPorAssento, setBotPorAssento] = useState(() => Array(quantidade).fill(false));
    const [proximoBotIndex, setProximoBotIndex] = useState(0);
    // Monitor de peito é um elemento a mais dentro do "bot" (ver `bot`/
    // Fantasminha.jsx) — chave PRÓPRIA (não junto de botPorAssento) pra dar
    // pra comparar visualmente com/sem ele em qualquer fantasminha já
    // marcado como bot, sem precisar alternar o bot em si.
    const [monitorBotAtivo, setMonitorBotAtivo] = useState(true);
    // A SUA mão: array de cartas de verdade (id+rank+naipe, ver
    // cartaAleatoria), não um número — cada uma precisa da própria
    // identidade pra virar face pra cima em SuaMaoEmLeque.
    const [suaMao, setSuaMao] = useState([]);
    const proximoIdSuaCarta = useRef(0);
    // Id da carta da SUA mão que está no meio da animação de saída (ver
    // jogarCarta) — null quando nenhuma está saindo. Só uma de cada vez:
    // trava novo clique enquanto essa não termina.
    const [cartaSaindoId, setCartaSaindoId] = useState(null);
    // Cartas já jogadas, pousadas na mesa (ver aoChegarCarta) — cada uma
    // com posição/rotação/escala final PRÓPRIA (não recalculada a cada
    // render, é onde ela pousou), diferente do baralho ou da sua mão que
    // são leques recalculados toda vez.
    const [cartasNaMesa, setCartasNaMesa] = useState([]);
    // Um <div> de carta-na-mesa por id (callback ref, ver JSX) — é daqui
    // que finalizarVaza lê a posição de VERDADE (getBoundingClientRect) da
    // carta vencedora no instante do clique, pra CartaRevelando nascer
    // exatamente onde ela estava, não recalculada a partir de x/y%.
    const cartaMesaRefs = useRef({});
    // Id da carta na mesa sob o mouse agora, ou null — usado tanto pro
    // contorno amarelo dela quanto pra achar (por `jogador`) qual assento
    // também destacar (ver rotuloAssento mais abaixo, no JSX).
    const [cartaEmHoverId, setCartaEmHoverId] = useState(null);
    // Revelação de fim de vaza (ver finalizarVaza/CartaRevelando) — null
    // enquanto não tem nenhuma rolando. `origem`/`destino` são posições em
    // PX DE TELA capturadas/calculadas no instante do clique, não
    // recalculadas depois (o assento pode até se mexer de mesa em mesa,
    // mas não NO MEIO de uma revelação).
    const [vazaRevelando, setVazaRevelando] = useState(null);
    // Fase atual da coreografia (ver calcularEstadoRevelacaoVaza) — null
    // junto com vazaRevelando null (nenhuma revelação rolando).
    const [faseRevelacaoVaza, setFaseRevelacaoVaza] = useState(null);
    // Só um contador — subir ele (na fase 'impacto', ver finalizarVaza)
    // remonta a onda de choque com `key={choqueVaza}`, mesmo truque de
    // versaoChapeu/danoVersao.
    const [choqueVaza, setChoqueVaza] = useState(0);
    // Cartas que já venceram uma vaza e foram "pro colo" de quem ganhou —
    // { id, assentoIndice, rank, naipe, x, y } por entrada, renderizadas
    // permanentemente ATRÁS da pilha de fichas de aposta dele (z-index
    // menor que o das fichas, ver CSS — não depende de ordem no DOM).
    // Nunca reseta sozinho durante a partida, só quando muda `quantidade`
    // (rodada/mesa nova de verdade).
    const [cartasVazaGanhas, setCartasVazaGanhas] = useState([]);
    // Cartas PERDEDORAS "explodindo" pra fora na fase 'impacto' (ver
    // finalizarVaza) — mapa { [cartaId]: {x,y,rot,escala} } com o alvo já
    // calculado, sobrepõe tanto a posição normal quanto a de melada (ver
    // JSX) enquanto a carta tem uma entrada aqui. Volta a {} assim que elas
    // saem de cartasNaMesa de vez.
    const [cartasExplodindo, setCartasExplodindo] = useState({});
    // Só pra pré-visualizar o leque com 0-4 cartas sem rodar a distribuição
    // inteira — muda a mão de todo mundo (menos "Você") de uma vez.
    const [cartasTeste, setCartasTeste] = useState(0);
    // Vira atual: { id, rank, naipe } ou null (nenhuma virada ainda). `id`
    // é só pra virar `key` do wrapper (ver JSX) — remontar em cima de um
    // `id` novo reinicia a coreografia do zero mesmo clicando de novo
    // antes da anterior "assentar", mesmo truque de key={danoVersao} em
    // Fantasminha.jsx.
    const [vira, setVira] = useState(null);
    const proximoIdVira = useRef(0);
    // Fase da coreografia da vira (ver calcularEstadoVira/tocarVira): null
    // = nenhuma vira ainda OU baralho parado sem nada acontecendo;
    // 'subindo' -> 'indo' -> 'voltando' -> 'pousada' (fica nesse último
    // valor pro resto da rodada, não volta a null sozinho).
    const [faseVira, setFaseVira] = useState(null);
    // Baralho "elevado" (escala ENTREGANDO) enquanto essa coreografia toda
    // roda — ver escalaBaralho mais abaixo: some do alvoIndex normal
    // porque aqui o baralho NÃO se desloca pra assento nenhum, só cresce.
    const [baralhoEmVira, setBaralhoEmVira] = useState(false);
    // Hover da vira: só um boolean (não um id como cartaEmHoverId) porque
    // só existe UMA vira na mesa, não uma lista.
    const [viraEmHover, setViraEmHover] = useState(false);

    // Chat (ver botão circular no canto inferior esquerdo, mais abaixo no
    // JSX). O painel (mensagens prontas + campo livre) só aparece com o
    // botão CLICADO (não é hover — pediu pra ficar assim de propósito,
    // senão fechava sozinho ao tirar o mouse no meio de digitar).
    const [chatAberto, setChatAberto] = useState(true);
    const [chatClicado, setChatClicado] = useState(false);
    const [textoChat, setTextoChat] = useState('');
    // Cosmético só (mesmo espírito do comentário de CHAT_COOLDOWN_MS no
    // próprio módulo — quem trava de verdade é o servidor): desabilita os
    // botões de envio por CHAT_COOLDOWN_MS depois de cada mensagem.
    const [chatEmCooldown, setChatEmCooldown] = useState(false);
    // Histórico (módulo à direita do painel, ver JSX) — cada mensagem já
    // enviada (pronta ou livre, sua ou de fantasma) + avisos de sistema de
    // entrar/sair (ver aumentarJogadores/diminuirJogadores). Mesmo shape do
    // chatMensagem de verdade: { jogador, tipo: 'restrita'|'aberta'|
    // 'sistema', texto } — só falta o `id`, que a UI não usa pra nada.
    const [mensagensChat, setMensagensChat] = useState([]);
    const chatHistoricoRef = useRef(null);
    // Balõezinhos de fala ativos agora — um por mensagem enviada, cada um
    // com o PRÓPRIO timer de sumir (ver mostrarBolhaFala), não uma fila:
    // várias podem estar na tela ao mesmo tempo, uma por assento ou até
    // empilhadas no mesmo (a de cima cobre a de baixo, sem tratamento
    // especial — cenário raro no sandbox).
    const [bolhasFala, setBolhasFala] = useState([]);
    const proximoIdBolha = useRef(0);
    // "Fantasma fala" (botão de debug, mesmo espírito de
    // proximoFantasmaIndex/proximoDanoIndex): avança um assento (que não
    // seja "Você") de cada vez, sentido normal, sorteando uma das 4
    // mensagens prontas.
    const [proximoFantasmaChatIndex, setProximoFantasmaChatIndex] = useState(0);

    // Aposta (ver botão "Apostar" lá embaixo, popup + fichas no JSX).
    // `apostaSuaVez` é o botão de debug simulando `turnoAposta` chegar pra
    // você (ver PROTOCOLO.md) — sem ele o botão de apostar nem aparece.
    const [apostaSuaVez, setApostaSuaVez] = useState(true);
    const [apostaPopupAberto, setApostaPopupAberto] = useState(false);
    // Valor sendo ajustado DENTRO do popup (campo + setinhas + pilha de
    // fichas "flutuante") — só vira `apostaConfirmada` de verdade quando
    // aperta o botão "Apostar" lá dentro (ver confirmarAposta).
    const [apostaValorPopup, setApostaValorPopup] = useState(0);
    // Valor já confirmado nesta "rodada" — null enquanto não apostou.
    // Controla tanto o texto do botão quanto se a pilha do canto existe.
    const [apostaConfirmada, setApostaConfirmada] = useState(null);
    // Fichas em voo agora (uma por unidade da aposta confirmada, ver
    // confirmarAposta) — cada uma some daqui e vira uma entrada em
    // `fichasNoCanto` assim que FichaVoando chama aoChegarFicha (mesmo
    // padrão de cartasVoando/cartasNaMesa: voando enquanto anima, estática
    // depois de pousar, nunca as duas listas ao mesmo tempo pro mesmo id).
    const [fichasVoando, setFichasVoando] = useState([]);
    const [fichasNoCanto, setFichasNoCanto] = useState([]);
    const proximoIdFicha = useRef(0);
    // Ancorada onde a pilha "flutuante" aparece DENTRO do popup — é daqui
    // que a gente lê a posição de origem (getBoundingClientRect) no
    // instante de confirmar, antes do popup fechar e o ref sumir do DOM.
    const popupFichasRef = useRef(null);
    // Ancorada no canto de destino da pilha — existe na tela o tempo
    // todo (mesmo com 0 fichas), só pra sempre ter uma posição de
    // destino pronta pra ler.
    const cantoFichasRef = useRef(null);
    // Um <div> de assento por índice — callback ref (ver JSX), preenchido
    // conforme cada assento monta. É daqui que fantasmaAposta lê a
    // posição de VERDADE (getBoundingClientRect) do fantasminha que vai
    // apostar, já que os assentos são posicionados em % (relativos à mesa
    // oval), não em px de tela como o popup/canto da SUA aposta.
    const assentoRefs = useRef([]);

    // Aposta dos fantasminhas (não a sua) — valor por assento (índice bate
    // com `assentos`), null enquanto não apostou. Diferente da sua: aqui
    // não tem popup, o "arremesso" sai do PRÓPRIO fantasminha (local, uma
    // saltada curta pro lado dele) — ver fantasmaAposta. As fichas ficam
    // empilhadas na VERTICAL (não em leque) e sempre visíveis; só o texto
    // "Aposta: N" é que só aparece com o mouse em cima do fantasminha (ver
    // assentoEmHoverIndex mais abaixo).
    const [apostaPorAssento, setApostaPorAssento] = useState(() => Array(quantidade).fill(null));
    const [proximoApostaFantasmaIndex, setProximoApostaFantasmaIndex] = useState(0);
    const [fichasFantasmaVoando, setFichasFantasmaVoando] = useState([]);
    const [fichasFantasmaNoCanto, setFichasFantasmaNoCanto] = useState([]);
    // Assento (índice) com o mouse em cima agora, ou null — reverso de
    // cartaEmHoverId: aquele já destaca o ASSENTO de quem jogou a carta em
    // hover; este destaca a CARTA de quem o assento em hover jogou, além
    // do próprio fantasminha e da legenda da aposta dele (ver JSX).
    const [assentoEmHoverIndex, setAssentoEmHoverIndex] = useState(null);

    // De quem é a vez agora (índice em `assentos`, ou null = ninguém) —
    // diferente de assentoEmHoverIndex: não depende do mouse, é um estado
    // de verdade (no jogo real viria de `turnoJogador`/`turnoAposta`, ver
    // PROTOCOLO.md). Só um por vez — avançarTurno troca, não acumula.
    const [turnoAssentoIndex, setTurnoAssentoIndex] = useState(null);
    const [proximoTurnoIndex, setProximoTurnoIndex] = useState(0);

    // Mudar a quantidade de jogadores muda os assentos (e o que cada
    // índice significa) — mão de todo mundo (incluindo a sua) e a mesa
    // zeram junto, senão sobrariam contagens/cartas penduradas em assentos
    // que nem existem mais.
    useEffect(() => {
        setMaos(Array(quantidade).fill(0));
        setSuaMao([]);
        setCartaSaindoId(null);
        setCartasNaMesa([]);
        setCartaEmHoverId(null);
        setCartasTeste(0);
        setProximoFantasmaIndex(0);
        setProximoDanoIndex(0);
        setDanoPorAssento(Array(quantidade).fill(0));
        setBotPorAssento(Array(quantidade).fill(false));
        setProximoBotIndex(0);
        setVira(null);
        setFaseVira(null);
        setBaralhoEmVira(false);
        setViraEmHover(false);
        setBolhasFala([]);
        setProximoFantasmaChatIndex(0);
        setApostaPopupAberto(false);
        setApostaConfirmada(null);
        setFichasVoando([]);
        setFichasNoCanto([]);
        setApostaPorAssento(Array(quantidade).fill(null));
        setProximoApostaFantasmaIndex(0);
        setFichasFantasmaVoando([]);
        setFichasFantasmaNoCanto([]);
        setAssentoEmHoverIndex(null);
        setTurnoAssentoIndex(null);
        setProximoTurnoIndex(0);
        setVazaRevelando(null);
        setFaseRevelacaoVaza(null);
        setCartasVazaGanhas([]);
        setCartasExplodindo({});
    }, [quantidade]);

    // Rola o histórico pro fim sempre que chega mensagem nova (mesma ideia
    // do feedChatRef em Partida.jsx). Só existe enquanto o painel está
    // montado (chatClicado), então a dependência do elemento em si já cobre
    // "painel acabou de abrir com mensagens antigas" também.
    useEffect(() => {
        const el = chatHistoricoRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [mensagensChat, chatClicado]);

    function ajustarCartasTeste(novoValor) {
        const valor = Math.max(MIN_CARTAS_TESTE, Math.min(MAX_CARTAS_TESTE, novoValor));
        setCartasTeste(valor);
        setMaos((atual) => atual.map((_, i) => (assentos[i]?.eVoce ? 0 : valor)));
    }

    // A coreografia em si (ver constantes VIRA_*/calcularEstadoVira lá em
    // cima) — função PRÓPRIA, não inline em virarCarta/distribuirCartas,
    // porque as duas precisam disparar a MESMA sequência (uma na resposta
    // ao clique do botão, a outra encadeada no fim de dar as cartas),
    // cada uma só cuidando de quando ligar/desligar `distribuindo` ao
    // redor dela.
    async function tocarVira() {
        setBaralhoEmVira(true);
        // Mesma folga que o resto do baralho já usa entre girar/deslocar
        // e soltar a primeira carta (FOLGA_APOS_BARALHO_MS) — dá tempo da
        // transition de escalaBaralho (DURACAO_DECK_MS) realmente
        // terminar antes de "puxar" a carta do topo.
        await esperar(DURACAO_DECK_MS + FOLGA_APOS_BARALHO_MS);
        setFaseVira('indo');
        await esperar(DURACAO_VIRA_IDA_MS);
        setFaseVira('voltando');
        await esperar(DURACAO_VIRA_VOLTA_MS);
        setFaseVira('pousada');
        // Baralho desce de volta pro repouso — como ele nunca saiu do
        // centro e a vira pousou NO MESMO ponto (girada, ver
        // ROTACAO_VIRA_POUSADA_GRAUS), o z-index (ver CSS) faz ele
        // "pousar" literalmente por cima dela sozinho.
        setBaralhoEmVira(false);
        await esperar(DURACAO_DECK_MS);
    }

    // Botão "🂡 Virar carta" — só faz sentido com o baralho parado no
    // centro (ver `alvo`/distribuindo abaixo: alvoIndex só deixa de ser
    // null DURANTE distribuirCartas), mesma trava que os outros botões de
    // teste já usam. `distribuindo` cobre a coreografia INTEIRA (não só a
    // "ida"), pra nenhum outro botão mexer no baralho/vira no meio dela.
    async function virarCarta() {
        if (distribuindo) return;
        setDistribuindo(true);
        setViraEmHover(false);
        setVira({ id: ++proximoIdVira.current, ...cartaAleatoria() });
        setFaseVira('subindo');
        await tocarVira();
        setDistribuindo(false);
    }

    const alvo = alvoIndex != null ? assentos[alvoIndex] : null;
    // Ângulo do centro da mesa até o assento alvo, +90° porque o baralho
    // "olha pra cima" (0°) por padrão — sem o ajuste, ele apontaria 90°
    // fora do lugar certo. `baralhoEmVira` não mexe aqui (o baralho não se
    // desloca nem gira pra "virar a vira", só cresce — ver escalaBaralho).
    const anguloBaralho = alvo
        ? (Math.atan2(alvo.y - 50, alvo.x - 50) * 180) / Math.PI + 90
        : 0;
    const baralhoX = 50 + (alvo ? (alvo.x - 50) * ALCANCE_BARALHO : 0);
    const baralhoY = 50 + (alvo ? (alvo.y - 50) * ALCANCE_BARALHO : 0);
    // "Sobe" tanto pra entregar carta (alvo) quanto pra virar a vira
    // (baralhoEmVira) — mesma escala ENTREGANDO nos dois casos, só o que
    // dispara é diferente.
    const escalaBaralho = (alvo || baralhoEmVira) ? ESCALA_BARALHO_ENTREGANDO : ESCALA_BARALHO_REPOUSO;
    const estadoVira = vira ? calcularEstadoVira(faseVira) : null;
    // Duração da transition de left/top/rotateY da vira — cada perna da
    // viagem (ida/volta) tem a SUA própria (ver DURACAO_VIRA_IDA_MS/
    // DURACAO_VIRA_VOLTA_MS), as demais fases (parada) usam qualquer uma,
    // não muda nada em pé quieto.
    const duracaoTransicaoVira = faseVira === 'indo' ? DURACAO_VIRA_IDA_MS : DURACAO_VIRA_VOLTA_MS;
    // A carta na mesa sob o mouse agora (ou undefined) — de onde vem o
    // "{jogador}" comparado no rótulo de cada assento (ver rotuloAssento no
    // JSX) pra saber quem também ganha o contorno amarelo.
    const cartaEmHover = cartasNaMesa.find((c) => c.id === cartaEmHoverId);

    // Quem está "ganhando" agora na mesa (contorno verde) e quais cartas
    // estão "meladas"/anuladas por repetição (contorno preto) — mesmo
    // critério de game/Mesa.js (recalcularMesa/saoIdenticas/compararForca,
    // ver saoIdenticasMesa/compararForcaMesa lá em cima). useMemo (não
    // estado próprio) recalcula TODA VEZ que cartasNaMesa muda — cada
    // carta nova entra na comparação assim que pousa de vez (ver
    // aoChegarCarta), nunca fica dessincronizado. A vira em si NUNCA entra
    // aqui — só cartasNaMesa, que só tem cartas jogadas de verdade.
    const analiseMesa = useMemo(() => {
        const viraValor = vira ? RANKS_TESTE.indexOf(rankDaManilha(vira.rank)) : -1;
        const cartas = cartasNaMesa.map((c) => ({
            id: c.id,
            valorInt: RANKS_TESTE.indexOf(c.rank),
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

        // Agrupa as meladas por RANK (valorInt) — dentro de um grupo, todas
        // já são idênticas entre si por definição (saoIdenticasMesa exige
        // valorInt igual como condição base, manilha ou não), então basta
        // isso pra separar visualmente "o par de 6" do "par de Rei" quando
        // os dois estão melados ao mesmo tempo (ver
        // MELADA_GRUPO_ESPACAMENTO_PX no JSX). Ordem = ordem de CHEGADA na
        // mesa (primeira carta de cada grupo a pousar), não ordem
        // alfabética/numérica de rank.
        const porValor = new Map();
        for (const carta of cartas) {
            if (!idsMeladas.has(carta.id)) continue;
            if (!porValor.has(carta.valorInt)) porValor.set(carta.valorInt, []);
            porValor.get(carta.valorInt).push(carta.id);
        }
        const gruposMeladas = [...porValor.values()];

        return { idVencedora, idsMeladas, gruposMeladas };
    }, [cartasNaMesa, vira]);

    // Onde uma carta melada cai dentro do agrupamento por rank (ver
    // gruposMeladas acima) — `grupo` escolhe o rank (desloca mais pro
    // lado), `indice` escolhe a posição DENTRO desse rank (escalona
    // diagonal, mesmo espírito de antes).
    function localizarGrupoMelada(id) {
        for (let g = 0; g < analiseMesa.gruposMeladas.length; g++) {
            const indice = analiseMesa.gruposMeladas[g].indexOf(id);
            if (indice !== -1) return { grupo: g, indice };
        }
        return { grupo: 0, indice: 0 };
    }

    // Quando uma CartaVoando termina o trajeto: sempre some da lista de
    // "voando", e o que acontece depois depende do `tipo` dela (ver
    // distribuirCartas/jogarCarta, que são quem preenche esse campo):
    //   - "dar": conta mais uma na mão em miniatura do assento (os outros
    //     jogadores), ou nasce uma carta de verdade subindo na SUA mão
    //     (ver SuaMaoEmLeque) se for o assento 0 — é isso que faz cada
    //     leque crescer uma carta de cada vez, no ritmo de chegada.
    //   - "jogar": a carta pousa DE VERDADE na mesa (ver cartasNaMesa) —
    //     troca de "voando" pra "parada ali", não desaparece.
    function aoChegarCarta(voo) {
        setCartasVoando((atuais) => atuais.filter((c) => c.id !== voo.id));
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
            setSuaMao((atual) => [...atual, { id: ++proximoIdSuaCarta.current, ...cartaAleatoria() }]);
        } else {
            setMaos((atual) => atual.map((qtd, i) => (i === voo.seatIndex ? qtd + 1 : qtd)));
        }
    }

    // Clicar numa carta da SUA mão pra jogar: ela sai da mão do MESMO jeito
    // que chegou (a animação de entrada, ao contrário — ver
    // mesa-exp-sua-carta-descer no CSS), some da mão, e uma versão pequena
    // nasce voando (mesma CartaVoando de dar carta, só com ângulo/escala
    // diferentes — ver constantes da "jogada" lá em cima) até pousar na
    // mesa, virada pra cima.
    function jogarCarta(cartaDaMao) {
        if (distribuindo || cartaSaindoId != null) return;
        setCartaSaindoId(cartaDaMao.id);
        setTimeout(() => {
            setSuaMao((atual) => atual.filter((c) => c.id !== cartaDaMao.id));
            setCartaSaindoId(null);

            // Mesmo espírito do giroInicial/rotFinal de public/_intro/index.html
            // (carta.jogar): começa girada bem mais que o repouso final e
            // desacelera até ele — só que aqui é a transition CSS que
            // interpola do "anguloInicial" pro "anguloFinal", não um loop
            // de rAF calculando frame a frame.
            const giroInicial = 360 + Math.random() * 360;
            const rotFinal = Math.random() * 360;
            const id = ++proximoIdCarta.current;
            setCartasVoando((atuais) => [
                ...atuais,
                {
                    id,
                    tipo: 'jogar',
                    jogador: 'Você',
                    de: assentos[0],
                    para: calcularAlvoJogada(assentos[0]),
                    anguloInicial: rotFinal + giroInicial,
                    anguloFinal: rotFinal,
                    escalaInicial: ESCALA_CARTA_JOGADA_INICIAL,
                    escalaFinal: ESCALA_CARTA_JOGADA_FINAL,
                    carta: { rank: cartaDaMao.rank, naipe: cartaDaMao.naipe },
                },
            ]);
        }, DURACAO_SAIDA_MAO_MS);
    }

    // Botão "Fantasma taca" — não depende de clicar numa carta específica
    // (os fantasminhas não têm cartas com identidade própria, só uma
    // contagem em `maos`): cada clique tira uma carta aleatória da mão do
    // PRÓXIMO fantasminha (`proximoFantasmaIndex`, sentido normal do
    // array, ida em ida) e taca ela na mesa — mesmo tipo:'jogar' de
    // jogarCarta, reaproveitando toda a lógica de pouso/giro/aoChegarCarta.
    function tacarCartaFantasma() {
        if (distribuindo) return;
        const outros = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((assento) => !assento.eVoce);
        if (outros.length === 0) return;

        const assento = outros[proximoFantasmaIndex % outros.length];
        setProximoFantasmaIndex((v) => (v + 1) % outros.length);
        setMaos((atual) => atual.map((qtd, i) => (i === assento.indice ? Math.max(0, qtd - 1) : qtd)));

        const giroInicial = 360 + Math.random() * 360;
        const rotFinal = Math.random() * 360;
        const id = ++proximoIdCarta.current;
        setCartasVoando((atuais) => [
            ...atuais,
            {
                id,
                tipo: 'jogar',
                jogador: `Player ${assento.indice}`,
                de: assento,
                para: calcularAlvoJogada(assento),
                anguloInicial: rotFinal + giroInicial,
                anguloFinal: rotFinal,
                escalaInicial: ESCALA_CARTA_JOGADA_INICIAL,
                escalaFinal: ESCALA_CARTA_JOGADA_FINAL,
                carta: cartaAleatoria(),
            },
        ]);
    }

    // Botão "Fantasma leva dano" — mesma ideia de ciclar pelos assentos que
    // não são "Você" (ver tacarCartaFantasma), só que sobe o contador de
    // `danoPorAssento` daquele assento em vez de mexer em carta nenhuma —
    // Fantasminha.jsx reage sozinho a essa mudança (ver `danoVersao` lá).
    function infligirDanoFantasma() {
        const outros = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((assento) => !assento.eVoce);
        if (outros.length === 0) return;

        const assento = outros[proximoDanoIndex % outros.length];
        setProximoDanoIndex((v) => (v + 1) % outros.length);
        setDanoPorAssento((atual) => atual.map((v, i) => (i === assento.indice ? v + 1 : v)));
    }

    // Botão "Alternar bot" — mesmo ciclo de assentos, só que LIGA/DESLIGA
    // (não incrementa) o `botPorAssento` daquele assento: dá pra ver os
    // dois estados no mesmo jogador clicando de novo depois de dar a volta
    // completa nos outros. No jogo de verdade quem alterna é o servidor
    // (ver `desconectados`/jogadorDesistiu/jogadorReconectou em
    // Partida.jsx) — aqui não tem conexão nenhuma pra detectar de verdade.
    function alternarBotFantasma() {
        const outros = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((assento) => !assento.eVoce);
        if (outros.length === 0) return;

        const assento = outros[proximoBotIndex % outros.length];
        setProximoBotIndex((v) => (v + 1) % outros.length);
        setBotPorAssento((atual) => atual.map((v, i) => (i === assento.indice ? !v : v)));
    }

    // Balão de fala em cima de um assento (índice em `assentos`) — some
    // sozinho depois de DURACAO_BOLHA_MS, com o PRÓPRIO id/timer (mesmo
    // truque de cartasVoando/danoPorAssento: várias podem coexistir).
    function mostrarBolhaFala(assentoIndex, texto) {
        const id = ++proximoIdBolha.current;
        setBolhasFala((atuais) => [...atuais, { id, assentoIndex, texto }]);
        setTimeout(() => {
            setBolhasFala((atuais) => atuais.filter((b) => b.id !== id));
        }, DURACAO_BOLHA_MS);
    }

    // Registra uma linha no histórico (ver mensagensChat) — mesmo shape do
    // chatMensagem de verdade, chamado tanto por mensagem de jogador
    // (restrita/aberta) quanto por aviso de sistema (entrar/sair).
    function registrarMensagem(jogador, tipo, texto) {
        setMensagensChat((atual) => [...atual.slice(-99), { jogador, tipo, texto }]);
    }

    // Caminho único de envio (ver enviarChat/enviarChatPronta/
    // enviarChatLivre no Partida.jsx de verdade) — aqui não tem servidor pra
    // validar cooldown, então o botão só trava sozinho por
    // CHAT_COOLDOWN_MS, puramente cosmético, igual lá.
    function enviarMensagem(texto, tipo) {
        if (chatEmCooldown || !texto.trim()) return;
        mostrarBolhaFala(0, texto); // índice 0 = "Você", ver calcularAssentos
        registrarMensagem('Você', tipo, texto);
        setChatEmCooldown(true);
        setTimeout(() => setChatEmCooldown(false), CHAT_COOLDOWN_MS);
    }

    function enviarMensagemPronta(id) {
        const mensagem = MENSAGENS_CHAT.find((m) => m.id === id);
        if (mensagem) enviarMensagem(mensagem.texto, 'restrita');
    }

    function enviarMensagemLivre(evento) {
        evento.preventDefault();
        const texto = textoChat.trim();
        if (!texto) return;
        enviarMensagem(texto, 'aberta');
        setTextoChat('');
    }

    // Botão de debug "Fantasma fala" — mesmo ciclo de assentos que
    // tacarCartaFantasma/infligirDanoFantasma, sorteando uma das 4
    // mensagens prontas pra pré-visualizar o balão em quem não é "Você".
    // Sem cooldown próprio (independente do seu, mesmo espírito dos outros
    // botões de debug de fantasma).
    function fantasmaFala() {
        const outros = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((assento) => !assento.eVoce);
        if (outros.length === 0) return;

        const assento = outros[proximoFantasmaChatIndex % outros.length];
        setProximoFantasmaChatIndex((v) => (v + 1) % outros.length);
        const mensagem = MENSAGENS_CHAT[Math.floor(Math.random() * MENSAGENS_CHAT.length)];
        mostrarBolhaFala(assento.indice, mensagem.texto);
        registrarMensagem(`Player ${assento.indice}`, 'restrita', mensagem.texto);
    }

    // +/- jogadores (botão de teste, ver .mesa-exp-controle no JSX) também
    // loga entrar/sair no histórico — igual ao "Fulano entrou/saiu na sala"
    // de sistema que o socketServer manda de verdade (ver avisoSistema em
    // conexao/socketServer.js), só que aqui disparado pelo próprio teste de
    // quantidade em vez de um jogador real conectando. O jogador novo/
    // removido é sempre o de ÍNDICE MAIS ALTO (assento 0 é "Você", nunca
    // muda) — `q`/`novo` já são os valores ANTES/DEPOIS do clique.
    function aumentarJogadores() {
        setQuantidade((q) => {
            const novo = Math.min(MAX_JOGADORES, q + 1);
            if (novo !== q) registrarMensagem(`Player ${q}`, 'sistema', 'entrou na sala');
            return novo;
        });
    }

    function diminuirJogadores() {
        setQuantidade((q) => {
            const novo = Math.max(MIN_JOGADORES, q - 1);
            if (novo !== q) registrarMensagem(`Player ${novo}`, 'sistema', 'saiu da sala');
            return novo;
        });
    }

    // Abre o popup sempre zerado (0 fichas) — o Henrique digita/ajusta a
    // partir daí, nunca reaproveita o valor de uma aposta anterior.
    function abrirPopupAposta() {
        setApostaValorPopup(0);
        setApostaPopupAberto(true);
    }

    function ajustarApostaValorPopup(novoValor) {
        setApostaValorPopup(Math.max(0, Math.min(APOSTA_VALOR_MAX, novoValor)));
    }

    // Lê a posição de origem (pilha flutuante do popup) e destino (canto)
    // ANTES de fechar o popup — depois de setApostaPopupAberto(false) o
    // popup some do DOM e popupFichasRef.current vira null. Uma ficha por
    // unidade do valor confirmado, cada uma com atraso crescente (cascata,
    // ver FICHA_ATRASO_ENTRE_MS) — todas nascem no MESMO ponto de origem
    // (o centro da pilha do popup), é o próprio arremesso que espalha elas.
    function confirmarAposta() {
        const origemRect = popupFichasRef.current?.getBoundingClientRect();
        const destinoRect = cantoFichasRef.current?.getBoundingClientRect();
        if (!origemRect || !destinoRect) return;

        const de = { x: origemRect.left + origemRect.width / 2, y: origemRect.top + origemRect.height / 2 };
        const para = { x: destinoRect.left + destinoRect.width / 2, y: destinoRect.top + destinoRect.height / 2 };
        const valor = apostaValorPopup;

        // Leque horizontal centralizado no canto: índice do MEIO fica bem
        // em cima do alvo, os outros se espalham pra esquerda/direita dele
        // (não empilhados um em cima do outro) — mesma altura pra todos.
        const meio = (valor - 1) / 2;

        setApostaPopupAberto(false);
        setApostaConfirmada(valor);
        setFichasVoando(
            Array.from({ length: valor }, (_, i) => ({
                id: ++proximoIdFicha.current,
                indice: i,
                de,
                para: { x: para.x + (i - meio) * FICHA_LEQUE_ESPACAMENTO_PX, y: para.y },
                atrasoMs: i * FICHA_ATRASO_ENTRE_MS,
            }))
        );
    }

    // Mesmo padrão de aoChegarCarta: recebe o objeto INTEIRO (não só o id)
    // direto do closure do .map() que renderizou esta ficha — evita
    // precisar procurar ela de volta dentro do estado.
    function aoChegarFicha(ficha) {
        setFichasVoando((atuais) => atuais.filter((f) => f.id !== ficha.id));
        setFichasNoCanto((atual) => [...atual, ficha]);
    }

    // Só um botão de debug (ver JSX) — limpa a pilha do canto e o valor
    // confirmado pra poder repetir a demonstração sem precisar mudar a
    // quantidade de jogadores (que reseta um monte de outra coisa junto).
    function resetarAposta() {
        setApostaPopupAberto(false);
        setApostaConfirmada(null);
        setFichasVoando([]);
        setFichasNoCanto([]);
        setApostaPorAssento(Array(quantidade).fill(null));
        setFichasFantasmaVoando([]);
        setFichasFantasmaNoCanto([]);
    }

    // Onde a PILHA de fichas de aposta de um assento fica (ou ficaria,
    // mesmo sem ter apostado ainda) — usado tanto por fantasmaAposta
    // (pra saber pra onde jogar a ficha) quanto por finalizarVaza (pra
    // saber pra onde mandar a carta vencedora "se esconder embaixo de uma
    // ficha", ver comentário lá). "Você" usa o mesmo canto fixo do seu
    // leque (cantoFichasRef); os fantasminhas usam a borda do PRÓPRIO
    // assento (ver assentoRefs) + o mesmo deslocamento de lado que
    // fantasmaAposta já usava.
    function calcularAncoraFichaAssento(assentoIndice) {
        const assento = assentos[assentoIndice];
        if (!assento) return null;
        if (assento.eVoce) {
            const rect = cantoFichasRef.current?.getBoundingClientRect();
            return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
        }
        const el = assentoRefs.current[assentoIndice];
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const lado = assento.x < 50 ? -1 : 1;
        return {
            x: (lado === -1 ? rect.left : rect.right) - lado * FICHA_FANTASMA_OFFSET_LADO_PX,
            y: rect.top + rect.height / 2,
        };
    }

    // Botão de debug "Fantasma aposta" — mesmo ciclo de assentos que os
    // outros botões de fantasma, só que aqui o "arremesso" nasce e pousa
    // PERTO do próprio assento (sem popup: quem tem popup é só a SUA
    // aposta, ver confirmarAposta). Lê a posição de verdade do assento em
    // tela via assentoRefs — os assentos são posicionados em % (relativos
    // à mesa), não dá pra calcular em px sem o DOM de verdade.
    function fantasmaAposta() {
        const outros = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((assento) => !assento.eVoce);
        if (outros.length === 0) return;

        const assento = outros[proximoApostaFantasmaIndex % outros.length];
        setProximoApostaFantasmaIndex((v) => (v + 1) % outros.length);

        const el = assentoRefs.current[assento.indice];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const de = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const ancora = calcularAncoraFichaAssento(assento.indice);
        if (!ancora) return;
        const baseX = ancora.x;
        const baseY = ancora.y;

        // Entre 1 e APOSTA_VALOR_MAX de propósito (não inclui 0) — um
        // fantasma apostando 0 não voa ficha nenhuma, não dá pra ver o
        // efeito. No jogo de verdade 0 é uma aposta válida igual.
        const valor = 1 + Math.floor(Math.random() * APOSTA_VALOR_MAX);
        // Mesma cor do CORPO deste fantasminha (ver huesPorAssento) — é o
        // que faz a ficha "combinar com quem apostou".
        const hue = huesPorAssento[assento.indice];
        setApostaPorAssento((atual) => atual.map((v, i) => (i === assento.indice ? valor : v)));
        setFichasFantasmaVoando((atuais) => [
            ...atuais,
            ...Array.from({ length: valor }, (_, i) => ({
                id: ++proximoIdFicha.current,
                de,
                // Empilha pra CIMA (índice maior = mais alto), ver
                // FICHA_EMPILHA_FANTASMA_PX.
                para: { x: baseX, y: baseY - i * FICHA_EMPILHA_FANTASMA_PX },
                atrasoMs: i * FICHA_ATRASO_ENTRE_MS,
                hue,
            })),
        ]);
    }

    function aoChegarFichaFantasma(ficha) {
        setFichasFantasmaVoando((atuais) => atuais.filter((f) => f.id !== ficha.id));
        setFichasFantasmaNoCanto((atual) => [...atual, ficha]);
    }

    // Botão de debug "Avançar vez" — mesmo ciclo de assentos que os outros
    // botões de fantasma, só que TROCA a vez em vez de acumular (só um
    // fantasminha por vez tem o contorno azul/legenda "Vez de", nunca
    // mais de um ao mesmo tempo — mesmo espírito de turnoJogador no jogo
    // de verdade, ver PROTOCOLO.md).
    function avancarTurno() {
        const outros = assentos
            .map((assento, indice) => ({ ...assento, indice }))
            .filter((assento) => !assento.eVoce);
        if (outros.length === 0) return;

        const assento = outros[proximoTurnoIndex % outros.length];
        setProximoTurnoIndex((v) => (v + 1) % outros.length);
        setTurnoAssentoIndex(assento.indice);
    }

    // Botão de debug "Finalizar vaza" — no jogo de verdade quem manda essa
    // notícia é o servidor (`vazaFinalizada`, já sabendo quem ganhou); aqui
    // só lê a MESMA carta que analiseMesa já aponta como mais forte agora
    // (idVencedora) e dispara a revelação. Se a vaza inteira melou (sem
    // vencedora) ou a mesa tá vazia, não tem o que revelar.
    async function finalizarVaza() {
        if (vazaRevelando) return;
        const vencedora = cartasNaMesa.find((c) => c.id === analiseMesa.idVencedora);
        if (!vencedora) return;

        const el = cartaMesaRefs.current[vencedora.id];
        if (!el) return;
        const rect = el.getBoundingClientRect();

        const assentoIndice = vencedora.jogador === 'Você' ? 0 : Number(vencedora.jogador.replace('Player ', ''));
        const destino = calcularAncoraFichaAssento(assentoIndice);
        if (!destino) return;

        const origem = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            rot: vencedora.rot,
            escala: vencedora.escala,
        };

        setVazaRevelando({ cartaId: vencedora.id, jogador: vencedora.jogador, assentoIndice, rank: vencedora.rank, naipe: vencedora.naipe, origem, destino });
        // Tira a vencedora da mesa NORMAL já de cara — a partir daqui quem
        // representa ela na tela é o CartaRevelando (por cima do
        // overlay); se ela continuasse em cartasNaMesa, o escurecido some
        // no 'impacto' e ela apareceria DUPLICADA (a pequena original +ainda
        // no lugar antigo, mais a grande viajando).
        setCartasNaMesa((atual) => atual.filter((c) => c.id !== vencedora.id));
        setFaseRevelacaoVaza('crescendo');

        await esperar(VAZA_REVELACAO_TRANSICAO_MS);
        await esperar(VAZA_REVELACAO_PAUSA_MS);

        // Impacto: onda de choque + tremor de tela + overlay desescurece
        // (a legenda já some sozinha, ver JSX — só existe na fase
        // 'crescendo') + as PERDEDORAS que sobraram na mesa explodem pra
        // fora (ver cartasExplodindo).
        setFaseRevelacaoVaza('impacto');
        setChoqueVaza((v) => v + 1);
        setCartasExplodindo(() => {
            const explosoes = {};
            for (const carta of cartasNaMesa) {
                // Direção radial AFASTANDO do centro da mesa (50,50) — não
                // uma direção aleatória solta, "explode pra fora" de
                // verdade a partir de onde cada uma já estava.
                const dx = carta.x - 50;
                const dy = carta.y - 50;
                const distancia = Math.hypot(dx, dy) || 1;
                const angulo = Math.atan2(dy, dx);
                const novaDistancia = distancia * VAZA_EXPLOSAO_FATOR;
                const voltas = VAZA_EXPLOSAO_VOLTAS_MIN + Math.random() * (VAZA_EXPLOSAO_VOLTAS_MAX - VAZA_EXPLOSAO_VOLTAS_MIN);
                const sentido = Math.random() < 0.5 ? 1 : -1;
                explosoes[carta.id] = {
                    x: 50 + Math.cos(angulo) * novaDistancia,
                    y: 50 + Math.sin(angulo) * novaDistancia,
                    rot: carta.rot + voltas * 360 * sentido,
                    escala: carta.escala * VAZA_EXPLOSAO_ESCALA_MULT,
                };
            }
            return explosoes;
        });

        await esperar(VAZA_IMPACTO_DURACAO_MS + VAZA_IMPACTO_PAUSA_MS);

        // As perdedoras já voaram pra fora — some com elas de vez, e a
        // vencedora parte em viagem pro colo de quem ganhou.
        setCartasNaMesa([]);
        setCartasExplodindo({});
        setCartaEmHoverId(null);
        setFaseRevelacaoVaza('viajando');

        await esperar(VAZA_VIAGEM_DURACAO_MS);

        // Pousou: vira uma carta ESTÁTICA de vez (ver cartasVazaGanhas),
        // no MESMO ponto exato que CartaRevelando parou — desmontar o
        // CartaRevelando agora e nascer a estática ali não pula nada.
        setCartasVazaGanhas((atual) => [
            ...atual,
            { id: vencedora.id, assentoIndice, rank: vencedora.rank, naipe: vencedora.naipe, x: destino.x, y: destino.y },
        ]);
        setVazaRevelando(null);
        setFaseRevelacaoVaza(null);
    }

    async function distribuirCartas() {
        if (distribuindo) return;
        setDistribuindo(true);

        // Os outros saem do array em ordem ANTI-horária (ver
        // calcularAssentos: o ângulo CRESCE com o índice, e crescer o
        // ângulo com sen positivo pra baixo varre anti-horário na tela) —
        // sentido horário é o inverso, por isso o `.reverse()`. "Você"
        // (índice 0) fecha o círculo por último — mesmo sem fantasminha
        // pra "receber" de verdade, o assento existe e as cartas voam até
        // ele igual aos outros.
        const comIndice = assentos.map((assento, indice) => ({ ...assento, indice }));
        const ordem = [...comIndice.filter((a) => !a.eVoce).reverse(), comIndice[0]];

        for (const assento of ordem) {
            setAlvoIndex(assento.indice);
            await esperar(DURACAO_DECK_MS + FOLGA_APOS_BARALHO_MS);

            const dePos = {
                x: 50 + (assento.x - 50) * ALCANCE_BARALHO,
                y: 50 + (assento.y - 50) * ALCANCE_BARALHO,
            };
            // Mesmo cálculo de anguloBaralho lá em cima, mas fixado no
            // instante em que a carta nasce — anguloBaralho (a variável de
            // fora) não dá porque só existe no render seguinte a chamar
            // setAlvoIndex, e essa função inteira é uma closure de um
            // único render (o de quando o botão foi clicado).
            const anguloNestaParada = (Math.atan2(assento.y - 50, assento.x - 50) * 180) / Math.PI + 90;
            for (let c = 0; c < CARTAS_POR_JOGADOR; c++) {
                const id = ++proximoIdCarta.current;
                setCartasVoando((atuais) => [
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
                    },
                ]);
                await esperar(ATRASO_ENTRE_CARTAS_MS);
            }
            await esperar(DURACAO_CARTA_MS + PAUSA_POS_ENTREGA_MS);
        }

        setAlvoIndex(null);
        await esperar(DURACAO_DECK_MS);

        // Encadeada aqui de propósito (ver comentário em rankDaManilha lá
        // em cima): no jogo de verdade a vira só vira DEPOIS de todo mundo
        // já ter recebido a mão, então o fim natural de "dar as cartas" já
        // é o começo de "virar a vira" — sem precisar de um segundo clique
        // manual pra isso acontecer na ordem certa.
        setVira({ id: ++proximoIdVira.current, ...cartaAleatoria() });
        setFaseVira('subindo');
        await tocarVira();

        setDistribuindo(false);
    }

    // DEPOIS de todos os hooks (useState/useEffect/useMemo lá em cima) —
    // um `return` condicional ANTES deles violaria a regra de hooks
    // (quantidade de hooks tem que ser igual em todo render).
    if (mostrarGaleria) {
        return <GaleriaRanks onFechar={() => setMostrarGaleria(false)} />;
    }

    return (
        <div className={`mesa-exp-tela${faseRevelacaoVaza === 'impacto' ? ' mesa-exp-tela-tremendo' : ''}`}>
            {/* Cabeçalho da sala (item 1 do checklist) — título + botão de
                sair, mesmo par que abria o Partida.jsx de verdade, só que
                aqui cada um flutuando no próprio canto (sem barra de fundo
                ligando os dois). A senha só aparece antes de iniciar, igual
                lá. */}
            <h1 className="mesa-exp-cabecalho-titulo">Sala {SALA_ID_TESTE}</h1>
            <div className="mesa-exp-cabecalho-direita">
                {!iniciada && (
                    <span className="mesa-exp-cabecalho-senha">🔒 Senha: <strong>{SENHA_TESTE}</strong></span>
                )}
                <button type="button" className="secundario">
                    {iniciada ? 'Sair da partida' : 'Sair da sala'}
                </button>
            </div>

            {/* Só pra pré-visualizar o cabeçalho nos dois estados (antes/
                depois de iniciar) — não existe no jogo de verdade, lá quem
                decide é o servidor (ver `iniciada` em Partida.jsx). */}
            <button
                type="button"
                className="mesa-exp-alternar-iniciada"
                onClick={() => setIniciada((v) => !v)}
            >
                🔀 {iniciada ? 'Ver: antes de iniciar' : 'Ver: em partida'}
            </button>

            {/* Idem, pro chat: `chatAberto` é config da SALA (dono decide ao
                criar, ver conexao/PROTOCOLO.md) — sem servidor aqui, só um
                botão de debug pra pré-visualizar os dois casos. Restrito
                continua funcionando sempre (as 4 mensagens prontas), só o
                campo livre some. */}
            <button
                type="button"
                className="mesa-exp-alternar-chat-aberto"
                onClick={() => setChatAberto((v) => !v)}
            >
                🔀 Chat: {chatAberto ? 'aberto' : 'restrito'}
            </button>

            {/* Simula `turnoAposta` chegar pra você (ver PROTOCOLO.md) —
                sem isto o botão "Apostar" lá embaixo nem aparece. */}
            <button
                type="button"
                className="mesa-exp-alternar-aposta-vez"
                onClick={() => setApostaSuaVez((v) => !v)}
            >
                🔀 Aposta: {apostaSuaVez ? 'sua vez' : 'não é sua vez'}
            </button>

            <button
                type="button"
                className="mesa-exp-resetar-aposta"
                onClick={resetarAposta}
            >
                🔄 Resetar aposta
            </button>

            {onFechar && (
                <button type="button" className="mesa-exp-fechar" onClick={onFechar}>← Voltar</button>
            )}

            <button
                type="button"
                className="mesa-exp-fantasma-taca"
                onClick={tacarCartaFantasma}
                disabled={distribuindo}
            >
                🂠 Fantasma taca
            </button>

            <button
                type="button"
                className="mesa-exp-fantasma-dano"
                onClick={infligirDanoFantasma}
            >
                💥 Fantasma leva dano
            </button>

            <button
                type="button"
                className="mesa-exp-fantasma-fala"
                onClick={fantasmaFala}
            >
                💬 Fantasma fala
            </button>

            <button
                type="button"
                className="mesa-exp-fantasma-bot"
                onClick={alternarBotFantasma}
            >
                🤖 Alternar bot
            </button>

            <button
                type="button"
                className="mesa-exp-fantasma-aposta"
                onClick={fantasmaAposta}
            >
                🪙 Fantasma aposta
            </button>

            <button
                type="button"
                className="mesa-exp-avancar-turno"
                onClick={avancarTurno}
            >
                ▶️ Avançar vez
            </button>

            <button
                type="button"
                className="mesa-exp-finalizar-vaza"
                onClick={finalizarVaza}
                disabled={!!vazaRevelando || distribuindo}
            >
                🏆 Finalizar vaza
            </button>

            {/* Liga/desliga só o monitor de peito, sem mexer no resto do
                visual de bot (engrenagens, olhos/boca quadrados) — pra
                comparar se ele é estímulo demais pra estética mais simples
                que a mesa tá seguindo. */}
            <button
                type="button"
                className="mesa-exp-alternar-monitor-bot"
                onClick={() => setMonitorBotAtivo((v) => !v)}
            >
                🔀 Monitor: {monitorBotAtivo ? 'ligado' : 'desligado'}
            </button>

            <button
                type="button"
                className="mesa-exp-ver-ranks"
                onClick={() => setMostrarGaleria(true)}
                disabled={distribuindo}
            >
                🃏 Ver ranks
            </button>

            <button
                type="button"
                className="mesa-exp-rolar-chapeus"
                onClick={() => setVersaoChapeu((v) => v + 1)}
                disabled={distribuindo}
            >
                🎩 Novos chapéus
            </button>

            <button
                type="button"
                className="mesa-exp-dar-cartas"
                onClick={distribuirCartas}
                disabled={distribuindo}
            >
                {distribuindo ? '🂠 Distribuindo...' : '🂠 Dar cartas'}
            </button>

            {/* No jogo de verdade a vira só existe DEPOIS da mão distribuída
                (ver comentário em rankDaManilha lá em cima), mas aqui é
                manual — trava só enquanto o baralho está se deslocando
                (mesma guarda de virarCarta), não depende de já ter dado
                carta nenhuma. */}
            <button
                type="button"
                className="mesa-exp-virar-carta"
                onClick={virarCarta}
                disabled={distribuindo}
            >
                🂡 Virar carta
            </button>

            {/* Só pra testar o arranjo com quantidades diferentes de
                jogador — não existe no jogo de verdade (lá a quantidade vem
                de jogadores.length). Trocar a quantidade NO MEIO da
                distribuição desalinharia os índices que distribuirCartas já
                capturou em `ordem` — por isso trava junto com o resto. */}
            <div className="mesa-exp-controle">
                <span>{quantidade} jogadores</span>
                <div className="botoes">
                    <button
                        type="button"
                        onClick={diminuirJogadores}
                        disabled={quantidade <= MIN_JOGADORES || distribuindo}
                    >
                        −
                    </button>
                    <button
                        type="button"
                        onClick={aumentarJogadores}
                        disabled={quantidade >= MAX_JOGADORES || distribuindo}
                    >
                        +
                    </button>
                </div>
            </div>

            {/* Preview rápido do leque (0-4 cartas) sem rodar a
                distribuição inteira — mexe na mesma `maos` que
                distribuirCartas() vai crescendo sozinha, então um não
                atrapalha o outro, só que este aqui pula direto pro valor
                escolhido em vez de chegar carta por carta. */}
            <div className="mesa-exp-controle mesa-exp-controle-cartas-teste">
                <span>{cartasTeste} carta(s) na mão (teste)</span>
                <div className="botoes">
                    <button
                        type="button"
                        onClick={() => ajustarCartasTeste(cartasTeste - 1)}
                        disabled={cartasTeste <= MIN_CARTAS_TESTE || distribuindo}
                    >
                        −
                    </button>
                    <button
                        type="button"
                        onClick={() => ajustarCartasTeste(cartasTeste + 1)}
                        disabled={cartasTeste >= MAX_CARTAS_TESTE || distribuindo}
                    >
                        +
                    </button>
                </div>
            </div>

            <div className="mesa-exp-mesa">
                {assentos.map((assento, i) => {
                    // Mesmo texto usado como `jogador` em jogarCarta/
                    // tacarCartaFantasma — é a chave que liga "esta carta
                    // na mesa" a "este assento" pro contorno amarelo.
                    const rotuloAssento = assento.eVoce ? 'Você' : `Player ${i}`;
                    // Destaca em DOIS casos agora, não só um: hover na
                    // carta que este assento jogou (já existia) OU hover
                    // no PRÓPRIO fantasminha (assentoEmHoverIndex — novo,
                    // ver onMouseEnter/Leave abaixo). Os dois acendem o
                    // MESMO contorno amarelo.
                    const destacado = cartaEmHover?.jogador === rotuloAssento || assentoEmHoverIndex === i;
                    // Balão de fala deste assento (ver mostrarBolhaFala) — no
                    // máximo um renderizado por vez aqui (se chegar mais de
                    // um pro mesmo assento antes do primeiro sumir, mostra
                    // só o mais recente; os outros ainda existem em
                    // `bolhasFala` e ainda vão sumir sozinhos no tempo deles).
                    const bolha = [...bolhasFala].reverse().find((b) => b.assentoIndex === i);
                    const ehBot = botPorAssento[i] ?? false;
                    const apostaDele = apostaPorAssento[i] ?? null;
                    const naVez = turnoAssentoIndex === i;
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
                            ) : (
                                <>
                                    <Fantasminha versaoChapeu={versaoChapeu} destacado={destacado} danoVersao={danoPorAssento[i] ?? 0} bot={ehBot} monitor={monitorBotAtivo} hue={huesPorAssento[i]} naVez={naVez}>
                                        <MaoEmLeque quantidade={maos[i] ?? 0} />
                                    </Fantasminha>
                                    <span className="mesa-exp-assento-legenda">
                                        {rotuloAssento}
                                        {ehBot && <span className="mesa-exp-assento-bot-tag"> 🤖 bot</span>}
                                    </span>
                                    {/* Mesmo lugar da legenda de aposta
                                        (centralizada no retângulo, ver
                                        .mesa-exp-assento-aposta-legenda) —
                                        só que "Vez de" NÃO depende do
                                        mouse (ver `naVez`, turnoAssentoIndex
                                        lá em cima), e tem prioridade: com a
                                        vez ativa, não mostra "Aposta: N"
                                        no mesmo lugar mesmo em hover — só
                                        um texto de cada vez ali. */}
                                    {naVez ? (
                                        <span className="mesa-exp-assento-aposta-legenda mesa-exp-assento-turno-legenda">
                                            Vez de {rotuloAssento}
                                        </span>
                                    ) : assentoEmHoverIndex === i && apostaDele != null && (
                                        <span className="mesa-exp-assento-aposta-legenda">
                                            Aposta: {apostaDele}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}

                {/* Vira (ver tocarVira/calcularEstadoVira lá em cima): nasce
                    no centro (debaixo do baralho), sai pra esquerda girando
                    metade do flip 3D (rotateY, ver .mesa-exp-vira-miolo no
                    CSS), depois volta e pousa de volta NO MESMO ponto do
                    baralho (x/y sempre 50,50 na volta — literalmente embaixo
                    dele, não do lado) — só que já girada uns
                    ROTACAO_VIRA_POUSADA_GRAUS no PRÓPRIO plano (--vira-rot-z,
                    2D, nada a ver com o flip em Y): embaixo "reto" ela
                    sumiria inteira atrás do baralho, girada sobram as pontas
                    pra fora. `key={vira.id}` força remontar — e reiniciar a
                    coreografia do ZERO — a cada clique novo, mesmo clicando
                    de novo antes da anterior "assentar". Fica ANTES do
                    baralho no DOM só por organização; quem garante "baralho
                    por cima" de verdade é o z-index dos dois (ver
                    index.css) somado ao baralho descer (escalaBaralho) só
                    depois da vira já ter chegado. */}
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

                {/* Legenda da vira, mesmo espírito da legenda de carta
                    jogada (ver mais abaixo) — só que em vez de "jogador +
                    rank de naipe", mostra a MANILHA (o rank seguinte na
                    sequência, ver rankDaManilha) como um preview visual dos
                    4 naipes em leque, não só texto. Acompanha a MESMA
                    posição ao vivo da vira (estadoVira), não um ponto fixo
                    — só importa na prática depois de 'pousada', que é
                    quando ela realmente para de se mover. */}
                {viraEmHover && vira && (
                    <div className="mesa-exp-vira-legenda" style={{ left: `${estadoVira.x}%`, top: `${estadoVira.y}%` }}>
                        <strong>Vira</strong>
                        <span>Manilha:</span>
                        <LequeManilha rank={rankDaManilha(vira.rank)} />
                    </div>
                )}

                {/* Baralho: decoração a maior parte do tempo — não
                    representa nenhum monte de verdade — mas gira/desloca/
                    aumenta sozinho durante distribuirCartas() (ver estado
                    alvoIndex acima), apontando pro assento da vez. */}
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

                {/* Cartas já jogadas, pousadas de vez (ver jogarCarta) —
                    posição/rotação/escala próprias, não recalculadas a
                    cada render como o baralho ou a sua mão (EXCETO quando
                    melada, ver abaixo — aí a posição renderizada troca pro
                    canto, mas x/y guardados em cartasNaMesa não mudam, só a
                    exibição). Hover liga o contorno amarelo (ver .carta-exp
                    dentro de mesa-exp-carta-jogada-hover) e alimenta
                    cartaEmHoverId lá em cima, que é o que também destaca o
                    assento de quem jogou — e agora o CAMINHO INVERSO
                    também: hover no assento (assentoEmHoverIndex) destaca
                    a carta DELE aqui (jogadorHover abaixo). Verde
                    (vencendo) e preto+canto (melada) vêm de analiseMesa,
                    recalculado a cada carta nova — ver useMemo lá em cima. */}
                {cartasNaMesa.map((carta) => {
                    const vencendo = carta.id === analiseMesa.idVencedora;
                    const melada = analiseMesa.idsMeladas.has(carta.id);
                    // grupo = qual rank melado (0 = primeiro a aparecer),
                    // indice = posição DENTRO desse rank — ver
                    // localizarGrupoMelada/gruposMeladas lá em cima.
                    const { grupo: grupoMelada, indice: indiceMelada } = melada
                        ? localizarGrupoMelada(carta.id)
                        : { grupo: 0, indice: 0 };
                    const jogadorHover = assentoEmHoverIndex != null
                        ? (assentos[assentoEmHoverIndex]?.eVoce ? 'Você' : `Player ${assentoEmHoverIndex}`)
                        : null;
                    // Explodindo (ver cartasExplodindo/finalizarVaza) tem
                    // prioridade sobre TUDO — inclusive melada: senão a
                    // carta melada nem se mexeria (o estilo dela ignora
                    // x/y e sempre volta pro canto fixo).
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
                                transform: `translate(-50%, -50%) rotate(${explosao.rot}deg) scale(${explosao.escala})`,
                            } : melada ? {
                                left: `${MELADA_CANTO_X}%`,
                                top: `${MELADA_CANTO_Y}%`,
                                // X soma os deslocamentos (entre grupos +
                                // dentro do grupo + o extra só do primeiro
                                // grupo, pra esquerda); Y só o de dentro do
                                // grupo — é o que separa "pro lado", não
                                // "mais pra baixo", um rank melado do outro.
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

                {/* Legenda ao lado da carta em hover — elemento PRÓPRIO
                    (não filho da carta), pra não herdar o rotate/scale
                    dela: usa a mesma posição RENDERIZADA (canto, se
                    melada — não o x/y guardado, que só vale enquanto não
                    melou), mas sem esse transform, então o texto sempre
                    fica na horizontal, legível. */}
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
                            <strong>{cartaEmHover.jogador}</strong>
                            <span>{cartaEmHover.rank} de {cartaEmHover.naipe}</span>
                            {/* Mesma info do contorno roxo (ver
                                .mesa-exp-carta-jogada-vencendo), só que em
                                texto — útil quando o contorno já não dá pra
                                ver direito (ex.: o próprio hover amarelo por
                                cima). melada/vencendo nunca são true junto:
                                uma carta anulada não compete por "mais
                                forte" nenhuma (ver analiseMesa). */}
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
                        duracaoMs={carta.tipo === 'jogar' ? DURACAO_JOGADA_MS : DURACAO_CARTA_MS}
                        onChegou={() => aoChegarCarta(carta)}
                    />
                ))}
            </div>

            {/* Fora de .mesa-exp-mesa de propósito: ancorada na TELA
                (ver .mesa-exp-sua-mao), não na mesa — é a sua mão, sobe de
                fora da tela, não voa a partir do baralho. */}
            <SuaMaoEmLeque cartas={suaMao} idSaindo={cartaSaindoId} onJogar={jogarCarta} />

            {/* Chat: botão circular no canto inferior esquerdo — painel
                (mensagens prontas + campo livre, se a sala permitir) E
                histórico (módulo à direita dele, com avisos de
                entrar/sair) só aparecem com o botão CLICADO, fecham de novo
                clicando outra vez. Enviar (pronta ou livre) sempre mostra o
                balão em cima do SEU assento (índice 0) e entra no
                histórico, sem fechar nada sozinho. */}
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
                                        disabled={chatEmCooldown}
                                        onClick={() => enviarMensagemPronta(mensagem.id)}
                                    >
                                        {mensagem.texto}
                                    </button>
                                ))}
                            </div>
                            {chatAberto && (
                                <form className="mesa-exp-chat-form" onSubmit={enviarMensagemLivre}>
                                    <input
                                        type="text"
                                        maxLength={200}
                                        placeholder="Mensagem..."
                                        value={textoChat}
                                        onChange={(e) => setTextoChat(e.target.value)}
                                        disabled={chatEmCooldown}
                                    />
                                    <button type="submit" disabled={chatEmCooldown || !textoChat.trim()}>
                                        Enviar
                                    </button>
                                </form>
                            )}
                            {chatEmCooldown && <span className="mesa-exp-chat-cooldown">aguarde pra enviar de novo</span>}
                        </div>

                        <div className="mesa-exp-chat-historico">
                            <h3>Histórico</h3>
                            <div className="mesa-exp-chat-historico-feed" ref={chatHistoricoRef}>
                                {mensagensChat.length === 0
                                    ? <span className="mesa-exp-chat-vazio">(sem mensagens)</span>
                                    : mensagensChat.map((mensagem, i) => (
                                        mensagem.tipo === 'sistema'
                                            ? (
                                                <div key={i} className="mesa-exp-chat-msg mesa-exp-chat-msg-sistema">
                                                    <em>{mensagem.jogador} {mensagem.texto}</em>
                                                </div>
                                            )
                                            : (
                                                <div key={i} className="mesa-exp-chat-msg">
                                                    <strong>{mensagem.jogador}:</strong> {mensagem.texto}
                                                </div>
                                            )
                                    ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Aposta: botão lá embaixo só existe na sua vez (ver
                apostaSuaVez) e enquanto ainda não confirmou nesta
                "rodada" (apostaConfirmada null) — clicar abre o popup;
                confirmar dentro dele fecha o popup e manda as fichas
                voando pro canto (ver confirmarAposta/FichaVoando). Não
                volta a aparecer sozinho depois de confirmar; só o botão
                de debug "🔄 Resetar aposta" libera de novo. */}
            {apostaSuaVez && apostaConfirmada === null && !apostaPopupAberto && (
                <button type="button" className="mesa-exp-aposta-botao" onClick={abrirPopupAposta}>
                    Apostar
                </button>
            )}

            {apostaPopupAberto && (
                <div className="mesa-exp-aposta-overlay" onClick={() => setApostaPopupAberto(false)}>
                    {/* stopPropagation: clicar DENTRO do popup não pode
                        fechar (só clicar no fundo escurecido, fora dele). */}
                    <div className="mesa-exp-aposta-popup" onClick={(e) => e.stopPropagation()}>
                        <h3>Quantas vazas você vai fazer?</h3>

                        {/* Pilha "flutuante" — cresce/encolhe junto com o
                            campo abaixo, ANTES de confirmar. popupFichasRef
                            é a origem que confirmarAposta lê pra saber de
                            onde as fichas de verdade vão sair voando. */}
                        <div className="mesa-exp-aposta-pilha" ref={popupFichasRef}>
                            {apostaValorPopup === 0
                                ? <span className="mesa-exp-aposta-pilha-vazia">nenhuma ficha ainda</span>
                                : Array.from({ length: apostaValorPopup }, (_, i) => (
                                    <div
                                        key={i}
                                        className="mesa-exp-aposta-ficha-pilha"
                                        style={{ '--indice-pilha': i }}
                                    >
                                        <Ficha />
                                    </div>
                                ))}
                        </div>

                        <div className="mesa-exp-aposta-campo">
                            <button
                                type="button"
                                onClick={() => ajustarApostaValorPopup(apostaValorPopup - 1)}
                                disabled={apostaValorPopup <= 0}
                            >
                                −
                            </button>
                            <input
                                type="number"
                                min={0}
                                max={APOSTA_VALOR_MAX}
                                value={apostaValorPopup}
                                onChange={(e) => ajustarApostaValorPopup(Number(e.target.value))}
                            />
                            <button
                                type="button"
                                onClick={() => ajustarApostaValorPopup(apostaValorPopup + 1)}
                                disabled={apostaValorPopup >= APOSTA_VALOR_MAX}
                            >
                                +
                            </button>
                        </div>

                        <button type="button" className="mesa-exp-aposta-confirmar" onClick={confirmarAposta}>
                            Apostar
                        </button>
                    </div>
                </div>
            )}

            {/* Camada de tela inteira só pras fichas EM VOO (ver
                FichaVoando) — pointer-events:none, mesmo espírito do
                #ficha-perspectiva do experimento arquivado (public/_intro):
                não pode atrapalhar clique em nada por baixo. As duas
                origens (sua aposta E aposta de fantasminha) dividem a
                MESMA camada — só o de/para/onChegou mudam. */}
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
            </div>

            {/* Fichas apostadas pelos FANTASMINHAS, já pousadas — SEMPRE
                visíveis (não é hover-only, diferente da legenda de texto
                com o valor, que fica dentro do próprio assento, ver JSX
                acima). left/top vêm da mesma `para` (px) que a
                FichaVoando terminou, mesmo truque da sua aposta: sem
                pulo nenhum trocando de voando pra estática. */}
            {fichasFantasmaNoCanto.map((ficha) => (
                <div
                    key={ficha.id}
                    className="mesa-exp-aposta-ficha-canto"
                    style={{ left: `${ficha.para.x}px`, top: `${ficha.para.y}px` }}
                >
                    <Ficha hue={ficha.hue} />
                </div>
            ))}

            {/* Canto onde a SUA aposta confirmada fica empilhada pro resto
                da "rodada" — sempre no DOM (mesmo com 0 fichas): é o alvo
                que confirmarAposta lê (getBoundingClientRect) pra saber
                pra onde mandar as fichas. Cada ficha pousada guarda a
                própria `para` (px exatos de onde FichaVoando parou) —
                reusa o MESMO ponto pra não sobrar nenhum pulo trocando de
                voando pra estática. */}
            <div className="mesa-exp-aposta-canto" ref={cantoFichasRef}>
                {fichasNoCanto.map((ficha) => (
                    <div
                        key={ficha.id}
                        className="mesa-exp-aposta-ficha-canto"
                        style={{ left: `${ficha.para.x}px`, top: `${ficha.para.y}px` }}
                    >
                        <Ficha />
                    </div>
                ))}
                {apostaConfirmada != null && (() => {
                    // Acompanha o LEQUE: quanto mais fichas, mais elas se
                    // espalham pros dois lados (ver `meio`/FICHA_LEQUE_
                    // ESPACAMENTO_PX em confirmarAposta) — sem isso a
                    // legenda ficava numa distância FIXA do centro e a
                    // última ficha (com aposta alta) cobria o texto.
                    // Math.max(0, ...): aposta 0 ou 1 não tem leque nenhum
                    // pra desviar, a legenda cola perto do centro mesmo.
                    const raioLeque = Math.max(0, (apostaConfirmada - 1) / 2) * FICHA_LEQUE_ESPACAMENTO_PX;
                    const metadeFicha = (FICHA_TAMANHO_PX * ESCALA_FICHA_CANTO) / 2;
                    return (
                        <span
                            className="mesa-exp-aposta-canto-legenda"
                            style={{ marginLeft: `${raioLeque + metadeFicha + 14}px` }}
                        >
                            Sua aposta: {apostaConfirmada}
                        </span>
                    );
                })()}
            </div>

            {/* Cartas que já venceram uma vaza, "no colo" de quem ganhou
                (ver cartasVazaGanhas/finalizarVaza) — ATRÁS da pilha de
                fichas de aposta dele (z-index menor que o das fichas, ver
                CSS), só as pontas/bordas espiando. Permanente: fica ali
                pro resto da partida, não é hover nem anima mais (já
                chegou). */}
            {cartasVazaGanhas.map((carta) => (
                <div
                    key={carta.id}
                    className="mesa-exp-carta-vaza-ganha"
                    style={{ left: `${carta.x}px`, top: `${carta.y}px` }}
                >
                    <Carta rank={carta.rank} naipe={carta.naipe} />
                </div>
            ))}

            {/* Revelação de fim de vaza (ver finalizarVaza/vazaRevelando/
                faseRevelacaoVaza) — escurece a TELA INTEIRA na fase
                'crescendo' (não só a mesa), desescurece sozinho a partir
                do 'impacto'. A carta vencedora (CartaRevelando) nasce
                EXATAMENTE onde ela estava na mesa (origem: px capturados
                no clique), cresce pro centro por cima do escurecido
                (z-index maior, "atravessa" o escuro), "bate" (cai um
                pouco + encolhe rápido) e por fim viaja até o colo de quem
                ganhou — a carta pequena original já saiu de cartasNaMesa
                assim que a revelação começa (ver finalizarVaza), não tem
                risco de aparecer duplicada quando o escurecido sumir. */}
            {vazaRevelando && (
                <div className={`mesa-exp-vaza-overlay${faseRevelacaoVaza === 'crescendo' ? ' mesa-exp-vaza-overlay-escuro' : ''}`} />
            )}
            {vazaRevelando && faseRevelacaoVaza === 'crescendo' && (
                <div className="mesa-exp-vaza-texto">
                    <strong>Fim de Vaza: {vazaRevelando.jogador}</strong>
                    <span>{vazaRevelando.rank} de {vazaRevelando.naipe}</span>
                </div>
            )}
            {/* Onda de choque no instante do impacto — key={choqueVaza}
                força remontar (e reiniciar a animação do zero) mesmo se
                clicasse "Finalizar vaza" de novo rapidinho depois. Fica
                montada da fase 'impacto' em diante (a keyframe já "segura"
                o estado final sozinha via forwards, não precisa desmontar
                na hora certa). */}
            {vazaRevelando && faseRevelacaoVaza && faseRevelacaoVaza !== 'crescendo' && (
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
        </div>
    );
}
