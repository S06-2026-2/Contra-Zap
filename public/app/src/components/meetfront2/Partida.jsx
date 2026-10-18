import PartidaMeetfront1 from '../meetfront1/Partida.jsx';

// Frente "meetfront2": onde entram as mudanças do segundo encontro com o
// grupo, usando a frente "mescla" (components/mescla/) como referência.
// Por enquanto é a Partida do meetfront1 sem alteração nenhuma.
export default function Partida(props) {
    return <PartidaMeetfront1 {...props} />;
}
