import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import RaiosNaCarta from './RaiosNaCarta.jsx';
import { useAjustesZap } from './ajustesZap.js';
import {
    BORDA_CICLO_MS, BORDA_DESLIZE_X, BORDA_DESLIZE_Y,
    FLIP_COLUNAS, FLIP_FOLGA, FLIP_FPS, FLIP_LINHAS, FLIP_QUADROS, FLIP_QUADRO_A, FLIP_QUADRO_L,
    prepararFlipbookBorda, urlFlipbookBorda,
} from './bordaFlipbook.js';

// Carta de baralho pro protótipo de mesa (MesaExperimento) — componente
// NOVO, não o .carta/.carta-face que Partida.jsx já usa de verdade; classes
// prefixadas "carta-exp-" de propósito, pra não colidir com aquele.
//
// Recebe o próprio valorInt e o valorInt da manilha da rodada (`manilha`) —
// a comparação é o mesmo critério de game/Mesa.js (c1.valorInt ===
// this.viraValor) pra decidir se é manilha, feita aqui dentro pra o
// componente reagir sozinho (borda/brilho dourado) sem quem chama precisar
// calcular isso na mão.

const NAIPES = {
    Ouros:   { simbolo: '♦', cor: '#f5a300' },
    Copas:   { simbolo: '♥', cor: '#e8102e' },
    Espadas: { simbolo: '♠', cor: '#1d2026' },
    Paus:    { simbolo: '♣', cor: '#0f6cff' },
};

// Teste de "material" por naipe quando a carta é MANILHA (ver `ehManilha`
// abaixo) — cada naipe vira uma classe própria no CSS (fundo/borda/glow
// diferentes: ouro de verdade, ferro, um coração gigante em Copas, raios em
// Paus/Zap). `COR_MANILHA` só existe pros dois naipes cujo fundo novo (ouro/
// ferro) não tem contraste nenhum com a cor original do naipe (vermelho em
// cima de ouro, azul em cima de ferro cinza escuro somem) — Copas/Paus
// mantêm o fundo bege de sempre, então a cor original continua legível.
const CLASSE_MANILHA_POR_NAIPE = {
    Ouros: 'carta-exp-manilha-ouros',
    Espadas: 'carta-exp-manilha-espadas',
    Copas: 'carta-exp-manilha-copas',
    Paus: 'carta-exp-manilha-paus',
};
const COR_MANILHA_POR_NAIPE = {
    Ouros: '#4a3005',
    Espadas: '#eef3f7',
};

// Layout de "pips" no meio da carta — só pras cartas numéricas do baralho
// de truco (ver valores em game/Baralho.js: 4,5,6,7,Q,J,K,A,2,3, sem
// 8/9/10). Ás é 1 naipe gigante centralizado; 2 e 3 formam uma coluna
// vertical; 4-7 usam duas colunas com `rot:180` na metade de baixo — igual
// carta de baralho de verdade, onde a metade inferior fica de cabeça pra
// baixo (assim a carta "lê certo" segurada de qualquer lado). Q/J/K ficam
// de fora de propósito: sem arte de rosto pra desenhar, só o índice do
// canto já basta pra elas.
const PIPS = {
    A: [{ x: 50, y: 50, grande: true }],
    2: [{ x: 50, y: 25 }, { x: 50, y: 75, rot: 180 }],
    3: [{ x: 50, y: 18 }, { x: 50, y: 50 }, { x: 50, y: 82, rot: 180 }],
    4: [{ x: 30, y: 22 }, { x: 70, y: 22 }, { x: 30, y: 78, rot: 180 }, { x: 70, y: 78, rot: 180 }],
    5: [{ x: 30, y: 22 }, { x: 70, y: 22 }, { x: 50, y: 50 }, { x: 30, y: 78, rot: 180 }, { x: 70, y: 78, rot: 180 }],
    6: [{ x: 30, y: 18 }, { x: 70, y: 18 }, { x: 30, y: 50 }, { x: 70, y: 50 }, { x: 30, y: 82, rot: 180 }, { x: 70, y: 82, rot: 180 }],
    7: [
        { x: 30, y: 18 }, { x: 70, y: 18 }, { x: 50, y: 34 },
        { x: 30, y: 50 }, { x: 70, y: 50 },
        { x: 30, y: 82, rot: 180 }, { x: 70, y: 82, rot: 180 },
    ],
};

// Borda elétrica do Zap (a partir do pen "Electric Border" do Balint
// Ferenczy, em azul claro): a borda de verdade passa por um filtro que
// desloca os pixels com ruído de turbulência — quatro camadas de ruído
// deslizando em sentidos opostos, então o contorno fica ondulando o tempo
// todo como se estivesse eletrificado. Por cima, duas cópias sem filtro e
// desfocadas fazem o brilho, e um reflexo branco em overlay clareia os
// cantos. O filtro é por carta (id próprio via useId).
//
// A linha filtrada é um <rect> dentro do próprio SVG do filtro, não uma div
// com `filter: url(#...)` no CSS: filtro de SVG aplicado a elemento HTML nem
// sempre é redesenhado quando o ruído muda; dentro do SVG ele é. O viewBox é
// a caixa da borda em px (carta 110x154 + 2px de cada lado).
//
// O deslize do ruído é escrito por JS a cada quadro (dx/dy dos feOffset), não
// por <animate>: o Chrome deixa de repintar filtro animado por SMIL quando os
// pais têm transform 3D, transição ou filter animado — justamente a carta na
// jogada do Zap —, e a borda congelava. Atributo mudado pelo DOM sempre
// invalida o filtro.
//
// Modos (ver ajustesZap.js):
// - 'viva': o filtro acima, 4 ruídos de 6 oitavas.
// - 'enxuta': o mesmo desenho com 2 ruídos de 3 oitavas — o 1º e o 2º ruído
//   da viva são idênticos (mesma seed), assim como o 3º e o 4º, então cada
//   um é calculado uma vez e deslocado duas; as oitavas de cima só dão
//   detalhe menor que um pixel nessa escala.
// - 'leve': o filtro com menos oitavas e sem deslize — calculado uma vez,
//   numa camada própria (.carta-exp-zap-borda-leve) que só treme por
//   transform.
// - 'flipbook': quadros da viva pré-desenhados num sprite (bordaFlipbook.js);
//   mostra a leve enquanto o sprite não fica pronto.
// `pulo` (viva/enxuta): o deslize é escrito só a cada `pulo` quadros.
const BORDA_OITAVAS = 6;
const BORDA_OITAVAS_ENXUTA = 3;
const BORDA_OITAVAS_LEVE = 2;

function BordaFiltro({ modo, pulo }) {
    const idFiltro = `carta-exp-zap-filtro-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const deslocRefs = useRef([]);
    const desliza = modo !== 'leve';

    useEffect(() => {
        if (!desliza) return undefined;
        let quadro;
        let contagem = 0;
        function passo(agora) {
            if (contagem++ % pulo === 0) {
                const f = (agora % BORDA_CICLO_MS) / BORDA_CICLO_MS;
                const [d1, d2, d3, d4] = deslocRefs.current;
                d1?.setAttribute('dy', (BORDA_DESLIZE_Y * (1 - f)).toFixed(2));
                d2?.setAttribute('dy', (-BORDA_DESLIZE_Y * f).toFixed(2));
                d3?.setAttribute('dx', (BORDA_DESLIZE_X * (1 - f)).toFixed(2));
                d4?.setAttribute('dx', (-BORDA_DESLIZE_X * f).toFixed(2));
            }
            quadro = requestAnimationFrame(passo);
        }
        quadro = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(quadro);
    }, [desliza, pulo]);

    const desloc = (i) => (el) => { deslocRefs.current[i] = el; };
    let ruidos;
    if (modo === 'enxuta') {
        ruidos = (
            <>
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={BORDA_OITAVAS_ENXUTA} result="ruidoA" seed="1" />
                <feOffset ref={desloc(0)} in="ruidoA" dx="0" dy={BORDA_DESLIZE_Y} result="ruidoDesloc1" />
                <feOffset ref={desloc(1)} in="ruidoA" dx="0" dy="0" result="ruidoDesloc2" />
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={BORDA_OITAVAS_ENXUTA} result="ruidoB" seed="2" />
                <feOffset ref={desloc(2)} in="ruidoB" dx={BORDA_DESLIZE_X} dy="0" result="ruidoDesloc3" />
                <feOffset ref={desloc(3)} in="ruidoB" dx="0" dy="0" result="ruidoDesloc4" />
            </>
        );
    } else {
        const oitavas = modo === 'leve' ? BORDA_OITAVAS_LEVE : BORDA_OITAVAS;
        ruidos = (
            <>
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={oitavas} result="ruido1" seed="1" />
                <feOffset ref={desloc(0)} in="ruido1" dx="0" dy={BORDA_DESLIZE_Y} result="ruidoDesloc1" />
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={oitavas} result="ruido2" seed="1" />
                <feOffset ref={desloc(1)} in="ruido2" dx="0" dy="0" result="ruidoDesloc2" />
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={oitavas} result="ruido3" seed="2" />
                <feOffset ref={desloc(2)} in="ruido3" dx={BORDA_DESLIZE_X} dy="0" result="ruidoDesloc3" />
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={oitavas} result="ruido4" seed="2" />
                <feOffset ref={desloc(3)} in="ruido4" dx="0" dy="0" result="ruidoDesloc4" />
            </>
        );
    }

    return (
        <svg className="carta-exp-zap-borda-svg" viewBox="0 0 114 158">
            <defs>
                <filter id={idFiltro} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
                    {ruidos}
                    <feComposite in="ruidoDesloc1" in2="ruidoDesloc2" result="parte1" />
                    <feComposite in="ruidoDesloc3" in2="ruidoDesloc4" result="parte2" />
                    <feBlend in="parte1" in2="parte2" mode="color-dodge" result="ruidoFinal" />
                    <feDisplacementMap in="SourceGraphic" in2="ruidoFinal" scale="11" xChannelSelector="R" yChannelSelector="B" />
                </filter>
            </defs>
            <rect className="carta-exp-zap-borda-linha" x="1" y="1" width="112" height="156" rx="9" filter={`url(#${idFiltro})`} />
        </svg>
    );
}

// O sprite é uma grade FLIP_COLUNAS x FLIP_LINHAS; duas camadas andam em
// degraus (steps) — a de dentro pelas colunas, a de fora pelas linhas — e
// juntas passam por todos os quadros em ordem, só com transform.
function BordaFlipbook({ url }) {
    const quadroMs = 1000 / FLIP_FPS;
    return (
        <div
            className="mf1-borda-flip"
            style={{ left: -FLIP_FOLGA, top: -FLIP_FOLGA, width: FLIP_QUADRO_L, height: FLIP_QUADRO_A }}
        >
            <div
                className="mf1-borda-flip-linhas"
                style={{
                    width: FLIP_QUADRO_L * FLIP_COLUNAS,
                    height: FLIP_QUADRO_A * FLIP_LINHAS,
                    animationDuration: `${quadroMs * FLIP_QUADROS}ms`,
                    animationTimingFunction: `steps(${FLIP_LINHAS})`,
                }}
            >
                <img
                    className="mf1-borda-flip-colunas"
                    src={url}
                    alt=""
                    draggable={false}
                    style={{
                        animationDuration: `${quadroMs * FLIP_COLUNAS}ms`,
                        animationTimingFunction: `steps(${FLIP_COLUNAS})`,
                    }}
                />
            </div>
        </div>
    );
}

function BordaEletrica({ modo = 'viva', pulo = 1 }) {
    const [urlFlip, setUrlFlip] = useState(urlFlipbookBorda);

    useEffect(() => {
        if (modo !== 'flipbook' || urlFlip) return undefined;
        let ativo = true;
        prepararFlipbookBorda().then((url) => { if (ativo && url) setUrlFlip(url); });
        return () => { ativo = false; };
    }, [modo, urlFlip]);

    const efetivo = modo === 'flipbook' && !urlFlip ? 'leve' : modo;

    return (
        <div className={`carta-exp-zap-borda${efetivo === 'leve' ? ' carta-exp-zap-borda-leve' : ''}`} aria-hidden="true">
            {efetivo === 'flipbook'
                ? <BordaFlipbook url={urlFlip} />
                : <BordaFiltro modo={efetivo} pulo={pulo} />}
            <div className="carta-exp-zap-borda-externa" />
            <div className="carta-exp-zap-borda-brilho carta-exp-zap-borda-brilho-1" />
            <div className="carta-exp-zap-borda-brilho carta-exp-zap-borda-brilho-2" />
            <div className="carta-exp-zap-borda-reflexo" />
        </div>
    );
}

// Valor da manilha da rodada (o `viraValor` do servidor, índice em
// ORDEM_RANKS) pra toda carta dentro do provider — a mesa de verdade
// (MesaExperimento) envolve tudo com isto, e qualquer carta daquele rank vira
// manilha sozinha (na mão, voando, na mesa, nas vazas ganhas), sem cada
// componente no meio precisar repassar prop. Fora de um provider é null e
// nada muda.
export const ManilhaContext = createContext(null);

// Mesma ordem de valorInt de game/Baralho.js.
const ORDEM_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

// `taxaRaios`/`taxaRaiosTransicaoMs`: só pro Zap (ver RaiosNaCarta) — quantos
// raios extras por segundo riscam dentro da carta e em quanto tempo chegar
// nessa taxa. `raiosPausados`: não nasce raio novo enquanto true.
export default function Carta({ rank, naipe, valorInt, manilha, efeitoManilha = false, virada = false, taxaRaios = 0, taxaRaiosTransicaoMs = 0, raiosPausados = false }) {
    const valorManilhaDaMesa = useContext(ManilhaContext);
    const zap = useAjustesZap();
    if (virada) {
        return <div className="carta-exp carta-exp-verso" />;
    }

    const info = NAIPES[naipe] ?? { simbolo: '', cor: 'inherit' };
    // `efeitoManilha`: força o efeito sem precisar de valorInt/manilha numéricos
    // (ninguém no jogo de verdade passa esses dois ainda — ver LequeManilha,
    // que É sempre manilha nas 4 cartas por construção). `manilha`/`valorInt`
    // continuam aqui pro dia que a mesa/mão real quiser calcular sozinha.
    const ehManilha = efeitoManilha
        || (manilha != null && valorInt === manilha)
        || (valorManilhaDaMesa != null && ORDEM_RANKS.indexOf(rank) === valorManilhaDaMesa);
    const cor = ehManilha ? (COR_MANILHA_POR_NAIPE[naipe] ?? info.cor) : info.cor;
    const classeMaterial = ehManilha ? CLASSE_MANILHA_POR_NAIPE[naipe] : null;
    const pips = PIPS[rank];

    return (
        <div className={`carta-exp${ehManilha ? ' carta-exp-manilha' : ''}${classeMaterial ? ` ${classeMaterial}` : ''}${zap.brilhoFiltro ? '' : ' carta-exp-brilho-leve'}`}>
            {/* Decoração por naipe, só quando é manilha — cada uma só
                aparece na carta do próprio naipe (ver classeMaterial acima
                escolhendo QUAL destas quatro classes entra). Abaixo do
                índice/pips na ordem do DOM (ver z-index deles no CSS), pra
                nunca tampar o rank/naipe de leitura. */}
            {ehManilha && naipe === 'Espadas' && (
                <>
                    <span className="carta-exp-rebite carta-exp-rebite-tl" />
                    <span className="carta-exp-rebite carta-exp-rebite-tr" />
                    <span className="carta-exp-rebite carta-exp-rebite-bl" />
                    <span className="carta-exp-rebite carta-exp-rebite-br" />
                </>
            )}
            {ehManilha && naipe === 'Copas' && (
                <div className="carta-exp-coracao-pulsante">♥</div>
            )}
            {ehManilha && naipe === 'Paus' && (
                <>
                    {zap.raiosDentro && <RaiosNaCarta taxa={taxaRaios} transicaoMs={taxaRaiosTransicaoMs} halo={!zap.brilhoFiltro} pausado={raiosPausados} />}
                    {zap.borda !== 'off' && <BordaEletrica modo={zap.borda} pulo={zap.bordaPulo ?? 1} />}
                </>
            )}

            {/* Índice repetido nos dois cantos opostos (clássico de carta
                de baralho de verdade) — com o leque mais cheio (ver
                SuaMaoEmLeque) as cartas se sobrepõem, e só um canto de
                cada uma fica visível por cima da vizinha; o de baixo
                garante que dê pra ler mesmo quando é o de cima que fica
                encoberto. O de baixo é o MESMO índice girado 180° (ver
                .carta-exp-indice-invertido), não um span reordenado na
                mão — é a forma clássica de ficar legível de cabeça pra
                baixo também. */}
            <div className="carta-exp-indice">
                <span className="carta-exp-rank" style={{ color: cor }}>{rank}</span>
                <span className="carta-exp-naipe" style={{ color: cor }}>{info.simbolo}</span>
            </div>
            <div className="carta-exp-indice carta-exp-indice-invertido">
                <span className="carta-exp-rank" style={{ color: cor }}>{rank}</span>
                <span className="carta-exp-naipe" style={{ color: cor }}>{info.simbolo}</span>
            </div>

            {pips && (
                <div className="carta-exp-pips">
                    {pips.map((pip, i) => (
                        <span
                            key={i}
                            className={`carta-exp-pip${pip.grande ? ' carta-exp-pip-grande' : ''}`}
                            style={{
                                left: `${pip.x}%`,
                                top: `${pip.y}%`,
                                color: cor,
                                transform: `translate(-50%, -50%) rotate(${pip.rot ?? 0}deg)`,
                            }}
                        >
                            {info.simbolo}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
