// Sprites de chapéu extraídos de uma planilha de referência de chapéus do
// Stardew Valley (117 ícones, ~48-54px cada) — ver assets/chapeus/. Só um
// experimento visual pra testar em cima do fantasminha (ver
// components/novo/Fantasminha.jsx), sem ligação nenhuma com o jogo de
// verdade.
const modulos = import.meta.glob('./assets/chapeus/*.png', { eager: true, import: 'default' });

export const CHAPEUS = Object.values(modulos);

export function sortearChapeu() {
    return CHAPEUS[Math.floor(Math.random() * CHAPEUS.length)];
}
