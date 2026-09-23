// Configuração de sala que o ack de criarSala/entrarSala/jogarDeNovo (ou o
// item de listarSalas) traz, mas que o App não repassa pra Partida — as
// props das telas são as mesmas nas três frentes e não mudam por causa da
// arcade. A Lobby arcade anota aqui antes de chamar onEntrouNaSala, e a
// Partida arcade lê pelo salaId pra desenhar as vagas livres ("4/6") e os
// chips de regra da sala de espera. Só em memória: some num F5, e aí a
// espera só mostra o que dá pra saber pelo roster.
const infoPorSala = new Map();

// info: { numberPlayers?, roundStart?, botNumber? } — campos ausentes não apagam os já anotados.
export function guardarInfoSala(salaId, info) {
    if (!salaId) return;
    const limpo = Object.fromEntries(Object.entries(info).filter(([, v]) => v != null));
    infoPorSala.set(salaId, { ...infoPorSala.get(salaId), ...limpo });
}

export function lerInfoSala(salaId) {
    return infoPorSala.get(salaId) ?? {};
}
