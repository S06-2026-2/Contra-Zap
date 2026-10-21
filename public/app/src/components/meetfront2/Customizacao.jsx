import { useEffect, useRef, useState } from 'react';
import { chamar } from '../../socket.js';
import { chapeuPorId, tom } from '../../visual.js';
import {
    CORES_LOJA, CHAPEUS_LOJA, COR_CINZA, SEM_CHAPEU, PRECO_COR, PRECO_CHAPEU,
} from '../../../../../conexao/loja.js';
import Casca from '../arcade/Casca.jsx';
import { tocarSom } from '../arcade/somArcade.js';
import Fantasminha from '../meetfront1/Fantasminha.jsx';
import Ficha from '../meetfront1/Ficha.jsx';
import Saldo from './Saldo.jsx';
import './inicio.css';

// `opcoes`: a ordem das setas e da grade, o grátis sempre primeiro.
const ABAS = {
    cor: { rotulo: 'COR', preco: PRECO_COR, gratis: COR_CINZA, comprados: 'coresCompradas', opcoes: [COR_CINZA, ...CORES_LOJA] },
    chapeu: { rotulo: 'CHAPÉU', preco: PRECO_CHAPEU, gratis: SEM_CHAPEU, comprados: 'chapeusComprados', opcoes: [SEM_CHAPEU, ...CHAPEUS_LOJA] },
};

// Loja de customização: à esquerda o saldo e o fantasminha com o que está
// selecionado (comprado ou não, pra provar antes), com setas dos lados que
// andam pelas opções da aba aberta (as setas do teclado também); à direita
// a grade da aba — cores ou chapéus —, onde clicar escolhe direto. Na
// grade, o que você já tem fica com borda azul clara e o selecionado com a
// amarela; "Já tem" esconde o que você ainda não comprou. Quem
// decide saldo, posse e preço é o servidor (ver conexao/carteira.js); a
// tela só mostra a carteira que ele devolve.
export default function Customizacao({ meuNome, onVoltar, conectado }) {
    const [carteira, setCarteira] = useState(null);
    const [aba, setAba] = useState('cor');
    // O que está sendo provado: { cor, chapeu }.
    const [provando, setProvando] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState(null);
    const gradeRef = useRef(null);
    // "Já tem": a grade e as setas só mostram o que você já possui.
    const [soOsMeus, setSoOsMeus] = useState(false);

    // As opções da aba aberta, na ordem das setas e da grade (ver ABAS),
    // filtradas por "Já tem" quando marcado.
    function opcoesVisiveis(chave) {
        const { opcoes, gratis, comprados } = ABAS[chave];
        if (!soOsMeus || !carteira) return opcoes;
        return opcoes.filter((id) => id === gratis || carteira[comprados].includes(id));
    }

    useEffect(() => {
        let cancelado = false;
        chamar('minhaCarteira')
            .then((resposta) => {
                if (cancelado) return;
                setCarteira(resposta);
                setProvando({ cor: resposta.cor, chapeu: resposta.chapeu });
            })
            .catch((erroDaChamada) => { if (!cancelado) setErro(erroDaChamada.message); });
        return () => { cancelado = true; };
    }, []);

    // Anda `passo` opções na aba aberta, dando a volta nas pontas. Provando
    // algo que o filtro escondeu, a seta parte do começo da lista.
    function andar(passo) {
        if (!provando) return;
        const opcoes = opcoesVisiveis(aba);
        const indice = opcoes.indexOf(provando[aba]);
        const atual = indice === -1 ? (passo > 0 ? -1 : 0) : indice;
        const proximo = opcoes[(atual + passo + opcoes.length) % opcoes.length];
        setProvando({ ...provando, [aba]: proximo });
    }
    const andarRef = useRef(andar);
    andarRef.current = andar;

    useEffect(() => {
        function aoTeclar(evento) {
            // Tecla não passa pelo som de clique da casca (ver
            // instalarSomDeClique), então toca aqui o mesmo das setas.
            const passo = evento.key === 'ArrowLeft' ? -1 : evento.key === 'ArrowRight' ? 1 : 0;
            if (!passo) return;
            tocarSom('aba');
            andarRef.current(passo);
        }
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, []);

    // A opção escolhida pelas setas fica sempre à vista na grade. Rola só a
    // grade (ela é o offsetParent dos itens, ver .mf2-loja-grade) — um
    // scrollIntoView levaria a página junto e, no celular, o fantasminha
    // sairia da tela a cada seta.
    useEffect(() => {
        const grade = gradeRef.current;
        const item = grade?.querySelector('.mf2-loja-selecionado');
        if (!item) return;
        if (item.offsetTop < grade.scrollTop) {
            grade.scrollTop = item.offsetTop;
        } else if (item.offsetTop + item.offsetHeight > grade.scrollTop + grade.clientHeight) {
            grade.scrollTop = item.offsetTop + item.offsetHeight - grade.clientHeight;
        }
    }, [provando, aba]);

    async function agir(evento, tipo, valor) {
        setErro(null);
        setCarregando(true);
        try {
            const resposta = await chamar(evento, { tipo, valor });
            setCarteira(resposta);
        } catch (erroDaChamada) {
            tocarSom('erro');
            setErro(erroDaChamada.message);
        } finally {
            setCarregando(false);
        }
    }

    const corpo = !carteira || !provando
        ? <div className="az-px az-vazio">{erro ?? 'CARREGANDO...'}</div>
        : (() => {
            const info = ABAS[aba];
            const valor = provando[aba];
            const tem = valor === info.gratis || carteira[info.comprados].includes(valor);
            const emUso = carteira[aba] === valor;
            const falta = info.preco - carteira.fichas;
            const chapeu = chapeuPorId(provando.chapeu);

            let acao;
            if (emUso) {
                acao = <button type="button" className="az-b az-px az-btn az-btn-cinza az-btn-g" disabled>EM USO</button>;
            } else if (tem) {
                acao = (
                    <button type="button" className="az-b az-px az-btn az-btn-verde az-btn-g" disabled={carregando} onClick={() => agir('equiparItem', aba, valor)}>
                        USAR
                    </button>
                );
            } else {
                acao = (
                    <button type="button" className="az-b az-px az-btn az-btn-amarelo az-btn-g" disabled={carregando || falta > 0} onClick={() => agir('comprarItem', aba, valor)}>
                        {falta > 0 ? `FALTAM ${falta} FICHAS` : `COMPRAR · ${info.preco} FICHAS`}
                    </button>
                );
            }

            return (
                <div className="mf2-loja">
                    <div className="az-painel mf2-loja-provador">
                        <div className="az-px mf2-loja-saldo" title="Suas fichas">
                            <span className="mf2-loja-saldo-ficha"><Ficha /></span>
                            <span className="mf2-loja-saldo-valor">{carteira.fichas}</span>
                            <span className="mf2-loja-saldo-rotulo">FICHAS</span>
                        </div>
                        <div className="mf2-loja-fantasma">
                            <button type="button" data-som="aba" className="az-b az-px mf2-loja-seta" onClick={() => andar(-1)} aria-label="Opção anterior">‹</button>
                            <Fantasminha monitor={false} hue={provando.cor} chapeu={chapeu.src} ajusteChapeuPct={chapeu.ajuste} />
                            <button type="button" data-som="aba" className="az-b az-px mf2-loja-seta" onClick={() => andar(1)} aria-label="Próxima opção">›</button>
                        </div>
                        {acao}
                        {erro && <div className="az-erro">{erro}</div>}
                    </div>

                    <div className="az-painel mf2-loja-vitrine">
                        <div className="az-seletor mf2-loja-abas">
                            {Object.entries(ABAS).map(([chave, { rotulo }]) => (
                                <button
                                    key={chave}
                                    type="button"
                                    data-som="aba"
                                    className={`az-b az-px az-opcao az-opcao-larga${aba === chave ? ' az-ativo' : ''}`}
                                    onClick={() => { setAba(chave); setErro(null); }}
                                >
                                    {rotulo}
                                </button>
                            ))}
                            <label className="az-px mf2-loja-filtro" data-som="aba">
                                <input type="checkbox" checked={soOsMeus} onChange={(evento) => setSoOsMeus(evento.target.checked)} />
                                JÁ TEM
                            </label>
                        </div>
                        <div className="mf2-loja-preco">
                            {aba === 'cor' ? `Cada cor: ${PRECO_COR} fichas` : `Cada chapéu: ${PRECO_CHAPEU} fichas`} · comprou, é seu pra sempre
                        </div>

                        <div ref={gradeRef} className="mf2-loja-grade">
                            {opcoesVisiveis(aba).map((id) => {
                                const comprado = id === info.gratis || carteira[info.comprados].includes(id);
                                const classes = `az-b mf2-loja-item${provando[aba] === id ? ' mf2-loja-selecionado' : ''}${comprado ? ' mf2-loja-comprado' : ''}`;
                                const escolher = () => setProvando({ ...provando, [aba]: id });
                                if (aba === 'cor') {
                                    return (
                                        <button key={id} type="button" className={classes} onClick={escolher} title={id === COR_CINZA ? 'Cinza (grátis)' : `Cor ${id}°`}>
                                            <span className="mf2-loja-cor-amostra" style={{ background: tom(id, 80, 82) }} />
                                        </button>
                                    );
                                }
                                const sprite = chapeuPorId(id);
                                return (
                                    <button key={id} type="button" className={classes} onClick={escolher} title={id === SEM_CHAPEU ? 'Sem chapéu' : `Chapéu ${id}`}>
                                        {sprite.src
                                            ? <span className="mf2-loja-chapeu-sprite" style={{ backgroundImage: `url(${sprite.src})` }} />
                                            : <span className="az-px mf2-loja-sem-chapeu">SEM</span>}
                                    </button>
                                );
                            })}
                        </div>
                        {carteira.convidado && (
                            <div className="az-nota az-centro">Como convidado, suas compras somem quando a sessão acabar.</div>
                        )}
                    </div>
                </div>
            );
        })();

    return (
        <Casca
            conectado={conectado}
            direita={
                <>
                    {carteira && <Saldo fichas={carteira.fichas} />}
                    <span className="az-px az-topo-nome" title="Você">{meuNome}</span>
                </>
            }
        >
            <div className="az-tela mf2-tela-loja" data-screen-label="Customização">
                <div className="az-px az-titulo az-sombra-azul">CUSTOMIZAÇÃO</div>
                <div className="az-sub">Prove à vontade — só paga o que comprar.</div>
                {corpo}
                <button type="button" data-som="aba" className="az-b az-btn-fantasma mf2-custom-voltar" onClick={onVoltar}>
                    Voltar pro início
                </button>
            </div>
        </Casca>
    );
}
