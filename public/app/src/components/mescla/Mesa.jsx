import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Fantasminha from '../novo/Fantasminha.jsx';
import Carta, { ManilhaContext } from '../novo/Carta.jsx';
import { MaoEmLeque } from '../novo/MesaExperimento.jsx';
import { CamadaGolpe } from '../arcade/Partida.jsx';
import { lerCarta, ORDEM_RANKS } from '../arcade/golpes.js';
import { coracoes, ehBot } from '../arcade/tema.js';
import { CHAPEUS_COM_ID } from '../../chapeus.js';
import './mescla.css';

// Mesa da frente "mescla": o oval de madeira, os fantasminhas de chapéu e as
// cartas "de verdade" (com o material de manilha) do front novo, por cima da
// interface da arcade — fonte pixel, placas de jogador, golpes de manilha no
// feltro, palpite, chat e log. Só APRESENTAÇÃO: o estado e as ações vêm
// prontos de arcade/Partida.jsx (ver a prop `Mesa` lá), que continua dona do
// socket, dos sons e das telas de espera e de fim.
//
// Funciona do celular ao desktop sem rolar a página: a mesa ocupa o que
// sobra da altura e os assentos são distribuídos em volta do oval medindo o
// palco de verdade (ResizeObserver), então o mesmo cálculo serve pro oval
// deitado do desktop e pro oval em pé do celular.

const CARTA_L = 110; // tamanho nativo do .carta-exp (index.css)
const CARTA_A = 154;
const FANTASMA_NATIVO = 180; // .fantasminha-flutuante
// Fração do caminho centro -> assento onde a carta jogada pousa — perto o
// bastante do centro pra não entrar embaixo da placa de quem jogou.
const POUSO_JOGADA = 0.38;
const MORTE_IMPACTO_MS = 1200;
const MORTE_DESINTEGRAR_MS = 900;

// Hash estável do nome — cor e chapéu de cada fantasminha não mudam entre
// renders, F5 ou reconexão (o front novo sorteia por montagem).
function hashNome(texto) {
    let h = 2166136261;
    for (const ch of String(texto)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
const hueDe = (nome) => hashNome(nome) % 360;
const chapeuDe = (nome) => (CHAPEUS_COM_ID.length ? CHAPEUS_COM_ID[hashNome(`${nome}#chapeu`) % CHAPEUS_COM_ID.length] : null);

function useTamanho(ref) {
    const [tamanho, setTamanho] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const medir = () => setTamanho({ w: el.clientWidth, h: el.clientHeight });
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return tamanho;
}

function useJanela() {
    const ler = () => ({ w: window.innerWidth, h: window.innerHeight });
    const [janela, setJanela] = useState(ler);
    useEffect(() => {
        const medir = () => setJanela(ler());
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);
    return janela;
}

// Ângulos dos oponentes em volta do oval (graus, y pra baixo: 90° = você,
// embaixo). A vez anda no sentido horário — esquerda, topo, direita —, igual
// na arcade, então o primeiro oponente é quem joga logo depois de você.
function angulosOponentes(n) {
    if (n <= 0) return [];
    if (n === 1) return [270];
    const ini = 165;
    const fim = 375;
    return Array.from({ length: n }, (_, i) => ini + ((fim - ini) * i) / (n - 1));
}

// Onde fica cada coisa no palco, em px — refeito a cada resize.
function calcularLayout(w, h, n) {
    const compacto = w < 640 || h < 360;
    const assento = compacto ? { w: 96, h: 92, fantasma: 52 } : { w: 156, h: 136, fantasma: 84 };
    // Folga em cima pro chapéu do fantasminha não invadir o HUD.
    const folgaChapeu = assento.fantasma * 0.3;
    const topo = assento.h * 0.42 + folgaChapeu;
    const base = compacto ? 4 : 10;
    const margemX = compacto ? 4 : Math.max(14, w * 0.03);
    const cx = w / 2;
    const cy = (topo + h - base) / 2;
    const rx = Math.max(60, w / 2 - margemX);
    const ry = Math.max(60, (h - base - topo) / 2);
    const prender = (v, min, max) => Math.max(min, Math.min(max, v));
    const assentos = angulosOponentes(n).map((graus) => {
        const rad = (graus * Math.PI) / 180;
        return {
            x: prender(cx + rx * Math.cos(rad), assento.w / 2 + 2, w - assento.w / 2 - 2),
            y: prender(cy + ry * Math.sin(rad), assento.h / 2 + folgaChapeu, h - assento.h / 2),
        };
    });
    const escalaMesa = compacto ? 0.42 : h < 420 ? 0.5 : 0.62;
    // O monte (com o vira) sai do centro, que é das jogadas: vai pra ponta
    // esquerda do oval bem deitado (desktop), ou pro pé da mesa à esquerda
    // quando ela é mais quadrada ou em pé (tablet, celular) — lá a ponta
    // esquerda é dos assentos.
    const deitado = w > h * 1.4;
    const monte = deitado ? { x: cx - rx * 0.62, y: cy } : { x: cx - rx * 0.42, y: cy + ry * 0.68 };
    return { compacto, assento, cx, cy, rx, ry, assentos, voce: { x: cx, y: cy + ry * 1.15 }, monte, escalaMesa };
}

function CartaEscalada({ texto, escala, virada = false }) {
    const c = lerCarta(texto);
    return (
        <div className="mz-carta" style={{ width: CARTA_L * escala, height: CARTA_A * escala }}>
            <div className="mz-carta-escala" style={{ transform: `scale(${escala})` }}>
                {virada || !c ? <Carta virada /> : <Carta rank={c.rank} naipe={c.naipe} />}
            </div>
        </div>
    );
}

// Situação da aposta de alguém: ainda não apostou, acertando, faltando ou
// já estourou (fez mais do que apostou — não tem volta, vai perder ♥).
function statusAposta(aposta, fez) {
    if (aposta == null) return 'nada';
    if (fez === aposta) return 'ok';
    return fez > aposta ? 'estourou' : 'falta';
}

export default function Mesa({ mesa: m, acoes }) {
    const palcoRef = useRef(null);
    const maoRef = useRef(null);
    const palco = useTamanho(palcoRef);
    const larguraMao = useTamanho(maoRef).w;
    const janela = useJanela();
    const [menuAberto, setMenuAberto] = useState(false);

    const L = calcularLayout(palco.w, palco.h, m.oponentes.length);
    const todos = [m.meuNome, ...m.oponentes];

    // ---- Dano e morte dos fantasminhas ----
    // `danoVersao` do Fantasminha só precisa MUDAR pra ele tomar a pancada;
    // aqui sobe sempre que o ♥ de alguém cai.
    const hpAnteriorRef = useRef({});
    const [danos, setDanos] = useState({});
    useEffect(() => {
        const machucados = [];
        for (const nome of todos) {
            const hp = m.hpDe(nome);
            const antes = hpAnteriorRef.current[nome];
            if (antes != null && hp < antes) machucados.push(nome);
            hpAnteriorRef.current[nome] = hp;
        }
        if (machucados.length) {
            setDanos((atual) => {
                const novo = { ...atual };
                for (const nome of machucados) novo[nome] = (novo[nome] ?? 0) + 1;
                return novo;
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hpDe é derivado de placar/eliminados
    }, [m.placar, m.eliminados]);

    // Eliminado durante a partida: apanha, desintegra e some (fica só a
    // placa com o carimbo FORA). Quem já estava fora ao montar (reconexão)
    // nem aparece como fantasminha.
    const [mortes, setMortes] = useState(() => Object.fromEntries(m.eliminados.map((nome) => [nome, 'fim'])));
    const mortesTimersRef = useRef([]);
    useEffect(() => {
        for (const nome of m.eliminados) {
            if (mortes[nome]) continue;
            setMortes((a) => ({ ...a, [nome]: 'impacto' }));
            mortesTimersRef.current.push(
                setTimeout(() => setMortes((a) => ({ ...a, [nome]: 'desintegrando' })), MORTE_IMPACTO_MS),
                setTimeout(() => setMortes((a) => ({ ...a, [nome]: 'fim' })), MORTE_IMPACTO_MS + MORTE_DESINTEGRAR_MS),
            );
        }
    }, [m.eliminados, mortes]);
    useEffect(() => () => mortesTimersRef.current.forEach(clearTimeout), []);

    // ---- Derivados ----
    const daVez = (nome) => !m.vaza && (m.jogadorDaVezAposta ? m.jogadorDaVezAposta === nome : m.jogadorDaVez === nome);
    const minhaVez = m.souEuNaVez || m.souEuNaVezDaAposta;
    const nomeCurto = (nome) => (nome === m.meuNome ? 'VOCÊ' : nome.toUpperCase());

    let textoVez = '';
    if (m.souEliminado) textoVez = 'VOCÊ ESTÁ FORA — ASSISTINDO';
    else if (m.vaza) textoVez = m.vaza.vencedor ? `${nomeCurto(m.vaza.vencedor)} LEVOU A VAZA` : 'VAZA MELADA';
    else if (m.souEuNaVezDaAposta) textoVez = 'SUA VEZ DE APOSTAR';
    else if (m.jogadorDaVezAposta) textoVez = `${m.jogadorDaVezAposta.toUpperCase()} ESTÁ APOSTANDO`;
    else if (m.souEuNaVez) textoVez = L.compacto ? 'SUA VEZ — TOQUE NUMA CARTA' : 'SUA VEZ — ESCOLHA UMA CARTA';
    else if (m.jogadorDaVez) textoVez = `VEZ DE ${m.jogadorDaVez.toUpperCase()}`;
    if (m.rodadaCega && !m.souEliminado && !m.vaza) textoVez += ' · SUA CARTA ESTÁ VIRADA';

    const manilha = m.viraValor != null ? ORDEM_RANKS[m.viraValor] ?? '?' : null;

    // Onde cada jogada pousa: metade do caminho do centro até quem jogou.
    const posicaoDe = (nome) => {
        if (nome === m.meuNome) return L.voce;
        const i = m.oponentes.indexOf(nome);
        return i >= 0 ? L.assentos[i] : { x: L.cx, y: L.cy };
    };

    // ---- Mão ----
    // Escala da mão pela janela: carta cheia no desktop, menor em tela
    // estreita ou baixa (celular deitado).
    let escalaMao = janela.w < 640 ? 0.62 : janela.w < 1100 ? 0.78 : 0.92;
    if (janela.h < 720) escalaMao = Math.min(escalaMao, 0.72);
    if (janela.h < 520) escalaMao = 0.56;
    const cartaL = CARTA_L * escalaMao;
    const n = m.mao.length;
    const passo = n > 1 ? Math.max(14, Math.min(cartaL * 0.86, (larguraMao - cartaL - 8) / (n - 1))) : 0;
    const larguraLeque = cartaL + passo * Math.max(0, n - 1);
    const inicioLeque = (larguraMao - larguraLeque) / 2;
    const meio = (n - 1) / 2;
    // Chave por carta + ocorrência (não por índice): jogar uma carta não
    // re-anima a entrada das outras.
    const vistas = {};
    const chavesMao = m.mao.map((carta) => {
        vistas[carta] = (vistas[carta] ?? 0) + 1;
        return `${m.numeroRodada}-${carta}-${vistas[carta]}`;
    });

    const minhaAposta = m.apostas[m.meuNome];
    const meuFez = m.vazasFeitas[m.meuNome] ?? 0;

    const botaoDicaBot = (classe) => (
        <button
            type="button"
            className={`az-b az-px ${classe}${m.dicaBotLigada ? ` ${classe}-ligado` : ''}`}
            aria-pressed={m.dicaBotLigada}
            title="Mostra, na sua vez, o que o bot da sala apostaria ou jogaria no seu lugar"
            onClick={acoes.alternarDicaBot}
        >
            DICA DO BOT: {m.dicaBotLigada ? 'ON' : 'OFF'}
        </button>
    );

    return (
        <ManilhaContext.Provider value={m.rodadaCega ? null : m.viraValor}>
            <div className={`mz-tela${m.estreito ? '' : ' mz-com-lateral'}`} data-screen-label="Mesa de partida">
                {/* ================= HUD ================= */}
                <div className="mz-hud">
                    <div className="az-px mz-hud-info">
                        <span className="mz-so-largo">SALA <b>{m.salaId}</b><i className="mz-sep" /></span>
                        R<b>{m.numeroRodada || '—'}</b> · <b>{m.cartasRodada}</b> CARTA{m.cartasRodada === 1 ? '' : 'S'}
                    </div>
                    <div className={`az-px mz-vez${minhaVez ? ' mz-vez-minha' : ''}`} aria-live="polite">
                        {textoVez}
                    </div>
                    <div className="mz-hud-dir">
                        <div className="az-pilula-manilha mz-so-largo">
                            <span className="az-px az-pilula-rotulo">MANILHA</span>
                            <span className="az-px az-pilula-valor">{manilha ?? '—'}</span>
                        </div>
                        <span className="mz-so-largo">{botaoDicaBot('az-btn-mini')}</span>
                        {m.estreito && (
                            <button
                                type="button"
                                className="az-b az-px az-btn-mini az-btn-icone"
                                onClick={acoes.abrirGaveta}
                                aria-label={m.naoLidas > 0 ? `Chat e log (${m.naoLidas} nova${m.naoLidas === 1 ? '' : 's'})` : 'Chat e log'}
                            >
                                💬
                                {m.naoLidas > 0 && <span className="az-bolinha">{m.naoLidas > 9 ? '9+' : m.naoLidas}</span>}
                            </button>
                        )}
                        <button type="button" className="az-b az-px az-btn-mini mz-so-largo" onClick={acoes.sair}>SAIR</button>
                        <div className="az-menu-ancora mz-so-compacto">
                            <button
                                type="button"
                                className={`az-b az-px az-btn-mini az-btn-icone${m.dicaBotLigada ? ' az-btn-mini-ligado' : ''}`}
                                onClick={() => setMenuAberto((a) => !a)}
                                aria-expanded={menuAberto}
                                aria-label="Menu da partida"
                            >
                                ⋯
                            </button>
                            {menuAberto && (
                                <>
                                    <div className="az-menu-fundo" onClick={() => setMenuAberto(false)} />
                                    <div className="az-menu" role="menu">
                                        <div className="az-px az-menu-rotulo">SALA <span className="az-claro">{m.salaId}</span></div>
                                        {botaoDicaBot('az-menu-item')}
                                        <button type="button" className="az-b az-px az-menu-item az-menu-item-perigo" onClick={acoes.sair}>
                                            SAIR DA PARTIDA
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ================= PALCO: oval + assentos ================= */}
                <div className={`mz-palco${L.compacto ? ' mz-palco-compacto' : ''}`} ref={palcoRef}>
                    {palco.w > 0 && (
                        <>
                            <div
                                className="mz-oval"
                                style={{ left: L.cx - L.rx, top: L.cy - L.ry, width: L.rx * 2, height: L.ry * 2 }}
                            >
                                <div className="mz-feltro" />
                                {m.golpe && !m.vaza && (
                                    <div className="mz-golpe" key={m.golpe.key}>
                                        {m.golpe.camadas.map((camada, i) => <CamadaGolpe key={i} estilo={camada.estilo} />)}
                                    </div>
                                )}
                            </div>

                            {/* Monte no centro, com o vira por cima */}
                            <div className="mz-monte" style={{ left: L.monte.x, top: L.monte.y }}>
                                <div className="mz-monte-pilha">
                                    {[0, 1, 2].map((k) => (
                                        <div key={k} className="mz-monte-verso" style={{ transform: `translate(${k * 2 - 2}px, ${-k * 2}px) rotate(${k * 3 - 4}deg)` }}>
                                            <CartaEscalada escala={L.escalaMesa * 0.82} virada />
                                        </div>
                                    ))}
                                    {m.vira && (
                                        <div className="mz-vira" key={m.vira.carta}>
                                            <CartaEscalada texto={m.vira.carta} escala={L.escalaMesa * 0.82} />
                                        </div>
                                    )}
                                </div>
                                {manilha && (
                                    <div className="az-px mz-monte-rotulo">
                                        MANILHA <b>{manilha}</b>
                                    </div>
                                )}
                            </div>

                            {/* Cartas jogadas na vaza */}
                            <div className="mz-jogadas" style={{ animation: m.tremendo ? 'cz-tremor 380ms steps(3)' : 'none' }}>
                                {m.jogadas.map((j, i) => {
                                    const de = posicaoDe(j.jogador);
                                    const x = L.cx + (de.x - L.cx) * POUSO_JOGADA;
                                    const y = L.cy + (de.y - L.cy) * POUSO_JOGADA;
                                    const rot = (hashNome(j.jogador + j.carta) % 17) - 8;
                                    const venceu = m.vaza?.vencedor && j.jogador === m.vaza.vencedor;
                                    const classe = m.vaza ? (venceu ? ' mz-jogada-venceu' : ' mz-jogada-perdeu') : '';
                                    return (
                                        <div
                                            key={`${i}-${j.jogador}-${j.carta}`}
                                            className={`mz-jogada${classe}`}
                                            style={{ left: x, top: y, '--dx': `${de.x - x}px`, '--dy': `${de.y - y}px`, '--rot': `${rot}deg` }}
                                        >
                                            <div className="mz-jogada-voo">
                                                <CartaEscalada texto={j.carta} escala={L.escalaMesa} />
                                                <div className="az-px mz-jogada-nome">{nomeCurto(j.jogador)}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {m.vaza && (
                                <div className="mz-faixa-vaza" style={{ top: L.cy }}>
                                    <div className="az-px mz-faixa-vaza-rotulo">{m.vaza.vencedor ? 'VAZA FECHADA' : 'VAZA MELADA'}</div>
                                    <div className="az-px mz-faixa-vaza-nome">
                                        {m.vaza.vencedor ? `${nomeCurto(m.vaza.vencedor)} LEVOU` : 'NINGUÉM LEVA'}
                                    </div>
                                </div>
                            )}

                            {/* Oponentes */}
                            {m.oponentes.map((nome, i) => {
                                const pos = L.assentos[i];
                                const morte = mortes[nome];
                                const fora = m.eliminados.includes(nome);
                                const noAuto = m.desconectados.includes(nome) && !fora;
                                const vez = daVez(nome) && !fora;
                                const aposta = m.apostas[nome];
                                const fez = m.vazasFeitas[nome] ?? 0;
                                const status = statusAposta(aposta, fez);
                                const restante = m.restanteDe(nome);
                                const revelada = m.maosReveladas[nome];
                                const chapeu = chapeuDe(nome);
                                const balao = m.baloes[nome];
                                const fantasma = L.assento.fantasma;
                                return (
                                    <div
                                        key={nome}
                                        className={`mz-assento${vez ? ' mz-assento-vez' : ''}${fora ? ' mz-assento-fora' : ''}`}
                                        style={{ left: pos.x, top: pos.y, width: L.assento.w, '--hue': hueDe(nome) }}
                                    >
                                        {balao && (
                                            <div key={balao.id} className={`az-balao mz-balao${pos.y < palco.h * 0.3 ? ' mz-balao-baixo' : ''}`}>
                                                {balao.texto}
                                            </div>
                                        )}
                                        <div className="mz-fantasma" style={{ width: fantasma, height: fantasma }}>
                                            {morte !== 'fim' && (
                                                <div className="mz-fantasma-escala" style={{ transform: `scale(${fantasma / FANTASMA_NATIVO})` }}>
                                                    <Fantasminha
                                                        hue={hueDe(nome)}
                                                        chapeu={chapeu?.src}
                                                        ajusteChapeuPct={chapeu?.ajuste ?? 0}
                                                        bot={ehBot(nome) || m.desconectados.includes(nome)}
                                                        monitor
                                                        naVez={vez}
                                                        danoVersao={danos[nome] ?? 0}
                                                        estadoMorte={morte === 'impacto' || morte === 'desintegrando' ? morte : undefined}
                                                    >
                                                        <MaoEmLeque
                                                            quantidade={fora ? 0 : restante}
                                                            cartas={revelada && restante > 0 ? revelada.map(lerCarta).filter(Boolean) : undefined}
                                                        />
                                                    </Fantasminha>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mz-placa">
                                            <div className="mz-placa-nome" title={nome}>{nome}</div>
                                            <div className="mz-placa-linha">
                                                <span className="az-px az-coracoes mz-coracoes">{coracoes(m.hpDe(nome))}</span>
                                                <span
                                                    className={`az-px mz-fez mz-fez-${status}`}
                                                    title={aposta == null ? 'Ainda não apostou' : `Fez ${fez} de ${aposta} apostada${aposta === 1 ? '' : 's'}`}
                                                >
                                                    <span className="mz-so-largo">FEZ </span>{fez}/{aposta ?? '–'}
                                                </span>
                                            </div>
                                            {noAuto && <div className="az-px mz-placa-tag">NO AUTOMÁTICO</div>}
                                            {fora && <div className="az-px az-carimbo mz-carimbo">FORA</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {m.souEuNaVezDaAposta && (
                        <div className="az-palpite mz-palpite">
                            {/* O vira repetido aqui: no celular o painel cobre o monte. */}
                            <div className="mz-palpite-cabeca">
                                <div className="az-px az-palpite-titulo">QUANTAS VAZAS VOCÊ FAZ?</div>
                                {m.vira && (
                                    <div className="mz-palpite-vira">
                                        <CartaEscalada texto={m.vira.carta} escala={0.28} />
                                        <span className="az-px">MANILHA <b>{manilha}</b></span>
                                    </div>
                                )}
                            </div>
                            <div className="az-palpite-botoes">
                                {Array.from({ length: m.cartasRodada + 1 }, (_, v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        data-som="mudo"
                                        className={`az-b az-px az-palpite-botao${v === m.valorDicaAposta ? ' az-palpite-dica-bot' : ''}`}
                                        disabled={v === m.palpiteProibido}
                                        title={v === m.palpiteProibido
                                            ? 'Esse valor fecharia a soma das apostas'
                                            : v === m.valorDicaAposta ? `O bot ${m.nomeDoBot} apostaria ${v}` : undefined}
                                        onClick={() => acoes.apostar(v)}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                            <div className="az-palpite-nota">
                                {m.palpiteProibido != null && m.palpiteProibido >= 0 && m.palpiteProibido <= m.cartasRodada
                                    ? `Você é o último: ${m.palpiteProibido} fecharia a soma e não vale.`
                                    : 'Errar o palpite tira coração — pra mais ou pra menos.'}
                            </div>
                        </div>
                    )}

                    {m.erro && <div className="az-erro az-erro-caixa mz-erro">{m.erro}</div>}
                </div>

                {/* ================= DOCA: você + sua mão ================= */}
                <div className={`mz-doca${minhaVez ? ' mz-doca-vez' : ''}`}>
                    <div className={`mz-voce${m.souEliminado ? ' mz-voce-fora' : ''}`}>
                        {m.baloes[m.meuNome] && (
                            <div key={m.baloes[m.meuNome].id} className="az-balao mz-balao">{m.baloes[m.meuNome].texto}</div>
                        )}
                        <div className="mz-voce-id">
                            <div className="az-px mz-voce-nome">VOCÊ</div>
                            <div key={danos[m.meuNome] ?? 0} className={`az-px az-coracoes mz-voce-coracoes${danos[m.meuNome] ? ' mz-dano' : ''}`}>
                                {coracoes(m.hpDe(m.meuNome))}
                            </div>
                        </div>
                        <div className="mz-voce-pocos">
                            <div className="mz-poco">
                                <span className="az-px mz-poco-k">APOSTA</span>
                                <span className="az-px mz-poco-v az-amarelo">{minhaAposta ?? '—'}</span>
                            </div>
                            <div className={`mz-poco mz-poco-${statusAposta(minhaAposta, meuFez)}`}>
                                <span className="az-px mz-poco-k">FEZ</span>
                                <span className="az-px mz-poco-v az-verde">{meuFez}</span>
                            </div>
                        </div>
                        {minhaVez && <div className="az-anel-vez" />}
                    </div>

                    <div className="mz-mao" ref={maoRef} style={{ height: CARTA_A * escalaMao + 30 }}>
                        {larguraMao > 0 && m.mao.map((carta, indice) => {
                            const dica = indice === m.indiceDicaCarta;
                            const off = indice - meio;
                            return (
                                <button
                                    key={chavesMao[indice]}
                                    type="button"
                                    data-som="mudo"
                                    className={`az-b mz-carta-mao${m.souEuNaVez ? ' mz-jogavel' : ''}${dica ? ' mz-carta-dica' : ''}`}
                                    style={{
                                        left: inicioLeque + indice * passo,
                                        width: cartaL,
                                        height: CARTA_A * escalaMao,
                                        '--rot': `${L.compacto ? off * 2 : off * 3}deg`,
                                        '--arco': `${Math.abs(off) * Math.abs(off) * (L.compacto ? 1.5 : 2.5)}px`,
                                        animationDelay: `${indice * 60}ms`,
                                    }}
                                    disabled={!m.souEuNaVez}
                                    onClick={() => acoes.jogar(indice)}
                                    aria-label={m.rodadaCega ? 'Sua carta (virada)' : carta}
                                    title={dica ? `O bot ${m.nomeDoBot} jogaria esta carta` : undefined}
                                >
                                    <CartaEscalada texto={carta} escala={escalaMao} virada={m.rodadaCega} />
                                    {dica && <span className="az-px az-selo-bot">BOT</span>}
                                </button>
                            );
                        })}
                        {m.mao.length === 0 && (
                            <div className="az-px mz-sem-cartas">{m.souEliminado ? 'FORA DA MESA' : 'SEM CARTAS'}</div>
                        )}
                    </div>
                </div>

                {!m.estreito && (
                    <aside className="mz-lateral">
                        {m.blocoChat}
                        {m.blocoLog}
                    </aside>
                )}
            </div>
        </ManilhaContext.Provider>
    );
}
