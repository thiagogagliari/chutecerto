// js/dashboard.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const userInfoEl = document.getElementById("user-info");
const matchesListEl = document.getElementById("matches-list");
const logoutBtn = document.getElementById("logout-btn");

const prevRoundBtn = document.getElementById("prev-round-btn");
const nextRoundBtn = document.getElementById("next-round-btn");
const roundLabelEl = document.getElementById("current-round-label");

let currentUser = null;
let currentUserProfile = null;

// todos os jogos
let allMatches = [];
// lista de rodadas (números)
let rounds = [];
// rodada atualmente exibida
let currentRound = null;

// logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// navegação entre rodadas
if (prevRoundBtn && nextRoundBtn && roundLabelEl) {
  prevRoundBtn.addEventListener("click", () => {
    if (!rounds.length || currentRound === null) return;
    const idx = rounds.indexOf(currentRound);
    if (idx > 0) {
      currentRound = rounds[idx - 1];
      updateRoundLabel();
      renderMatchesForCurrentRound();
    }
  });

  nextRoundBtn.addEventListener("click", () => {
    if (!rounds.length || currentRound === null) return;
    const idx = rounds.indexOf(currentRound);
    if (idx >= 0 && idx < rounds.length - 1) {
      currentRound = rounds[idx + 1];
      updateRoundLabel();
      renderMatchesForCurrentRound();
    }
  });
}

// autenticação
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  // tenta carregar perfil
  const userRef = doc(db, "users", user.uid);
  let userDoc = await getDoc(userRef);

  // se não existir, cria um perfil básico automaticamente
  if (!userDoc.exists()) {
    const email = user.email || "";
    const defaultUsername = email
      ? email.split("@")[0]
      : `user_${user.uid.slice(0, 6)}`;

    await setDoc(userRef, {
      username: defaultUsername,
      displayName: defaultUsername,
      email: email,
      avatarUrl: "",
      role: "user",
      createdAt: new Date(),
      totalPoints: 0,
      bonusUsage: {},
    });

    // lê de novo o doc depois de criar
    userDoc = await getDoc(userRef);
  }

  currentUserProfile = userDoc.data();

  const avatarHtml = currentUserProfile.avatarUrl
    ? `<img src="${currentUserProfile.avatarUrl}" class="user-avatar-header" />`
    : `<div class="user-avatar-header user-avatar-placeholder"></div>`;

  const favoriteTeamName =
    currentUserProfile.favoriteTeamName || "Time do coração não definido";

  userInfoEl.innerHTML = `
    <div class="header-user">
      ${avatarHtml}
      <div>
        <p>Olá, <strong>${currentUserProfile.username}</strong>!</p>
        <p>Pontos: <strong>${currentUserProfile.totalPoints}</strong></p>
        <p style="font-size:0.85rem; opacity:0.8;">Time do coração: ${favoriteTeamName}</p>
      </div>
    </div>
  `;

  carregarJogos();
});

async function carregarJogos() {
  matchesListEl.innerHTML = "Carregando...";

  const snapshot = await getDocs(collection(db, "matches"));

  allMatches = [];
  const roundToMatches = new Map();

  snapshot.forEach((matchDoc) => {
    const data = matchDoc.data();
    const matchId = matchDoc.id;

    // garantir que round é número
    const roundNumber = Number(data.round) || 0;

    const match = {
      id: matchId,
      ...data,
      roundNumber,
    };

    // normalizar data de kickoff
    if (match.kickoff?.toDate) {
      match._kickoffDate = match.kickoff.toDate();
    } else {
      match._kickoffDate = new Date(match.kickoff);
    }

    allMatches.push(match);

    if (!roundToMatches.has(roundNumber)) {
      roundToMatches.set(roundNumber, []);
    }
    roundToMatches.get(roundNumber).push(match);
  });

  rounds = Array.from(roundToMatches.keys()).sort((a, b) => a - b);

  if (!rounds.length) {
    matchesListEl.innerHTML = "Nenhum jogo cadastrado.";
    updateRoundLabel();
    return;
  }

  // escolher rodada inicial:
  // 1) primeira rodada que ainda tenha jogo NÃO finalizado
  // 2) se todas estiverem finalizadas, mostra a última
  let rodadaEscolhida = rounds[rounds.length - 1]; // por padrão, última

  for (const r of rounds) {
    const jogos = roundToMatches.get(r);
    if (!jogos || !jogos.length) continue;

    const temNaoFinalizado = jogos.some((m) => m.status !== "finished");
    if (temNaoFinalizado) {
      rodadaEscolhida = r;
      break;
    }
  }

  currentRound = rodadaEscolhida;
  updateRoundLabel();
  renderMatchesForCurrentRound();
}

function updateRoundLabel() {
  if (!rounds.length || currentRound === null) {
    if (roundLabelEl) roundLabelEl.textContent = "Nenhuma rodada";
    if (prevRoundBtn) prevRoundBtn.disabled = true;
    if (nextRoundBtn) nextRoundBtn.disabled = true;
    return;
  }

  if (roundLabelEl) roundLabelEl.textContent = `Rodada ${currentRound}`;

  const idx = rounds.indexOf(currentRound);
  if (prevRoundBtn) prevRoundBtn.disabled = idx <= 0;
  if (nextRoundBtn)
    nextRoundBtn.disabled = idx === -1 || idx >= rounds.length - 1;
}

async function renderMatchesForCurrentRound() {
  matchesListEl.innerHTML = "";

  if (currentRound === null) {
    matchesListEl.innerHTML = "Nenhuma rodada selecionada.";
    return;
  }

  // jogos da rodada atual, do mais cedo pro mais tarde
  const matchesOfRound = allMatches
    .filter((m) => m.roundNumber === currentRound)
    .sort((a, b) => a._kickoffDate - b._kickoffDate);

  if (!matchesOfRound.length) {
    matchesListEl.innerHTML = "Nenhum jogo nesta rodada.";
    return;
  }

  for (const match of matchesOfRound) {
    const matchId = match.id;

    const kickoffDate = match._kickoffDate || new Date();

    const agora = new Date();
    const isFinished = match.status === "finished";
    const hasStarted = kickoffDate <= agora;
    const isUpcoming = !isFinished && !hasStarted;
    const isLive = !isFinished && hasStarted;

    // pode palpitar só se ainda NÃO começou e não está finalizado
    const podePalpitar = !isFinished && !hasStarted;

    // buscar palpite do usuário nesse jogo
    const predId = `${currentUser.uid}_${matchId}`;
    const predDoc = await getDoc(doc(db, "predictions", predId));
    let userPred = null;
    if (predDoc.exists()) {
      userPred = predDoc.data();
    }
    const userHasPred = !!userPred;

    const status = isFinished ? "finished" : isLive ? "live" : "scheduled";

    const resultHtml =
      status === "finished" &&
      match.homeScore != null &&
      match.awayScore != null
        ? `<div class="match-score">${match.homeScore} x ${match.awayScore}</div>`
        : "";

    const statusLabel =
      status === "scheduled"
        ? "Agendado"
        : status === "live"
        ? "Ao vivo"
        : "Finalizado";

    const homeLogoHtml = match.homeLogoUrl
      ? `<img src="${match.homeLogoUrl}" class="match-team-logo" />`
      : `<div class="match-team-logo placeholder-logo"></div>`;

    const awayLogoHtml = match.awayLogoUrl
      ? `<img src="${match.awayLogoUrl}" class="match-team-logo" />`
      : `<div class="match-team-logo placeholder-logo"></div>`;

    // classe visual do card
    let stateClass = "state-default";
    if (isFinished) {
      stateClass = "state-finished";
    } else if (isUpcoming) {
      stateClass = "state-upcoming";
    }

    // status de palpite
    const palpiteStatusHtml = userHasPred
      ? `<span class="palpite-status palpite-ok">✔ Palpite enviado</span>`
      : `<span class="palpite-status palpite-pendente">Você não palpitou</span>`;

    // mensagem de resultado/placar
    let resultadoMessage = "";
    if (
      isFinished &&
      userHasPred &&
      match.homeScore != null &&
      match.awayScore != null
    ) {
      const diffPred = userPred.homeGoalsPred - userPred.awayGoalsPred;
      const diffReal = match.homeScore - match.awayScore;
      const resPred = diffPred > 0 ? "H" : diffPred < 0 ? "A" : "D";
      const resReal = diffReal > 0 ? "H" : diffReal < 0 ? "A" : "D";

      if (
        userPred.homeGoalsPred === match.homeScore &&
        userPred.awayGoalsPred === match.awayScore
      ) {
        resultadoMessage = `<div class="resultado-msg exato">🎯 Ganhei 10 Pontos!</div>`;
      } else if (resPred === resReal) {
        resultadoMessage = `<div class="resultado-msg resultado">✔ Acertei o resultado!</div>`;
      } else if (userPred.points && userPred.points > 0) {
        resultadoMessage = `<div class="resultado-msg pontos">Ganhei ${userPred.points} pontos.</div>`;
      }
    }

    const matchEl = document.createElement("div");
    matchEl.className = `match-card ${stateClass}`;
    matchEl.id = `card-${matchId}`;
    matchEl.innerHTML = `
      <div class="match-top">
        <div class="match-team">
          ${homeLogoHtml}
          <div class="match-team-name">${match.homeTeam}</div>
        </div>

        <div class="match-vs">
          <div class="match-time">${kickoffDate.toLocaleString()}</div>
          <span class="match-status ${status}">${statusLabel}</span>
          ${resultHtml}
          ${palpiteStatusHtml}
          ${resultadoMessage}
        </div>

        <div class="match-team">
          ${awayLogoHtml}
          <div class="match-team-name">${match.awayTeam}</div>
        </div>
      </div>

      <div class="match-bottom">
        <div class="match-column">
          <h4>Seu palpite</h4>
          <label>Gols ${match.homeTeam}:</label>
          <input type="number" min="0" id="home-${matchId}" value="${
      userPred ? userPred.homeGoalsPred : ""
    }" ${!podePalpitar ? "disabled" : ""} />

          <label>Gols ${match.awayTeam}:</label>
          <input type="number" min="0" id="away-${matchId}" value="${
      userPred ? userPred.awayGoalsPred : ""
    }" ${!podePalpitar ? "disabled" : ""} />

          <label>
            <input type="checkbox" id="bonus-${matchId}" ${
      userPred && userPred.usedBonus ? "checked" : ""
    } ${!podePalpitar ? "disabled" : ""} />
            Usar bônus 2x nesta partida
          </label>

          <button id="save-${matchId}" ${!podePalpitar ? "disabled" : ""}>
            Salvar palpite
          </button>
        </div>

        <div class="match-column">
          <h4>Palpites da galera</h4>
          <div class="palpite-line" id="others-${matchId}">
            Carregando palpites de outros usuários...
          </div>
        </div>
      </div>
    `;

    matchesListEl.appendChild(matchEl);

    // evento salvar palpite
    document
      .getElementById(`save-${matchId}`)
      .addEventListener("click", () =>
        salvarPalpite(matchId, match.roundNumber)
      );

    // ouvir palpites dos outros (apenas depois que o jogo começar)
    ouvirPalpitesDosOutros(matchId, hasStarted);
  }

  // sempre volta pro topo ao renderizar uma rodada
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

async function salvarPalpite(matchId, matchRound) {
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);
  const bonusInput = document.getElementById(`bonus-${matchId}`);

  const homeGoals = Number(homeInput.value);
  const awayGoals = Number(awayInput.value);
  const usedBonus = bonusInput.checked;

  if (isNaN(homeGoals) || isNaN(awayGoals)) {
    alert("Preencha o placar corretamente.");
    return;
  }

  // Checar no Firestore se o jogo ainda está aberto para palpite
  const matchRef = doc(db, "matches", matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    alert("Jogo não encontrado.");
    return;
  }

  const match = matchSnap.data();
  const kickoffDate = match.kickoff?.toDate
    ? match.kickoff.toDate()
    : new Date(match.kickoff);
  const agora = new Date();

  // se já finalizou ou já passou da hora, não deixa salvar
  if (match.status === "finished" || kickoffDate <= agora) {
    alert("Palpites encerrados para este jogo.");
    return;
  }

  // regra simples: só permitir 1 bônus por rodada
  if (usedBonus) {
    const bonusUsage = currentUserProfile.bonusUsage || {};
    if (
      bonusUsage &&
      bonusUsage[matchRound] &&
      bonusUsage[matchRound] !== matchId
    ) {
      alert("Você já usou o bônus 2x em outra partida nesta rodada.");
      bonusInput.checked = false;
      return;
    }
  }

  const predId = `${currentUser.uid}_${matchId}`;

  await setDoc(
    doc(db, "predictions", predId),
    {
      userId: currentUser.uid,
      matchId,
      round: matchRound,
      homeGoalsPred: homeGoals,
      awayGoalsPred: awayGoals,
      usedBonus,
      points: 0,
      createdAt: new Date(),
    },
    { merge: true }
  );

  // atualizar bonusUsage do usuário
  if (usedBonus) {
    const bonusUsage = currentUserProfile.bonusUsage || {};
    bonusUsage[matchRound] = matchId;
    await setDoc(
      doc(db, "users", currentUser.uid),
      { bonusUsage },
      { merge: true }
    );
    currentUserProfile.bonusUsage = bonusUsage;
  }

  alert("Palpite salvo!");

  // Atualizar status de palpite no card
  const cardEl = document.getElementById(`card-${matchId}`);
  if (cardEl) {
    const statusEl = cardEl.querySelector(".palpite-status");
    if (statusEl) {
      statusEl.textContent = "✔ Palpite enviado";
      statusEl.classList.remove("palpite-pendente");
      statusEl.classList.add("palpite-ok");
    }
  }
}

// Estatísticas + lista de palpites da galera
// AGORA: só mostra depois que o jogo começar (hasStarted === true)
function ouvirPalpitesDosOutros(matchId, hasStarted) {
  const el = document.getElementById(`others-${matchId}`);
  if (!el) return;

  // se o jogo ainda não começou, não mostra palpites
  if (!hasStarted) {
    el.textContent =
      "Os palpites da galera serão exibidos após o início do jogo.";
    return;
  }

  const q = query(
    collection(db, "predictions"),
    where("matchId", "==", matchId)
  );

  onSnapshot(q, async (snapshot) => {
    if (snapshot.empty) {
      el.textContent = "Você não palpitou";
      return;
    }

    const arr = [];
    let total = 0;
    let casaWin = 0;
    let empate = 0;
    let foraWin = 0;

    for (const docSnap of snapshot.docs) {
      const pred = docSnap.data();
      total++;

      const userDoc = await getDoc(doc(db, "users", pred.userId));
      const username = userDoc.exists() ? userDoc.data().username : "anônimo";

      arr.push(
        `${username}: ${pred.homeGoalsPred} x ${pred.awayGoalsPred}${
          pred.usedBonus ? " (2x)" : ""
        }`
      );

      const diff = pred.homeGoalsPred - pred.awayGoalsPred;
      if (diff > 0) casaWin++;
      else if (diff < 0) foraWin++;
      else empate++;
    }

    const percCasa = Math.round((casaWin / total) * 100);
    const percEmpate = Math.round((empate / total) * 100);
    const percFora = Math.round((foraWin / total) * 100);

    el.innerHTML = `
      <div class="palpite-stats">
        <div>${total} palpites</div>
        <div>
          Casa: ${percCasa}% |
          Empate: ${percEmpate}% |
          Visitante: ${percFora}%
        </div>
      </div>
      <div class="palpite-list">
        ${arr.join(" | ")}
      </div>
    `;
  });
}
