import { useEffect, useRef, useState } from 'react';
import PunhalAssembly from './PunhalAssembly.jsx';
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
                transform: `translate(-50%, -50%) rotate(${corte.rot}deg) scale(${corte.escala}, ${corte.escala * (corte.arco ?? 1)})`,
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

// "Lugar aleatório" fica numa faixa central (20-80% x, 22-78% y) em vez de
// 0-100% — mesmo com o overflow:hidden+border-radius:inherit de
// .mesa-exp-danos escondendo qualquer sobra fora do contorno oval, um corte
// sorteado bem na quina ainda ficaria com metade dele cortado fora de vista;
// a faixa central garante que a lente inteira sempre caiba dentro da mesa.
// Extraído de cortarLugarAleatorio (era só uma variável local ali) porque a
// jogada simulada (ver CartaSimulada) precisa do MESMO centro pra pousar a
// carta jogada e, mais tarde, pra cortar a mesa nesse ponto.
function sortearPontoCentralMesa() {
    return { x: 20 + Math.random() * 60, y: 22 + Math.random() * 56 };
}

// Geometria completa de UM golpe de corte — variante/ângulo/escala/pontas —
// sem efeito colateral nenhum (não mexe em estado, só calcula e devolve).
// Extraído de cortarLugarAleatorio pra poder ser chamado de dois lugares: o
// botão manual (`centroForcado` omitido, sorteia um centro novo) e a jogada
// simulada (que primeiro pousa a carta jogada num centro, ver
// sortearPontoCentralMesa, e só depois de crescer/seguar chama isto de novo
// com ESSE MESMO centro — ver CartaSimulada — pra cortar exatamente onde a
// carta tinha pousado).
function sortearGeometriaCorte(mesaRef, centroForcado) {
    const variante = FACA_VARIANTES[Math.floor(Math.random() * FACA_VARIANTES.length)];
    const rot = variante.rotMin + Math.random() * (variante.rotMax - variante.rotMin);
    const escalaGolpe = 0.85 + Math.random() * 0.4;
    const centro = centroForcado ?? sortearPontoCentralMesa();

    // dxPct/dyPct: meio-comprimento do corte (px reais, escalado) convertido
    // pra % de CADA EIXO separado (largura/altura da mesa não são iguais —
    // a mesa é bem mais larga que alta), senão o ângulo `rot` desenhado na
    // tela não bateria com o ângulo usado aqui pra calcular as pontas.
    const retMesa = mesaRef.current?.getBoundingClientRect();
    const larguraMesaPx = retMesa?.width || 1080;
    const alturaMesaPx = retMesa?.height || 400;
    const metadePx = MESA_CORTE_METADE_COMPRIMENTO * escalaGolpe;
    const rad = (rot * Math.PI) / 180;
    const dxPct = ((metadePx * Math.cos(rad)) / larguraMesaPx) * 100;
    const dyPct = ((metadePx * Math.sin(rad)) / alturaMesaPx) * 100;
    // pontoA é sempre o lado -70 do espaço local da lente (mesmo -70 que
    // MESA_CORTE_LENTE usa, ver CorteNaMesa) e pontoB o lado +70 — só isso,
    // sem precisar comparar qual é esquerda/direita: os rotMin/rotMax de
    // cada variante já foram escolhidos pra manter cos(rot) com sinal
    // CONSTANTE dentro da própria faixa (nunca cruza 90°/270°), então
    // "pontoA" cai sempre do lado que combina com driftSign daquela
    // variante (testado nas duas: 150° dá pontoA à direita, 30° dá pontoA à
    // esquerda — sempre onde a faca deveria pousar). pontoA = pouso, pontoB
    // = destino do deslize, sempre nessa ordem.
    return {
        variante,
        rot,
        yaw: yawDoCorte(rot),
        escalaGolpe,
        // A lente sempre curva pro +y LOCAL; rotacionada por `rot`, isso
        // dá barriga pra baixo na tela quando cos(rot) >= 0 (corte indo pra
        // direita) e pra CIMA quando o corte vai pra esquerda. -1 espelha a
        // lente no eixo local (scaleY negativo em CorteNaMesa) pra barriga
        // ficar sempre pra baixo na tela — as duas direções de corte viram
        // espelho uma da outra, e a faca (ver seguirArcoDoCorte) acompanha.
        arco: Math.cos(rad) >= 0 ? 1 : -1,
        centro,
        pontoInicio: { x: centro.x - dxPct, y: centro.y - dyPct },
        pontoFim: { x: centro.x + dxPct, y: centro.y + dyPct },
    };
}

// Faca caindo (pedido do Henrique 2026-09-21, v2 — a v1 caía centralizada
// no corte e não dava a impressão de ser ELA cortando; agora pousa numa
// PONTA da linha e desliza pela mesa até a outra ponta, com o corte se
// desenhando NO MESMO RITMO do deslize — ver FACA_DESLIZE_MS == duração
// do corte). O ângulo do CORTE em si (`rot`, direção da linha na mesa) é
// sorteado por variante (ver FACA_VARIANTES: cada uma tem sua faixa de
// rot), e as DUAS pontas da linha são calculadas geometricamente a partir
// dele (ver cortarLugarAleatorio) — `driftSign` decide qual ponta é o
// POUSO (de onde a faca "veio") e qual é o DESTINO do deslize.
const FACA_VARIANTES = [
    { driftSign: -1, rotMin: 140, rotMax: 160 }, // pousa na ponta direita, desliza pra esquerda
    { driftSign: 1, rotMin: 20, rotMax: 40 }, // pousa na ponta esquerda, desliza pra direita
];
// Decresce até FACA_PITCH_POUSO durante a queda — ajuda a ler como "caindo".
const FACA_PITCH_INICIAL = 141;
// Pose da faca cortando: quase em pé, ponta enfiada na mesa e cabo vindo na
// direção de quem olha. Roll sempre 0 — ela cai reta.
const FACA_PITCH_POUSO = 130;
// O yaw (rotateY) gira a faca em torno do PRÓPRIO eixo da lâmina, então é
// ele que decide pra que lado o FIO aponta na mesa. O fio é o eixo X local
// da peça; depois de rotateX(p) rotateY(y) ele aparece na tela na direção
// (cos y, sin p · sin y). Pra ficar paralelo ao deslize (`rot`, y da tela
// crescendo pra baixo): tan y = tan rot / sin p — o atan2 abaixo escolhe o
// ramo em que o fio aponta PRO MESMO lado do deslize, não pro oposto.
function yawDoCorte(rot) {
    const r = (rot * Math.PI) / 180;
    const senoPitch = Math.sin((FACA_PITCH_POUSO * Math.PI) / 180);
    return (Math.atan2(Math.sin(r), senoPitch * Math.cos(r)) * 180) / Math.PI;
}
const FACA_ESCALA_INICIAL = 3; // "super grande nesse ângulo"
// Multiplicada por `escalaGolpe` (sorteado por golpe, mesmo fator que
// escala o próprio corte — ver cortarLugarAleatorio) pra faca e corte
// crescerem/encolherem sempre JUNTOS, nunca um maior que o outro. Mesmo
// tamanho de uma carta jogada na mesa (SIM_VOO_ESCALA_POUSO) — encolher de
// FACA_ESCALA_INICIAL até aqui é boa parte do efeito de queda.
const FACA_ESCALA_POUSO_BASE = 0.6;
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
// Onde a lâmina "entra" na mesa (a borda do clip afundado), medida a partir
// do pivô do miolo — o meio da carta (154/2 = 77px, transform-origin
// padrão). Enquanto ainda não afundou, os 46px da ponta ficam visíveis além
// da linha; ao afundar (clip-path), é exatamente esse pedaço que some
// "dentro" da mesa.
const FACA_ENTRADA_NA_MESA_PX = 154 / 2 - FACA_ASSEMBLY_TOPO_PX - FACA_AFUNDAMENTO_PX;
// == `perspective` de .mesa-exp-faca-caindo/.mesa-exp-carta-simulada (e do
// palco da Carta giratória) em index.css.
const FACA_PERSPECTIVA_PX = 700;

// Onde a entrada da lâmina aparece NA TELA, em px, relativa ao ponto
// ancorado em `pos` — pra empurrar o wrapper pelo inverso disso e a entrada
// cair EXATAMENTE em cima da linha do corte. O pivô continua sendo o meio da
// carta (em z=0, igual à Carta giratória): mudar o pivô pra ponta via
// translateY jogaria o resto da faca pra perto da câmera e a perspectiva
// deixaria ela enorme e com cara de deitada, diferente da pose testada.
// Mesma composição do transform do miolo — scale
// rotateX(pitch) rotateY(yaw) — aplicada no vetor (0, -E, 0) do pivô até a
// entrada; rotateY não mexe nesse vetor (ele É o eixo do rotateY), então
// yaw nem entra na conta. Depois projeta pela perspectiva (origem = pivô,
// porque o wrapper tem o tamanho exato da carta).
function entradaNaTela(escala, pitch) {
    const e = FACA_ENTRADA_NA_MESA_PX * escala;
    const p = (pitch * Math.PI) / 180;
    const z = -e * Math.sin(p);
    const fator = FACA_PERSPECTIVA_PX / (FACA_PERSPECTIVA_PX - z);
    return { x: 0, y: -e * Math.cos(p) * fator };
}

// O corte não é reto: a linha do meio da lente (ver MESA_CORTE_LENTE) é a
// média das duas quadráticas, ou seja, outra quadrática com controle em
// (0, MESA_CORTE_CURVATURA) — no progresso t ela fica 2·t·(1−t)·CURVATURA
// fora da reta entre as pontas (máximo no meio), na direção do +y local do
// corte. Como o controle está em x=0, o x dela anda LINEAR com t, que é
// exatamente o ritmo em que o corte se revela (clip-path, ease-in-out) e em
// que a faca desliza (left/top, ease-in-out) — então o mesmo t serve pros
// três. O deslize reto continua na transição de left/top; isto só SOMA o
// desvio perpendicular por cima, via a propriedade `translate` (aplicada
// por fora do `transform`, em px da mesa), com a MESMA duração/easing — os
// quadros são amostrados em t linear e o easing do efeito inteiro converte
// tempo em t igual à transição do deslize.
const FACA_ARCO_AMOSTRAS = 20;
function seguirArcoDoCorte(elemento, geometria) {
    if (!elemento?.animate) return;
    const r = (geometria.rot * Math.PI) / 180;
    const perpX = -Math.sin(r) * geometria.arco;
    const perpY = Math.cos(r) * geometria.arco;
    const quadros = [];
    for (let i = 0; i <= FACA_ARCO_AMOSTRAS; i++) {
        const t = i / FACA_ARCO_AMOSTRAS;
        const desvio = 2 * t * (1 - t) * MESA_CORTE_CURVATURA * geometria.escalaGolpe;
        quadros.push({ translate: `${perpX * desvio}px ${perpY * desvio}px` });
    }
    elemento.animate(quadros, { duration: FACA_DESLIZE_MS, easing: 'ease-in-out' });
}

function FacaCaindo({ faca, onImpacto, onFim }) {
    const [fase, setFase] = useState('inicio');
    const wrapperRef = useRef(null);

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
            seguirArcoDoCorte(wrapperRef.current, faca);
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
    const entrada = entradaNaTela(escala, pitch);

    return (
        <div
            ref={wrapperRef}
            className="mesa-exp-faca-caindo"
            style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transition: `left ${duracaoPosicao}ms ease-in-out, top ${duracaoPosicao}ms ease-in-out, transform ${duracaoPosicao}ms ease-in-out`,
                transform: `translate(-50%, -50%) translate(${driftX - entrada.x}px, ${quedaY - entrada.y}px)`,
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
                    transform: `scale(${escala}) rotateX(${pitch}deg) rotateY(${faca.yaw}deg) rotateZ(0deg)`,
                    clipPath: `inset(${clipTopoPx}px -300px -300px -300px)`,
                }}
            >
                <PunhalAssembly />
            </div>
        </div>
    );
}

// Jogada simulada (pedido do Henrique 2026-09-22): não é um sistema novo de
// verdade, é PONTE entre três que já existiam cada um do seu lado —
//   1) o voo de carta jogada (CartaVoando, MesaExperimento.jsx) — aqui
//      reduzido a girar/encolher em 2D indo de fora da mesa até um ponto
//      central, sem servidor nem assento de jogador nenhum por trás;
//   2) o crescer-e-escurecer de fim de vaza (CartaRevelando +
//      .mesa-exp-vaza-overlay, MESMA classe CSS reaproveitada aqui sem
//      mudar nada nela) — é o que faz a carta "sair da mesa, crescer, a
//      tela ficar escura";
//   3) o corte de verdade (FacaCaindo/CorteNaMesa, ACIMA nesta tela) —
//      reaproveitado chamando sortearGeometriaCorte/aoCortar com o MESMO
//      centro onde a carta simulada pousou, então o corte sai exatamente
//      de baixo dela.
// A única coisa literalmente NOVA é o meio de campo: a carta jogada vira o
// punhal crescendo (revela lâmina/guarda/cabo com a transição suave de
// PunhalAssembly/.carta-giro3d-extra-oculta, em vez do toggle seco que só
// CartaGiratoria tinha), segura firme um instante grande e escuro, desce pro
// mesmo pouso/ângulo que FacaCaindo usaria e, depois de cortar, faz o
// INVERSO de FacaCaindo (que só some): sobe, RECOLHE a espada de volta pra
// carta e pousa de novo na mesa — fica ali pra sempre, mesma lógica dos
// cortes (registro visual do que aconteceu, ver .mesa-exp-corte-mesa).
const SIM_VOO_DURACAO_MS = 620; // mesmo espírito de DURACAO_JOGADA_MS (MesaExperimento.jsx)
const SIM_VOO_ESCALA_INICIAL = 0.34; // == ESCALA_CARTA_JOGADA_INICIAL de lá
const SIM_VOO_ESCALA_POUSO = 0.6; // == ESCALA_CARTA_JOGADA_FINAL de lá
// Raio > 50 (borda da mesa, em %) de propósito — a carta nasce FORA da
// elipse, como se tivesse vindo de um jogador sentado ali, e voa pra dentro.
const SIM_ORIGEM_RAIO_X = 85;
const SIM_ORIGEM_RAIO_Y = 90;
const SIM_CRESCIDA_DURACAO_MS = 550; // == VAZA_REVELACAO_TRANSICAO_MS (MesaExperimento.jsx)
const SIM_CRESCIDA_ESCALA = 2.2;
const SIM_CRESCIDA_PITCH_GRAUS = -14;
const SIM_CRESCIDA_ROT_GRAUS = -90; // deitada na horizontal (lâmina pra esquerda) enquanto fica grande na tela
// O conjunto inteiro vai de -220px (ponta da lâmina) a +247px (fim do cabo)
// na origem do miolo, então o meio da FACA fica em y=13.5px, 63.5px acima
// do meio da CARTA (y=77, onde o transform-origin padrão pivota). Enquanto
// está grande na tela, esse translateY (aplicado antes das rotações/escala)
// leva o meio da faca pro pivô, então é ela que fica centralizada e gira em
// torno do próprio centro, não a carta.
const SIM_CRESCIDA_CENTRO_FACA_PX = 63.5;
// Fração da JANELA (não da mesa — mesma ideia de VAZA_REVELACAO_*_FRACAO em
// MesaExperimento.jsx), onde a carta cresce até parar.
const SIM_CRESCIDA_X_FRACAO = 0.5;
const SIM_CRESCIDA_Y_FRACAO = 0.48;
const SIM_SEGURAR_MS = 600;
const SIM_DESCIDA_DURACAO_MS = FACA_QUEDA_MS; // mesma sensação de queda da faca de verdade
// Um pouco mais que FACA_LEVANTAR_MS: dá tempo da espada recolher (transição
// de .35s em index.css, ver .carta-giro3d-extra-oculta) terminar ANTES da
// carta pousar de vez, em vez das duas coisas baterem no mesmo instante.
const SIM_LEVANTAR_DURACAO_MS = 420;
const SIM_POUSO_FINAL_DURACAO_MS = 260;
const SIM_POUSO_FINAL_ROT_MAX_GRAUS = 18; // pequena inclinação 2D, só pra não pousar sempre quadradinha

// Carta que já terminou a coreografia e ficou na mesa sai do z-index 47 de
// .mesa-exp-carta-simulada (que existe pra atravessar o escurecido) e desce
// pra baixo dele — senão, quando a PRÓXIMA jogada cresce e escurece a tela,
// as pousadas continuavam claras e por cima dela (as de Copas vêm depois no
// DOM, então empatando no 47 ainda ganhavam da espada crescendo).
const Z_CARTA_SIMULADA_POUSADA = 1;

function sortearOrigemJogador() {
    const angulo = Math.random() * Math.PI * 2;
    return { x: 50 + SIM_ORIGEM_RAIO_X * Math.cos(angulo), y: 50 + SIM_ORIGEM_RAIO_Y * Math.sin(angulo) };
}

// Empurrão (em PX de tela) que faz a carta — ainda ANCORADA em % dentro da
// mesa (ver `pos` no render de CartaSimulada) — parecer ter saltado pro
// centro da JANELA. Por que empurrão via transform e não position:fixed:
// trocar o TIPO de posicionamento no meio da coreografia quebraria a
// transição CSS (left/top em % e em px não são a mesma unidade pro
// navegador interpolar, viraria um salto seco); assim o elemento nunca muda
// de sistema de coordenadas, só de quanto translate() empurra em cima dele.
function calcularEmpurraoParaCentroDaTela(mesaRef, pontoPercentual) {
    const rect = mesaRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const ancoraX = rect.left + (rect.width * pontoPercentual.x) / 100;
    const ancoraY = rect.top + (rect.height * pontoPercentual.y) / 100;
    return {
        x: window.innerWidth * SIM_CRESCIDA_X_FRACAO - ancoraX,
        y: window.innerHeight * SIM_CRESCIDA_Y_FRACAO - ancoraY,
    };
}

function CartaSimulada({ mesaRef, onCortar, onFim }) {
    const [fase, setFase] = useState('jogando');
    const [partiu, setPartiu] = useState(false);
    const [origem] = useState(sortearOrigemJogador);
    const [pousoJogada] = useState(sortearPontoCentralMesa);
    const [giroInicial] = useState(() => 360 + Math.random() * 360);
    const [rotFinalJogada] = useState(() => Math.random() * 360);
    // A girada da crescida é no próprio plano da tela (rotateZ): sai de
    // rotFinalJogada e gira pra frente (menos de uma volta) até parar
    // deitada em SIM_CRESCIDA_ROT_GRAUS. `voltasZ` é o múltiplo de 360 onde ela termina
    // "em pé" — as fases seguintes partem dele (em vez de 0) pra não
    // desenrolar todas essas voltas de novo ao descer/pousar.
    const [voltasZ] = useState(() => 360 * Math.ceil((rotFinalJogada - SIM_CRESCIDA_ROT_GRAUS) / 360));
    const [rotFinalPouso] = useState(() => (Math.random() * 2 - 1) * SIM_POUSO_FINAL_ROT_MAX_GRAUS);
    // Só a queda pro corte e a geometria do corte em si dependem de valores
    // sorteados NO MEIO da coreografia (não no mount, como os de cima) —
    // ref porque não precisam disparar re-render sozinhos, só são lidos
    // depois que a fase que os usa já trocou (o setFase ao lado é que
    // dispara o render).
    const empurraoRef = useRef({ x: 0, y: 0 });
    const geometriaRef = useRef(null);
    const wrapperRef = useRef(null);

    useEffect(() => {
        let cancelado = false;
        async function coreografia() {
            await new Promise((r) => requestAnimationFrame(r));
            if (cancelado) return;
            setPartiu(true); // dispara o voo: da origem até pousoJogada
            await esperar(SIM_VOO_DURACAO_MS);
            if (cancelado) return;

            empurraoRef.current = calcularEmpurraoParaCentroDaTela(mesaRef, pousoJogada);
            setFase('subindo'); // sai da mesa, cresce, revela a espada, escurece a tela
            await esperar(SIM_CRESCIDA_DURACAO_MS);
            if (cancelado) return;

            setFase('segurando');
            await esperar(SIM_SEGURAR_MS);
            if (cancelado) return;

            // Corta EXATAMENTE onde a carta tinha pousado (mesmo pousoJogada
            // como centro) — o golpe sai de baixo do lugar onde ela cresceu.
            geometriaRef.current = sortearGeometriaCorte(mesaRef, pousoJogada);
            setFase('descendo'); // desce até o pouso do corte, clareia a tela de novo
            await esperar(SIM_DESCIDA_DURACAO_MS);
            if (cancelado) return;

            setFase('cortando');
            onCortar(geometriaRef.current);
            seguirArcoDoCorte(wrapperRef.current, geometriaRef.current);
            await esperar(FACA_DESLIZE_MS);
            if (cancelado) return;

            setFase('levantando'); // sobe e recolhe a espada (oposto de FacaCaindo, que só sumiria)
            await esperar(SIM_LEVANTAR_DURACAO_MS);
            if (cancelado) return;

            setFase('pousando-final');
            await esperar(SIM_POUSO_FINAL_DURACAO_MS);
            if (cancelado) return;

            setFase('pousada'); // fica assim pra sempre, mesma lógica dos cortes
            onFim();
        }
        coreografia();
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mesaRef/pousoJogada/onCortar/onFim são fixos por instância (cada jogada simulada roda uma vez só)
    }, []);

    const geometria = geometriaRef.current;
    let pos = pousoJogada;
    let offsetX = 0;
    let offsetY = 0;
    let escala = SIM_VOO_ESCALA_POUSO;
    let pitch = 0;
    let yaw = 0;
    let rotZ = 0;
    let pivoY = 0;
    let extraVisivel = false;
    let afundada = false;
    let escurecendo = false;
    let duracaoPos = 0;

    if (fase === 'jogando') {
        pos = partiu ? pousoJogada : origem;
        escala = partiu ? SIM_VOO_ESCALA_POUSO : SIM_VOO_ESCALA_INICIAL;
        rotZ = partiu ? rotFinalJogada : rotFinalJogada + giroInicial;
        duracaoPos = partiu ? SIM_VOO_DURACAO_MS : 0;
    } else if (fase === 'subindo' || fase === 'segurando') {
        offsetX = empurraoRef.current.x;
        offsetY = empurraoRef.current.y;
        escala = SIM_CRESCIDA_ESCALA;
        pitch = SIM_CRESCIDA_PITCH_GRAUS;
        rotZ = voltasZ + SIM_CRESCIDA_ROT_GRAUS;
        pivoY = SIM_CRESCIDA_CENTRO_FACA_PX;
        extraVisivel = true;
        escurecendo = true;
        duracaoPos = fase === 'subindo' ? SIM_CRESCIDA_DURACAO_MS : 0;
    } else if (fase === 'descendo') {
        pos = geometria.pontoInicio;
        escala = FACA_ESCALA_POUSO_BASE * geometria.escalaGolpe;
        pitch = FACA_PITCH_POUSO;
        yaw = geometria.yaw;
        rotZ = voltasZ;
        extraVisivel = true;
        duracaoPos = SIM_DESCIDA_DURACAO_MS;
    } else if (fase === 'cortando') {
        pos = geometria.pontoFim;
        escala = FACA_ESCALA_POUSO_BASE * geometria.escalaGolpe;
        pitch = FACA_PITCH_POUSO;
        yaw = geometria.yaw;
        rotZ = voltasZ;
        extraVisivel = true;
        afundada = true;
        duracaoPos = FACA_DESLIZE_MS;
    } else if (fase === 'levantando') {
        pos = geometria.pontoFim;
        offsetY = -FACA_LEVANTAR_PX;
        escala = SIM_VOO_ESCALA_POUSO;
        rotZ = voltasZ;
        duracaoPos = SIM_LEVANTAR_DURACAO_MS;
    } else { // 'pousando-final' ou 'pousada'
        pos = geometria.pontoFim;
        escala = SIM_VOO_ESCALA_POUSO;
        rotZ = voltasZ + rotFinalPouso;
        duracaoPos = fase === 'pousando-final' ? SIM_POUSO_FINAL_DURACAO_MS : 0;
    }

    const clipTopoPx = FACA_ASSEMBLY_TOPO_PX + (afundada ? FACA_AFUNDAMENTO_PX : 0);
    // Mesma correção de FacaCaindo (ver entradaNaTela) — só enquanto é faca
    // na mesa (descendo/cortando); nas outras fases ela é carta.
    if (fase === 'descendo' || fase === 'cortando') {
        const entrada = entradaNaTela(escala, pitch);
        offsetX -= entrada.x;
        offsetY -= entrada.y;
    }

    return (
        <>
            {/* MESMA classe da revelação de fim de vaza real (ver index.css)
                — escurece a tela inteira enquanto a carta está grande, fica
                montado o tempo todo pra ter como animar de volta pra
                transparente (ver comentário dela em index.css). Como a
                CartaSimulada nunca desmonta (fica pousada na mesa), o
                overlay só captura clique enquanto está escuro — senão
                ficaria uma camada invisível (z-index 46) por cima dos
                botões pra sempre. */}
            <div
                className={`mesa-exp-vaza-overlay${escurecendo ? ' mesa-exp-vaza-overlay-escuro' : ''}`}
                style={{ pointerEvents: escurecendo ? 'auto' : 'none' }}
            />
            <div
                ref={wrapperRef}
                className="mesa-exp-carta-simulada"
                style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transition: `left ${duracaoPos}ms ease-in-out, top ${duracaoPos}ms ease-in-out, transform ${duracaoPos}ms ease-in-out`,
                    transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
                    zIndex: fase === 'pousada' ? Z_CARTA_SIMULADA_POUSADA : undefined,
                }}
            >
                <div
                    className="carta-giro3d-miolo"
                    style={{
                        transition: `transform ${duracaoPos}ms ease-in-out, clip-path ${FACA_AFUNDAR_MS}ms ease-in-out`,
                        // translateY sempre presente (0 fora da crescida) —
                        // a lista de funções precisa ser a mesma em toda
                        // fase pro navegador interpolar função a função;
                        // se mudasse, cairia em interpolação de matriz e o
                        // giro de voltas inteiras do rotateZ viraria "nenhum giro".
                        transform: `scale(${escala}) rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${rotZ}deg) translateY(${pivoY}px)`,
                        clipPath: `inset(${clipTopoPx}px -300px -300px -300px)`,
                    }}
                >
                    <PunhalAssembly extraVisivel={extraVisivel} />
                </div>
            </div>
        </>
    );
}

// Jogada de Copas (pedido do Henrique 2026-09-23: coração -> paixão -> fogo)
// — mesmo começo da jogada de Espadas (CartaSimulada): voa de fora da mesa
// até um ponto central, sai da mesa crescendo pro centro da tela com o
// fundo escurecendo. Daí pra frente é outra coreografia:
//   segura um instante curto (COPAS_SEGURAR_MS) -> dá uma batida de coração
//   (.mesa-exp-copas-batida) e as chamas saem de TRÁS dela, crescendo de
//   baixo da carta pra fora das bordas (ChamasCopas modo 'borda', camada
//   abaixo da carta no DOM) -> cai de volta no mesmo ponto da mesa -> pega
//   fogo por CIMA (modo 'cobrindo') por mais ou menos o tempo que a faca
//   leva cortando/levantando/pousando -> levanta um pouco (mesma altura e
//   tempo da espada levantando, ver FACA_LEVANTAR_PX), anda um pouco pra
//   frente na direção em que foi jogada e pousa de novo intacta —
//   fica ali pra sempre como a de Espadas. No lugar onde ela queimou fica a
//   marca carbonizada (MarcaCarbonizada, na camada de danos) com um coração
//   intacto no meio.
const COPAS_SEGURAR_MS = 100;
// Da batida começar até as chamas aparecerem — as chamas saem logo depois
// do pico da primeira batida (14% de .52s em mesa-exp-copas-bater).
const COPAS_ATRASO_CHAMAS_MS = 80;
const COPAS_QUEIMANDO_ALTO_MS = 760;
const COPAS_DESCIDA_MS = 520;
// ~ FACA_DESLIZE_MS + SIM_LEVANTAR_DURACAO_MS + SIM_POUSO_FINAL_DURACAO_MS
// (tudo que a espada faz depois de pousar na mesa).
const COPAS_QUEIMANDO_MESA_MS = 1200;
const COPAS_POUSO_ROT_MAX_GRAUS = 18;
// Quanto ela anda pra frente (px de tela) entre sair da marca e pousar de
// novo — o bastante pra descobrir boa parte da marca carbonizada.
const COPAS_AVANCO_PX = 75;
const COPAS_APAGAR_FOGO_MS = 200;

// Uma fogueira no estilo do "CSS Blend Mode Fire" (codepen.io/jkantner/pen/
// gKRKKb, que o Henrique mandou): N bolinhas laranja com degradê radial
// espalhadas por igual na base, cada uma subindo e encolhendo até sumir em
// loop, com atraso sorteado. É o mix-blend-mode:screen entre elas (ver
// .mesa-exp-fogo-particula) que faz o miolo ficar amarelo/branco onde muitas
// se sobrepõem — sem imagem nem forma de chama desenhada. Tudo em `em`, então
// `fonte` (px) escala a fogueira inteira; ela fica ancorada pela BASE no
// ponto (x,y) em % do container.
//
// `acesa` liga o crescimento: de `escalaInicial` parada na base até
// `escalaFinal` deslocada `foraX/foraY` px, numa transição de `duracaoMs`.
// Só vale depois do primeiro quadro montada (`pronta`), senão uma fogueira
// que já nasce acesa (o fogão da mesa) pularia direto pro tamanho final.
//
// `espalhar` (fogueirinhas da pulsada) troca a transição por um loop CSS
// próprio (.mesa-exp-fogo-espalhando): nasce na semente, cresce e é lançada
// até foraX/foraY sumindo no fim, e recomeça — com `duracaoMs`/`atrasoMs`
// sorteados por fogueira, cada uma sai num ritmo diferente.
function FogueiraCodepen({ x, y, fonte, particulas, acesa, escalaInicial, escalaFinal, foraX = 0, foraY = 0, duracaoMs, atrasoMs = 0, espalhar = false }) {
    const [atrasos] = useState(() => Array.from({ length: particulas }, () => Math.random()));
    const [pronta, setPronta] = useState(false);
    useEffect(() => {
        const quadro = requestAnimationFrame(() => setPronta(true));
        return () => cancelAnimationFrame(quadro);
    }, []);
    const crescida = pronta && acesa;
    const estilo = espalhar
        ? {
            '--fora-x': `${foraX}px`,
            '--fora-y': `${foraY}px`,
            '--escala-inicial': escalaInicial,
            '--escala-final': escalaFinal,
            animationDuration: `${duracaoMs}ms`,
            animationDelay: `${atrasoMs}ms`,
        }
        : {
            transform: `translate(-50%, -100%) translate(${crescida ? foraX : 0}px, ${crescida ? foraY : 0}px) scale(${crescida ? escalaFinal : escalaInicial})`,
            transition: `transform ${duracaoMs}ms ease-out`,
        };
    return (
        <div
            className={`mesa-exp-fogo${espalhar ? ' mesa-exp-fogo-espalhando' : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, fontSize: `${fonte}px`, ...estilo }}
        >
            {atrasos.map((atraso, i) => (
                <span
                    key={i}
                    className="mesa-exp-fogo-particula"
                    style={{
                        left: `calc((100% - 5em) * ${i / particulas})`,
                        animationDelay: `-${atraso}s`,
                    }}
                />
            ))}
        </div>
    );
}

// 'borda' (na pulsada, por TRÁS da carta): fogueirinhas semeadas em pontos
// aleatórios num raio em volta do centro da carta (escondidas atrás dela) —
// cada uma cresce e é lançada pra fora numa direção sorteada até passar da
// borda da carta, com tempo e atraso próprios, em loop enquanto a carta tá
// grande. 'cobrindo' (na mesa, por CIMA): uma fogueira só com a base no pé
// da carta — o "fogão" — que cresce devagar do começo ao fim da queima.
// Posição em % da caixa da carta (110x154); o container é escalado junto
// com a carta.
const COPAS_FOGUEIRAS_BORDA = 18;
const COPAS_SEMENTE_RAIO_PX = 38;
// Quanto passa da borda da carta no fim do lançamento.
const COPAS_LANCAMENTO_ALEM_BORDA_MIN_PX = 20;
const COPAS_LANCAMENTO_ALEM_BORDA_MAX_PX = 60;

function sortearFogueiras(modo) {
    if (modo === 'cobrindo') {
        return [{ x: 50, y: 104, fonte: 14, particulas: 50, escalaInicial: 0.3, escalaFinal: 1.3, duracaoMs: COPAS_QUEIMANDO_MESA_MS }];
    }
    return Array.from({ length: COPAS_FOGUEIRAS_BORDA }, () => {
        const angulo = Math.random() * Math.PI * 2;
        const cos = Math.cos(angulo);
        const sen = Math.sin(angulo);
        const raioSemente = Math.sqrt(Math.random()) * COPAS_SEMENTE_RAIO_PX;
        // Distância do centro até a borda do retângulo (55x77 de meia-caixa)
        // nessa direção — o lançamento termina sempre um pouco além dela.
        const ateBorda = Math.min(55 / Math.max(Math.abs(cos), 1e-3), 77 / Math.max(Math.abs(sen), 1e-3));
        const alcance = ateBorda - raioSemente
            + COPAS_LANCAMENTO_ALEM_BORDA_MIN_PX
            + Math.random() * (COPAS_LANCAMENTO_ALEM_BORDA_MAX_PX - COPAS_LANCAMENTO_ALEM_BORDA_MIN_PX);
        return {
            x: 50 + ((cos * raioSemente) / 110) * 100,
            y: 50 + ((sen * raioSemente) / 154) * 100,
            fonte: 4.5 + Math.random() * 2.5,
            particulas: 16,
            espalhar: true,
            escalaInicial: 0.3,
            escalaFinal: 1.3 + Math.random() * 0.6,
            foraX: cos * alcance,
            foraY: sen * alcance,
            duracaoMs: 450 + Math.random() * 350,
            atrasoMs: Math.random() * 350,
        };
    });
}

// `transicaoEscala`: a MESMA transição de transform da carta na fase atual,
// pra o container encolher/crescer junto com ela (ex.: descendo da tela pra
// mesa) em vez de pular de tamanho.
function ChamasCopas({ modo, ativo, escala, duracaoFadeMs, transicaoEscala }) {
    const [fogueiras] = useState(() => sortearFogueiras(modo));
    // Só monta as fogueiras na primeira vez que acende (e não desmonta mais,
    // pra dar tempo do fade de saída) — assim o loop de cada uma começa da
    // semente na hora da pulsada, não no meio do ciclo.
    const [acendeu, setAcendeu] = useState(ativo);
    if (ativo && !acendeu) setAcendeu(true);
    return (
        <div
            className="mesa-exp-copas-chamas"
            style={{
                opacity: ativo ? 1 : 0,
                transform: `scale(${escala})`,
                transition: `opacity ${duracaoFadeMs}ms ease-out, transform ${transicaoEscala}`,
            }}
        >
            {acendeu && fogueiras.map((f, i) => <FogueiraCodepen key={i} acesa={ativo} {...f} />)}
        </div>
    );
}

// Contorno "amorfo" da mancha: pontos em volta de um círculo com raio
// sorteado por ponto, ligados por quadráticas que passam pelos PONTOS
// MÉDIOS (cada ponto sorteado vira só controle) — assim a borda fica
// ondulada mas sem nenhuma quina.
function sortearContornoAmorfo(raio, pontos) {
    const vertices = Array.from({ length: pontos }, (_, i) => {
        const angulo = (i / pontos) * Math.PI * 2;
        const r = raio * (0.72 + Math.random() * 0.4);
        return { x: Math.cos(angulo) * r, y: Math.sin(angulo) * r };
    });
    const medio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const inicio = medio(vertices[pontos - 1], vertices[0]);
    let d = `M${inicio.x.toFixed(1)},${inicio.y.toFixed(1)}`;
    for (let i = 0; i < pontos; i++) {
        const ctrl = vertices[i];
        const fim = medio(ctrl, vertices[(i + 1) % pontos]);
        d += ` Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${fim.x.toFixed(1)},${fim.y.toFixed(1)}`;
    }
    return `${d} Z`;
}

const MARCA_RAIO = 78;
const MARCA_TAMANHO_PX = MARCA_RAIO * 2 + 30;
// Coração centrado em (0,0), ~32x29 antes do scale — usado de máscara
// (buraco sem carbonizar) e pro contorno em brasa em volta dele.
const MARCA_CORACAO = 'M0,14.5 C-2,12.5 -16,3.5 -16,-4.5 C-16,-10.5 -11,-14.5 -6,-14.5 C-3,-14.5 -1,-12.5 0,-10.5 C1,-12.5 3,-14.5 6,-14.5 C11,-14.5 16,-10.5 16,-4.5 C16,3.5 2,12.5 0,14.5 Z';
const MARCA_CORACAO_ESCALA = 1.15;

let proximoIdMarca = 0;

function MarcaCarbonizada({ marca }) {
    const [ids] = useState(() => {
        const n = ++proximoIdMarca;
        return { grad: `mesa-exp-carbonizado-grad-${n}`, mascara: `mesa-exp-carbonizado-mascara-${n}` };
    });
    const [formas] = useState(() => ({
        externa: sortearContornoAmorfo(MARCA_RAIO, 13),
        interna: sortearContornoAmorfo(MARCA_RAIO * 0.62, 11),
    }));
    const meio = MARCA_TAMANHO_PX / 2;
    const coracao = `rotate(${marca.rot}) scale(${MARCA_CORACAO_ESCALA})`;
    return (
        <svg
            className="mesa-exp-carbonizado"
            width={MARCA_TAMANHO_PX}
            height={MARCA_TAMANHO_PX}
            viewBox={`${-meio} ${-meio} ${MARCA_TAMANHO_PX} ${MARCA_TAMANHO_PX}`}
            style={{
                left: `${marca.x}%`,
                top: `${marca.y}%`,
                '--duracao-carbonizar': `${COPAS_QUEIMANDO_MESA_MS}ms`,
            }}
        >
            <defs>
                <radialGradient id={ids.grad}>
                    <stop offset="0%" stopColor="#050302" stopOpacity="0.97" />
                    <stop offset="55%" stopColor="#120a05" stopOpacity="0.92" />
                    <stop offset="82%" stopColor="#2e1b0c" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#3d2410" stopOpacity="0.25" />
                </radialGradient>
                {/* Máscara invertida: tudo branco (mostra a mancha) menos o
                    coração preto no meio (esconde) — o feltro aparece
                    intacto ali, como um selo. */}
                <mask id={ids.mascara}>
                    <rect x={-meio} y={-meio} width={MARCA_TAMANHO_PX} height={MARCA_TAMANHO_PX} fill="#fff" />
                    <path d={MARCA_CORACAO} transform={coracao} fill="#000" />
                </mask>
            </defs>
            <g mask={`url(#${ids.mascara})`}>
                <path className="mesa-exp-carbonizado-borda" d={formas.externa} fill={`url(#${ids.grad})`} />
                <path d={formas.interna} fill="#040201" opacity="0.8" />
            </g>
            <path className="mesa-exp-carbonizado-brasa" d={MARCA_CORACAO} transform={coracao} />
        </svg>
    );
}

function CartaCopasSimulada({ mesaRef, onCarbonizar, onFim }) {
    const [fase, setFase] = useState('jogando');
    const [partiu, setPartiu] = useState(false);
    const [chamasBaixo, setChamasBaixo] = useState(false);
    const [origem] = useState(sortearOrigemJogador);
    const [pousoJogada] = useState(sortearPontoCentralMesa);
    const [giroInicial] = useState(() => 360 + Math.random() * 360);
    const [rotFinalJogada] = useState(() => Math.random() * 360);
    // Mesma ideia de voltasZ em CartaSimulada, só que termina EM PÉ (0°) na
    // crescida em vez de deitada — aqui não tem lâmina pra caber na tela.
    const [voltasZ] = useState(() => 360 * Math.ceil(rotFinalJogada / 360));
    const [rotFinalPouso] = useState(() => (Math.random() * 2 - 1) * COPAS_POUSO_ROT_MAX_GRAUS);
    const [rotSegundoPouso] = useState(() => (Math.random() * 2 - 1) * COPAS_POUSO_ROT_MAX_GRAUS);
    const empurraoRef = useRef({ x: 0, y: 0 });
    const avancoRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        let cancelado = false;
        async function coreografia() {
            await new Promise((r) => requestAnimationFrame(r));
            if (cancelado) return;
            setPartiu(true);
            await esperar(SIM_VOO_DURACAO_MS);
            if (cancelado) return;

            empurraoRef.current = calcularEmpurraoParaCentroDaTela(mesaRef, pousoJogada);
            setFase('subindo');
            await esperar(SIM_CRESCIDA_DURACAO_MS);
            if (cancelado) return;

            setFase('segurando');
            await esperar(COPAS_SEGURAR_MS);
            if (cancelado) return;

            setFase('pulsando');
            await esperar(COPAS_ATRASO_CHAMAS_MS);
            if (cancelado) return;
            setChamasBaixo(true);
            await esperar(COPAS_QUEIMANDO_ALTO_MS);
            if (cancelado) return;

            setChamasBaixo(false);
            setFase('descendo');
            await esperar(COPAS_DESCIDA_MS);
            if (cancelado) return;

            setFase('queimando');
            onCarbonizar({ x: pousoJogada.x, y: pousoJogada.y, rot: rotFinalPouso });
            await esperar(COPAS_QUEIMANDO_MESA_MS);
            if (cancelado) return;

            // "Pra frente" = continuando a direção em que ela foi jogada
            // (origem -> pouso), medida em px de tela (a mesa não é
            // quadrada, então em % a direção sairia torta).
            const rect = mesaRef.current?.getBoundingClientRect();
            const dx = ((pousoJogada.x - origem.x) / 100) * (rect?.width || 1080);
            const dy = ((pousoJogada.y - origem.y) / 100) * (rect?.height || 400);
            const norma = Math.hypot(dx, dy) || 1;
            avancoRef.current = { x: (dx / norma) * COPAS_AVANCO_PX, y: (dy / norma) * COPAS_AVANCO_PX };
            setFase('levantando');
            await esperar(SIM_LEVANTAR_DURACAO_MS);
            if (cancelado) return;

            setFase('pousando-final');
            await esperar(SIM_POUSO_FINAL_DURACAO_MS);
            if (cancelado) return;

            setFase('pousada');
            onFim();
        }
        coreografia();
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mesaRef/pousoJogada/onCarbonizar/onFim são fixos por instância (cada jogada roda uma vez só)
    }, []);

    let pos = pousoJogada;
    let offsetX = 0;
    let offsetY = 0;
    let escala = SIM_VOO_ESCALA_POUSO;
    let pitch = 0;
    let rotZ = voltasZ + rotFinalPouso;
    let escurecendo = false;
    let duracaoPos = 0;
    let easing = 'ease-in-out';

    if (fase === 'jogando') {
        pos = partiu ? pousoJogada : origem;
        escala = partiu ? SIM_VOO_ESCALA_POUSO : SIM_VOO_ESCALA_INICIAL;
        rotZ = partiu ? rotFinalJogada : rotFinalJogada + giroInicial;
        duracaoPos = partiu ? SIM_VOO_DURACAO_MS : 0;
    } else if (fase === 'subindo' || fase === 'segurando' || fase === 'pulsando') {
        offsetX = empurraoRef.current.x;
        offsetY = empurraoRef.current.y;
        escala = SIM_CRESCIDA_ESCALA;
        pitch = SIM_CRESCIDA_PITCH_GRAUS;
        rotZ = voltasZ;
        escurecendo = true;
        duracaoPos = fase === 'subindo' ? SIM_CRESCIDA_DURACAO_MS : 0;
    } else if (fase === 'descendo') {
        duracaoPos = COPAS_DESCIDA_MS;
        easing = 'ease-in';
    } else if (fase === 'queimando') {
        // parada no pouso (valores padrão acima), só o fogo por cima
    } else if (fase === 'levantando') {
        offsetX = avancoRef.current.x;
        offsetY = avancoRef.current.y - FACA_LEVANTAR_PX;
        duracaoPos = SIM_LEVANTAR_DURACAO_MS;
    } else { // 'pousando-final' ou 'pousada'
        offsetX = avancoRef.current.x;
        offsetY = avancoRef.current.y;
        rotZ = voltasZ + rotSegundoPouso;
        duracaoPos = fase === 'pousando-final' ? SIM_POUSO_FINAL_DURACAO_MS : 0;
    }

    const chamasMesaAtivas = fase === 'queimando';
    const transicaoEscala = `${duracaoPos}ms ${easing}`;
    return (
        <>
            <div
                className={`mesa-exp-vaza-overlay${escurecendo ? ' mesa-exp-vaza-overlay-escuro' : ''}`}
                style={{ pointerEvents: escurecendo ? 'auto' : 'none' }}
            />
            <div
                className="mesa-exp-carta-simulada"
                style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transition: `left ${duracaoPos}ms ${easing}, top ${duracaoPos}ms ${easing}, transform ${duracaoPos}ms ${easing}`,
                    transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
                    zIndex: fase === 'pousada' ? Z_CARTA_SIMULADA_POUSADA : undefined,
                }}
            >
                {/* Antes da carta no DOM = pinta por baixo dela. */}
                <ChamasCopas
                    modo="borda"
                    ativo={chamasBaixo}
                    escala={escala}
                    duracaoFadeMs={chamasBaixo ? 150 : COPAS_DESCIDA_MS}
                    transicaoEscala={transicaoEscala}
                />
                <div
                    className="mesa-exp-copas-miolo"
                    style={{
                        transition: `transform ${duracaoPos}ms ${easing}`,
                        transform: `scale(${escala}) rotateX(${pitch}deg) rotateZ(${rotZ}deg)`,
                    }}
                >
                    <div className={`mesa-exp-copas-batida${fase === 'pulsando' ? ' mesa-exp-copas-batida-ativa' : ''}`}>
                        <Carta rank="A" naipe="Copas" efeitoManilha />
                    </div>
                </div>
                {/* Depois da carta = por cima dela. Monta quando pousa e
                    apaga assim que ela levanta. */}
                {(fase === 'queimando' || fase === 'levantando') && (
                    <ChamasCopas
                        modo="cobrindo"
                        ativo={chamasMesaAtivas}
                        escala={SIM_VOO_ESCALA_POUSO}
                        duracaoFadeMs={chamasMesaAtivas ? 150 : COPAS_APAGAR_FOGO_MS}
                        transicaoEscala="0ms"
                    />
                )}
            </div>
        </>
    );
}

export default function MesaDanificada({ onVoltar }) {
    const [cortes, setCortes] = useState([]);
    const [facas, setFacas] = useState([]);
    const [simulacoes, setSimulacoes] = useState([]);
    const [jogadasCopas, setJogadasCopas] = useState([]);
    const [marcasCarbonizadas, setMarcasCarbonizadas] = useState([]);
    // Gate do botão "Simular jogada" — trava enquanto a coreografia inteira
    // (ver CartaSimulada) ainda tá rolando, pra não deixar duas brigando
    // pelo centro da tela ao mesmo tempo. As jogadas simuladas já
    // terminadas continuam em `simulacoes` (pousadas de vez, mesma lógica
    // dos cortes) — só o gate solta de novo.
    const [simulandoAgora, setSimulandoAgora] = useState(false);
    const proximoIdCorte = useRef(0);
    const proximoIdFaca = useRef(0);
    const proximoIdSimulacao = useRef(0);
    const proximoIdCopas = useRef(0);
    const proximoIdMarcaCarbonizada = useRef(0);
    // Pra converter o "meio-comprimento" do corte (em px de verdade, ver
    // MESA_CORTE_METADE_COMPRIMENTO) nas duas pontas em %, precisa saber o
    // tamanho ATUAL da mesa em px (ela é responsiva — min(86vw,1080px) —
    // não dá pra assumir um valor fixo). Medido só na hora do clique
    // (getBoundingClientRect), não guardado/observado continuamente:
    // sobra preciso o bastante, a mesa não muda de tamanho no meio de um
    // golpe.
    const mesaRef = useRef(null);

    function cortarLugarAleatorio() {
        const geometria = sortearGeometriaCorte(mesaRef);
        const idFaca = ++proximoIdFaca.current;
        setFacas((atuais) => [...atuais, { id: idFaca, ...geometria }]);
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
                arco: faca.arco,
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

    function simularJogada() {
        if (simulandoAgora) return;
        setSimulandoAgora(true);
        const id = ++proximoIdSimulacao.current;
        setSimulacoes((atuais) => [...atuais, { id }]);
    }

    // Mesmo gate da jogada de Espadas (simulandoAgora) — as duas disputam o
    // centro da tela. Como a de Espadas, a carta de Copas fica pousada na
    // mesa pra sempre (junto com a marca carbonizada), só o gate solta.
    function simularCopas() {
        if (simulandoAgora) return;
        setSimulandoAgora(true);
        const id = ++proximoIdCopas.current;
        setJogadasCopas((atuais) => [...atuais, { id }]);
    }

    function aoCarbonizar(marca) {
        const id = ++proximoIdMarcaCarbonizada.current;
        setMarcasCarbonizadas((atuais) => [...atuais, { id, ...marca }]);
    }

    function aoTerminarCopas() {
        setSimulandoAgora(false);
    }

    return (
        <div className="mesa-exp-tela">
            <button type="button" className="mesa-exp-fechar" onClick={onVoltar}>← Voltar</button>
            <div className="mesa-exp-mesa" ref={mesaRef}>
                <div className="mesa-exp-danos">
                    {marcasCarbonizadas.map((marca) => <MarcaCarbonizada key={marca.id} marca={marca} />)}
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
                {/* `aoImpactar` aceita qualquer objeto com centro/rot/
                    escalaGolpe (mesmo formato de `faca` acima e de
                    `sortearGeometriaCorte`) — a jogada simulada reaproveita
                    a função tal e qual, sem precisar de uma versão própria. */}
                {simulacoes.map((sim) => (
                    <CartaSimulada
                        key={sim.id}
                        mesaRef={mesaRef}
                        onCortar={aoImpactar}
                        onFim={() => setSimulandoAgora(false)}
                    />
                ))}
                {jogadasCopas.map((jogada) => (
                    <CartaCopasSimulada
                        key={jogada.id}
                        mesaRef={mesaRef}
                        onCarbonizar={aoCarbonizar}
                        onFim={aoTerminarCopas}
                    />
                ))}
            </div>
            <div className="mesa-exp-botoes-teste">
                <button type="button" className="mesa-exp-cortar-botao" onClick={cortarLugarAleatorio}>
                    🔪 Cortar a mesa
                </button>
                <button
                    type="button"
                    className="mesa-exp-cortar-botao mesa-exp-simular-botao"
                    onClick={simularJogada}
                    disabled={simulandoAgora}
                >
                    🗡️ Simular jogada
                </button>
                <button
                    type="button"
                    className="mesa-exp-cortar-botao mesa-exp-copas-botao"
                    onClick={simularCopas}
                    disabled={simulandoAgora}
                >
                    ❤️‍🔥 Simular copas
                </button>
            </div>
        </div>
    );
}
