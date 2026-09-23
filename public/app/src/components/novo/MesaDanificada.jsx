import { useEffect, useRef, useState } from 'react';
import PunhalAssembly from './PunhalAssembly.jsx';

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

export default function MesaDanificada({ onVoltar }) {
    const [cortes, setCortes] = useState([]);
    const [facas, setFacas] = useState([]);
    const [simulacoes, setSimulacoes] = useState([]);
    // Gate do botão "Simular jogada" — trava enquanto a coreografia inteira
    // (ver CartaSimulada) ainda tá rolando, pra não deixar duas brigando
    // pelo centro da tela ao mesmo tempo. As jogadas simuladas já
    // terminadas continuam em `simulacoes` (pousadas de vez, mesma lógica
    // dos cortes) — só o gate solta de novo.
    const [simulandoAgora, setSimulandoAgora] = useState(false);
    const proximoIdCorte = useRef(0);
    const proximoIdFaca = useRef(0);
    const proximoIdSimulacao = useRef(0);
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
            </div>
        </div>
    );
}
