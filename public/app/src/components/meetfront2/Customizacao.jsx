import { useEffect, useState } from 'react';
import { chamar } from '../../socket.js';
import { chapeuPorId, tom } from '../../visual.js';
import {
    CORES_LOJA, CHAPEUS_LOJA, COR_CINZA, SEM_CHAPEU, PRECO_COR, PRECO_CHAPEU,
} from '../../../../../conexao/loja.js';
import Casca from '../arcade/Casca.jsx';
import { tocarSom } from '../arcade/somArcade.js';
import Fantasminha from '../meetfront1/Fantasminha.jsx';
import Saldo from './Saldo.jsx';
import './inicio.css';

const ABAS = {
    cor: { rotulo: 'COR', preco: PRECO_COR, gratis: COR_CINZA, comprados: 'coresCompradas' },
    chapeu: { rotulo: 'CHAPÉU', preco: PRECO_CHAPEU, gratis: SEM_CHAPEU, comprados: 'chapeusComprados' },
};

// Raio do círculo de cores, em px (o centro é o cinza grátis).
const RAIO_CIRCULO = 128;

// Loja de customização: o fantasminha à esquerda com o que está
// selecionado (comprado ou não, pra provar antes), a loja à direita — o
// círculo de cores pastel (cinza grátis no meio) e a grade de chapéus. Quem
// decide saldo, posse e preço é o servidor (ver conexao/carteira.js); a
// tela só mostra a carteira que ele devolve.
export default function Customizacao({ meuNome, onVoltar, conectado }) {
    const [carteira, setCarteira] = useState(null);
    const [aba, setAba] = useState('cor');
    // O que está sendo provado: { cor, chapeu }.
    const [provando, setProvando] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState(null);

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
                        <div className="mf2-loja-fantasma">
                            <Fantasminha monitor={false} hue={provando.cor} chapeu={chapeu.src} ajusteChapeuPct={chapeu.ajuste} />
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
                        </div>
                        <div className="mf2-loja-preco">
                            {aba === 'cor' ? `Cada cor: ${PRECO_COR} fichas` : `Cada chapéu: ${PRECO_CHAPEU} fichas`} · comprou, é seu pra sempre
                        </div>

                        {aba === 'cor' ? (
                            <div className="mf2-loja-circulo" style={{ '--raio': `${RAIO_CIRCULO}px` }}>
                                {CORES_LOJA.map((hue, i) => {
                                    const angulo = (i / CORES_LOJA.length) * 2 * Math.PI - Math.PI / 2;
                                    return (
                                        <BotaoCor
                                            key={hue}
                                            hue={hue}
                                            x={Math.cos(angulo) * RAIO_CIRCULO}
                                            y={Math.sin(angulo) * RAIO_CIRCULO}
                                            selecionado={provando.cor === hue}
                                            emUso={carteira.cor === hue}
                                            comprado={carteira.coresCompradas.includes(hue)}
                                            onClick={() => setProvando({ ...provando, cor: hue })}
                                        />
                                    );
                                })}
                                <BotaoCor
                                    hue={COR_CINZA}
                                    x={0}
                                    y={0}
                                    grande
                                    selecionado={provando.cor === COR_CINZA}
                                    emUso={carteira.cor === COR_CINZA}
                                    comprado
                                    onClick={() => setProvando({ ...provando, cor: COR_CINZA })}
                                />
                            </div>
                        ) : (
                            <div className="mf2-loja-chapeus">
                                {[SEM_CHAPEU, ...CHAPEUS_LOJA].map((id) => {
                                    const sprite = chapeuPorId(id);
                                    const comprado = id === SEM_CHAPEU || carteira.chapeusComprados.includes(id);
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            className={`az-b mf2-loja-chapeu${provando.chapeu === id ? ' mf2-loja-selecionado' : ''}${carteira.chapeu === id ? ' mf2-loja-em-uso' : ''}${comprado ? ' mf2-loja-comprado' : ''}`}
                                            onClick={() => setProvando({ ...provando, chapeu: id })}
                                            title={id === SEM_CHAPEU ? 'Sem chapéu' : `Chapéu ${id}`}
                                        >
                                            {sprite.src
                                                ? <span className="mf2-loja-chapeu-sprite" style={{ backgroundImage: `url(${sprite.src})` }} />
                                                : <span className="az-px mf2-loja-sem-chapeu">SEM</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
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

// Bolinha de cor no círculo: marcada quando selecionada, com anel quando
// em uso, apagada quando ainda não foi comprada.
function BotaoCor({ hue, x, y, grande = false, selecionado, emUso, comprado, onClick }) {
    return (
        <button
            type="button"
            className={`az-b mf2-loja-cor${grande ? ' mf2-loja-cor-cinza' : ''}${selecionado ? ' mf2-loja-selecionado' : ''}${emUso ? ' mf2-loja-em-uso' : ''}${comprado ? ' mf2-loja-comprado' : ''}`}
            style={{ background: tom(hue, 80, 82), '--x': `${x}px`, '--y': `${y}px` }}
            onClick={onClick}
            title={hue === COR_CINZA ? 'Cinza (grátis)' : `Cor ${hue}°`}
        />
    );
}
