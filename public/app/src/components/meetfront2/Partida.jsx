import PartidaMeetfront1 from '../meetfront1/Partida.jsx';
import MesaExperimento from './MesaExperimento.jsx';
import './meetfront2.css';

// Partida do jogo: onde entram as mudanças do segundo encontro com o
// grupo. A Partida (socket/estado) é a do meetfront1; a mesa é a cópia daqui, que
// importa do meetfront1 tudo o que não mudou. O CSS só deste front vem do
// meetfront2.css, escopado pelo .mf2 deste wrapper (display: contents, não
// entra no layout).
export default function Partida(props) {
    return (
        <div className="mf2">
            <PartidaMeetfront1 {...props} Mesa={MesaExperimento} />
        </div>
    );
}
