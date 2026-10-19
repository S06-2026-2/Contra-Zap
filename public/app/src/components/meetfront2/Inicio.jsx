import { useEffect, useState } from 'react';
import { chamar } from '../../socket.js';
import Casca from '../arcade/Casca.jsx';
import PopupLogin from './PopupLogin.jsx';
import Saldo from './Saldo.jsx';
import './inicio.css';

// Tela inicial do meetfront2: JOGAR e CUSTOMIZAÇÃO. Sem sessão, os dois
// abrem o PopupLogin e só seguem pro destino depois de autenticar; com
// sessão, seguem direto e o topo mostra o nome, o saldo de fichas e o SAIR.
export default function Inicio({ meuNome, onAutenticado, onIr, onSair, conectado }) {
    // Destino do clique que abriu o pop-up ('jogar' | 'customizar'), ou
    // null com o pop-up fechado.
    const [pedindoLogin, setPedindoLogin] = useState(null);
    const [fichas, setFichas] = useState(null);

    useEffect(() => {
        if (!meuNome) return undefined;
        let cancelado = false;
        chamar('minhaCarteira')
            .then((carteira) => { if (!cancelado) setFichas(carteira.fichas); })
            .catch(() => {}); // melhor esforço — sem saldo, só não mostra
        return () => { cancelado = true; };
    }, [meuNome]);

    function ir(destino) {
        if (meuNome) onIr(destino);
        else setPedindoLogin(destino);
    }

    const cabecaDireita = meuNome && (
        <>
            {fichas != null && <Saldo fichas={fichas} />}
            <span className="az-px az-topo-nome" title="Você">{meuNome}</span>
            <button
                type="button"
                data-som="aba"
                className="az-b az-px az-topo-btn"
                onClick={onSair}
                title="Sair da conta"
            >
                SAIR
            </button>
        </>
    );

    return (
        <Casca conectado={conectado} direita={cabecaDireita}>
            <div className="az-tela az-tela-login" data-screen-label="Início">
                <div className="az-login-cabeca">
                    <div className="az-px az-login-titulo">CONTRA<br />ZAP</div>
                    <div className="az-sub">fodinha online — não erre o palpite</div>
                </div>
                <div className="mf2-inicio-botoes">
                    <button
                        type="button"
                        className="az-b az-px az-btn az-btn-amarelo mf2-inicio-btn"
                        onClick={() => ir('jogar')}
                    >
                        JOGAR
                    </button>
                    <button
                        type="button"
                        className="az-b az-px az-btn az-btn-azul mf2-inicio-btn"
                        onClick={() => ir('customizar')}
                    >
                        CUSTOMIZAÇÃO
                    </button>
                </div>
            </div>
            {pedindoLogin && (
                <PopupLogin
                    destino={pedindoLogin}
                    onAutenticado={(sessao) => {
                        onAutenticado(sessao);
                        onIr(pedindoLogin);
                    }}
                    onFechar={() => setPedindoLogin(null)}
                />
            )}
        </Casca>
    );
}
