import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Corpo do "fantasminha da bola" — não a versão que já estava na branch
// atual, mas a de public/experimento (branch experimentando-front, commit
// "Bola"): o <path> em gota (cauda pontuda única embaixo, não um círculo) e
// o rosto (olhos + boca) em cima do SVG, ver .fantasminha-rosto/-olho/-boca
// em index.css. Fora do que essa referência já tem: sem o selo (a imagem
// no meio) nem as partículas caindo, que lá eram o efeito principal, não o
// corpo; e sem o nome sobreposto (`.fantasma-nome` na referência) — aqui
// quem legenda o jogador é o `<span>` fora do componente, em
// MesaExperimento.jsx.
// Vira o avatar temporário de cada jogador que não somos nós: cor clara
// sorteada por instância (tons pastel, não o roxo escuro do original), e um
// balanço vertical tipo onda senoidal (CSS puro, ver @keyframes
// fantasminha-flutuar em index.css) com duração e atraso também sorteados
// por instância, pra nenhum fantasminha boiar em sincronia com os outros.

const DURACAO_MIN_S = 2.4;
const DURACAO_MAX_S = 4.2;

// Balanço da cauda: mesma ideia do flutuar (duração/atraso sorteados por
// instância), mas numa faixa própria — não precisa ser síncrona com o
// flutuar vertical, os dois rodam em relógios separados.
const DURACAO_CAUDA_MIN_S = 1.6;
const DURACAO_CAUDA_MAX_S = 3;
// Quanto a PONTA da cauda anda pra cada lado do centro (x=50 no viewBox);
// o resto do corpo (dome + ombros) não muda de posição nenhuma.
const AMPLITUDE_CAUDA = 3;

// A cauda é só o final da mesma <path> do corpo (os dois "C" que convergem
// num ponto só, ver corpoComPonta) — balançar ela é reaproveitar essa
// mesma forma com a ponta (x) deslocada, e deixar o <animate> do SVG
// interpolar do centro até cada lado e voltar.
function corpoComPonta(x) {
    return `M${x},97 C${x},97 13,58 13,33 A37,37 0 1,1 87,33 C87,58 ${x},97 ${x},97 Z`;
}

// Animação de dano ("impact frame"): um corte atravessando o rosto. Não é
// um traço de espessura uniforme — é uma "lente" (fina nas duas pontas,
// grossa no meio), desenhada em coordenadas LOCAIS horizontais (mais fácil
// de calcular reto) e só depois girada/posicionada em cima do rosto via
// <g transform>. A lente é feita de DUAS curvas quadráticas entre os
// mesmos dois pontos-ponta: uma com o controle deslocado pra cima
// (CORTE_METADE_ESPESSURA), outra pra baixo — no meio (t=0.5) uma bezier
// quadrática se afasta da corda em metade do deslocamento do controle, daí
// as duas juntas darem espessura = CORTE_METADE_ESPESSURA bem no centro, e
// exatamente 0 nas pontas (onde as duas curvas começam/terminam no MESMO
// ponto). O "desenhar de ponta a ponta" agora é um clipPath com um <rect>
// cuja largura anima de 0 até cobrir tudo (SMIL, mesma ideia do balanço da
// cauda) — funciona em cima de uma forma preenchida, diferente do
// stroke-dashoffset de antes (que só funciona em traço, não em fill).
const CORTE_METADE_COMPRIMENTO = 40;
const CORTE_METADE_ESPESSURA = 10;
// Some o MESMO deslocamento aos dois controles (em vez de -espessura/
// +espessura simétricos) — a ESPESSURA no meio continua a mesma (é a
// DIFERENÇA entre os dois controles, que não muda), mas a lente inteira
// arqueia pra um lado, já que os dois extremos continuam presos nos mesmos
// dois pontos-ponta (P0/P1) e só o meio se afasta da linha reta entre eles.
const CORTE_CURVATURA = 16;
const CORTE_LENTE = `M-${CORTE_METADE_COMPRIMENTO},0 Q0,${CORTE_CURVATURA - CORTE_METADE_ESPESSURA} ${CORTE_METADE_COMPRIMENTO},0 Q0,${CORTE_CURVATURA + CORTE_METADE_ESPESSURA} -${CORTE_METADE_COMPRIMENTO},0 Z`;
const CORTE_CENTRO = { x: 50, y: 47 };
const CORTE_ANGULO_GRAUS = 38;
const DURACAO_DANO_MS = 1500;
// Bate com MORTE_DESINTEGRAR_MS em MesaExperimento.jsx (900ms) — os dois
// têm que ficar iguais: é o tempo que o PAI espera antes de trocar esta
// fase por 'morto' (que troca o fantasminha por um "💀 Eliminado" fixo,
// ver JSX de lá), então a animação de desmanchar precisa acabar de
// verdade dentro desse tempo, não sobrar cortada.
const DURACAO_DESINTEGRAR_MS = 900;

// Impacto do chapéu (ver chapeuImpacto abaixo): sobe uma quantia
// aleatória por pancada (nunca a mesma, pra não ficar mecânico igual toda
// vez), desloca um pouco pro lado (direção também sorteada) e gira —
// depois volta sozinho pro lugar de origem (ver @keyframes
// fantasminha-chapeu-impacto: começa e termina exatamente na mesma
// transform do CSS parado, "solta" a animação sem pulo nenhum quando
// `machucado` vira false de novo).
const CHAPEU_IMPACTO_SOBE_MIN = 10;
const CHAPEU_IMPACTO_SOBE_MAX = 24;
const CHAPEU_IMPACTO_LADO = 14;
const CHAPEU_IMPACTO_ROT_GRAUS = 20;

// Monitor de peito (ver `bot` mais abaixo) — um retângulo só, tipo tela de
// osciloscópio, colado na barriga do robô. Coordenadas conservadoras de
// propósito: o corpo (corpoComPonta) é uma gota que já estreita bastante
// entre y=33 (dome, largura cheia 13-87) e a ponta da cauda em (50,97) —
// sem clipar o monitor na silhueta, mantém tudo dentro de x 28-72 / y
// 46-70, a faixa que ainda fica sob o corpo mesmo já estreitado, com folga.
// Rosto (HTML por cima) termina por volta de y=42, então o monitor começa
// logo abaixo dele. `TELA_*` é a área ÚTIL (dentro da moldura, onde a onda
// desenha) — `MONITOR_RECT` (a moldura em si) só um pouco maior em volta.
const MONITOR_BORDA = 2;
const TELA_LARGURA = 32;
const TELA_ALTURA = 15;
// Centro fixo (não canto): reduzir TELA_LARGURA/ALTURA encolhe o monitor
// sem descentralizar ele do peito — x/y da moldura vêm DAQUI, não de um
// canto fixo.
const MONITOR_CENTRO = { x: 50, y: 58 };
const MONITOR_RECT = {
    x: MONITOR_CENTRO.x - (TELA_LARGURA + MONITOR_BORDA * 2) / 2,
    y: MONITOR_CENTRO.y - (TELA_ALTURA + MONITOR_BORDA * 2) / 2,
    width: TELA_LARGURA + MONITOR_BORDA * 2,
    height: TELA_ALTURA + MONITOR_BORDA * 2,
    rx: 3,
};
const TELA_RECT = { x: MONITOR_RECT.x + MONITOR_BORDA, y: MONITOR_RECT.y + MONITOR_BORDA, width: TELA_LARGURA, height: TELA_ALTURA };
const MONITOR_COR_MOLDURA = '#23262c';
const MONITOR_COR_TELA = '#0c0f12';

// Onda (ver gerarOndaQuadrada/`bot` mais abaixo): "degraus" retos (sobe/
// desce na vertical, anda reto na horizontal — nada de curva), altura de
// cada degrau sorteada, não um padrão fixo repetindo — é o que dá a cara
// de "quadrada, sharp, e aleatória" pedida, tipo um osciloscópio mostrando
// ruído digital em vez de uma onda senoidal lisa.
const ONDA_PASSOS = 9;
const ONDA_MARGEM_V = 2.5; // não deixa a onda encostar na moldura de cima/baixo
const ONDA_DURACAO_S = 2.6;

// Gera os pontos de UM ciclo da onda (largura TELA_LARGURA) — o path final
// duplica esse mesmo ciclo lado a lado (ver JSX) e faz o <g> deslizar
// exatamente TELA_LARGURA pra a esquerda num loop indefinite: como as duas
// cópias são IDÊNTICAS, a emenda entre elas é invisível, e a onda parece
// rolar pra sempre sem nunca "pular".
function gerarOndaQuadrada(passos, largura, altura, margemV) {
    const passoX = largura / passos;
    const alturaUtil = altura - margemV * 2;
    let yAtual = margemV + Math.random() * alturaUtil;
    const pontos = [[0, yAtual]];
    for (let i = 1; i <= passos; i++) {
        const x = i * passoX;
        pontos.push([x, yAtual]); // reto na horizontal até o próximo degrau
        yAtual = margemV + Math.random() * alturaUtil;
        pontos.push([x, yAtual]); // reto na vertical, sobe/desce de uma vez (canto vivo)
    }
    return pontos;
}

// Partículas da desintegração (ver `estadoMorte` mais abaixo) — um punhado
// de quadradinhos que voam pra fora em direções/distâncias aleatórias
// (sorteadas uma vez só, ver useMemo no componente) enquanto o corpo
// inteiro desmancha (ver .fantasminha-flutuante-desintegrando no CSS).
// Nada de física de verdade — só CSS puro, mesmo espírito pragmático do
// resto deste arquivo (Engrenagem, monitor).
const PARTICULAS_QTD = 12;
const PARTICULA_DISTANCIA_MIN = 40;
const PARTICULA_DISTANCIA_MAX = 90;

// Engrenagem decorativa (ver `bot` mais abaixo) — dentes como retângulos
// arredondados distribuídos em volta de um corpo circular (mais simples de
// desenhar/ler que um <path> de engrenagem de verdade, e já solto no
// mesmo espírito pragmático do resto deste arquivo: formas geométricas
// básicas compostas, não ilustração). Dois anéis no centro (mais escuro por
// cima do corpo, mais claro por cima desse) sugerem o furo do eixo sem
// precisar de transparência de verdade — não dá pra saber o que fica atrás
// do fantasminha na mesa.
function Engrenagem({ className, dentes = 8, corBase = '#cbd1d6', corSombra = '#8a9096' }) {
    return (
        <svg className={className} viewBox="0 0 100 100">
            <g fill={corBase}>
                <circle cx="50" cy="50" r="34" />
                {Array.from({ length: dentes }, (_, i) => (
                    <rect
                        key={i}
                        x="43" y="4" width="14" height="22" rx="3"
                        transform={`rotate(${(360 / dentes) * i} 50 50)`}
                    />
                ))}
            </g>
            <circle cx="50" cy="50" r="15" fill={corSombra} />
            <circle cx="50" cy="50" r="7" fill={corBase} />
        </svg>
    );
}

// `chapeu` e `hue` vêm de FORA agora (ver MesaExperimento.jsx:
// chapeusPorAssento/huesPorAssento) — não são mais sorteados aqui dentro.
// Precisa disso por DOIS motivos: (1) a ficha de aposta de cada
// fantasminha (ver Ficha.jsx/fantasmaAposta) tem que saber a MESMA cor do
// corpo dele; (2) a tela de vitória (jogoVencedorIndice em
// MesaExperimento.jsx) cria um <Fantasminha> NOVO só pra aquele momento —
// se cor/chapéu nascessem e morressem dentro deste componente, cada
// instância nova sortearia os PRÓPRIOS valores, diferentes do fantasminha
// que já existia na mesa (era o bug: cor batia por coincidência não bate
// mais aqui, chapéu não batia nunca).
// `bot` (ver botPorAssento/alternarBotFantasma em MesaExperimento.jsx):
// vira o avatar temporário de quem está jogando no automático — duas
// engrenagens por cima do corpo + olhos/boca quadrados em vez de
// redondos (ver .fantasminha-rosto-bot no CSS), sem mexer em cor, chapéu
// nem no balançar/flutuar, que continuam os mesmos de sempre.
// `ajusteChapeuPct` (default 0): desloca o chapéu verticalmente em cima do
// `top` fixo do CSS (ver --chapeu-ajuste/.fantasminha-chapeu em index.css)
// — cada chapéu tem o seu próprio nudge calibrado à mão (ver `ajuste` em
// chapeus.js/assets/chapeus/calibracao-chapeus.csv), já que a maioria não
// nasceu desenhada pro mesmo lugar em cima do fantasminha.
export default function Fantasminha({ children, destacado, danoVersao, bot, monitor = true, hue, naVez, chapeu, estadoMorte, ajusteChapeuPct = 0 }) {
    const idGradiente = useId();
    const idCorteClip = useId();
    const idTelaClip = useId();
    const { duracao, atraso, duracaoCauda, atrasoCauda } = useMemo(() => ({
        duracao: DURACAO_MIN_S + Math.random() * (DURACAO_MAX_S - DURACAO_MIN_S),
        // Atraso NEGATIVO adianta o relógio da animação em vez de esperar
        // pra começar — é isso que faz cada fantasminha nascer num ponto
        // diferente da onda (offset de fase) em vez de todos começarem
        // subindo juntos.
        atraso: Math.random() * DURACAO_MAX_S,
        duracaoCauda: DURACAO_CAUDA_MIN_S + Math.random() * (DURACAO_CAUDA_MAX_S - DURACAO_CAUDA_MIN_S),
        atrasoCauda: Math.random() * DURACAO_CAUDA_MAX_S,
    }), []);

    // `danoVersao` é o mesmo truque de `versaoChapeu`: um contador que só
    // interessa MUDAR (ver botão "💥 Fantasma leva dano" em
    // MesaExperimento.jsx), não o valor em si. `primeiraVez` evita disparar
    // a animação já no mount (quando o valor inicial, 0, "muda" de
    // undefined pra 0 na primeira renderização).
    const [machucado, setMachucado] = useState(false);
    const primeiraVez = useRef(true);
    useEffect(() => {
        if (primeiraVez.current) {
            primeiraVez.current = false;
            return;
        }
        setMachucado(true);
        const id = setTimeout(() => setMachucado(false), DURACAO_DANO_MS);
        return () => clearTimeout(id);
    }, [danoVersao]);

    // Sorteado de novo a CADA pancada (chave é danoVersao, não []) — mesmo
    // espírito do corte/flash logo abaixo, que também usam `key={danoVersao}`
    // pra reiniciar do zero a cada hit mesmo que o anterior ainda não tenha
    // sumido de todo.
    const chapeuImpacto = useMemo(() => ({
        x: (Math.random() * 2 - 1) * CHAPEU_IMPACTO_LADO,
        y: -(CHAPEU_IMPACTO_SOBE_MIN + Math.random() * (CHAPEU_IMPACTO_SOBE_MAX - CHAPEU_IMPACTO_SOBE_MIN)),
        rot: (Math.random() * 2 - 1) * CHAPEU_IMPACTO_ROT_GRAUS,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só deve resortear quando MUDA danoVersao, não a cada render
    }), [danoVersao]);

    // Sorteada uma vez por fantasminha (não muda ligando/desligando `bot`
    // de novo — mesmo espírito do `hue` acima) — vira só o `d` de um
    // <path>, ver JSX: "M x0,y0 L x1,y1 L x2,y2 ...".
    const ondaD = useMemo(() => {
        const pontos = gerarOndaQuadrada(ONDA_PASSOS, TELA_LARGURA, TELA_ALTURA, ONDA_MARGEM_V);
        return `M${pontos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só sorteia no mount, mesmo padrão do `hue`/chapéu
    }, []);

    // Sorteadas uma vez só (nunca muda de novo — "morrer" só acontece uma
    // vez na vida de um fantasminha) — direção/distância/atraso de cada
    // partícula da desintegração (ver estadoMorte mais abaixo).
    const particulas = useMemo(() => Array.from({ length: PARTICULAS_QTD }, () => {
        const angulo = Math.random() * Math.PI * 2;
        const distancia = PARTICULA_DISTANCIA_MIN + Math.random() * (PARTICULA_DISTANCIA_MAX - PARTICULA_DISTANCIA_MIN);
        return {
            dx: Math.cos(angulo) * distancia,
            dy: Math.sin(angulo) * distancia,
            rot: Math.random() * 360,
            atraso: Math.random() * 150,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só sorteia no mount, mesmo padrão do `hue`/chapéu/onda
    }), []);

    // `estadoMorte` (ver MesaExperimento.jsx: matarFantasma/estadoMorte
    // PorAssento) — 'impacto' ou 'desintegrando' força o rosto a ficar
    // "machucado" (olhos fechados) PERMANENTEMENTE, não só durante
    // `machucado` (que é transitório, volta sozinho). 'desintegrando'
    // ainda liga a animação de desmanchar + as partículas.
    const morrendo = estadoMorte != null;
    const desintegrando = estadoMorte === 'desintegrando';

    return (
        <div
            // Modificador "atacado" (ver machucado acima) vive AQUI, no
            // container de fora, não só no .fantasminha-rosto — é o que
            // deixa o CSS reagir de fora pra dentro (ver
            // .fantasminha-flutuante-atacado .mesa-exp-mao-carta/-leque em
            // index.css) sem precisar passar `machucado` como prop pra
            // dentro de `children` (MaoEmLeque, que nem sabe que existe
            // dano — só o CSS liga os dois via seletor descendente).
            // `-desintegrando` (ver estadoMorte) troca a PRÓPRIA animação
            // de flutuar pela de desmanchar — não fica bobeando enquanto
            // morre.
            className={`fantasminha-flutuante${machucado ? ' fantasminha-flutuante-atacado' : ''}${desintegrando ? ' fantasminha-flutuante-desintegrando' : ''}`}
            // Duração/atraso do FLUTUAR vêm sorteados por instância — mas
            // durante a desintegração precisam virar os da PRÓPRIA
            // animação de desmanchar (ver DURACAO_DESINTEGRAR_MS), senão o
            // navegador aplicaria a duração/atraso do flutuar (inline
            // sempre vence classe) na animação errada, cortando ou
            // esticando ela sem querer.
            style={desintegrando
                ? { animationDuration: `${DURACAO_DESINTEGRAR_MS}ms`, animationDelay: '0ms' }
                : { animationDuration: `${duracao.toFixed(2)}s`, animationDelay: `-${atraso.toFixed(2)}s` }}
        >
            {/* ANTES do <svg> do corpo de propósito — sem z-index nem
                position própria pra nenhum dos dois, quem vem primeiro no
                DOM pinta embaixo: assim o corpo (opaco) cobre o miolo das
                engrenagens, só os dentes/pontas sobram pra fora da
                silhueta, "espiando" atrás do fantasminha. Cores tiradas do
                MESMO gradiente do corpo (stops de 45%/100%, ver
                radialGradient abaixo) — a engrenagem tem que parecer FEITA
                do fantasminha, não uma peça solta por cima. */}
            {bot && (
                <>
                    <Engrenagem
                        className="fantasminha-engrenagem fantasminha-engrenagem-pequena"
                        dentes={8}
                        corBase={`hsl(${hue}, 80%, 82%)`}
                        corSombra={`hsl(${hue}, 65%, 68%)`}
                    />
                    <Engrenagem
                        className="fantasminha-engrenagem fantasminha-engrenagem-grande"
                        dentes={10}
                        corBase={`hsl(${hue}, 80%, 82%)`}
                        corSombra={`hsl(${hue}, 65%, 68%)`}
                    />
                </>
            )}
            <svg
                className={`fantasminha-svg${destacado ? ' fantasminha-svg-destacado' : ''}`}
                viewBox="0 0 100 100"
            >
                <defs>
                    <radialGradient id={idGradiente} cx="35%" cy="30%" r="75%">
                        <stop offset="0%" stopColor={`hsl(${hue}, 90%, 95%)`} />
                        <stop offset="45%" stopColor={`hsl(${hue}, 80%, 82%)`} />
                        <stop offset="100%" stopColor={`hsl(${hue}, 65%, 68%)`} />
                    </radialGradient>
                </defs>
                {/* `destacado` (ver MesaExperimento.jsx: assento de quem
                    jogou a carta em hover, OU o próprio assento em hover)
                    contorna o CONTORNO DE VERDADE do fantasma — a
                    silhueta do path, não um retângulo por cima dele — via
                    stroke direto no SVG. `naVez` (de quem é a vez agora,
                    NÃO depende do mouse) usa a MESMA técnica e o mesmo
                    amarelo — azul claro sumia demais em cima do feltro. */}
                <path
                    d={corpoComPonta(50)}
                    fill={`url(#${idGradiente})`}
                    stroke={destacado || naVez ? '#ffcc00' : 'none'}
                    strokeWidth={destacado || naVez ? 3 : 0}
                >
                    {/* centro -> direita -> centro -> esquerda -> centro,
                        num ciclo só — "andar pra direita pra esquerda" em
                        vaivém, não só ida. */}
                    <animate
                        attributeName="d"
                        values={[50, 50 + AMPLITUDE_CAUDA, 50, 50 - AMPLITUDE_CAUDA, 50]
                            .map(corpoComPonta)
                            .join(';')}
                        keyTimes="0;0.25;0.5;0.75;1"
                        calcMode="spline"
                        keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                        dur={`${duracaoCauda.toFixed(2)}s`}
                        begin={`-${atrasoCauda.toFixed(2)}s`}
                        repeatCount="indefinite"
                    />
                </path>
                {/* Flash branco por cima da silhueta inteira — bem mais
                    rápido que o resto do impact frame (o corte/aperto de
                    olho seguram DURACAO_DANO_MS inteiro), some sozinho
                    rápido pra dar aquele "pisca" de dano. `d` fixo (sem a
                    animação da cauda) de propósito: dura tão pouco que o
                    descompasso com a cauda balançando não dá pra notar. */}
                {machucado && (
                    <path key={`flash-${danoVersao}`} className="fantasminha-flash" d={corpoComPonta(50)} fill="#ffffff" />
                )}
                {/* O corte só existe enquanto machucado — `key={danoVersao}`
                    força remontar (e reiniciar as animações do zero, tanto
                    a SMIL do <rect> quanto a CSS do <g>) a cada nova
                    pancada, mesmo que a anterior ainda não tenha sumido de
                    todo. */}
                {machucado && (
                    <g
                        key={danoVersao}
                        className="fantasminha-corte-grupo"
                        transform={`translate(${CORTE_CENTRO.x} ${CORTE_CENTRO.y}) rotate(${CORTE_ANGULO_GRAUS})`}
                    >
                        <defs>
                            <clipPath id={idCorteClip}>
                                {/* Largura anima de 0 até cobrir a lente
                                    inteira — "desenha" o corte de ponta a
                                    ponta por cima da forma já pronta (fina
                                    nas pontas, grossa no meio). */}
                                <rect
                                    x={-CORTE_METADE_COMPRIMENTO}
                                    y={-CORTE_METADE_ESPESSURA * 2}
                                    width="0"
                                    height={CORTE_METADE_ESPESSURA * 4}
                                >
                                    <animate
                                        attributeName="width"
                                        from="0"
                                        to={CORTE_METADE_COMPRIMENTO * 2}
                                        dur="0.22s"
                                        fill="freeze"
                                    />
                                </rect>
                            </clipPath>
                        </defs>
                        <path className="fantasminha-corte" d={CORTE_LENTE} clipPath={`url(#${idCorteClip})`} />
                    </g>
                )}
                {/* Monitor de peito (ver MONITOR_/TELA_/ONDA_ e `bot` lá em
                    cima) — POR CIMA do corpo (não antes, como as
                    engrenagens): é um equipamento colado na "roupa" do
                    robô, não algo por trás dele. Moldura + tela escura fixas;
                    dentro dela, a onda (gerada uma vez em `ondaD`) rola pra
                    a esquerda pra sempre — SMIL, mesmo padrão do balanço da
                    cauda/clip do corte acima, não CSS. Cor da onda: o MESMO
                    hue do corpo, só que bem mais saturada/escura (o corpo
                    usa no máximo 90% de saturação nos tons claros; aqui
                    100%, quase neon contra a tela quase preta). `monitor`
                    (default true) é uma chave À PARTE de `bot` — ver botão
                    "🔀 Monitor" em MesaExperimento.jsx: dá pra comparar o
                    visual de bot com/sem ele, sem desligar engrenagens nem
                    olhos/boca quadrados junto. */}
                {/* Monitor desligado por enquanto — bot fica só com
                    engrenagens + olhos/boca quadrados. Pra religar, é só
                    descomentar o bloco abaixo.
                {bot && monitor && (
                    <g>
                        <rect {...MONITOR_RECT} fill={MONITOR_COR_TELA} stroke={MONITOR_COR_MOLDURA} strokeWidth="2" />
                        <defs>
                            <clipPath id={idTelaClip}>
                                <rect x="0" y="0" width={TELA_LARGURA} height={TELA_ALTURA} />
                            </clipPath>
                        </defs>
                        <g transform={`translate(${TELA_RECT.x} ${TELA_RECT.y})`} clipPath={`url(#${idTelaClip})`}>
                            <g fill="none" stroke={`hsl(${hue}, 100%, 62%)`} strokeWidth="1.6" strokeLinejoin="round">
                                Duas cópias idênticas lado a lado (a
                                    segunda começa exatamente onde a primeira
                                    termina, TELA_LARGURA à direita) — o <g>
                                    desliza TELA_LARGURA inteira pra esquerda
                                    e volta pro começo (from/to), sem dar pra
                                    notar a costura.
                                <path d={ondaD} />
                                <path d={ondaD} transform={`translate(${TELA_LARGURA} 0)`} />
                                <animateTransform
                                    attributeName="transform"
                                    type="translate"
                                    from="0 0"
                                    to={`-${TELA_LARGURA} 0`}
                                    dur={`${ONDA_DURACAO_S}s`}
                                    repeatCount="indefinite"
                                />
                            </g>
                        </g>
                    </g>
                )}
                */}
            </svg>
            {/* `morrendo` reusa a MESMA classe -machucado do dano normal
                (olhos "apertam"/fecham, boca aumenta, ver .fantasminha-
                machucado no CSS) — só que aqui fica PRA SEMPRE, não volta
                sozinho: "toma a animação de dano e fica naquele estado". */}
            <div className={`fantasminha-rosto${(machucado || morrendo) ? ' fantasminha-machucado' : ''}${bot ? ' fantasminha-rosto-bot' : ''}`}>
                <div className="fantasminha-olho fantasminha-olho-esq" />
                <div className="fantasminha-olho fantasminha-olho-dir" />
                <div className="fantasminha-boca" />
            </div>
            {/* Partículas da desintegração (ver particulas/desintegrando
                lá em cima) — só existem no DOM na fase 'desintegrando',
                cada uma some sozinha no fim da própria animação. */}
            {desintegrando && (
                <div className="fantasminha-particulas">
                    {particulas.map((p, i) => (
                        <span
                            key={i}
                            className="fantasminha-particula"
                            style={{
                                background: `hsl(${hue}, 75%, 78%)`,
                                animationDelay: `${p.atraso.toFixed(0)}ms`,
                                '--particula-dx': `${p.dx.toFixed(1)}px`,
                                '--particula-dy': `${p.dy.toFixed(1)}px`,
                                '--particula-rot': `${p.rot.toFixed(0)}deg`,
                            }}
                        />
                    ))}
                </div>
            )}
            {/* Sorteado uma vez por fantasminha (ver chapeus.js) — nasce
                fixo em cima da cabeça, não acompanha a cauda nem o rosto.
                Durante `machucado`, ganha a classe -impacto (ver
                @keyframes fantasminha-chapeu-impacto em index.css): sobe/
                desloca/gira pelos valores de chapeuImpacto (variáveis CSS
                inline, sorteados por pancada) e volta sozinho pro lugar —
                animationDuration bate com DURACAO_DANO_MS de propósito,
                pra terminar exatamente quando `machucado` vira false de
                novo, sem sobrar uma ponta de animação cortada. */}
            <span
                className={`fantasminha-chapeu${machucado ? ' fantasminha-chapeu-impacto' : ''}`}
                style={{
                    backgroundImage: `url(${chapeu})`,
                    animationDuration: `${DURACAO_DANO_MS}ms`,
                    '--chapeu-impacto-x': `${chapeuImpacto.x.toFixed(1)}px`,
                    '--chapeu-impacto-y': `${chapeuImpacto.y.toFixed(1)}px`,
                    '--chapeu-impacto-rot': `${chapeuImpacto.rot.toFixed(1)}deg`,
                    '--chapeu-ajuste': `${ajusteChapeuPct}%`,
                }}
            />
            {/* Filho de .fantasminha-flutuante de propósito (não um
                irmão) — assim quem passar algo aqui (ver MaoEmLeque em
                MesaExperimento.jsx) recebe o EXATO mesmo flutuar em onda
                senoidal deste fantasminha, sem duplicar duração/atraso
                sorteados: é o mesmo elemento animado carregando os dois
                juntos. */}
            {children}
        </div>
    );
}
