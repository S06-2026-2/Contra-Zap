import Ficha from '../meetfront1/Ficha.jsx';
import './inicio.css';

// Saldo de fichas pro topo das telas (ficha + número).
export default function Saldo({ fichas }) {
    return (
        <span className="az-px mf2-saldo" title="Suas fichas">
            <span className="mf2-saldo-ficha"><Ficha /></span>
            {fichas}
        </span>
    );
}
