import { useState } from 'react';
import { chamar } from '../../socket.js';
import { NOME_MIN, NOME_MAX, SENHA_MIN, SENHA_MAX } from '../../../../../conexao/limites.js';
import Casca from './Casca.jsx';
import { tocarSom } from './somArcade.js';

const ETAPA = {
    NOME: 'nome',
    CONFIRMAR_SENHA: 'senha',
    OFERECER_CADASTRO: 'oferta',
    NOVA_SENHA: 'novaSenha',
};

// Mesmo fluxo em etapas do novo/Login.jsx (nome decide o resto: senha pra
// nome registrado; oferta de cadastro ou convidado pra nome livre) — só a
// casca visual é arcade.
export default function Login({ onAutenticado, conectado }) {
    const [etapa, setEtapa] = useState(ETAPA.NOME);
    const [nome, setNome] = useState('');
    const [senha, setSenha] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState(null);

    function irPara(proxima) {
        setEtapa(proxima);
        setErro(null);
    }

    function voltar() {
        irPara(ETAPA.NOME);
        setSenha('');
    }

    async function continuar(evento) {
        evento.preventDefault();
        if (nome.trim().length < NOME_MIN) return;
        setErro(null);
        setCarregando(true);
        try {
            const resposta = await chamar('verificarNome', { nome });
            irPara(resposta.existe ? ETAPA.CONFIRMAR_SENHA : ETAPA.OFERECER_CADASTRO);
        } catch (erroDaChamada) {
            tocarSom('erro');
            setErro(erroDaChamada.message);
        } finally {
            setCarregando(false);
        }
    }

    async function autenticar(evento, tipoDeAcao, payload) {
        evento?.preventDefault();
        setErro(null);
        setCarregando(true);
        try {
            const resposta = await chamar(tipoDeAcao, payload ?? { nome, senha });
            onAutenticado({ nome: resposta.nome, token: resposta.token });
        } catch (erroDaChamada) {
            tocarSom('erro');
            // `ultimaTentativa` só vem em `entrar` (rate-limit de login, ver
            // conexao/PROTOCOLO.md).
            const aviso = erroDaChamada.resposta?.ultimaTentativa
                ? ' Essa era sua última tentativa — novas tentativas ficarão bloqueadas por um tempo.'
                : '';
            setErro(erroDaChamada.message + aviso);
            setCarregando(false);
        }
    }

    const nomeCurtoDemais = nome.trim().length > 0 && nome.trim().length < NOME_MIN;
    const senhaCurtaDemais = senha.length > 0 && senha.length < SENHA_MIN;
    const botaoVoltar = (
        <button type="button" className="az-b az-btn-fantasma" onClick={voltar} disabled={carregando}>
            Voltar
        </button>
    );

    let corpo;
    if (etapa === ETAPA.NOME) {
        corpo = (
            <form className="az-etapa" onSubmit={continuar}>
                <div>
                    <div className="az-px az-rotulo">SEU NOME</div>
                    <input
                        className="az-input az-input-amarelo"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        maxLength={NOME_MAX}
                        autoFocus
                        autoComplete="username"
                    />
                    {nomeCurtoDemais && <div className="az-erro">Nome precisa ter pelo menos {NOME_MIN} caracteres.</div>}
                    {erro && <div className="az-erro">{erro}</div>}
                </div>
                <button
                    type="submit"
                    className="az-b az-px az-btn az-btn-amarelo az-btn-g"
                    disabled={carregando || nome.trim().length < NOME_MIN}
                >
                    CONTINUAR
                </button>
            </form>
        );
    } else if (etapa === ETAPA.CONFIRMAR_SENHA) {
        corpo = (
            <form className="az-etapa" onSubmit={(e) => autenticar(e, 'entrar')}>
                <div className="az-texto">
                    Esse nome já é registrado. Confirme que é você, <strong className="az-forte">{nome}</strong>.
                </div>
                <div>
                    <div className="az-px az-rotulo">SENHA</div>
                    <input
                        className="az-input az-input-amarelo az-input-senha"
                        type="password"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        maxLength={SENHA_MAX}
                        autoFocus
                        autoComplete="current-password"
                    />
                    {erro && <div className="az-erro">{erro}</div>}
                </div>
                <button type="submit" className="az-b az-px az-btn az-btn-amarelo az-btn-g" disabled={carregando || !senha}>
                    ENTRAR
                </button>
                {botaoVoltar}
            </form>
        );
    } else if (etapa === ETAPA.OFERECER_CADASTRO) {
        corpo = (
            <div className="az-etapa">
                <div className="az-texto az-texto-claro">"{nome}" ainda não tem conta. Quer registrar esse nome?</div>
                <button
                    type="button"
                    className="az-b az-px az-btn az-btn-amarelo az-btn-g"
                    onClick={() => irPara(ETAPA.NOVA_SENHA)}
                    disabled={carregando}
                >
                    SIM, REGISTRAR
                </button>
                <button
                    type="button"
                    className="az-b az-px az-btn az-btn-cinza"
                    onClick={() => autenticar(null, 'entrarComoConvidado', { nome })}
                    disabled={carregando}
                >
                    NÃO, SÓ JOGAR
                </button>
                <div className="az-nota az-centro">Como convidado, seu nome some quando a sessão acabar.</div>
                {erro && <div className="az-erro">{erro}</div>}
                {botaoVoltar}
            </div>
        );
    } else {
        corpo = (
            <form className="az-etapa" onSubmit={(e) => autenticar(e, 'cadastrar')}>
                <div className="az-texto az-texto-claro">Escolha uma senha pra registrar "{nome}".</div>
                <div>
                    <div className="az-px az-rotulo">NOVA SENHA</div>
                    <input
                        className="az-input az-input-verde az-input-senha"
                        type="password"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        maxLength={SENHA_MAX}
                        autoFocus
                        autoComplete="new-password"
                    />
                    <div className="az-nota">
                        {senhaCurtaDemais
                            ? `Faltam ${SENHA_MIN - senha.length} caractere(s).`
                            : `Mínimo de ${SENHA_MIN} caracteres.`}
                    </div>
                    {erro && <div className="az-erro">{erro}</div>}
                </div>
                <button
                    type="submit"
                    className="az-b az-px az-btn az-btn-verde az-btn-g"
                    disabled={carregando || senha.length < SENHA_MIN}
                >
                    CADASTRAR
                </button>
                {botaoVoltar}
            </form>
        );
    }

    return (
        <Casca conectado={conectado}>
            <div className="az-tela az-tela-login" data-screen-label="Login">
                <div className="az-login-cabeca">
                    <div className="az-px az-login-titulo">CONTRA<br />ZAP</div>
                    <div className="az-sub">fodinha online — não erre o palpite</div>
                </div>
                <div className="az-painel az-painel-login" key={etapa}>
                    {corpo}
                </div>
            </div>
        </Casca>
    );
}
