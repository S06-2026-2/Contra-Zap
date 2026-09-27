// Pequenos pedaços visuais compartilhados pelas telas da frente arcade.

// Cor do avatar por índice de assento (ordem do roster da sala).
export const CORES = ['#f5c451', '#3d9be9', '#7fd6a5', '#e07be0', '#ff9d5c'];

export function corDoAssento(indice) {
    return CORES[((indice % CORES.length) + CORES.length) % CORES.length];
}

// Mesmo valor de `this.hp = 3` em game/PlayerGame.js.
export const HP_INICIAL = 3;

// "♥♥♡" — cheios + vazios até HP_INICIAL.
export function coracoes(hp, max = HP_INICIAL) {
    const cheios = Math.max(0, Math.min(max, hp));
    return '♥'.repeat(cheios) + '♡'.repeat(max - cheios);
}

// bots/Bot.js sempre nomeia como "Bot N" — o roster pré-início não manda
// flag de bot nenhuma (ver salaSoVoceEBots em novo/Partida.jsx).
export function ehBot(nome) {
    return /^Bot \d+$/.test(nome ?? '');
}

export function inicial(nome) {
    return (String(nome ?? '').trim()[0] ?? '?').toUpperCase();
}
