// Sprites de chapéu extraídos de uma planilha de referência de chapéus do
// Stardew Valley (ver assets/chapeus/) — experimento visual em cima do
// fantasminha (ver components/novo/Fantasminha.jsx), sem ligação nenhuma
// com o jogo de verdade. Dos 117 originais, só ficaram os que passaram na
// validação manual (ver assets/chapeus/calibracao-chapeus.csv, gerado pelo
// Calibrador de chapéus que já foi removido) — cada um com um ajuste
// vertical próprio (`ajuste`, em pontos percentuais de `top`, ver
// ajusteChapeuPct em Fantasminha.jsx), porque a maioria não nasceu
// desenhada pra encaixar no mesmo lugar.
import calibracaoBruta from './assets/chapeus/calibracao-chapeus.csv?raw';

const modulos = import.meta.glob('./assets/chapeus/*.png', { eager: true, import: 'default' });

// id -> ajuste (pula o cabeçalho "chapeu;funciona;ajuste" — todo chapéu que
// sobrou como arquivo .png tem uma linha aqui, os dois vêm do mesmo apuramento).
const AJUSTES_POR_ID = new Map(
    calibracaoBruta
        .trim()
        .split('\n')
        .slice(1)
        .map((linha) => {
            const [id, , ajuste] = linha.split(';');
            return [id, Number(ajuste)];
        })
);

// `id` é o número de 3 dígitos do nome do arquivo (chapeu-001.png -> "001")
// — extraído do caminho em vez de assumido pela ordem do glob, pra nunca
// dessincronizar do arquivo de verdade em disco.
export const CHAPEUS_COM_ID = Object.entries(modulos)
    .map(([caminho, src]) => {
        const id = caminho.match(/chapeu-(\d+)\.png$/)[1];
        return { id, src, ajuste: AJUSTES_POR_ID.get(id) ?? 0 };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

export function sortearChapeu() {
    return CHAPEUS_COM_ID[Math.floor(Math.random() * CHAPEUS_COM_ID.length)];
}
