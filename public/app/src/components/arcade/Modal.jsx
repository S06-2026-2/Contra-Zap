import { createPortal } from 'react-dom';

// Modal da frente arcade. Vai por portal pro <body> — fora da div da casca,
// que pode estar com `filter`/`transform` do painel de filtro de tela: com
// qualquer um dos dois ligado, `position: fixed` dentro dela passaria a ser
// relativo à página inteira (e o modal sumiria lá embaixo), não à viewport.
export default function Modal({ borda = '#ff4b3e', onFechar, children }) {
    return createPortal(
        <div className="az-raiz az-modal-fundo" onClick={onFechar}>
            <div className="az-modal" style={{ borderColor: borda }} onClick={(e) => e.stopPropagation()}>
                {children}
            </div>
        </div>,
        document.body
    );
}
