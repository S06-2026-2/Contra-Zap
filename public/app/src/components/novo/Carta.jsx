import { createContext, useContext, useId } from 'react';
import RaiosNaCarta from './RaiosNaCarta.jsx';

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
function BordaEletrica() {
    const idFiltro = `carta-exp-zap-filtro-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <div className="carta-exp-zap-borda" aria-hidden="true">
            <svg className="carta-exp-zap-filtro-svg">
                <defs>
                    <filter id={idFiltro} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="6" result="ruido1" seed="1" />
                        <feOffset in="ruido1" dx="0" dy="0" result="ruidoDesloc1">
                            <animate attributeName="dy" values="220; 0" dur="5s" repeatCount="indefinite" calcMode="linear" />
                        </feOffset>
                        <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="6" result="ruido2" seed="1" />
                        <feOffset in="ruido2" dx="0" dy="0" result="ruidoDesloc2">
                            <animate attributeName="dy" values="0; -220" dur="5s" repeatCount="indefinite" calcMode="linear" />
                        </feOffset>
                        <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="6" result="ruido3" seed="2" />
                        <feOffset in="ruido3" dx="0" dy="0" result="ruidoDesloc3">
                            <animate attributeName="dx" values="160; 0" dur="5s" repeatCount="indefinite" calcMode="linear" />
                        </feOffset>
                        <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="6" result="ruido4" seed="2" />
                        <feOffset in="ruido4" dx="0" dy="0" result="ruidoDesloc4">
                            <animate attributeName="dx" values="0; -160" dur="5s" repeatCount="indefinite" calcMode="linear" />
                        </feOffset>
                        <feComposite in="ruidoDesloc1" in2="ruidoDesloc2" result="parte1" />
                        <feComposite in="ruidoDesloc3" in2="ruidoDesloc4" result="parte2" />
                        <feBlend in="parte1" in2="parte2" mode="color-dodge" result="ruidoFinal" />
                        <feDisplacementMap in="SourceGraphic" in2="ruidoFinal" scale="11" xChannelSelector="R" yChannelSelector="B" />
                    </filter>
                </defs>
            </svg>
            <div className="carta-exp-zap-borda-externa" />
            <div className="carta-exp-zap-borda-linha" style={{ filter: `url(#${idFiltro})` }} />
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
// nessa taxa.
export default function Carta({ rank, naipe, valorInt, manilha, efeitoManilha = false, virada = false, taxaRaios = 0, taxaRaiosTransicaoMs = 0 }) {
    const valorManilhaDaMesa = useContext(ManilhaContext);
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
        <div className={`carta-exp${ehManilha ? ' carta-exp-manilha' : ''}${classeMaterial ? ` ${classeMaterial}` : ''}`}>
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
                    <RaiosNaCarta taxa={taxaRaios} transicaoMs={taxaRaiosTransicaoMs} />
                    <BordaEletrica />
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
