// Preferência "Dica do bot" da frente arcade: ligada, a mesa mostra na sua
// vez o que o bot da sala (modeloBot) faria no seu lugar — aposta ou carta
// — via o evento `sugestaoBot` (ver conexao/PROTOCOLO.md). Só leitura: a
// jogada continua sendo sua. Fica no localStorage pra valer em toda partida
// até desligar, igual ao SOM ON/OFF (ver somArcade.js).
const CHAVE_DICA_BOT = 'contrazap-arcade-dica-bot';

export function lerDicaBotLigada() {
    try {
        return localStorage.getItem(CHAVE_DICA_BOT) === 'on';
    } catch {
        return false;
    }
}

export function gravarDicaBotLigada(ligada) {
    try {
        localStorage.setItem(CHAVE_DICA_BOT, ligada ? 'on' : 'off');
    } catch {
        // sem localStorage (aba privada etc.) só não lembra no próximo F5
    }
}
