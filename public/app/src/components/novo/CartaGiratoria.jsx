import { useRef, useState } from 'react';
import PunhalAssembly from './PunhalAssembly.jsx';

// Sandbox isolada (pedido do Henrique 2026-09-21): uma carta que gira livre
// nos 3 eixos, só pra "testar um negócio" — sem ligação nenhuma com
// login/sessão de verdade, é só um <button> na tela de Login que troca a
// tela local por esta e volta. Arrastar normal = pitch/yaw (rotateX/Y);
// segurando Shift = roll (rotateZ), já que um drag 2D só dá 2 eixos de
// cada vez. Mesma técnica de flip-card de .mesa-exp-vira-miolo (ver
// index.css) — duas faces empilhadas com backface-visibility:hidden — só
// que o giro aqui vem do ponteiro, não de uma transição fixa.
const SENSIBILIDADE = 0.4;
const SENSIBILIDADE_ZOOM = 0.0015;

// Pedido do Henrique 2026-09-21: em vez de um brilho por peça (carta,
// lâmina, guarda, cabo — cada um resetando o próprio degradê na borda
// dele), UMA ÚNICA div cobrindo a área de tudo junto, por cima de todas
// as peças (ver .carta-giro3d-brilho-unico), pra virar um streak SÓ
// atravessando o punhal inteiro de ponta a ponta, sem costura nenhuma
// entre pedaço e pedaço. Ela é invisível fora da faixa de luz em si
// (sem background próprio, só o ::before com o gradiente diagonal — ver
// index.css) e pointer-events:none, senão capturaria o drag do palco por
// estar por cima de tudo.
const EFEITO_INICIAL = { vel: 3.4, delay: 0 };

// pitch/yaw/roll acumulam livre (arrastar várias voltas soma sem limite,
// de propósito — "gira em todas as direções"), então pra MOSTRAR precisa
// dobrar pra 0-359 primeiro, senão o campo exibiria tipo "742°" depois de
// duas voltas arrastadas.
function normalizarAngulo(graus) {
    const resto = graus % 360;
    return Math.round(resto < 0 ? resto + 360 : resto);
}

// Máscara do brilho único (pedido do Henrique 2026-09-21: "as pontas não
// deveriam ter efeito, criar uma máscara onde o efeito só se aplique
// dentro dela") — a caixa de .carta-giro3d-brilho-unico é um RETÂNGULO
// (140x467, a largura da guarda x a soma das 4 peças), mas a silhueta de
// verdade não é: lâmina é um pentágono mais estreito que a guarda, carta
// e cabo também são mais estreitos que ela. Sem essa máscara o brilho
// "vaza" nas sobras do retângulo que nenhuma peça ocupa (os cantos fora
// do pentágono da lâmina, as laterais onde só a guarda é larga). Cada
// vértice é a MESMA proporção usada nas próprias peças (55/140 = largura
// da carta/lâmina sobre a largura da guarda, 20% = ponto onde a lâmina
// começa a afunilar — ver clip-path de .carta-giro3d-lamina — etc.),
// contornando lâmina+carta+guarda+cabo como uma silhueta só. Só faz
// sentido com a pilha inteira; com o plano estendido desligado a caixa É
// a carta (retângulo puro), por isso 'none' nesse caso.
const MASCARA_PUNHAL =
    'polygon(50% 0%, 89.29% 9.42%, 89.29% 80.09%, 100% 80.09%, 100% 83.51%, ' +
    '69.64% 83.51%, 69.64% 100%, 30.36% 100%, 30.36% 83.51%, 0% 83.51%, ' +
    '0% 80.09%, 10.71% 80.09%, 10.71% 9.42%)';

export default function CartaGiratoria({ onVoltar }) {
    const [pitch, setPitch] = useState(-12);
    const [yaw, setYaw] = useState(18);
    const [roll, setRoll] = useState(0);
    const [escala, setEscala] = useState(1);
    // Plano estendido (pedido do Henrique 2026-09-21): a carta em si NÃO
    // muda de tamanho/forma — isto aqui é conteúdo A MAIS, um elemento
    // irmão dentro do mesmo .carta-giro3d-miolo (mesmo preserve-3d), então
    // herda o rotateX/Y/Z/scale do miolo de graça, sem nenhuma conta extra
    // de ângulo — é literalmente "o plano invisível da carta continuando"
    // (ver .carta-giro3d-lamina no index.css). Toggle só controla se esse
    // elemento a mais é renderizado.
    const [planoEstendido, setPlanoEstendido] = useState(true);
    const [efeito, setEfeito] = useState(EFEITO_INICIAL);
    const arrastando = useRef(null); // { x, y } do último pointermove, ou null se solto

    function ajustarEfeito(campo, valor) {
        setEfeito((atual) => ({ ...atual, [campo]: valor }));
    }

    function aoPressionar(evento) {
        evento.currentTarget.setPointerCapture(evento.pointerId);
        arrastando.current = { x: evento.clientX, y: evento.clientY };
    }

    function aoMover(evento) {
        if (!arrastando.current) return;
        const dx = evento.clientX - arrastando.current.x;
        const dy = evento.clientY - arrastando.current.y;
        arrastando.current = { x: evento.clientX, y: evento.clientY };
        if (evento.shiftKey) {
            setRoll((r) => r + dx * SENSIBILIDADE);
        } else {
            setYaw((y) => y + dx * SENSIBILIDADE);
            setPitch((p) => p - dy * SENSIBILIDADE);
        }
    }

    function aoSoltar() {
        arrastando.current = null;
    }

    function aoRodaDoMouse(evento) {
        evento.preventDefault();
        setEscala((e) => Math.min(2.5, Math.max(0.5, e - evento.deltaY * SENSIBILIDADE_ZOOM)));
    }

    function resetar() {
        setPitch(-12);
        setYaw(18);
        setRoll(0);
        setEscala(1);
    }

    return (
        <div className="cartao">
            <h1>Carta giratória</h1>
            <p>Arraste pra girar. Segure Shift e arraste pra rolar (eixo Z). Scroll pra zoom.</p>
            <div
                className="carta-giro3d-palco"
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onWheel={aoRodaDoMouse}
            >
                <div
                    className="carta-giro3d-miolo"
                    style={{ transform: `scale(${escala}) rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)` }}
                >
                    {/* Faces + lâmina/guarda/cabo (ver PunhalAssembly.jsx) —
                        extraVisivel só liga/desliga a classe que anima
                        opacity+scale (ver .carta-giro3d-extra-oculta em
                        index.css), pra o toggle abaixo ganhar uma transição
                        suave em vez do aparecer/sumir seco de antes.
                        pausarBrilhoFace: o streak de luz aqui é só o
                        .carta-giro3d-brilho-unico por cima de tudo, mais
                        abaixo — o da própria carta fica pausado. */}
                    <PunhalAssembly extraVisivel={planoEstendido} pausarBrilhoFace />
                    {/* Última do DOM de propósito — dentro do MESMO
                        preserve-3d do miolo (gira junto, sem conta de
                        ângulo própria), mas por cima de todas as peças na
                        ordem de pintura (todas coplanares, sem translateZ
                        nenhum, então ordem de DOM já decide quem fica na
                        frente). Tamanho muda com planoEstendido: só a
                        carta (110x154) quando as peças extras estão
                        desligadas, ou a pilha inteira (lâmina 220 + carta
                        154 + guarda 16 + cabo 77 = 467, largura 140 da
                        guarda) quando ligadas. */}
                    <div
                        className="carta-giro3d-brilho-unico"
                        style={{
                            top: planoEstendido ? '-220px' : '0px',
                            width: planoEstendido ? '140px' : '110px',
                            height: planoEstendido ? '467px' : '154px',
                            clipPath: planoEstendido ? MASCARA_PUNHAL : 'none',
                            '--brilho-unico-duracao': `${efeito.vel}s`,
                            '--brilho-unico-delay': `${efeito.delay}s`,
                        }}
                    />
                </div>
            </div>
            <div className="carta-giro3d-angulo">
                <span>Pitch (X): {normalizarAngulo(pitch)}°</span>
                <span>Yaw (Y): {normalizarAngulo(yaw)}°</span>
                <span>Roll (Z): {normalizarAngulo(roll)}°</span>
            </div>
            <div className="botoes">
                <button type="button" onClick={() => setPlanoEstendido((v) => !v)} className="secundario">
                    🗡️ Plano estendido: {planoEstendido ? 'ligado' : 'desligado'}
                </button>
                <button type="button" onClick={resetar} className="secundario">Resetar</button>
                <button type="button" onClick={onVoltar} className="secundario">← Voltar</button>
            </div>
            <h2>Velocidade do brilho</h2>
            <div className="carta-giro3d-controles">
                <label>
                    Velocidade ({efeito.vel.toFixed(1)}s)
                    <input
                        type="range" min="0.3" max="8" step="0.1"
                        value={efeito.vel}
                        onChange={(e) => ajustarEfeito('vel', Number(e.target.value))}
                    />
                </label>
                <label>
                    Delay ({efeito.delay.toFixed(1)}s)
                    <input
                        type="range" min="0" max="5" step="0.1"
                        value={efeito.delay}
                        onChange={(e) => ajustarEfeito('delay', Number(e.target.value))}
                    />
                </label>
            </div>
        </div>
    );
}
