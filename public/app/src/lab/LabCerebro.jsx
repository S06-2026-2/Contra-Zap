import { useCallback, useEffect, useRef, useState } from 'react';
import { RedeAtorCritico } from '../../../../bots/rede.js';
import { NOMES, rodarPartida } from './simulador.js';
import RedeCanvas from './RedeCanvas.jsx';
import Fantasminha from '../components/meetfront1/Fantasminha.jsx';
import Carta from '../components/meetfront1/Carta.jsx';
import './lab.css';

// Lab do cérebro (rota /lab): uma partida simulada de quatro bots com a
// rede Campeão (slot01) e, a cada decisão do "Você", o cérebro dele
// pensando — o que entrou, o que acendeu nas duas camadas e a chance que
// ele deu pra cada opção. Os outros três decidem rápido, só pra partida
// andar. A mesinha no canto mostra o mínimo: a mesa, os fantasminhas, as
// suas cartas e o que cada um jogou. Partida acabou (ou o "Você" morreu e
// sobrou um), começa outra sozinha.

const VELOCIDADES = [0.5, 1, 2, 4];
// Quanto cada passo fica na tela, na velocidade 1x. A decisão do "Você" é
// a animação do cérebro + um tempo pra ler.
const ESPERA_MS = {
    rodada: 900,
    decisaoOutro: 500,
    decisaoVoce: 1600 + 1600,
    forcada: 900,
    vaza: 1000,
    fimRodada: 1300,
    fimJogo: 2600,
};
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SIMBOLO_NAIPE = { Ouros: '♦', Espadas: '♠', Copas: '♥', Paus: '♣' };
const HUES = [48, 200, 320, 140];
const EU = NOMES[0];

function nomeCurto(carta) {
    return carta ? `${carta.nomeValor}${SIMBOLO_NAIPE[carta.nomeNaipe]}` : '—';
}

function CartaPequena({ carta, escala, virada = false }) {
    return (
        <div className="lab-carta" style={{ width: 110 * escala, height: 154 * escala }}>
            <div className="lab-carta-escala" style={{ transform: `scale(${escala})` }}>
                {virada || !carta ? <Carta virada /> : <Carta rank={carta.nomeValor} naipe={carta.nomeNaipe} />}
            </div>
        </div>
    );
}

function MesaMini({ estado, pensando, cega }) {
    if (!estado) return null;
    const eu = estado.jogadores[0];
    return (
        <div className="lab-mesa-canto">
            <div className="lab-mesa">
                {estado.jogadores.map((j, i) => (
                    <div key={j.nome} className={`lab-assento lab-assento-${i}${j.vivo ? '' : ' lab-assento-fora'}`}>
                        <div className="lab-fantasma">
                            <div className="lab-fantasma-escala">
                                <Fantasminha hue={HUES[i]} naVez={i === 0 && pensando} monitor={false} />
                            </div>
                        </div>
                        <span className="lab-assento-nome">{j.nome}</span>
                        {j.naMesa && (
                            <div className="lab-jogada">
                                <CartaPequena carta={j.naMesa} escala={0.3} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="lab-sua-mao">
                {eu.mao.map((c) => <CartaPequena key={c.id} carta={c} escala={0.36} virada={cega} />)}
            </div>
        </div>
    );
}

export default function LabCerebro() {
    const [redes, setRedes] = useState(null);
    const [erro, setErro] = useState(null);
    const [estado, setEstado] = useState(null);
    const [decisao, setDecisao] = useState(null);
    const [texto, setTexto] = useState({ titulo: 'Carregando o cérebro…', detalhe: '' });
    const [pensando, setPensando] = useState(false);
    const [pausado, setPausado] = useState(false);
    const [velocidade, setVelocidade] = useState(1);
    const [partida, setPartida] = useState(1);
    const geradorRef = useRef(null);
    // Timer do próximo passo, e a revelação da decisão do "Você" (a escolha
    // aparece depois da animação do cérebro) ainda por acontecer.
    const proximoRef = useRef(null);
    const revelacaoRef = useRef(null);
    const pausadoRef = useRef(false);
    const velocidadeRef = useRef(1);
    pausadoRef.current = pausado;
    velocidadeRef.current = velocidade;

    useEffect(() => {
        Promise.all([
            import('../../../../bots/models/slot01.json'),
            import('../../../../bots/models/round1.json'),
        ])
            .then(([principal, round1]) => setRedes({
                rede: new RedeAtorCritico(principal.default),
                redeRound1: new RedeAtorCritico(round1.default),
            }))
            .catch((e) => setErro(e.message));
    }, []);

    // Aplica um evento do simulador e devolve quanto esperar até o próximo.
    const aplicar = useCallback((ev) => {
        const manilha = (estadoEv) => (estadoEv?.viraValor >= 0 ? RANKS[estadoEv.viraValor] : '?');
        switch (ev.tipo) {
            case 'rodada':
                setEstado(ev.estado);
                setPensando(false);
                setTexto({
                    titulo: `Rodada ${ev.estado.numeroRodada} · ${ev.estado.cartasRodada} carta${ev.estado.cartasRodada > 1 ? 's' : ''}`,
                    detalhe: `Vira ${nomeCurto(ev.estado.vira)} · manilha ${manilha(ev.estado)}${ev.estado.cartasRodada === 1 ? ' · rodada cega: ninguém vê a própria carta' : ''}`,
                });
                return ESPERA_MS.rodada;
            case 'decisao': {
                if (ev.jogador !== EU) {
                    setEstado(ev.estado);
                    return ESPERA_MS.decisaoOutro;
                }
                if (ev.decisao.forcada) {
                    setEstado(ev.estado);
                    setTexto({ titulo: `Você jogou ${nomeCurto(ev.carta)}`, detalhe: 'Jogada forçada: só tinha essa carta (a rede nem é consultada).' });
                    return ESPERA_MS.forcada;
                }
                const d = { ...ev.decisao, fase: ev.fase, maoAntes: ev.estadoAntes.jogadores[0].mao };
                setEstado(ev.estadoAntes);
                setDecisao(d);
                setPensando(true);
                const certeza = Math.round(d.probs[d.escolha] * 100);
                const valor = d.detalhe.valor;
                const avaliacao = valor == null ? '' : ` · avaliação da situação ${valor >= 0 ? '+' : ''}${valor.toFixed(2)}`;
                setTexto({
                    titulo: ev.fase === 'aposta' ? 'Você está decidindo quantas vazas apostar…' : 'Você está decidindo qual carta jogar…',
                    detalhe: `${d.cega ? 'Rede da rodada cega (22 entradas)' : 'Rede Campeão (110 entradas)'}${avaliacao}`,
                });
                const revelar = () => {
                    clearTimeout(revelacaoRef.current?.timer);
                    revelacaoRef.current = null;
                    setPensando(false);
                    setEstado(ev.estado);
                    setTexto({
                        titulo: ev.fase === 'aposta' ? `Você apostou ${d.escolha}` : `Você jogou ${nomeCurto(ev.carta)}`,
                        detalhe: `${certeza}% de certeza${avaliacao}`,
                    });
                };
                revelacaoRef.current = { revelar, timer: setTimeout(revelar, 1600 / velocidadeRef.current) };
                return ESPERA_MS.decisaoVoce;
            }
            case 'vaza':
                setEstado(ev.estado);
                setTexto((t) => ({ ...t, detalhe: ev.vencedor ? `${ev.vencedor} levou a vaza` : 'Melou: ninguém levou a vaza' }));
                return ESPERA_MS.vaza;
            case 'fimRodada': {
                setEstado(ev.estado);
                const eu = ev.estado.jogadores[0];
                setTexto({ titulo: 'Fim da rodada', detalhe: `Você apostou ${eu.aposta} e fez ${eu.steak}${eu.aposta === eu.steak ? ': acertou' : ''}` });
                return ESPERA_MS.fimRodada;
            }
            case 'fimJogo':
                setEstado(ev.estado);
                setTexto({ titulo: ev.vencedor ? `${ev.vencedor} venceu a partida` : 'Fim de partida', detalhe: 'Começando outra…' });
                return ESPERA_MS.fimJogo;
            default:
                return 0;
        }
    }, []);

    // Um passo: termina a revelação pendente (se o passo veio antes dela),
    // aplica o próximo evento e, rodando, agenda o seguinte.
    const avancar = useCallback(() => {
        clearTimeout(proximoRef.current);
        revelacaoRef.current?.revelar();
        const gerador = geradorRef.current;
        if (!gerador) return;
        const { value: ev, done } = gerador.next();
        if (done) {
            setPartida((n) => n + 1);
            return;
        }
        const espera = aplicar(ev);
        if (!pausadoRef.current) proximoRef.current = setTimeout(avancar, espera / velocidadeRef.current);
    }, [aplicar]);

    // Partida nova (no começo, no fim de cada uma ou pelo botão).
    useEffect(() => {
        if (!redes) return undefined;
        geradorRef.current = rodarPartida({ ...redes, seed: Math.floor(Math.random() * 1e9) });
        setDecisao(null);
        avancar();
        return () => {
            clearTimeout(proximoRef.current);
            clearTimeout(revelacaoRef.current?.timer);
            revelacaoRef.current = null;
        };
    }, [redes, partida, avancar]);

    function alternarPausa() {
        if (pausado) {
            setPausado(false);
            pausadoRef.current = false;
            avancar();
        } else {
            setPausado(true);
            pausadoRef.current = true;
            clearTimeout(proximoRef.current);
        }
    }

    const cega = estado?.cartasRodada === 1;
    const rotuloSaida = (i) => {
        if (!decisao) return '';
        if (decisao.fase === 'aposta') return `apostar ${i}`;
        return nomeCurto(decisao.maoAntes[i]);
    };

    return (
        <div className="lab-tela">
            <header className="lab-topo">
                <div className="lab-titulo">
                    <span className="lab-marca">CONTRA ZAP · CÉREBRO DO BOT</span>
                    <strong>{texto.titulo}</strong>
                    <span className="lab-detalhe">{texto.detalhe}</span>
                </div>
                <div className="lab-controles">
                    <button type="button" onClick={alternarPausa}>{pausado ? '▶ Continuar' : '⏸ Pausar'}</button>
                    <button type="button" onClick={avancar} disabled={!pausado}>⏭ Passo</button>
                    <div className="lab-velocidades">
                        {VELOCIDADES.map((v) => (
                            <button key={v} type="button" className={v === velocidade ? 'lab-ativo' : ''} onClick={() => setVelocidade(v)}>{v}x</button>
                        ))}
                    </div>
                    <button type="button" onClick={() => setPartida((n) => n + 1)}>↻ Nova partida</button>
                </div>
            </header>

            {erro && <div className="lab-erro">Não deu pra carregar a rede: {erro}</div>}
            {decisao ? (
                <RedeCanvas decisao={decisao} velocidade={velocidade} rotuloSaida={rotuloSaida} />
            ) : (
                <div className="lab-rede lab-rede-vazia">O cérebro aparece na primeira decisão do “Você”.</div>
            )}
            <div className="lab-legenda">
                <span><i className="lab-cor-quente" /> empurrou pra essa escolha</span>
                <span><i className="lab-cor-fria" /> puxou contra</span>
                <span>passe o mouse num neurônio pra ver o valor</span>
            </div>

            <MesaMini estado={estado} pensando={pensando} cega={cega} />
        </div>
    );
}
