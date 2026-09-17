import { useEffect, useMemo, useRef, useState } from 'react';
import Fantasminha from './Fantasminha.jsx';
import Carta from './Carta.jsx';

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
const MELADA_GRUPO_ESPACAMENTO_PX = 30;

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
    const [quantidade, setQuantidade] = useState(4);
    const assentos = useMemo(() => calcularAssentos(quantidade), [quantidade]);
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
    // Id da carta na mesa sob o mouse agora, ou null — usado tanto pro
    // contorno amarelo dela quanto pra achar (por `jogador`) qual assento
    // também destacar (ver rotuloAssento mais abaixo, no JSX).
    const [cartaEmHoverId, setCartaEmHoverId] = useState(null);
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
        setVira(null);
        setFaseVira(null);
        setBaralhoEmVira(false);
        setViraEmHover(false);
    }, [quantidade]);

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
        <div className="mesa-exp-tela">
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
                        onClick={() => setQuantidade((q) => Math.max(MIN_JOGADORES, q - 1))}
                        disabled={quantidade <= MIN_JOGADORES || distribuindo}
                    >
                        −
                    </button>
                    <button
                        type="button"
                        onClick={() => setQuantidade((q) => Math.min(MAX_JOGADORES, q + 1))}
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
                    const destacado = cartaEmHover?.jogador === rotuloAssento;
                    return (
                        <div
                            key={i}
                            className={`mesa-exp-assento${assento.eVoce ? ' mesa-exp-assento-voce' : ''}`}
                            style={{ left: `${assento.x}%`, top: `${assento.y}%` }}
                        >
                            {assento.eVoce ? (
                                'Você'
                            ) : (
                                <>
                                    <Fantasminha versaoChapeu={versaoChapeu} destacado={destacado} danoVersao={danoPorAssento[i] ?? 0}>
                                        <MaoEmLeque quantidade={maos[i] ?? 0} />
                                    </Fantasminha>
                                    <span className="mesa-exp-assento-legenda">{rotuloAssento}</span>
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
                    assento de quem jogou. Verde (vencendo) e preto+canto
                    (melada) vêm de analiseMesa, recalculado a cada carta
                    nova — ver useMemo lá em cima. */}
                {cartasNaMesa.map((carta) => {
                    const vencendo = carta.id === analiseMesa.idVencedora;
                    const melada = analiseMesa.idsMeladas.has(carta.id);
                    // grupo = qual rank melado (0 = primeiro a aparecer),
                    // indice = posição DENTRO desse rank — ver
                    // localizarGrupoMelada/gruposMeladas lá em cima.
                    const { grupo: grupoMelada, indice: indiceMelada } = melada
                        ? localizarGrupoMelada(carta.id)
                        : { grupo: 0, indice: 0 };
                    const classes = ['mesa-exp-carta-jogada'];
                    if (carta.id === cartaEmHoverId) classes.push('mesa-exp-carta-jogada-hover');
                    if (vencendo) classes.push('mesa-exp-carta-jogada-vencendo');
                    if (melada) classes.push('mesa-exp-carta-jogada-melada');
                    return (
                        <div
                            key={carta.id}
                            className={classes.join(' ')}
                            style={melada ? {
                                left: `${MELADA_CANTO_X}%`,
                                top: `${MELADA_CANTO_Y}%`,
                                // X soma os dois deslocamentos (entre grupos
                                // + dentro do grupo); Y só o de dentro do
                                // grupo — é o que separa "pro lado", não
                                // "mais pra baixo", um rank melado do outro.
                                transform: `translate(calc(-50% + ${grupoMelada * MELADA_GRUPO_ESPACAMENTO_PX + indiceMelada * MELADA_CANTO_ESPACAMENTO_PX}px), calc(-50% + ${indiceMelada * MELADA_CANTO_ESPACAMENTO_PX}px)) rotate(${carta.rot}deg) scale(${carta.escala})`,
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
        </div>
    );
}
