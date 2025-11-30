// js/points.js
export function calcularPontosPalpite(palpite, resultado, usouBonus = false) {
  const homePred = palpite.homePred;
  const awayPred = palpite.awayPred;
  const homeScore = resultado.homeScore;
  const awayScore = resultado.awayScore;

  let pontos = 0;

  const diffPred = homePred - awayPred;
  const diffReal = homeScore - awayScore;

  const resultadoPred = diffPred > 0 ? "H" : diffPred < 0 ? "A" : "D";
  const resultadoReal = diffReal > 0 ? "H" : diffReal < 0 ? "A" : "D";

  // Resultado correto
  if (resultadoPred === resultadoReal) {
    pontos += 3;
  }

  // Gols time da casa
  if (homePred === homeScore) {
    pontos += 2;
  }

  // Gols time visitante
  if (awayPred === awayScore) {
    pontos += 2;
  }

  // Diferença de gols
  if (diffPred === diffReal) {
    pontos += 3;
  }

  if (usouBonus) {
    pontos *= 2;
  }

  return pontos;
}
