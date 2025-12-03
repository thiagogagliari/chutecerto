// js/dashboard.js
// Substitua totalmente o arquivo antigo por este.
// Requer: ./firebase-config.js que exporte `auth` e `db`.

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
  orderBy,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ------------------------------
   Elementos DOM
-------------------------------*/
const userInfoEl = document.getElementById("user-info");
const matchesListEl = document.getElementById("matches-list");
const logoutBtn = document.getElementById("logout-btn");

const prevRoundBtn = document.getElementById("prev-round-btn");
const nextRoundBtn = document.getElementById("next-round-btn");
const roundLabelEl = document.getElementById("current-round-label");
const roundPrizeLabelEl = document.getElementById("round-prize-label"); // opcional

// modals (promo & all-saved)
const promoBtn = document.getElementById("promo-btn");
const promoModal = document.getElementById("promo-modal");
const promoClose = document.getElementById("promo-close");
const promoMore = document.getElementById("promo-more");

const rulesBtn = document.getElementById("rules-btn");
const rulesModal = document.getElementById("rules-modal");
const rulesClose = document.getElementById("rules-close");

const allSavedModal = document.getElementById("all-saved-modal");
const allSavedCloseBtn = document.getElementById("all-saved-close");

/* ------------------------------
   Estado local
-------------------------------*/
let currentUser = null;
let currentUserProfile = null;

let allMatches = []; // todos os jogos
let rounds = []; // números das rodadas
let currentRound = null; // rodada exibida

/* ------------------------------
   Logout
-------------------------------*/
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

/* ------------------------------
   Prev / Next rodada
-------------------------------*/
if (prevRoundBtn) {
  prevRoundBtn.addEventListener("click", () => {
    if (!rounds.length || currentRound === null) return;
    const idx = rounds.indexOf(currentRound);
    if (idx > 0) {
      currentRound = rounds[idx - 1];
      updateRoundLabel();
      renderMatchesForCurrentRound();
      showRoundPrizeLabel(currentRound);
    }
  });
}
if (nextRoundBtn) {
  nextRoundBtn.addEventListener("click", () => {
    if (!rounds.length || currentRound === null) return;
    const idx = rounds.indexOf(currentRound);
    if (idx >= 0 && idx < rounds.length - 1) {
      currentRound = rounds[idx + 1];
      updateRoundLabel();
      renderMatchesForCurrentRound();
      showRoundPrizeLabel(currentRound);
    }
  });
}

/* ------------------------------
   Autenticação
-------------------------------*/
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  // carregar ou criar perfil
  const userRef = doc(db, "users", user.uid);
  let userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // cria perfil básico
    const email = user.email || "";
    const defaultUsername = email
      ? email.split("@")[0]
      : `user_${user.uid.slice(0, 6)}`;
    await setDoc(userRef, {
      username: defaultUsername,
      displayName: defaultUsername,
      email,
      avatarUrl: "",
      role: "user",
      createdAt: new Date(),
      totalPoints: 0,
      bonusUsage: {},
    });
    userSnap = await getDoc(userRef);
  }

  currentUserProfile = userSnap.data();

  // exibir mini perfil no header
  const avatarHtml = currentUserProfile.avatarUrl
    ? `<img src="${currentUserProfile.avatarUrl}" class="user-avatar-header" />`
    : `<div class="user-avatar-header user-avatar-placeholder"></div>`;

  const favoriteTeamName =
    currentUserProfile.favoriteTeamName || "Time do coração não definido";

  if (userInfoEl) {
    userInfoEl.innerHTML = `
      <div class="header-user">
        ${avatarHtml}
        <div>
          <p>Olá, <strong>${currentUserProfile.username}</strong>!</p>
          <p>Pontos: <strong>${currentUserProfile.totalPoints || 0}</strong></p>
          <p style="font-size:0.85rem; opacity:0.8;">${favoriteTeamName}</p>
        </div>
      </div>
    `;
  }

  // carregar jogos assim que usuário autenticado
  await carregarJogos();
});

/* ------------------------------
   Carregar jogos do Firestore
-------------------------------*/
async function carregarJogos() {
  if (!matchesListEl) return;
  matchesListEl.innerHTML = "Carregando...";

    const snapshot = await getDocs(
      query(
        collection(db, "matches"),
        orderBy("round", "asc"),
        orderBy("kickoff", "asc")
      )
    );

  allMatches = [];
  const roundToMatches = new Map();

  snapshot.forEach((matchDoc) => {
    const data = matchDoc.data();
    const matchId = matchDoc.id;
    const roundNumber = Number(data.round) || 0;

    let kickoffDate = null;
    if (data.kickoff?.toDate) kickoffDate = data.kickoff.toDate();
    else kickoffDate = data.kickoff ? new Date(data.kickoff) : new Date();

    const m = { id: matchId, ...data, roundNumber, _kickoffDate: kickoffDate };
    allMatches.push(m);

    if (!roundToMatches.has(roundNumber)) roundToMatches.set(roundNumber, []);
    roundToMatches.get(roundNumber).push(m);
  });

  rounds = Array.from(roundToMatches.keys()).sort((a, b) => a - b);

  if (!rounds.length) {
    matchesListEl.innerHTML = "Nenhum jogo cadastrado.";
    updateRoundLabel();
    return;
  }

  // escolher rodada inicial: primeira com jogo não finalizado; se todas finalizadas, última rodada
  let rodadaEscolhida = rounds[rounds.length - 1];
  const agora = new Date();
  for (const r of rounds) {
    const jogos = roundToMatches.get(r) || [];
    const temNaoFinalizado = jogos.some((m) => m.status !== "finished");
    if (temNaoFinalizado) {
      rodadaEscolhida = r;
      break;
    }
  }

  currentRound = rodadaEscolhida;
  updateRoundLabel();
  renderMatchesForCurrentRound();
  showRoundPrizeLabel(currentRound);
}

/* ------------------------------
   Atualizar label de rodada e botões
-------------------------------*/
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

/* ------------------------------
   Renderizar jogos da rodada atual (ordenados por horário)
-------------------------------*/
async function renderMatchesForCurrentRound() {
  if (!matchesListEl) return;
  matchesListEl.innerHTML = "";

  if (currentRound === null) {
    matchesListEl.innerHTML = "Nenhuma rodada selecionada.";
    return;
  }

  // filtrar e ordenar por horário
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
    const isLive = !isFinished && hasStarted;
    const isUpcoming = !isFinished && !hasStarted;
    const podePalpitar = !isFinished && !hasStarted;

    // buscar prediction do usuário para esse jogo
    const predId = `${currentUser.uid}_${matchId}`;
    const predSnap = await getDoc(doc(db, "predictions", predId));
    let userPred = null;
    if (predSnap.exists()) userPred = predSnap.data();
    const userHasPred = !!userPred;

    // prepare logos
    const homeLogoHtml = match.homeLogoUrl
      ? `<img src="${match.homeLogoUrl}" class="match-team-logo" />`
      : `<div class="match-team-logo placeholder-logo"></div>`;
    const awayLogoHtml = match.awayLogoUrl
      ? `<img src="${match.awayLogoUrl}" class="match-team-logo" />`
      : `<div class="match-team-logo placeholder-logo"></div>`;

    // status label
    const status = isFinished ? "finished" : isLive ? "live" : "scheduled";
    const statusLabel =
      status === "scheduled"
        ? "Agendado"
        : status === "live"
        ? "Ao vivo"
        : "Finalizado";

    // resultado final (se houver)
    const resultHtml =
      status === "finished" &&
      match.homeScore != null &&
      match.awayScore != null
        ? `<div class="match-score">${match.homeScore} x ${match.awayScore}</div>`
        : "";

    // palpite da galera (placeholder; será preenchido por ouvirPalpitesDosOutros)
    const palpiteStatusHtml = userHasPred
      ? `<span class="palpite-status palpite-ok">✔ Palpite enviado</span>`
      : `<span class="palpite-status palpite-pendente">Nenhum palpite ainda</span>`;

    // badges de resultado/pontos (se finalizado)
    let resultadoBadgesHtml = "";
    let pontosDetalheHtml = "";

    if (
      isFinished &&
      userHasPred &&
      match.homeScore != null &&
      match.awayScore != null
    ) {
      // badges: placar exato / resultado certo
      const diffPred = userPred.homeGoalsPred - userPred.awayGoalsPred;
      const diffReal = match.homeScore - match.awayScore;
      const resPred = diffPred > 0 ? "H" : diffPred < 0 ? "A" : "D";
      const resReal = diffReal > 0 ? "H" : diffReal < 0 ? "A" : "D";

      if (
        userPred.homeGoalsPred === match.homeScore &&
        userPred.awayGoalsPred === match.awayScore
      ) {
        resultadoBadgesHtml = `<div class="resultado-msg exato">🎯 Acertei o placar exato!</div>`;
      } else if (resPred === resReal) {
        resultadoBadgesHtml = `<div class="resultado-msg resultado">✔ Acertei o resultado!</div>`;
      }

      // detalhe de pontuação (para transparência)
      const detalhe = calcularDetalhePontuacao(
        match.homeScore,
        match.awayScore,
        userPred.homeGoalsPred,
        userPred.awayGoalsPred,
        userPred.usedBonus
      );
      if (detalhe.total > 0) {
        const partesStr = detalhe.partes.join(" + ");
        const bonusStr = detalhe.usedBonus ? " (bônus 2x aplicado)" : "";
        pontosDetalheHtml = `<div class="resultado-msg pontos">Você ganhou <strong>${detalhe.total}</strong> pontos: ${partesStr}${bonusStr}.</div>`;
      } else {
        pontosDetalheHtml = `<div class="resultado-msg pontos">Você não marcou pontos neste jogo.</div>`;
      }
    }

    // construir card
    const matchEl = document.createElement("div");
    matchEl.className = `match-card ${
      isFinished
        ? "state-finished"
        : isUpcoming
        ? "state-upcoming"
        : "state-live"
    }`;
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
          ${resultadoBadgesHtml}
          ${pontosDetalheHtml}
        </div>

        <div class="match-team">
          ${awayLogoHtml}
          <div class="match-team-name">${match.awayTeam}</div>
        </div>
      </div>

      <div class="match-bottom">
        <div class="match-column">
          <h4>Seu palpite</h4>

          <div class="score-row">
            <span class="score-team">${match.homeTeam}</span>
            <input type="number" min="0" id="home-${matchId}" value="${
      userPred ? userPred.homeGoalsPred : ""
    }" ${!podePalpitar ? "disabled" : ""} />
            <span class="score-x">x</span>
            <input type="number" min="0" id="away-${matchId}" value="${
      userPred ? userPred.awayGoalsPred : ""
    }" ${!podePalpitar ? "disabled" : ""} />
            <span class="score-team">${match.awayTeam}</span>
          </div>

          <label class="bonus-switch" for="bonus-${matchId}">
            <input
              type="checkbox"
              id="bonus-${matchId}"
              data-round="${match.roundNumber}"
              data-matchid="${matchId}"
              ${userPred && userPred.usedBonus ? "checked" : ""}
              ${!podePalpitar ? "disabled" : ""}
            />
            <span class="slider"></span>
            <span class="bonus-text">Usar bônus 2x nesta partida</span>
          </label>

          <button id="save-${matchId}" ${
      !podePalpitar ? "disabled" : ""
    }>Salvar palpite</button>
        </div>

        <div class="match-column">
          <h4>Palpites da galera</h4>
          <div class="palpite-line" id="others-${matchId}">
            Carregando palpites de outros usuários...
          </div>
        </div>
      </div>
    `;

    // aplicar classe saved-prediction se já tiver palpite salvo
    if (userHasPred) {
      matchEl.classList.add("saved-prediction");
    }

    matchesListEl.appendChild(matchEl);

    // listeners: salvar, bonus toggle, palpites dos outros
    const saveBtn = document.getElementById(`save-${matchId}`);
    if (saveBtn) {
      saveBtn.addEventListener("click", () =>
        salvarPalpite(matchId, match.roundNumber)
      );
    }

    const bonusCheckbox = document.getElementById(`bonus-${matchId}`);
    if (bonusCheckbox) {
      bonusCheckbox.addEventListener("change", async (e) => {
        const checked = e.target.checked;
        const roundAttr = e.target.getAttribute("data-round");
        const matchRound = Number(roundAttr) || match.roundNumber || 0;
        await handleBonusToggle(matchId, matchRound, checked);
      });
    }

    // Mostrar palpites da galera apenas se o jogo já começou
    ouvirPalpitesDosOutros(matchId, hasStarted);
  }

  // voltar ao topo da lista após render
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------
   Função salvarPalpite (validação e gravação)
-------------------------------*/
async function salvarPalpite(matchId, matchRound) {
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);
  const bonusInput = document.getElementById(`bonus-${matchId}`);

  // validações
  if (!homeInput || !awayInput) {
    alert("Erro: campos de placar não encontrados.");
    return;
  }
  if (homeInput.value === "" || awayInput.value === "") {
    alert("Preencha os gols de ambos os times antes de salvar o palpite!");
    return;
  }
  const homeGoals = Number(homeInput.value);
  const awayGoals = Number(awayInput.value);
  if (isNaN(homeGoals) || isNaN(awayGoals)) {
    alert("Digite valores numéricos válidos para os gols.");
    return;
  }
  const usedBonus = bonusInput ? bonusInput.checked : false;

  // checar se o jogo ainda aceita palpites
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
  if (match.status === "finished" || kickoffDate <= agora) {
    alert("Palpites encerrados para este jogo.");
    return;
  }

  // regra: 1 bônus por rodada
  if (usedBonus) {
    const bonusUsage = currentUserProfile.bonusUsage || {};
    if (
      bonusUsage &&
      bonusUsage[matchRound] &&
      bonusUsage[matchRound] !== matchId
    ) {
      alert("Você já usou o bônus 2x em outra partida nesta rodada.");
      if (bonusInput) bonusInput.checked = false;
      return;
    }
  }

  const predId = `${currentUser.uid}_${matchId}`;
  try {
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

    // atualizar bonusUsage do usuário se necessário
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

    // feedback visual
    const card = document.getElementById(`card-${matchId}`);
    if (card) card.classList.add("saved-prediction");

    // sucesso
    alert("Palpite salvo!");

    // depois de salvar, checar se salvou TODOS os palpites da rodada
    try {
      await checkAllPredictionsSaved(matchRound);
    } catch (err) {
      console.error("Erro ao checar palpites salvos da rodada:", err);
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar palpite: " + (err.message || err));
  }
}

/* ------------------------------
   handleBonusToggle: 1 por rodada
-------------------------------*/
async function handleBonusToggle(matchId, matchRound, checked) {
  if (!currentUser || !currentUserProfile) {
    alert("Usuário não identificado.");
    const cb = document.getElementById(`bonus-${matchId}`);
    if (cb) cb.checked = !checked;
    return;
  }

  // pred deve existir (exigir que o usuário salve palpite antes)
  const predRef = doc(db, "predictions", `${currentUser.uid}_${matchId}`);
  const predSnap = await getDoc(predRef);
  if (!predSnap.exists()) {
    alert("Salve seu palpite antes de usar o bônus nesta partida.");
    const cb = document.getElementById(`bonus-${matchId}`);
    if (cb) cb.checked = false;
    return;
  }

  const bonusUsage = currentUserProfile.bonusUsage || {};
  const previousMatchId = bonusUsage[matchRound];

  if (checked) {
    // desmarcar anterior se diferente
    if (previousMatchId && previousMatchId !== matchId) {
      const prevPredRef = doc(
        db,
        "predictions",
        `${currentUser.uid}_${previousMatchId}`
      );
      const prevPredSnap = await getDoc(prevPredRef);
      if (prevPredSnap.exists()) {
        await setDoc(prevPredRef, { usedBonus: false }, { merge: true });
      }
      const prevCb = document.getElementById(`bonus-${previousMatchId}`);
      if (prevCb) prevCb.checked = false;
    }

    // marcar o atual
    await setDoc(predRef, { usedBonus: true }, { merge: true });

    // atualizar users.bonusUsage
    const newBonusUsage = { ...(currentUserProfile.bonusUsage || {}) };
    newBonusUsage[matchRound] = matchId;
    await setDoc(
      doc(db, "users", currentUser.uid),
      { bonusUsage: newBonusUsage },
      { merge: true }
    );
    currentUserProfile.bonusUsage = newBonusUsage;

    // desmarca outras checkboxes do mesmo round no DOM
    document
      .querySelectorAll(`input[type="checkbox"][data-round="${matchRound}"]`)
      .forEach((el) => {
        if (el.id !== `bonus-${matchId}`) el.checked = false;
      });
  } else {
    // desmarcou -> remover flag
    await setDoc(predRef, { usedBonus: false }, { merge: true });
    const newBonusUsage = { ...(currentUserProfile.bonusUsage || {}) };
    if (newBonusUsage && newBonusUsage[matchRound]) {
      delete newBonusUsage[matchRound];
      await setDoc(
        doc(db, "users", currentUser.uid),
        { bonusUsage: newBonusUsage },
        { merge: true }
      );
      currentUserProfile.bonusUsage = newBonusUsage;
    }
  }
}

/* ------------------------------
   ouvir palpites dos outros (após início)
-------------------------------*/
function ouvirPalpitesDosOutros(matchId, hasStarted) {
  const el = document.getElementById(`others-${matchId}`);
  if (!el) return;

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
      el.textContent = "Nenhum palpite ainda.";
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
        <div>Casa: ${percCasa}% | Empate: ${percEmpate}% | Visitante: ${percFora}%</div>
      </div>
      <div class="palpite-list">${arr.join(" | ")}</div>
    `;
  });
}

/* ------------------------------
   Detalhe da pontuação (para mostrar ao usuário)
-------------------------------*/
function calcularDetalhePontuacao(
  realHome,
  realAway,
  predHome,
  predAway,
  usedBonus
) {
  let base = 0;
  const partes = [];
  const diffReal = realHome - realAway;
  const diffPred = predHome - predAway;
  const resReal = diffReal > 0 ? "H" : diffReal < 0 ? "A" : "D";
  const resPred = diffPred > 0 ? "H" : diffPred < 0 ? "A" : "D";

  if (resReal === resPred) {
    base += 3;
    partes.push("3 (resultado)");
  }
  if (realHome === predHome) {
    base += 2;
    partes.push("2 (gols mandante)");
  }
  if (realAway === predAway) {
    base += 2;
    partes.push("2 (gols visitante)");
  }
  if (diffReal === diffPred) {
    base += 3;
    partes.push("3 (diferença de gols)");
  }

  let total = base;
  if (usedBonus && base > 0) total = base * 2;

  return { total, base, partes, usedBonus: !!usedBonus };
}

/* ------------------------------
   Modal "Todos palpites salvos" e função de checagem
-------------------------------*/
function openAllSavedModal(roundNumber) {
  if (!allSavedModal) return;
  const key = `allSavedShown_round_${roundNumber}`;
  if (localStorage.getItem(key)) return; // já mostrado
  allSavedModal.style.display = "flex";
  localStorage.setItem(key, "1");
  setTimeout(() => closeAllSavedModal(), 6000);
}
function closeAllSavedModal() {
  if (!allSavedModal) return;
  allSavedModal.style.display = "none";
}
if (allSavedCloseBtn)
  allSavedCloseBtn.addEventListener("click", () => closeAllSavedModal());
if (allSavedModal)
  allSavedModal.addEventListener("click", (e) => {
    if (e.target === allSavedModal) closeAllSavedModal();
  });

async function checkAllPredictionsSaved(roundNumber) {
  if (!currentUser) return false;
  // contar jogos dessa rodada
  const matchesQ = query(
    collection(db, "matches"),
    where("round", "==", roundNumber)
  );
  const matchesSnap = await getDocs(matchesQ);
  const matchesCount = matchesSnap.size;
  if (!matchesCount) return false;

  // contar predictions do usuário nessa rodada
  const predsQ = query(
    collection(db, "predictions"),
    where("round", "==", roundNumber),
    where("userId", "==", currentUser.uid)
  );
  const predsSnap = await getDocs(predsQ);
  const predsCount = predsSnap.size;

  const allSaved = predsCount >= matchesCount;
  if (allSaved) openAllSavedModal(roundNumber);

  return allSaved;
}

/* ------------------------------
   Promo modal & rules modal logic (simples)
-------------------------------*/
if (promoBtn && promoModal) {
  promoBtn.addEventListener("click", () => {
    promoModal.style.display = "flex";
  });
}
if (promoClose)
  promoClose.addEventListener("click", () => {
    promoModal.style.display = "none";
  });
if (promoModal)
  promoModal.addEventListener("click", (e) => {
    if (e.target === promoModal) promoModal.style.display = "none";
  });
if (promoMore)
  promoMore.addEventListener("click", () => {
    promoModal.style.display = "none";
    if (rulesBtn) rulesBtn.click();
  });

if (rulesBtn && rulesModal) {
  rulesBtn.addEventListener("click", () => {
    rulesModal.style.display = "flex";
  });
}
if (rulesClose)
  rulesClose.addEventListener("click", () => {
    rulesModal.style.display = "none";
  });
if (rulesModal)
  rulesModal.addEventListener("click", (e) => {
    if (e.target === rulesModal) rulesModal.style.display = "none";
  });

/* ------------------------------
   showRoundPrizeLabel (opcional)
-------------------------------*/
async function showRoundPrizeLabel(roundNumber) {
  if (!roundPrizeLabelEl) return;
  try {
    const prizeDoc = await getDoc(doc(db, "roundPrizes", String(roundNumber)));
    if (!prizeDoc.exists()) {
      roundPrizeLabelEl.style.display = "none";
      return;
    }
    const prize = prizeDoc.data();
    if (!prize.enabled) {
      roundPrizeLabelEl.style.display = "none";
      return;
    }
    const positions =
      prize.positions ||
      (prize.perc ? prize.perc.length : prize.fixed?.length || 0);
    const text =
      prize.type === "money"
        ? `Prêmio: R$ ${prize.totalAmount} • Top ${positions}`
        : `Prêmio: ${prize.totalAmount || 0} pontos • Top ${positions}`;
    roundPrizeLabelEl.textContent = text;
    roundPrizeLabelEl.style.display = "inline-block";
  } catch (err) {
    console.error("Erro ao buscar roundPrize:", err);
    if (roundPrizeLabelEl) roundPrizeLabelEl.style.display = "none";
  }
}

/* ------------------------------
   Export (nenhum) - fim do arquivo
-------------------------------*/
