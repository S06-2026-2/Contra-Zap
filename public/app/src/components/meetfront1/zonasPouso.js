// Zonas de pouso das cartas jogadas no mobile (ver modoMobile.js): com os
// fantasminhas todos em cima, o pouso "na direção do assento" do computador
// amontoa as cartas de todo mundo no mesmo pedaço da mesa. Aqui cada assento
// tem um retângulo próprio, desenhado à mão por quantidade de jogadores, e a
// carta cai num ponto sorteado dentro dele — nunca fora.
//
// Tudo em % da TELA: centro (`x`, `y`) e tamanho (`largura`, `altura`).
// Índice 0 é você; os outros seguem a ordem dos assentos (da esquerda pra
// direita no arco de cima). Quantidade sem tabela aqui cai no pouso do
// computador (calcularAlvoJogada em MesaExperimento.jsx).

export const ESCALA_CARTA_JOGADA_MOBILE = 0.6;

export const ZONAS_POUSO_MOBILE = {
    2: [
        { x: 50.1, y: 64, largura: 51.5, altura: 15.8 },
        { x: 50.1, y: 31.6, largura: 55.8, altura: 15.9 },
    ],
    3: [
        { x: 50.9, y: 65, largura: 45.1, altura: 18.4 },
        { x: 21, y: 42.2, largura: 31.9, altura: 22.7 },
        { x: 80.9, y: 42.4, largura: 31.1, altura: 24 },
    ],
    4: [
        { x: 49, y: 62.9, largura: 44.5, altura: 13.4 },
        { x: 18.5, y: 48.3, largura: 30.6, altura: 16.9 },
        { x: 48.6, y: 33.7, largura: 42.9, altura: 12.1 },
        { x: 83.1, y: 49.1, largura: 28.8, altura: 16.6 },
    ],
    5: [
        { x: 51.3, y: 67.4, largura: 39.4, altura: 12.2 },
        { x: 17.7, y: 54.3, largura: 29.5, altura: 11.1 },
        { x: 24.9, y: 42.8, largura: 35, altura: 8.5 },
        { x: 75.3, y: 42.8, largura: 32.5, altura: 8.7 },
        { x: 82.2, y: 55, largura: 29, altura: 10.9 },
    ],
    6: [
        { x: 51.4, y: 65.6, largura: 27.6, altura: 16.1 },
        { x: 18.9, y: 56.6, largura: 31.2, altura: 10.7 },
        { x: 18.4, y: 44.5, largura: 30.5, altura: 11.2 },
        { x: 50.3, y: 32.4, largura: 20.9, altura: 17.2 },
        { x: 81.7, y: 45.7, largura: 29.7, altura: 11 },
        { x: 81.5, y: 57.1, largura: 27.6, altura: 11.2 },
    ],
};

// Onde as cartas meladas se juntam no mobile (o mesmo canto de
// MELADA_CANTO_X/Y do computador, só que em % da tela): é a âncora do
// primeiro grupo; os grupos seguintes vão pra direita dela.
export const MELADA_POUSO_MOBILE = { x: 11.2, y: 67.8 };

// Posição dos fantasminhas dos outros no mobile, por quantidade de
// jogadores: centro de cada assento (caixinha + bandeja + nome) em % da
// tela, na ordem dos assentos sem você (o primeiro é o assento 2).
// Quantidade sem tabela aqui fica no triângulo calculado
// (calcularAssentosMobile em MesaExperimento.jsx).
export const ASSENTOS_MOBILE = {
    3: [{ x: 17.1, y: 19.6 }, { x: 83.7, y: 19.2 }],
    4: [{ x: 16.6, y: 19.9 }, { x: 50.3, y: 13.6 }, { x: 82.9, y: 20.1 }],
    5: [{ x: 14.3, y: 29.8 }, { x: 30.7, y: 16.2 }, { x: 68.2, y: 16.5 }, { x: 83.9, y: 30.3 }],
    6: [{ x: 15.8, y: 29.1 }, { x: 16.5, y: 16.2 }, { x: 49.8, y: 12.6 }, { x: 83.3, y: 16.7 }, { x: 84.4, y: 29.4 }],
};

// Ponto sorteado dentro da zona, em % da tela.
export function sortearPontoNaZona(zona) {
    return {
        x: zona.x + (Math.random() - 0.5) * zona.largura,
        y: zona.y + (Math.random() - 0.5) * zona.altura,
    };
}

