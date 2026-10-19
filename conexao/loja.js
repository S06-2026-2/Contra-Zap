// loja.js
// Economia de fichas e catálogo da loja de customização — fonte única
// compartilhada pelo servidor (conexao/carteira.js, socketServer.js) e pelo
// front (tela de customização), mesmo esquema de conexao/limites.js. Puro:
// sem banco nem socket.

// Toda conta (e todo convidado) começa com isso.
export const FICHAS_INICIAIS = 100;

export const PRECO_COR = 20;
export const PRECO_CHAPEU = 50;

// Cor = matiz (em graus) do tom pastel do fantasminha, andando de
// PASSO_COR em PASSO_COR pelo círculo de cor. COR_CINZA é o padrão grátis.
export const PASSO_COR = 10;
export const COR_CINZA = -1;
export const CORES_LOJA = Array.from({ length: 360 / PASSO_COR }, (_, i) => i * PASSO_COR);

// Chapéu = número do sprite (public/app/src/assets/chapeus/chapeu-NNN.png).
// SEM_CHAPEU é o padrão grátis. A lista tem que bater com os .png de lá.
export const SEM_CHAPEU = 0;
export const CHAPEUS_LOJA = [
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25,
    26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 45,
    46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 58, 59, 60, 61, 63, 65, 67,
    68, 69, 70, 71, 72, 73, 74, 76, 79, 80, 81, 84, 85, 86, 87, 88, 89, 90,
    92, 93, 95, 96, 97, 99, 100, 101, 102, 104, 105, 106, 107, 108, 109, 110,
    112, 113, 114, 115,
];

// Os dois tipos de item: em que lista o valor tem que estar, quanto custa e
// qual é o grátis (que todo mundo tem sem comprar).
export const TIPOS_ITEM = {
    cor: { catalogo: CORES_LOJA, preco: PRECO_COR, gratis: COR_CINZA },
    chapeu: { catalogo: CHAPEUS_LOJA, preco: PRECO_CHAPEU, gratis: SEM_CHAPEU },
};

// Fichas por colocação: 100 por jogar + 50 por jogador que você durou mais
// (com 4 jogadores: 4º 100, 3º 150, 2º 200, 1º 250).
export function recompensaColocacao(posicao, total) {
    return 100 + 50 * Math.max(0, total - posicao);
}

// Fichas por desistir, pelas rodadas que já tinham terminado: menos de 3 não
// ganha nada.
export function recompensaDesistencia(rodadasCompletas) {
    if (rodadasCompletas >= 5) return 40;
    if (rodadasCompletas >= 4) return 30;
    if (rodadasCompletas >= 3) return 25;
    return 0;
}

// Visual dos bots: sorteado do catálogo inteiro.
export function visualAleatorio() {
    return {
        cor: CORES_LOJA[Math.floor(Math.random() * CORES_LOJA.length)],
        chapeu: CHAPEUS_LOJA[Math.floor(Math.random() * CHAPEUS_LOJA.length)],
    };
}
