# paridade_motor.py -- lado Python de tests/paridade/motores.test.js. Lê os
# cenários (JSON) do stdin, joga cada um no motor de verdade (motor/) e devolve
# no stdout o registro do que aconteceu. Não confere nada: quem compara com o
# motor JS é o teste. Só stdlib, sem torch.
import json
import sys

from motor.partida import Partida

LIMITE_DECISOES = 50_000


def _ids(cartas):
    return [c.id for c in cartas]


def _recusou(acao, jogador, valor):
    # O generator morre quando uma ação inválida levanta, então a tentativa
    # é feita direto na validação, antes do `.send`.
    try:
        acao(jogador, valor)
    except ValueError:
        return True
    return False


def _escolher_aposta(partida, jogador, sorteio):
    total = partida.rodada.round
    inicio = int(sorteio * (total + 1))
    candidatos = [-1, total + 1, 0.5] + [(inicio + k) % (total + 1) for k in range(total + 1)]
    recusadas = []
    anterior = jogador.aposta
    for valor in candidatos:
        if not _recusou(partida._aplicar_aposta, jogador, valor):
            jogador.aposta = anterior  # quem aplica de verdade é o generator
            return valor, recusadas
        recusadas.append(valor)
    return None, recusadas


def _escolher_carta(partida, jogador, sorteio):
    total = len(jogador.mao)
    recusadas = []
    for indice in (-1, total, 0.5):
        if not _recusou(partida._aplicar_carta, jogador, indice):
            raise RuntimeError(f"o motor aceitou a carta de índice {indice}")
        recusadas.append(indice)
    # Não é testada antes: validar uma carta válida já a tiraria da mão.
    return int(sorteio * total), recusadas


def jogar(cenario):
    registro = []
    recusadas = []

    def ao_iniciar_rodada(numero, cartas):
        rodada = partida.rodada
        virar_manilha = rodada.virar_manilha
        registrar_jogada = rodada.registrar_jogada
        finalizar_vaza = rodada.finalizar_vaza

        def virar():
            virar_manilha()
            registro.append({
                "tipo": "rodada", "numero": numero, "cartas": cartas,
                "ordem": [j.nome for j in rodada.game_order],
                "maos": [_ids(j.mao) for j in rodada.game_order],
                "vira": rodada.vira.id, "viraValor": rodada.vira_valor,
            })

        def jogada(jogador, carta):
            registrar_jogada(jogador, carta)
            mesa = rodada.mesa_ativa
            melhor = mesa.melhor_jogada
            registro.append({
                "tipo": "carta", "jogador": jogador.nome, "carta": carta.id,
                "recusadas": recusadas,
                "ganhando": melhor[1].nome if melhor else None,
                "cartaGanhando": melhor[0].id if melhor else None,
                "melada": mesa.esta_empatado,
            })

        def vaza():
            vencedor = finalizar_vaza()
            registro.append({"tipo": "vaza", "vencedor": vencedor.nome if vencedor else None})
            return vencedor

        rodada.virar_manilha = virar
        rodada.registrar_jogada = jogada
        rodada.finalizar_vaza = vaza

    def ao_fechar_rodada(resultado):
        registro.append({"tipo": "placar", "resultado": [
            {"nome": r["jogador"].nome, "aposta": r["aposta"], "steak": r["steak"],
             "diferenca": r["diferenca"], "hp": r["hp"]}
            for r in resultado
        ]})

    # Sem hp no cenário, vale a vida inicial do próprio motor.
    vida = {} if cenario["hp"] is None else {"hp_inicial": cenario["hp"]}
    partida = Partida(
        number_players=cenario["jogadores"], round_start=cenario["roundStart"],
        random_shuffle=cenario["randomShuffle"], max_deck=cenario["maxDeck"],
        **vida, seed=cenario["seed"],
        on_nova_rodada=ao_iniciar_rodada, on_rodada_finalizada=ao_fechar_rodada,
        on_jogo_finalizado=lambda v: registro.append({"tipo": "fim", "vencedor": v.nome}),
    )
    decisoes = cenario["decisoes"]
    passos = partida.jogar()
    try:
        fase, jogador = next(passos)
        for n in range(LIMITE_DECISOES):
            sorteio = decisoes[n % len(decisoes)]
            if fase == "aposta":
                escolhido, recusadas = _escolher_aposta(partida, jogador, sorteio)
                registro.append({"tipo": "aposta", "jogador": jogador.nome,
                                 "aposta": escolhido, "recusadas": recusadas})
            else:
                escolhido, recusadas = _escolher_carta(partida, jogador, sorteio)
            fase, jogador = passos.send(escolhido)
        registro.append({"tipo": "erro", "erro": "a partida não terminou"})
    except StopIteration:
        pass
    except Exception as erro:  # vira divergência no teste, com a mensagem
        registro.append({"tipo": "erro", "erro": f"{type(erro).__name__}: {erro}"})
    return registro


if __name__ == "__main__":
    json.dump([jogar(c) for c in json.load(sys.stdin)], sys.stdout)
