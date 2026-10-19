// avisoFichas.js
// Fichas ganhas, pra quem mostra o aviso (meetfront2/AvisoFichas.jsx): as
// da colocação chegam pelo socket (fichasGanhas, privado, assim que o
// jogador sai da partida ou vence); as da desistência vêm no ack de
// `desistir` e quem desistiu chama avisarFichas direto (ver Lobby.jsx).
import { socket } from './socket.js';

const ouvintes = new Set();

// aviso: { fichas, saldo, posicao?, total?, motivo: 'colocacao' | 'desistencia' }
export function avisarFichas(aviso) {
    for (const ouvinte of ouvintes) ouvinte(aviso);
}

// Devolve a função de cancelar a assinatura (mesmo formato de
// assinarConexao em socket.js).
export function assinarAvisoFichas(ouvinte) {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
}

socket.on('fichasGanhas', ({ fichas, saldo, posicao, total }) => {
    avisarFichas({ fichas, saldo, posicao, total, motivo: 'colocacao' });
});
