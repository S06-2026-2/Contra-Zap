import PartidaArcade from '../arcade/Partida.jsx';
import Mesa from './Mesa.jsx';

// Frente "mescla": a Partida da arcade inteira (socket, golpes de manilha,
// sons, chat, sala de espera e fim de partida) com a mesa trocada pela de
// Mesa.jsx. Abaixo de 1100px o chat e o log saem da coluna lateral e vão
// pra gaveta do 💬.
const LATERAL_PX = 1100;

export default function Partida(props) {
    return <PartidaArcade {...props} Mesa={Mesa} estreitoPx={LATERAL_PX} />;
}
