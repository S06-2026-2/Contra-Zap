import { useEffect, useRef, useState } from 'react';
import Carta from './Carta.jsx';

// Sandbox isolada (pedido do Henrique 2026-09-21): a mesma "sala" visual
// de MesaExperimento.jsx, mas só fundo+mesa — sem fantasminhas, cartas,
// socket ou `estado`/`acoes` nenhum. Reaproveita .mesa-exp-tela/
// .mesa-exp-mesa (ver index.css) pra ficar idêntica de longe, só que sem
// nenhuma peça de jogo em cima: é uma superfície vazia pra testar efeitos
// de "dano" nela — o corte, causado por uma faca de verdade caindo e
// DESLIZANDO de uma ponta à outra da linha (ver FacaCaindo).

// Sistema de corte em si (pedido do Henrique: "salve esse sistema, talvez
// precisemos criar outro") — mesma técnica que Fantasminha.jsx usa pro
// fantasma levando dano (ver CORTE_LENTE lá): uma "lente" (fina nas duas
// pontas, grossa no meio) feita de duas curvas quadráticas entre os
// mesmos dois pontos-ponta. `duracaoMs` é um prop (não valor fixo)
// exatamente pra poder ser reaproveitado por fluxos diferentes — hoje só
// FacaCaindo usa (com a duração do deslize, ver FACA_DESLIZE_MS, pra
// bater EXATAMENTE com a faca arrastando), mas o componente em si não
// sabe nem precisa saber disso. Sem a animação de sumir que o
// fantasminha tem (.fantasminha-corte-grupo): aqui o corte fica pra
// sempre.
//
// Revelado por clip-path + transição CSS (useState/rAF, MESMO mecanismo
// de FacaCaindo) — não por SMIL como Fantasminha.jsx faz. Era SMIL antes
// (um <rect> com <animate> de width), só que a faca precisa estar
// SINCRONIZADA com o corte quadro a quadro (a "mesma ponta" cortando) e
// SMIL roda no relógio interno do próprio <svg>, começando a contar
// quando o navegador processa aquele elemento — não necessariamente no
// MESMO frame que a transição CSS da faca (que é outro mecanismo de
// timing inteiramente à parte). Às vezes batia, às vezes o corte
// começava um frame (ou mais) depois da faca já ter saído andando —
// bug relatado pelo Henrique. Com os dois no mesmo mecanismo (clip-path
// + transition, disparados pelo mesmo React commit), o navegador começa
// as duas exatamente no mesmo frame sempre.
//
// Prefixo MESA_ nas constantes abaixo de propósito (outro bug relatado
// pelo Henrique: "aperta o botão e não acontece nada" — ReferenceError
// em produção, porque estes nomes SEM prefixo colidiam com os de
// Fantasminha.jsx, que já usa CORTE_METADE_COMPRIMENTO/CORTE_LENTE/etc.
// pro corte do fantasminha; os dois arquivos entram no MESMO bundle
// final, e essa colisão de identificador top-level quebrava a
// referência em runtime mesmo com o build passando limpo). Nunca usar
// CORTE_* cru aqui de novo — sempre MESA_CORTE_*.
const MESA_CORTE_METADE_COMPRIMENTO = 70;
const MESA_CORTE_METADE_ESPESSURA = 7;
const MESA_CORTE_CURVATURA = 10;
const MESA_CORTE_LENTE = `M-${MESA_CORTE_METADE_COMPRIMENTO},0 Q0,${MESA_CORTE_CURVATURA - MESA_CORTE_METADE_ESPESSURA} ${MESA_CORTE_METADE_COMPRIMENTO},0 Q0,${MESA_CORTE_CURVATURA + MESA_CORTE_METADE_ESPESSURA} -${MESA_CORTE_METADE_COMPRIMENTO},0 Z`;
// Fallback pra quem usar <CorteNaMesa> sem passar duracaoMs — não é mais
// o valor usado pela faca (ver FACA_DESLIZE_MS).
const MESA_CORTE_DURACAO_PADRAO_MS = 260;
// Bounding box da lente com folga (ver comentário de CORTE_LENTE em
// Fantasminha.jsx: o pico da curva fica bem dentro de ±(espessura+
// curvatura), essa margem de 4 sobra de propósito).
const MESA_CORTE_META_Y = MESA_CORTE_METADE_ESPESSURA + MESA_CORTE_CURVATURA;
const MESA_CORTE_SVG_LARGURA = MESA_CORTE_METADE_COMPRIMENTO * 2 + 8;
const MESA_CORTE_SVG_ALTURA = MESA_CORTE_META_Y * 2 + 8;

function CorteNaMesa({ corte }) {
    const [revelado, setRevelado] = useState(false);
    useEffect(() => {
        const quadro = requestAnimationFrame(() => setRevelado(true));
        return () => cancelAnimationFrame(quadro);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só dispara uma vez, no mount deste corte específico
    }, []);

    return (
        <div
            className="mesa-exp-corte-mesa"
            style={{
                left: `${corte.x}%`,
                top: `${corte.y}%`,
                transform: `translate(-50%, -50%) rotate(${corte.rot}deg) scale(${corte.escala})`,
            }}
        >
            {/* clip-path em % é relativo à própria caixa CSS do <svg>
                (MESA_CORTE_SVG_LARGURA/ALTURA, não ao viewBox) — como o
                viewBox mapeia 1:1 pra essa caixa, 0%/100% de inset da
                direita bate exatamente com a ponta esquerda/direita da
                lente (local x = -70/+70, ver MESA_CORTE_LENTE), revelando
                sempre da ESQUERDA pra DIREITA no espaço local — que é
                pontoInicio -> pontoFim de propósito (ver
                cortarLugarAleatorio: pontoA, sempre o lado -70, é
                sempre o pouso). ease-in-out igual à transição de
                posição da faca (não linear) — sem isso as duas
                bateriam só no início/fim e desalinhariam no meio. */}
            <svg
                width={MESA_CORTE_SVG_LARGURA}
                height={MESA_CORTE_SVG_ALTURA}
                viewBox={`${-MESA_CORTE_METADE_COMPRIMENTO - 4} ${-MESA_CORTE_META_Y - 4} ${MESA_CORTE_SVG_LARGURA} ${MESA_CORTE_SVG_ALTURA}`}
                style={{
                    clipPath: `inset(0 ${revelado ? 0 : 100}% 0 0)`,
                    transition: `clip-path ${corte.duracaoMs ?? MESA_CORTE_DURACAO_PADRAO_MS}ms ease-in-out`,
                }}
            >
                <path className="mesa-exp-corte-mesa-tracado" d={MESA_CORTE_LENTE} />
            </svg>
        </div>
    );
}

function esperar(ms) {
    return new Promise((resolver) => setTimeout(resolver, ms));
}

// Faca caindo (pedido do Henrique 2026-09-21, v2 — a v1 caía centralizada
// no corte e não dava a impressão de ser ELA cortando; agora pousa numa
// PONTA da linha e desliza pela mesa até a outra ponta, com o corte se
// desenhando NO MESMO RITMO do deslize — ver FACA_DESLIZE_MS == duração
// do corte). Ângulo da peça em si vem dos dois testados na Carta
// giratória — Pitch 141°/Yaw 240°/Roll 0° e o espelho Yaw 132° — mas o
// ângulo do CORTE em si (`rot`, direção da linha na mesa) é sorteado à
// parte por variante (ver FACA_YAW_VARIANTES: cada uma tem sua faixa de
// rot), e as DUAS pontas da linha são calculadas geometricamente a partir
// dele (ver cortarLugarAleatorio) — `driftSign` decide qual ponta é o
// POUSO (de onde a faca "veio") e qual é o DESTINO do deslize.
const FACA_YAW_VARIANTES = [
    { yaw: 240, driftSign: -1, rotMin: 140, rotMax: 160 }, // pousa na ponta direita, desliza pra esquerda
    { yaw: 132, driftSign: 1, rotMin: 20, rotMax: 40 }, // pousa na ponta esquerda, desliza pra direita
];
const FACA_PITCH_INICIAL = 141;
// Decresce — é ISSO que lê como "caindo" (pedido do Henrique: "o ângulo
// diminuir vai causar o efeito que está caindo"); fica FIXO nesse valor
// durante todo o resto da coreografia (pouso, deslize, levantar).
const FACA_PITCH_POUSO = 98;
const FACA_ESCALA_INICIAL = 3; // "super grande nesse ângulo"
// Multiplicada por `escalaGolpe` (sorteado por golpe, mesmo fator que
// escala o próprio corte — ver cortarLugarAleatorio) pra faca e corte
// crescerem/encolherem sempre JUNTOS, nunca um maior que o outro.
const FACA_ESCALA_POUSO_BASE = 1;
const FACA_QUEDA_ALTURA_PX = 260;
const FACA_DESLOCAMENTO_PX = 45; // flourish da queda, pequeno de propósito
const FACA_LEVANTAR_PX = 70;
const FACA_QUEDA_MS = 550; // do céu até a ponta de pouso
// A faca desliza de uma ponta à outra EXATAMENTE nesse tanto — é a MESMA
// duração passada pro corte (ver aoImpactar) como `duracaoMs`, pra a
// largura do corte se desenhando e a faca se arrastando baterem sempre,
// quadro a quadro, sem um terminar antes do outro.
const FACA_DESLIZE_MS = 520;
const FACA_LEVANTAR_MS = 380;
// Duração fixa (não escala com o resto) do "afundar"/"desafundar" da
// ponta — sempre um plunge rápido, não importa quão longo é o deslize.
const FACA_AFUNDAR_MS = 150;
// Topo/base do conjunto INTEIRO (lâmina+carta+guarda+cabo) relativo à
// origem do .carta-giro3d-miolo — mesma conta de CartaGiratoria.jsx
// (lâmina 220 pra cima, carta 154, guarda 16, cabo 77 pra baixo).
const FACA_ASSEMBLY_TOPO_PX = -220;
// Quanto da ponta "afunda"/some (medido a partir do topo) — só a
// pontinha da lâmina, não a lâmina inteira. Fica assim o deslize INTEIRO
// (ver fase 'cortando'), não só no instante do toque.
const FACA_AFUNDAMENTO_PX = 46;

function FacaCaindo({ faca, onImpacto, onFim }) {
    const [fase, setFase] = useState('inicio');

    useEffect(() => {
        let cancelado = false;
        async function coreografia() {
            await new Promise((r) => requestAnimationFrame(r));
            if (cancelado) return;
            setFase('pousando');
            await esperar(FACA_QUEDA_MS);
            if (cancelado) return;
            // Dispara o corte JUNTO com a troca pra 'cortando' — as duas
            // animações (deslize da faca via CSS, desenho do corte via
            // SMIL) começam no mesmo instante, com a mesma duração
            // (FACA_DESLIZE_MS), então correm sincronizadas até o fim.
            setFase('cortando');
            onImpacto();
            await esperar(FACA_DESLIZE_MS);
            if (cancelado) return;
            setFase('levantando');
            await esperar(FACA_LEVANTAR_MS);
            if (cancelado) return;
            onFim();
        }
        coreografia();
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- faca/onImpacto/onFim são fixos por instância (cada faca cai uma vez só)
    }, []);

    const pousada = fase === 'cortando' || fase === 'levantando';
    const pos = pousada ? faca.pontoFim : faca.pontoInicio;
    const escalaPouso = FACA_ESCALA_POUSO_BASE * faca.escalaGolpe;

    let driftX = 0;
    let quedaY = 0;
    let escala = escalaPouso;
    let pitch = FACA_PITCH_POUSO;
    let opacidade = 1;
    let afundada = false;
    if (fase === 'inicio') {
        driftX = faca.variante.driftSign * FACA_DESLOCAMENTO_PX;
        quedaY = -FACA_QUEDA_ALTURA_PX;
        escala = FACA_ESCALA_INICIAL;
        pitch = FACA_PITCH_INICIAL;
    } else if (fase === 'cortando') {
        afundada = true;
    } else if (fase === 'levantando') {
        quedaY = -FACA_LEVANTAR_PX;
        opacidade = 0;
    }

    // 'inicio' nunca transiciona DE lugar nenhum (primeiro paint) — 0 só
    // deixa isso explícito em vez de emprestar a duração de outra fase.
    const duracaoPosicao = fase === 'pousando' ? FACA_QUEDA_MS
        : fase === 'cortando' ? FACA_DESLIZE_MS
        : fase === 'levantando' ? FACA_LEVANTAR_MS
        : 0;
    const clipTopoPx = FACA_ASSEMBLY_TOPO_PX + (afundada ? FACA_AFUNDAMENTO_PX : 0);

    return (
        <div
            className="mesa-exp-faca-caindo"
            style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transition: `left ${duracaoPosicao}ms ease-in-out, top ${duracaoPosicao}ms ease-in-out, transform ${duracaoPosicao}ms ease-in-out`,
                transform: `translate(-50%, -50%) translate(${driftX}px, ${quedaY}px)`,
            }}
        >
            <div
                className="carta-giro3d-miolo"
                style={{
                    // clip-path sempre nos mesmos FACA_AFUNDAR_MS (um
                    // "plunge" rápido, não importa quão longo o resto da
                    // fase é) — as outras duas propriedades seguem a
                    // duração da fase atual (queda, deslize ou subida).
                    transition: `transform ${duracaoPosicao}ms ease-in-out, opacity ${duracaoPosicao}ms ease-in-out, clip-path ${FACA_AFUNDAR_MS}ms ease-in-out`,
                    opacity: opacidade,
                    transform: `scale(${escala}) rotateX(${pitch}deg) rotateY(${faca.variante.yaw}deg) rotateZ(0deg)`,
                    clipPath: `inset(${clipTopoPx}px -300px -300px -300px)`,
                }}
            >
                <div className="carta-giro3d-face">
                    <Carta rank="A" naipe="Espadas" efeitoManilha />
                </div>
                <div className="carta-giro3d-face carta-giro3d-face-verso">
                    <Carta virada />
                </div>
                <div className="carta-giro3d-lamina">
                    <span className="carta-giro3d-rebite carta-giro3d-rebite-lamina-esq" />
                    <span className="carta-giro3d-rebite carta-giro3d-rebite-lamina-dir" />
                </div>
                <div className="carta-giro3d-guarda">
                    <span className="carta-giro3d-rebite carta-giro3d-rebite-guarda-esq" />
                    <span className="carta-giro3d-rebite carta-giro3d-rebite-guarda-dir" />
                </div>
                <div className="carta-giro3d-cabo">
                    <span className="carta-giro3d-rebite carta-giro3d-rebite-cabo-cima" />
                    <span className="carta-giro3d-rebite carta-giro3d-rebite-cabo-baixo" />
                </div>
            </div>
        </div>
    );
}

export default function MesaDanificada({ onVoltar }) {
    const [cortes, setCortes] = useState([]);
    const [facas, setFacas] = useState([]);
    const proximoIdCorte = useRef(0);
    const proximoIdFaca = useRef(0);
    // Pra converter o "meio-comprimento" do corte (em px de verdade, ver
    // MESA_CORTE_METADE_COMPRIMENTO) nas duas pontas em %, precisa saber o
    // tamanho ATUAL da mesa em px (ela é responsiva — min(86vw,1080px) —
    // não dá pra assumir um valor fixo). Medido só na hora do clique
    // (getBoundingClientRect), não guardado/observado continuamente:
    // sobra preciso o bastante, a mesa não muda de tamanho no meio de um
    // golpe.
    const mesaRef = useRef(null);

    // "Lugar aleatório" fica numa faixa central (20-80% x, 22-78% y) em vez
    // de 0-100% — mesmo com o overflow:hidden+border-radius:inherit de
    // .mesa-exp-danos escondendo qualquer sobra fora do contorno oval, um
    // corte sorteado bem na quina ainda ficaria com metade dele cortado
    // fora de vista; a faixa central garante que a lente inteira sempre
    // caiba dentro da mesa.
    function cortarLugarAleatorio() {
        const variante = FACA_YAW_VARIANTES[Math.floor(Math.random() * FACA_YAW_VARIANTES.length)];
        const rot = variante.rotMin + Math.random() * (variante.rotMax - variante.rotMin);
        const escalaGolpe = 0.85 + Math.random() * 0.4;
        const centro = { x: 20 + Math.random() * 60, y: 22 + Math.random() * 56 };

        // dxPct/dyPct: meio-comprimento do corte (px reais, escalado)
        // convertido pra % de CADA EIXO separado (largura/altura da mesa
        // não são iguais — a mesa é bem mais larga que alta), senão o
        // ângulo `rot` desenhado na tela não bateria com o ângulo usado
        // aqui pra calcular as pontas.
        const retMesa = mesaRef.current?.getBoundingClientRect();
        const larguraMesaPx = retMesa?.width || 1080;
        const alturaMesaPx = retMesa?.height || 400;
        const metadePx = MESA_CORTE_METADE_COMPRIMENTO * escalaGolpe;
        const rad = (rot * Math.PI) / 180;
        const dxPct = ((metadePx * Math.cos(rad)) / larguraMesaPx) * 100;
        const dyPct = ((metadePx * Math.sin(rad)) / alturaMesaPx) * 100;
        // pontoA é sempre o lado -70 do espaço local da lente (mesmo -70
        // que MESA_CORTE_LENTE usa, ver CorteNaMesa) e pontoB o lado +70 — só
        // isso, sem precisar comparar qual é esquerda/direita: os
        // rotMin/rotMax de cada variante já foram escolhidos pra manter
        // cos(rot) com sinal CONSTANTE dentro da própria faixa (nunca
        // cruza 90°/270°), então "pontoA" cai sempre do lado que
        // combina com driftSign daquela variante (testado nas duas: 150°
        // dá pontoA à direita, 30° dá pontoA à esquerda — sempre onde a
        // faca deveria pousar). pontoA = pouso, pontoB = destino do
        // deslize, sempre nessa ordem.
        const pontoInicio = { x: centro.x - dxPct, y: centro.y - dyPct };
        const pontoFim = { x: centro.x + dxPct, y: centro.y + dyPct };

        const idFaca = ++proximoIdFaca.current;
        setFacas((atuais) => [
            ...atuais,
            { id: idFaca, variante, rot, escalaGolpe, centro, pontoInicio, pontoFim },
        ]);
    }

    function aoImpactar(faca) {
        const idCorte = ++proximoIdCorte.current;
        setCortes((atuais) => [
            ...atuais,
            {
                id: idCorte,
                x: faca.centro.x,
                y: faca.centro.y,
                rot: faca.rot,
                escala: faca.escalaGolpe,
                // A MESMA duração do deslize (ver FacaCaindo) — é isso que
                // faz o corte se desenhar no ritmo exato da faca
                // arrastando de ponta a ponta.
                duracaoMs: FACA_DESLIZE_MS,
            },
        ]);
    }

    function aoTerminarFaca(id) {
        setFacas((atuais) => atuais.filter((f) => f.id !== id));
    }

    return (
        <div className="mesa-exp-tela">
            <button type="button" className="mesa-exp-fechar" onClick={onVoltar}>← Voltar</button>
            <div className="mesa-exp-mesa" ref={mesaRef}>
                <div className="mesa-exp-danos">
                    {cortes.map((corte) => <CorteNaMesa key={corte.id} corte={corte} />)}
                </div>
                {facas.map((faca) => (
                    <FacaCaindo
                        key={faca.id}
                        faca={faca}
                        onImpacto={() => aoImpactar(faca)}
                        onFim={() => aoTerminarFaca(faca.id)}
                    />
                ))}
            </div>
            <button type="button" className="mesa-exp-cortar-botao" onClick={cortarLugarAleatorio}>
                🔪 Cortar a mesa
            </button>
        </div>
    );
}
