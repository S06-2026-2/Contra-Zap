# test_fim_de_jogo.py -- desempate de fim de jogo no motor Python (item 18),
# paridade com game/GameController.js::_resolverFimDeJogo. Local, fora do git
# (ver .gitignore).
#
# Roda com:  training\.venv\Scripts\python.exe -m unittest test_fim_de_jogo -v
import unittest

from motor.partida import Partida


class _J:
    def __init__(self, nome, hp):
        self.nome = nome
        self.hp = hp


def resolver(game_order):
    p = Partida.__new__(Partida)          # sem __init__: só quero _resolver_fim_de_jogo
    p.finalizada = False
    p.vencedor = None
    p._on_jogo_finalizado = None

    class _Jogo:
        pass

    p.jogo = _Jogo()
    p.jogo.game_order = game_order
    p.rodada = _Jogo()
    p.rodada.game_order = game_order
    acabou = p._resolver_fim_de_jogo()
    return acabou, (p.vencedor.nome if p.vencedor else None), p.finalizada


class Desempate(unittest.TestCase):
    def test_sobra_um_vivo(self):
        self.assertEqual(resolver([_J("A", 2), _J("B", -1), _J("C", 0)]), (True, "A", True))

    def test_dois_vivos_continua(self):
        self.assertEqual(resolver([_J("A", 2), _J("B", 1), _J("C", -1)]), (False, None, False))

    def test_todos_mortos_vence_o_mais_perto_de_zero(self):
        self.assertEqual(resolver([_J("A", -3), _J("B", -1), _J("C", -2)])[1], "B")

    def test_empate_no_hp_vence_quem_vem_antes(self):
        self.assertEqual(resolver([_J("A", -3), _J("B", -1), _J("C", -1)])[1], "B")
        self.assertEqual(resolver([_J("A", -3), _J("C", -1), _J("B", -1)])[1], "C")

    def test_todos_em_zero(self):
        self.assertEqual(resolver([_J("X", 0), _J("Y", 0)])[1], "X")


if __name__ == "__main__":
    unittest.main()
