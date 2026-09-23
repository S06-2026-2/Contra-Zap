import Carta from './Carta.jsx';

// Miolo do punhal (as duas faces da carta + lâmina/guarda/cabo) — extraído de
// CartaGiratoria.jsx pra ser reaproveitado também por quem PRECISA da lâmina
// sempre visível (FacaCaindo, em MesaDanificada.jsx) e por quem quer revelar
// as peças extras com uma transição suave em vez de aparecer/sumir seco
// (CartaGiratoria continua chamando isto com `extraVisivel={planoEstendido}`,
// MesaDanificada com `extraVisivel` variando ao longo da coreografia de
// jogada simulada). As peças ficam sempre MONTADAS no DOM — é
// `.carta-giro3d-extra-oculta` (ver index.css) que esconde via
// opacity/transform, porque só assim dá pra transicionar; condicionar o
// `return` inteiro (como era antes) troca de "nada" pra "peça inteira" sem
// nenhum quadro intermediário possível.
// `pausarBrilhoFace`: só a CartaGiratoria usa (ver --brilho-carta-play em
// index.css) — lá o streak de luz da CARTA em si fica pausado porque quem
// brilha é só o .carta-giro3d-brilho-unico por cima de tudo; FacaCaindo e a
// jogada simulada de MesaDanificada não têm esse brilho único, então deixam
// no padrão (fallback 'running' do var()).
export default function PunhalAssembly({ extraVisivel = true, pausarBrilhoFace = false }) {
    const classeExtra = extraVisivel ? '' : ' carta-giro3d-extra-oculta';
    return (
        <>
            <div className="carta-giro3d-face" style={pausarBrilhoFace ? { '--brilho-carta-play': 'paused' } : undefined}>
                <Carta rank="A" naipe="Espadas" efeitoManilha />
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
