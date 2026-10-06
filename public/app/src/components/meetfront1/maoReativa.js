// Layout reativo da SUA mão (ver SuaMaoEmLeque em MesaExperimento.jsx):
// com poucas cartas o leque é sempre o mesmo; passando do `limiar`, cada
// carta a mais encolhe a mão um pouco e o leque se fecha pra caber na tela
// sem tampar a mesa. Dois conjuntos de ajustes: o do computador e o do
// mobile (ver modoMobile.js), que sai do lab do leque (LabMao.jsx, botão no
// Login).

export const MAO_REATIVA_PADRAO = {
    escalaBase: 1,               // multiplica o 1.5 base das cartas da mão
    subida: 0,                   // px que a mão inteira sobe (negativo desce) até o limiar
    // Passando do `limiar`, a subida cresce em linha reta até `subidaMaxima`,
    // alcançada em `limiarSubida` cartas (daí pra cima fica nela).
    subidaMaxima: 0,
    limiarSubida: 10,
    anguloBase: 10,              // graus entre uma carta e a próxima
    deslocamentoBase: 70,        // px entre uma carta e a próxima
    // Abaixo disso o canto da carta (rank + naipe) some debaixo da vizinha.
    deslocamentoMinimo: 22,
    // Largura da carta na mão em escala 1: .carta (92px) x 1.5 da
    // .mesa-exp-sua-mao-carta.
    larguraCarta: 92 * 1.5,
    limiar: 8,                   // até aqui nada muda
    encolhimentoPorCarta: 0.025, // escala perdida por carta acima do limiar
    escalaMinima: 0.75,
    larguraMaxima: 0.65,         // fração da largura disponível que o leque pode ocupar
    aberturaMaxima: 45,          // graus entre a primeira e a última carta
    escalaForaDaVez: 0.8,        // mão inteira quando não é sua vez de jogar nem de apostar
};

// Mesmos campos do PADRAO. `larguraCarta` aqui é a da .carta-exp de
// verdade (110px) x 1.5.
export const MAO_REATIVA_MOBILE = {
    escalaBase: 0.74,
    subida: 79,
    subidaMaxima: 115,
    limiarSubida: 10,
    anguloBase: 16,
    deslocamentoBase: 98,
    deslocamentoMinimo: 0,
    larguraCarta: 165,
    limiar: 5,
    encolhimentoPorCarta: 0.03,
    escalaMinima: 0.75,
    larguraMaxima: 0.65,
    aberturaMaxima: 45,
    escalaForaDaVez: 0.8,
};

// `escala` vale pra mão inteira (multiplica o 1.5 base das cartas, já com
// `escalaBase`) e `subida` também (px, ver subidaMaxima);
// `angulo`/`deslocamento` são por carta. O teto de largura
// vale sempre — numa tela estreita até poucas cartas podem precisar apertar
// —, mas com a largura normal de desktop ele só entra bem depois do limiar.
export function calcularLayoutMao(quantidade, larguraDisponivel, ajustes = MAO_REATIVA_PADRAO) {
    const excesso = Math.max(0, quantidade - ajustes.limiar);
    const escala = ajustes.escalaBase * Math.max(ajustes.escalaMinima, 1 - excesso * ajustes.encolhimentoPorCarta);
    const faixaSubida = ajustes.limiarSubida - ajustes.limiar;
    const fracaoSubida = faixaSubida > 0 ? Math.min(1, excesso / faixaSubida) : (excesso > 0 ? 1 : 0);
    const subida = ajustes.subida + (ajustes.subidaMaxima - ajustes.subida) * fracaoSubida;
    if (quantidade <= 1) return { escala, subida, angulo: 0, deslocamento: 0 };

    const vaos = quantidade - 1;
    let angulo = ajustes.anguloBase;
    let deslocamento = ajustes.deslocamentoBase * escala;
    if (excesso > 0) angulo = Math.min(ajustes.anguloBase, ajustes.aberturaMaxima / vaos);

    if (larguraDisponivel > 0) {
        const larguraMax = larguraDisponivel * ajustes.larguraMaxima;
        const larguraCarta = ajustes.larguraCarta * escala;
        if (vaos * deslocamento + larguraCarta > larguraMax) {
            deslocamento = Math.max(ajustes.deslocamentoMinimo, (larguraMax - larguraCarta) / vaos);
        }
    }
    return { escala, subida, angulo, deslocamento };
}

// Bloco de código do MAO_REATIVA_MOBILE (é o que o lab mostra pra copiar).
export function gerarCodigoMao(ajustes) {
    const arred = (v) => Math.round(v * 1000) / 1000;
    const linhas = ['export const MAO_REATIVA_MOBILE = {'];
    for (const chave of Object.keys(MAO_REATIVA_MOBILE)) {
        linhas.push(`    ${chave}: ${arred(ajustes[chave])},`);
    }
    linhas.push('};');
    return linhas.join('\n');
}
