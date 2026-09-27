import { lerCarta } from './golpes.js';

// Face de carta da frente arcade. `tamanho` escolhe só as medidas (ver
// .az-carta-* em arcade.css): 'mesa' 84×120, 'mao' 92×132, 'vaza' 96×138,
// 'vira' 52×74, 'mini' (mão revelada de oponente na rodada de 1 carta).
// Na 'vaza' só vai o valor grande, como no design.
export function FaceCarta({ texto, tamanho = 'mesa' }) {
    const carta = lerCarta(texto);
    if (!carta) return <span className={`az-carta az-carta-${tamanho}`}>{texto}</span>;
    const cor = { color: carta.cor };
    return (
        <span className={`az-carta az-carta-${tamanho}`}>
            <span className="az-px az-carta-valor" style={cor}>{carta.rank}</span>
            {tamanho !== 'vaza' && (
                <>
                    <span className="az-carta-naipe az-carta-naipe-topo" style={cor}>{carta.glifo}</span>
                    {tamanho !== 'vira' && tamanho !== 'mini' && (
                        <span className="az-carta-naipe az-carta-naipe-baixo" style={cor}>{carta.glifo}</span>
                    )}
                </>
            )}
        </span>
    );
}

// Verso listrado vermelho. `tamanho` igual ao de FaceCarta, mais 'oponente'
// (o leque pequeno em cima de cada card de oponente).
export function VersoCarta({ tamanho = 'oponente' }) {
    return <span className={`az-verso az-verso-${tamanho}`} />;
}
