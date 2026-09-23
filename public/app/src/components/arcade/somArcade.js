// Singleton do motor de som da frente arcade (ver arcade/som.js). Uma
// instância só pro app inteiro — as três telas (Login/Lobby/Partida) tocam
// pelo mesmo `tocarSom`, e o SOM ON/OFF da barra de cima vale pra todas.
//
// O AudioContext só é criado no primeiro gesto do usuário (política de
// autoplay dos navegadores): até lá `tocarSom` não faz nada — nem cria o
// contexto "suspenso", que alguns navegadores reclamam no console.
import Som from '../../arcade/som.js';

const CHAVE_SOM = 'contrazap-arcade-som';
const CHAVE_VOLUME = 'contrazap-arcade-volume';
const VOLUME_PADRAO = 0.7;

function lerLocal(chave) {
    try {
        return localStorage.getItem(chave);
    } catch {
        return null;
    }
}

function gravarLocal(chave, valor) {
    try {
        localStorage.setItem(chave, valor);
    } catch {
        // sem localStorage (aba privada etc.) só não lembra no próximo F5
    }
}

let ligado = lerLocal(CHAVE_SOM) !== 'off';
let volume = (() => {
    const v = Number(lerLocal(CHAVE_VOLUME));
    return lerLocal(CHAVE_VOLUME) != null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : VOLUME_PADRAO;
})();
let motor = null;
let acordado = false;
const ouvintes = new Set();

function avisar() {
    for (const ouvinte of ouvintes) ouvinte();
}

function obterMotor() {
    if (!motor) {
        motor = new Som();
        motor.defVolume(volume);
    }
    return motor;
}

export function tocarSom(nome) {
    if (!ligado || !acordado || !nome) return;
    obterMotor().tocar(nome);
}

// API no formato de useSyncExternalStore (mesmo padrão de assinarConexao
// em socket.js).
export function assinarSom(ouvinte) {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
}

export function somLigado() {
    return ligado;
}

export function volumeSom() {
    return volume;
}

export function alternarSom() {
    ligado = !ligado;
    gravarLocal(CHAVE_SOM, ligado ? 'on' : 'off');
    if (ligado) {
        acordado = true;
        obterMotor().acordar();
        tocarSom('aba');
    }
    avisar();
}

export function definirVolume(v) {
    volume = v;
    gravarLocal(CHAVE_VOLUME, String(v));
    if (motor) motor.defVolume(v);
    avisar();
}

// Instala (uma vez por montagem da casca arcade) o som de clique genérico:
// qualquer <button>/<input> clicado toca `clique`, a não ser que ele (ou
// um ancestral) tenha `data-som="<nome>"` — aí toca esse nome, ou nada se
// for "mudo". O primeiro gesto também acorda o AudioContext. Devolve a
// função de desinstalar (formato de cleanup de useEffect).
export function instalarSomDeClique() {
    function acordar() {
        if (acordado) return;
        acordado = true;
        if (ligado) obterMotor().acordar();
    }
    function aoClicar(evento) {
        acordar();
        const alvo = evento.target.closest?.('button, input, [data-som]');
        if (!alvo || alvo.disabled) return;
        const marca = alvo.closest('[data-som]');
        const nome = marca ? marca.getAttribute('data-som') : 'clique';
        if (nome !== 'mudo') tocarSom(nome);
    }
    document.addEventListener('pointerdown', acordar, true);
    document.addEventListener('keydown', acordar, true);
    document.addEventListener('click', aoClicar, true);
    return () => {
        document.removeEventListener('pointerdown', acordar, true);
        document.removeEventListener('keydown', acordar, true);
        document.removeEventListener('click', aoClicar, true);
    };
}
