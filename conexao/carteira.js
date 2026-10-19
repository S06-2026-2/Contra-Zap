// carteira.js
// Fichas, itens comprados e visual equipado (cor/chapéu) de cada jogador.
// Conta registrada guarda tudo no banco (conexao/db.js); convidado guarda
// só em memória, pelo id efêmero dele (negativo, ver conexao/convidado.js):
// começa com as mesmas FICHAS_INICIAIS, pode comprar e equipar, mas nunca
// ganha fichas em partida e perde tudo quando a sessão acaba. O resto do
// servidor não sabe a diferença — só chama as funções daqui.
import { CodigosErro } from './eventos.js';
import { buscarCarteira, creditarFichas, gravarCarteira, transacao } from './db.js';
import { FICHAS_INICIAIS, COR_CINZA, SEM_CHAPEU, TIPOS_ITEM } from './loja.js';

export class ErroCarteira extends Error {
    constructor(codigo, mensagem) {
        super(mensagem);
        this.name = 'ErroCarteira';
        this.codigo = codigo;
    }
}

// Convidado sem uso há mais que isso é esquecido — o token dele (6h, ver
// conexao/jwt.js) já venceu, ninguém mais consegue ser esse id.
const VALIDADE_CONVIDADO_MS = 6 * 60 * 60 * 1000;
const carteirasConvidados = new Map(); // id -> { carteira, ultimoUso }

function ehConvidado(player) {
    return player.id < 0;
}

function carteiraNova() {
    return {
        fichas: FICHAS_INICIAIS,
        cor: COR_CINZA,
        chapeu: SEM_CHAPEU,
        coresCompradas: [],
        chapeusComprados: [],
    };
}

function esquecerConvidadosVencidos(agora) {
    for (const [id, entrada] of carteirasConvidados) {
        if (agora - entrada.ultimoUso > VALIDADE_CONVIDADO_MS) carteirasConvidados.delete(id);
    }
}

function carteiraDoConvidado(id) {
    const agora = Date.now();
    esquecerConvidadosVencidos(agora);
    let entrada = carteirasConvidados.get(id);
    if (!entrada) {
        entrada = { carteira: carteiraNova(), ultimoUso: agora };
        carteirasConvidados.set(id, entrada);
    }
    entrada.ultimoUso = agora;
    return entrada.carteira;
}

// { fichas, cor, chapeu, coresCompradas, chapeusComprados }.
export function lerCarteira(player) {
    if (ehConvidado(player)) return { ...carteiraDoConvidado(player.id) };
    return buscarCarteira(player.id) ?? carteiraNova();
}

// Só o que vai pra mesa: { cor, chapeu }.
export function visualDe(player) {
    const { cor, chapeu } = lerCarteira(player);
    return { cor, chapeu };
}

function campos(tipo) {
    const item = TIPOS_ITEM[tipo];
    if (!item) throw new ErroCarteira(CodigosErro.ITEM_INVALIDO, `Tipo de item desconhecido: "${tipo}".`);
    return {
        ...item,
        equipado: tipo,
        comprados: tipo === 'cor' ? 'coresCompradas' : 'chapeusComprados',
    };
}

function exigirNoCatalogo(item, valor) {
    if (!item.catalogo.includes(valor)) {
        throw new ErroCarteira(CodigosErro.ITEM_INVALIDO, 'Esse item não existe na loja.');
    }
}

// Lê, aplica `mudar` (que valida e altera a cópia) e grava — numa
// transação pra conta registrada, direto na memória pro convidado.
function alterarCarteira(player, mudar) {
    if (ehConvidado(player)) {
        const carteira = carteiraDoConvidado(player.id);
        const copia = { ...carteira, coresCompradas: [...carteira.coresCompradas], chapeusComprados: [...carteira.chapeusComprados] };
        mudar(copia);
        Object.assign(carteira, copia);
        return { ...carteira };
    }
    return transacao(() => {
        const carteira = buscarCarteira(player.id) ?? carteiraNova();
        mudar(carteira);
        gravarCarteira(player.id, carteira);
        return carteira;
    });
}

// Compra pra sempre e já equipa. Devolve a carteira atualizada.
export function comprarItem(player, tipo, valor) {
    const item = campos(tipo);
    exigirNoCatalogo(item, valor);
    return alterarCarteira(player, (carteira) => {
        if (carteira[item.comprados].includes(valor)) {
            throw new ErroCarteira(CodigosErro.ITEM_JA_COMPRADO, 'Você já tem esse item.');
        }
        if (carteira.fichas < item.preco) {
            throw new ErroCarteira(CodigosErro.SALDO_INSUFICIENTE, `Faltam ${item.preco - carteira.fichas} fichas.`);
        }
        carteira.fichas -= item.preco;
        carteira[item.comprados].push(valor);
        carteira[item.equipado] = valor;
    });
}

// Troca o equipado por um item já comprado (ou pelo grátis). Devolve a
// carteira atualizada.
export function equiparItem(player, tipo, valor) {
    const item = campos(tipo);
    if (valor !== item.gratis) exigirNoCatalogo(item, valor);
    return alterarCarteira(player, (carteira) => {
        if (valor !== item.gratis && !carteira[item.comprados].includes(valor)) {
            throw new ErroCarteira(CodigosErro.ITEM_NAO_COMPRADO, 'Compre esse item antes de usar.');
        }
        carteira[item.equipado] = valor;
    });
}

// Recompensa de partida: só conta registrada ganha. Devolve o saldo novo,
// ou null quando não creditou (convidado).
export function creditar(player, valor) {
    if (ehConvidado(player) || valor <= 0) return null;
    return creditarFichas(player.id, valor);
}
