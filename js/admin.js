// js/admin.js
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
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const logoutBtn = document.getElementById("logout-btn");
const matchesListEl = document.getElementById("matches-list");

// form de criação de jogo
const createMatchForm = document.getElementById("create-match-form");
const roundInput = document.getElementById("round");
const homeTeamInput = document.getElementById("home-team");
const awayTeamInput = document.getElementById("away-team");
const kickoffInput = document.getElementById("kickoff");
const homeLogoInput = document.getElementById("home-logo-url");
const awayLogoInput = document.getElementById("away-logo-url");
const createMatchBtn = document.getElementById("create-match-btn");

// --- NOVOS ELEMENTOS: controle de pagamentos ---
const paymentRoundInput = document.getElementById("payment-round");
const paymentEmailInput = document.getElementById("payment-email");
const markPaidBtn = document.getElementById("mark-paid-btn");
const unmarkPaidBtn = document.getElementById("unmark-paid-btn");
const paymentInfoEl = document.getElementById("payment-info");

let currentUser = null;
let currentUserProfile = null;

/* --------------------------------
   Função para colorir o select de status
-------------------------------- */
function aplicarCorStatusSelect(selectEl) {
  if (!selectEl) return;

  // limpa classes anteriores
  selectEl.classList.remove(
    "select-scheduled",
    "select-live",
    "select-finished"
  );

  const value = selectEl.value;

  if (value === "scheduled") {
    selectEl.classList.add("select-scheduled"); // azul
  } else if (value === "live") {
    selectEl.classList.add("select-live"); // vermelho
  } else if (value === "finished") {
    selectEl.classList.add("select-finished"); // verde
  }
}

/* --------------------------------
   LOGOUT
-------------------------------- */
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* --------------------------------
   AUTENTICAÇÃO E VERIFICAÇÃO DE ADMIN
-------------------------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("Usuário sem perfil encontrado.");
    window.location.href = "index.html";
    return;
  }

  currentUserProfile = userSnap.data();

  if (currentUserProfile.role !== "admin") {
    alert("Acesso negado. Esta página é apenas para administradores.");
    window.location.href = "dashboard.html";
    return;
  }

  // admin autenticado
  carregarJogosAdmin();
});

/* --------------------------------
   CARREGAR JOGOS NO ADMIN
-------------------------------- */
async function carregarJogosAdmin() {
  matchesListEl.innerHTML = "Carregando jogos cadastrados...";

  const snapshot = await getDocs(collection(db, "matches"));

  const matches = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const matchId = docSnap.id;

    let kickoffDate;
    if (data.kickoff?.toDate) {
      kickoffDate = data.kickoff.toDate();
    } else {
      kickoffDate = new Date(data.kickoff);
    }

    matches.push({
      id: matchId,
      ...data,
      _kickoffDate: kickoffDate,
      roundNumber: Number(data.round) || 0,
    });
  });

  // Rodada mais recente em cima, horário crescente dentro da rodada
  matches.sort((a, b) => {
    if (a.roundNumber !== b.roundNumber) {
      return b.roundNumber - a.roundNumber;
    }
    return a._kickoffDate - b._kickoffDate;
  });

  if (!matches.length) {
    matchesListEl.innerHTML = "Nenhum jogo cadastrado.";
    return;
  }

  // Header de colunas
  const header = document.createElement("div");
  header.className = "admin-match-row admin-match-row-header";
  header.innerHTML = `
    <div>Jogo</div>
    <div>Rodada</div>
    <div>Status</div>
    <div>Placar</div>
    <div>Hora</div>
    <div>Ações</div>
  `;
  matchesListEl.innerHTML = "";
  matchesListEl.appendChild(header);

  // Linhas de jogos
  matches.forEach((match) => {
    const row = document.createElement("div");
    row.className = "admin-match-row";

    const kickoffStr = match._kickoffDate
      ? match._kickoffDate.toLocaleString()
      : "";

    const status = match.status || "scheduled";

    const homeScore = match.homeScore ?? "";
    const awayScore = match.awayScore ?? "";

    row.innerHTML = `
      <div class="admin-match-main">
        <div class="teams">${match.homeTeam} x ${match.awayTeam}</div>
        <div class="date">${kickoffStr}</div>
      </div>
      <div class="admin-round-label">Rodada ${match.roundNumber || "-"}</div>
      <div class="admin-match-status">
        <select id="status-${match.id}">
          <option value="scheduled" ${
            status === "scheduled" ? "selected" : ""
          }>Agendado</option>
          <option value="live" ${
            status === "live" ? "selected" : ""
          }>Ao vivo</option>
          <option value="finished" ${
            status === "finished" ? "selected" : ""
          }>Finalizado</option>
        </select>
      </div>
      <div class="admin-score-inputs">
        <input type="number" id="homeScore-${
          match.id
        }" min="0" placeholder="Casa" value="${homeScore}"/>
        <span>x</span>
        <input type="number" id="awayScore-${
          match.id
        }" min="0" placeholder="Fora" value="${awayScore}"/>
      </div>
      <div class="admin-kickoff">${kickoffStr}</div>
      <div class="admin-actions">
        <button type="button" class="btn-secondary" id="save-${match.id}">
          💾 Salvar
        </button>
        <button type="button" class="btn-secondary" id="delete-${match.id}">
          🗑 Apagar
        </button>
      </div>
    `;

    matchesListEl.appendChild(row);

    // aplica cor inicial no select de status
    const statusSelect = document.getElementById(`status-${match.id}`);
    aplicarCorStatusSelect(statusSelect);

    // atualizar cor ao mudar o status
    if (statusSelect) {
      statusSelect.addEventListener("change", () => {
        aplicarCorStatusSelect(statusSelect);
      });
    }

    // listeners de salvar / deletar
    document
      .getElementById(`save-${match.id}`)
      .addEventListener("click", () => salvarJogo(match.id));

    document
      .getElementById(`delete-${match.id}`)
      .addEventListener("click", () => deletarJogo(match.id));
  });
}

/* --------------------------------
   CADASTRAR NOVO JOGO
-------------------------------- */
createMatchBtn.addEventListener("click", async () => {
  const round = Number(roundInput.value);
  const homeTeam = homeTeamInput.value.trim();
  const awayTeam = awayTeamInput.value.trim();
  const kickoff = kickoffInput.value;
  const homeLogoUrl = homeLogoInput.value.trim();
  const awayLogoUrl = awayLogoInput.value.trim();

  if (!round || !homeTeam || !awayTeam || !kickoff) {
    alert("Preencha rodada, times e data/hora.");
    return;
  }

  const kickoffDate = new Date(kickoff);
  if (isNaN(kickoffDate.getTime())) {
    alert("Data/hora inválida.");
    return;
  }

  try {
    await addDoc(collection(db, "matches"), {
      round,
      homeTeam,
      awayTeam,
      kickoff: kickoffDate,
      homeLogoUrl: homeLogoUrl || "",
      awayLogoUrl: awayLogoUrl || "",
      status: "scheduled",
      homeScore: null,
      awayScore: null,
    });

    alert("Jogo cadastrado com sucesso!");

    // limpar form
    roundInput.value = "";
    homeTeamInput.value = "";
    awayTeamInput.value = "";
    kickoffInput.value = "";
    homeLogoInput.value = "";
    awayLogoInput.value = "";

    carregarJogosAdmin();
  } catch (err) {
    console.error(err);
    alert("Erro ao cadastrar jogo: " + err.message);
  }
});

/* --------------------------------
   SALVAR JOGO (status e placar)
-------------------------------- */
async function salvarJogo(matchId) {
  const statusSelect = document.getElementById(`status-${matchId}`);
  const homeScoreInput = document.getElementById(`homeScore-${matchId}`);
  const awayScoreInput = document.getElementById(`awayScore-${matchId}`);

  if (!statusSelect || !homeScoreInput || !awayScoreInput) return;

  const status = statusSelect.value;
  const homeScoreRaw = homeScoreInput.value;
  const awayScoreRaw = awayScoreInput.value;

  const homeScore =
    homeScoreRaw === "" || homeScoreRaw === null ? null : Number(homeScoreRaw);
  const awayScore =
    awayScoreRaw === "" || awayScoreRaw === null ? null : Number(awayScoreRaw);

  if (
    status === "finished" &&
    (homeScore === null ||
      awayScore === null ||
      isNaN(homeScore) ||
      isNaN(awayScore))
  ) {
    alert("Para finalizar o jogo, informe o placar completo.");
    return;
  }

  try {
    const matchRef = doc(db, "matches", matchId);
    await updateDoc(matchRef, {
      status,
      homeScore,
      awayScore,
    });

    if (status === "finished" && homeScore != null && awayScore != null) {
      await recalcularPontuacaoDoJogo(matchId, homeScore, awayScore);
      alert("Jogo e pontuações atualizados com sucesso!");
    } else {
      // se não estiver finalizado, zera os pontos desse jogo
      await resetarPontuacaoDoJogo(matchId);
      alert("Jogo atualizado. Pontos desse jogo foram zerados.");
    }

    carregarJogosAdmin();
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar jogo: " + err.message);
  }
}

/* --------------------------------
   APAGAR JOGO
-------------------------------- */
async function deletarJogo(matchId) {
  const confirma = confirm(
    "Tem certeza que deseja apagar este jogo? Isso também afetará os pontos dos usuários."
  );
  if (!confirma) return;

  try {
    // antes de deletar, zera os pontos desse jogo para todos
    await resetarPontuacaoDoJogo(matchId);

    await deleteDoc(doc(db, "matches", matchId));
    alert("Jogo apagado com sucesso.");
    carregarJogosAdmin();
  } catch (err) {
    console.error(err);
    alert("Erro ao apagar jogo: " + err.message);
  }
}

/* --------------------------------
   FUNÇÃO DE PONTUAÇÃO
-------------------------------- */
function calcularPontosJogo(realHome, realAway, predHome, predAway, usedBonus) {
  let pontos = 0;

  const diffReal = realHome - realAway;
  const diffPred = predHome - predAway;

  const resReal = diffReal > 0 ? "H" : diffReal < 0 ? "A" : "D";
  const resPred = diffPred > 0 ? "H" : diffPred < 0 ? "A" : "D";

  if (resReal === resPred) {
    pontos += 3;
  }
  if (realHome === predHome) {
    pontos += 2;
  }
  if (realAway === predAway) {
    pontos += 2;
  }
  if (diffReal === diffPred) {
    pontos += 3;
  }

  if (usedBonus) {
    pontos *= 2;
  }

  return pontos;
}

/* --------------------------------
   RECALCULAR PONTUAÇÃO PARA UM JOGO FINALIZADO
-------------------------------- */
async function recalcularPontuacaoDoJogo(matchId, homeScore, awayScore) {
  const q = query(
    collection(db, "predictions"),
    where("matchId", "==", matchId)
  );

  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    const pred = docSnap.data();
    const predId = docSnap.id;

    const predHome = Number(pred.homeGoalsPred);
    const predAway = Number(pred.awayGoalsPred);
    const usedBonus = !!pred.usedBonus;

    const oldPoints = pred.points || 0;
    const newPoints = calcularPontosJogo(
      homeScore,
      awayScore,
      predHome,
      predAway,
      usedBonus
    );

    const predRef = doc(db, "predictions", predId);
    await updateDoc(predRef, { points: newPoints });

    const userRef = doc(db, "users", pred.userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const currentTotal = userData.totalPoints || 0;
      const newTotal = currentTotal - oldPoints + newPoints;
      await updateDoc(userRef, { totalPoints: newTotal });
    }
  }
}

/* --------------------------------
   RESETAR PONTUAÇÃO PARA UM JOGO (quando não está finalizado)
-------------------------------- */
async function resetarPontuacaoDoJogo(matchId) {
  const q = query(
    collection(db, "predictions"),
    where("matchId", "==", matchId)
  );

  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    const pred = docSnap.data();
    const predId = docSnap.id;

    const oldPoints = pred.points || 0;

    const predRef = doc(db, "predictions", predId);
    await updateDoc(predRef, { points: 0 });

    const userRef = doc(db, "users", pred.userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const currentTotal = userData.totalPoints || 0;
      const newTotal = currentTotal - oldPoints;
      await updateDoc(userRef, { totalPoints: newTotal });
    }
  }
}

/* =========================================================================
   CONTROLE DE PAGAMENTOS DO BOLÃO POR RODADA
   - Coleção: roundEntries
   - DocId: `${round}_${userId}`
   - Também atualiza roundPrizes (lido no dashboard)
   ======================================================================== */

// busca usuário por email OU username
async function encontrarUsuarioPorEmailOuUsername(texto) {
  const valor = texto.trim();
  if (!valor) return null;

  // tenta por email
  let qEmail = query(
    collection(db, "users"),
    where("email", "==", valor.toLowerCase())
  );
  let snap = await getDocs(qEmail);
  if (!snap.empty) return snap.docs[0];

  // tenta por username
  let qUser = query(collection(db, "users"), where("username", "==", valor));
  snap = await getDocs(qUser);
  if (!snap.empty) return snap.docs[0];

  return null;
}

// recalcula prêmio da rodada com base em quem pagou (R$ 10 por usuário)
async function recalcularPremioRodada(roundNumber) {
  const qEntries = query(
    collection(db, "roundEntries"),
    where("round", "==", roundNumber)
  );
  const snap = await getDocs(qEntries);
  const count = snap.size;
  const totalAmount = count * 10; // R$ 10 por usuário

  const prizeRef = doc(db, "roundPrizes", String(roundNumber));

  if (count === 0) {
    // se ninguém pagou, desabilita prêmio
    await setDoc(
      prizeRef,
      {
        round: roundNumber,
        enabled: false,
        totalAmount: 0,
        type: "money",
        positions: 1,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } else {
    await setDoc(
      prizeRef,
      {
        round: roundNumber,
        enabled: true,
        totalAmount,
        type: "money",
        positions: 1, // 1 vencedor (pode mudar depois)
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }

  if (paymentInfoEl) {
    paymentInfoEl.textContent = `Rodada ${roundNumber}: ${count} participante(s) pago(s). Prêmio atual: R$ ${totalAmount},00`;
  }
}

// marcar pagamento
async function marcarPagamentoRodada() {
  if (!paymentRoundInput || !paymentEmailInput) return;

  const roundNumber = Number(paymentRoundInput.value);
  const texto = paymentEmailInput.value.trim();

  if (!roundNumber || !texto) {
    alert("Informe a rodada e o e-mail/username do usuário.");
    return;
  }

  const userDocSnap = await encontrarUsuarioPorEmailOuUsername(texto);
  if (!userDocSnap) {
    alert("Usuário não encontrado pelo e-mail/username informado.");
    return;
  }

  const userId = userDocSnap.id;
  const userData = userDocSnap.data();
  const docId = `${roundNumber}_${userId}`;

  try {
    await setDoc(doc(db, "roundEntries", docId), {
      round: roundNumber,
      userId,
      amount: 10,
      paidAt: new Date(),
      byAdmin: currentUser ? currentUser.uid : null,
      username: userData.username || "",
      email: userData.email || "",
    });

    await recalcularPremioRodada(roundNumber);

    alert(
      `Pagamento registrado: ${
        userData.username || userData.email
      } está apto na rodada ${roundNumber}.`
    );
  } catch (err) {
    console.error(err);
    alert("Erro ao registrar pagamento: " + (err.message || err));
  }
}

// remover pagamento
async function removerPagamentoRodada() {
  if (!paymentRoundInput || !paymentEmailInput) return;

  const roundNumber = Number(paymentRoundInput.value);
  const texto = paymentEmailInput.value.trim();

  if (!roundNumber || !texto) {
    alert("Informe a rodada e o e-mail/username do usuário.");
    return;
  }

  const userDocSnap = await encontrarUsuarioPorEmailOuUsername(texto);
  if (!userDocSnap) {
    alert("Usuário não encontrado pelo e-mail/username informado.");
    return;
  }

  const userId = userDocSnap.id;
  const userData = userDocSnap.data();
  const docId = `${roundNumber}_${userId}`;

  try {
    await deleteDoc(doc(db, "roundEntries", docId));
    await recalcularPremioRodada(roundNumber);

    alert(
      `Pagamento removido: ${
        userData.username || userData.email
      } não está mais apto na rodada ${roundNumber}.`
    );
  } catch (err) {
    console.error(err);
    alert("Erro ao remover pagamento: " + (err.message || err));
  }
}

// listeners dos botões de pagamento
if (markPaidBtn) {
  markPaidBtn.addEventListener("click", marcarPagamentoRodada);
}
if (unmarkPaidBtn) {
  unmarkPaidBtn.addEventListener("click", removerPagamentoRodada);
}
