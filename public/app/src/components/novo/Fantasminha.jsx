import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { sortearChapeu } from '../../chapeus.js';

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

// `versaoChapeu` é só um contador: subir ele (ver botão "🎩 Novos chapéus"
// em MesaExperimento.jsx) sorteia um chapéu novo sem mexer em mais nada
// (cor, timing da cauda/flutuar continuam os mesmos) — se fosse um `key`
// remontando o componente inteiro, tudo sortearia de novo junto.
export default function Fantasminha({ versaoChapeu, children, destacado, danoVersao }) {
    const idGradiente = useId();
    const idCorteClip = useId();
    const chapeu = useMemo(sortearChapeu, [versaoChapeu]);
    const { hue, duracao, atraso, duracaoCauda, atrasoCauda } = useMemo(() => ({
        hue: Math.random() * 360,
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

    return (
        <div
            // Modificador "atacado" (ver machucado acima) vive AQUI, no
            // container de fora, não só no .fantasminha-rosto — é o que
            // deixa o CSS reagir de fora pra dentro (ver
            // .fantasminha-flutuante-atacado .mesa-exp-mao-carta/-leque em
            // index.css) sem precisar passar `machucado` como prop pra
            // dentro de `children` (MaoEmLeque, que nem sabe que existe
            // dano — só o CSS liga os dois via seletor descendente).
            className={`fantasminha-flutuante${machucado ? ' fantasminha-flutuante-atacado' : ''}`}
            style={{ animationDuration: `${duracao.toFixed(2)}s`, animationDelay: `-${atraso.toFixed(2)}s` }}
        >
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
                    jogou a carta em hover) contorna o CONTORNO DE VERDADE
                    do fantasma — a silhueta do path, não um retângulo por
                    cima dele — via stroke direto no SVG. */}
                <path
                    d={corpoComPonta(50)}
                    fill={`url(#${idGradiente})`}
                    stroke={destacado ? '#ffcc00' : 'none'}
                    strokeWidth={destacado ? 3 : 0}
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
            </svg>
            <div className={`fantasminha-rosto${machucado ? ' fantasminha-machucado' : ''}`}>
                <div className="fantasminha-olho fantasminha-olho-esq" />
                <div className="fantasminha-olho fantasminha-olho-dir" />
                <div className="fantasminha-boca" />
            </div>
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
