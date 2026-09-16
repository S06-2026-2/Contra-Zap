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
    Ouros:   { simbolo: '♦', cor: '#f2555a' },
    Copas:   { simbolo: '♥', cor: '#f2555a' },
    Espadas: { simbolo: '♠', cor: '#5c9dff' },
    Paus:    { simbolo: '♣', cor: '#42c98a' },
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

export default function Carta({ rank, naipe, valorInt, manilha, virada = false }) {
    if (virada) {
        return <div className="carta-exp carta-exp-verso" />;
    }

    const info = NAIPES[naipe] ?? { simbolo: '', cor: 'inherit' };
    const ehManilha = manilha != null && valorInt === manilha;
    const pips = PIPS[rank];

    return (
        <div className={`carta-exp${ehManilha ? ' carta-exp-manilha' : ''}`}>
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
                <span className="carta-exp-rank" style={{ color: info.cor }}>{rank}</span>
                <span className="carta-exp-naipe" style={{ color: info.cor }}>{info.simbolo}</span>
            </div>
            <div className="carta-exp-indice carta-exp-indice-invertido">
                <span className="carta-exp-rank" style={{ color: info.cor }}>{rank}</span>
                <span className="carta-exp-naipe" style={{ color: info.cor }}>{info.simbolo}</span>
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
                                color: info.cor,
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
