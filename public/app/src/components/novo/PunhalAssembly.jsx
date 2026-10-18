import Carta from './Carta.jsx';

// Miolo do punhal (as duas faces da carta + lâmina/guarda/cabo), usado por
// quem precisa da lâmina sempre visível (FacaCaindo, em MesaDanificada.jsx)
// e pela jogada simulada da MesaDanificada, que revela as peças extras com
// uma transição suave (`extraVisivel` variando ao longo da coreografia). As
// peças ficam sempre MONTADAS no DOM — é `.carta-giro3d-extra-oculta` (ver
// index.css) que esconde via opacity/transform, porque só assim dá pra
// transicionar; montar e desmontar trocaria de "nada" pra "peça inteira"
// sem nenhum quadro intermediário.
export default function PunhalAssembly({ extraVisivel = true, rank = 'A' }) {
    const classeExtra = extraVisivel ? '' : ' carta-giro3d-extra-oculta';
    return (
        <>
            <div className="carta-giro3d-face">
                <Carta rank={rank} naipe="Espadas" efeitoManilha />
            </div>
            <div className="carta-giro3d-face carta-giro3d-face-verso">
                <Carta virada />
            </div>
            <div className={`carta-giro3d-lamina${classeExtra}`}>
                <span className="carta-giro3d-rebite carta-giro3d-rebite-lamina-esq" />
                <span className="carta-giro3d-rebite carta-giro3d-rebite-lamina-dir" />
            </div>
            <div className={`carta-giro3d-guarda${classeExtra}`}>
                <span className="carta-giro3d-rebite carta-giro3d-rebite-guarda-esq" />
                <span className="carta-giro3d-rebite carta-giro3d-rebite-guarda-dir" />
            </div>
            <div className={`carta-giro3d-cabo${classeExtra}`}>
                <span className="carta-giro3d-rebite carta-giro3d-rebite-cabo-cima" />
                <span className="carta-giro3d-rebite carta-giro3d-rebite-cabo-baixo" />
            </div>
        </>
    );
}
