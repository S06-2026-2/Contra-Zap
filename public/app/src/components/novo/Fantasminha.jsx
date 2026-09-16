import { useId, useMemo } from 'react';

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

export default function Fantasminha() {
    const idGradiente = useId();
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

    return (
        <div
            className="fantasminha-flutuante"
            style={{ animationDuration: `${duracao.toFixed(2)}s`, animationDelay: `-${atraso.toFixed(2)}s` }}
        >
            <svg className="fantasminha-svg" viewBox="0 0 100 100">
                <defs>
                    <radialGradient id={idGradiente} cx="35%" cy="30%" r="75%">
                        <stop offset="0%" stopColor={`hsl(${hue}, 90%, 95%)`} />
                        <stop offset="45%" stopColor={`hsl(${hue}, 80%, 82%)`} />
                        <stop offset="100%" stopColor={`hsl(${hue}, 65%, 68%)`} />
                    </radialGradient>
                </defs>
                <path d={corpoComPonta(50)} fill={`url(#${idGradiente})`}>
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
            </svg>
            <div className="fantasminha-rosto">
                <div className="fantasminha-olho fantasminha-olho-esq" />
                <div className="fantasminha-olho fantasminha-olho-dir" />
                <div className="fantasminha-boca" />
            </div>
        </div>
    );
}
