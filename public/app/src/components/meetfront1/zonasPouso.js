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
//
// Os valores saem do lab de pouso (LabPouso.jsx, botão no Login): ajustar
// lá, copiar o bloco gerado e colar no lugar deste.

export const ESCALA_CARTA_JOGADA_MOBILE = 0.6;

export const ZONAS_POUSO_MOBILE = {
    2: [
        { x: 49.3, y: 64.1, largura: 39, altura: 16.9 },
        { x: 50.4, y: 28.7, largura: 31.3, altura: 12 },
    ],
    3: [
        { x: 50, y: 64.1, largura: 38.3, altura: 16.8 },
        { x: 25, y: 37.9, largura: 32.2, altura: 17.4 },
        { x: 75.1, y: 38.4, largura: 32.2, altura: 17.2 },
    ],
    4: [
        { x: 50.2, y: 64.7, largura: 36.5, altura: 15.9 },
        { x: 19.4, y: 47.1, largura: 32.5, altura: 15.7 },
        { x: 49.5, y: 29.4, largura: 25.9, altura: 18.5 },
        { x: 79.8, y: 47.1, largura: 32.3, altura: 15.5 },
    ],
    5: [
        { x: 50.5, y: 62.1, largura: 29.4, altura: 19.5 },
        { x: 16.6, y: 52.7, largura: 32.4, altura: 16.1 },
        { x: 27.9, y: 32.7, largura: 34.7, altura: 16.2 },
        { x: 73.2, y: 32.9, largura: 34.5, altura: 16.7 },
        { x: 84.6, y: 53.2, largura: 31.1, altura: 15.4 },
    ],
    6: [
        { x: 50.7, y: 67.4, largura: 37, altura: 17.9 },
        { x: 18.1, y: 52, largura: 34.3, altura: 16.4 },
        { x: 21.8, y: 35.2, largura: 32, altura: 16.2 },
        { x: 50.7, y: 29.5, largura: 29.2, altura: 15.6 },
        { x: 77.4, y: 36.3, largura: 32, altura: 16.1 },
        { x: 82.5, y: 52.4, largura: 33.3, altura: 16.4 },
    ],
};

// Onde as cartas meladas se juntam no mobile (o mesmo canto de
// MELADA_CANTO_X/Y do computador, só que em % da tela): é a âncora do
// primeiro grupo; os grupos seguintes vão pra direita dela.
export const MELADA_POUSO_MOBILE = { x: 11.2, y: 67.8 };

// Ponto sorteado dentro da zona, em % da tela.
export function sortearPontoNaZona(zona) {
    return {
        x: zona.x + (Math.random() - 0.5) * zona.largura,
        y: zona.y + (Math.random() - 0.5) * zona.altura,
    };
}

// Bloco de código com as zonas, a escala e o canto das meladas, no
// formato deste arquivo (é o que o lab mostra pra copiar).
export function gerarCodigoZonas(zonas, escala, melada) {
    const arred = (v) => Math.round(v * 10) / 10;
    const linhas = [`export const ESCALA_CARTA_JOGADA_MOBILE = ${Math.round(escala * 100) / 100};`, '', 'export const ZONAS_POUSO_MOBILE = {'];
    for (const quantidade of Object.keys(zonas).sort((a, b) => a - b)) {
        linhas.push(`    ${quantidade}: [`);
        for (const z of zonas[quantidade]) {
            linhas.push(`        { x: ${arred(z.x)}, y: ${arred(z.y)}, largura: ${arred(z.largura)}, altura: ${arred(z.altura)} },`);
        }
        linhas.push('    ],');
    }
    linhas.push('};', '', `export const MELADA_POUSO_MOBILE = { x: ${arred(melada.x)}, y: ${arred(melada.y)} };`);
    return linhas.join('\n');
}
