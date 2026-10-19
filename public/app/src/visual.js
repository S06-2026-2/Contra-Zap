// visual.js
// Cor e chapéu do fantasminha a partir do que o servidor guarda (ver
// conexao/loja.js): cor = matiz em graus do tom pastel, ou COR_CINZA;
// chapéu = número do sprite, ou SEM_CHAPEU.
import { CHAPEUS_COM_ID } from './chapeus.js';
import { COR_CINZA, SEM_CHAPEU } from '../../../conexao/loja.js';

// hsl() do tom do fantasminha; com COR_CINZA (qualquer matiz negativo) é o
// mesmo tom sem saturação.
export function tom(hue, saturacao, luz) {
    return hue < 0 ? `hsl(0, 0%, ${luz}%)` : `hsl(${hue}, ${saturacao}%, ${luz}%)`;
}

const NENHUM_CHAPEU = { id: null, src: null, ajuste: 0 };

// { id, src, ajuste } do sprite (ver chapeus.js); sem chapéu, src null.
export function chapeuPorId(id) {
    if (id == null || id === SEM_CHAPEU) return NENHUM_CHAPEU;
    return CHAPEUS_COM_ID.find((c) => Number(c.id) === id) ?? NENHUM_CHAPEU;
}

export { COR_CINZA, SEM_CHAPEU };
