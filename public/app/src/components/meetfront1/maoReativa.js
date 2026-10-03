// Layout reativo da SUA mão (ver SuaMaoEmLeque em MesaExperimento.jsx):
// com poucas cartas o leque é sempre o mesmo; passando do `limiar`, cada
// carta a mais encolhe a mão um pouco e o leque se fecha pra caber na tela
// sem tampar a mesa. Os números são ajustados no laboratório da mão (botão
// "🃏 MÃO" no login, ver LabMao.jsx), que mostra os valores prontos pra
// colar aqui.

export const ANGULO_BASE = 10;        // graus entre uma carta e a próxima
export const DESLOCAMENTO_BASE = 70;  // px entre uma carta e a próxima
// Largura da carta na mão em escala 1: .carta (92px) x 1.5 da
// .mesa-exp-sua-mao-carta.
const LARGURA_CARTA = 92 * 1.5;
// Abaixo disso o canto da carta (rank + naipe) some debaixo da vizinha.
const DESLOCAMENTO_MINIMO = 22;

export const MAO_REATIVA_PADRAO = {
    limiar: 8,                   // até aqui nada muda
    encolhimentoPorCarta: 0.025, // escala perdida por carta acima do limiar
    escalaMinima: 0.75,
    larguraMaxima: 0.65,         // fração da largura disponível que o leque pode ocupar
    aberturaMaxima: 45,          // graus entre a primeira e a última carta
    escalaForaDaVez: 0.8,        // mão inteira quando não é sua vez de jogar nem de apostar
};

// `escala` vale pra mão inteira (multiplica o 1.5 base das cartas);
// `angulo`/`deslocamento` são por carta. O teto de largura vale sempre — numa
// tela estreita até poucas cartas podem precisar apertar —, mas com a largura
// normal de desktop ele só entra bem depois do limiar.
export function calcularLayoutMao(quantidade, larguraDisponivel, ajustes = MAO_REATIVA_PADRAO) {
    const excesso = Math.max(0, quantidade - ajustes.limiar);
    const escala = Math.max(ajustes.escalaMinima, 1 - excesso * ajustes.encolhimentoPorCarta);
    if (quantidade <= 1) return { escala, angulo: 0, deslocamento: 0 };

    const vaos = quantidade - 1;
    let angulo = ANGULO_BASE;
    let deslocamento = DESLOCAMENTO_BASE * escala;
    if (excesso > 0) angulo = Math.min(ANGULO_BASE, ajustes.aberturaMaxima / vaos);

    if (larguraDisponivel > 0) {
        const larguraMax = larguraDisponivel * ajustes.larguraMaxima;
        const larguraCarta = LARGURA_CARTA * escala;
        if (vaos * deslocamento + larguraCarta > larguraMax) {
            deslocamento = Math.max(DESLOCAMENTO_MINIMO, (larguraMax - larguraCarta) / vaos);
        }
    }
    return { escala, angulo, deslocamento };
}
