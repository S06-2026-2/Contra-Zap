import { useState } from 'react';
import { createPortal } from 'react-dom';

// Folha que sobe de baixo, com abas — no celular é onde moram o chat e o log
// da mesa (ver Partida.jsx), que no desktop ficam soltos embaixo da mão.
// Vai por portal pro <body> pelo mesmo motivo do Modal.jsx: a casca pode
// estar com `filter`/`transform` do filtro de tela, e aí `position: fixed`
// lá dentro deixaria de ser relativo à viewport.
//
// `abas`: [{ id, rotulo, conteudo }].
export default function Gaveta({ abas, onFechar }) {
    const [abaAtual, setAbaAtual] = useState(abas[0]?.id);
    const aba = abas.find((a) => a.id === abaAtual) ?? abas[0];
    return createPortal(
        <div className="az-raiz az-gaveta-fundo" onClick={onFechar}>
            <div className="az-gaveta" role="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="az-gaveta-cabeca">
                    <div className="az-gaveta-abas" role="tablist">
                        {abas.map((a) => (
                            <button
                                key={a.id}
                                type="button"
                                role="tab"
                                aria-selected={a.id === aba.id}
                                className={`az-b az-px az-gaveta-aba${a.id === aba.id ? ' az-ativo' : ''}`}
                                onClick={() => setAbaAtual(a.id)}
                            >
                                {a.rotulo}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="az-b az-px az-btn-mini az-gaveta-fechar" onClick={onFechar} aria-label="Fechar">
                        ✕
                    </button>
                </div>
                <div className="az-gaveta-corpo">{aba?.conteudo}</div>
            </div>
        </div>,
        document.body
    );
}
