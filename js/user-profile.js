// js/user-profile.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ------------------------------
   ELEMENTOS DOM
-------------------------------*/
const logoutBtn = document.getElementById("logout-btn");
const profileTitleEl = document.getElementById("profile-title");
const userInfoEl = document.getElementById("profile-user-info");
const roundSummaryEl = document.getElementById("profile-round-summary");
const roundFilterEl = document.getElementById("profile-round-filter");
const predictionsListEl = document.getElementById("profile-predictions-list");

// 🔹 opcional (não quebra se não existir)
const titlesEl = document.getElementById("profile-titles");

/* ------------------------------
   PARAMS
-------------------------------*/
const params = new URLSearchParams(window.location.search);
const profileUserId = params.get("userId");

/* ------------------------------
   ESTADO
-------------------------------*/
let loggedUser = null;
let profileUser = null;
let matchesMap = new Map();
let predictions = [];
let rounds = [];

/* ------------------------------
   LOGOUT
-------------------------------*/
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

/* ------------------------------
   AUTH
-------------------------------*/
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  loggedUser = user;

  if (!profileUserId) {
    userInfoEl.textContent = "Usuário não especificado.";
    return;
  }

  await carregarUsuarioPerfil();
  await carregarMatches();
  await carregarPredictionsDoUsuario();

  montarResumoPorRodada();
  montarFiltroDeRodadas();
  renderPredictions();

  // 🔒 títulos NÃO podem quebrar o perfil
  try {
    await carregarTitulosEGanhos();
  } catch (err) {
    console.warn("Títulos ainda não disponíveis:", err);
  }
});

/* ------------------------------
   PERFIL
-------------------------------*/
async function carregarUsuarioPerfil() {
  const snap = await getDoc(doc(db, "users", profileUserId));
  if (!snap.exists()) {
    userInfoEl.textContent = "Usuário não encontrado.";
    return;
  }

  profileUser = snap.data();
  profileTitleEl.textContent = `Perfil de ${profileUser.username}`;

  const avatarHtml = profileUser.avatarUrl
    ? `<img src="${profileUser.avatarUrl}" class="profile-avatar" />`
    : `<div class="profile-avatar profile-avatar-placeholder"></div>`;

  userInfoEl.innerHTML = `
    <div class="profile-user-header">
      ${avatarHtml}
      <div>
        <div class="profile-username">${profileUser.username}</div>
        ${
          profileUser.favoriteTeamName
            ? `<div class="profile-team">Time do coração: ${profileUser.favoriteTeamName}</div>`
            : ""
        }
        <div class="profile-total-points">
          Pontos totais: <strong>${profileUser.totalPoints || 0}</strong>
        </div>
        ${
          loggedUser.uid === profileUserId
            ? `<div class="profile-badge">Este é o seu perfil</div>`
            : ""
        }
      </div>
    </div>
  `;
}

/* ------------------------------
   MATCHES
-------------------------------*/
async function carregarMatches() {
  matchesMap.clear();

  const snapshot = await getDocs(collection(db, "matches"));
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const kickoffDate = data.kickoff?.toDate
      ? data.kickoff.toDate()
      : new Date(data.kickoff);

    matchesMap.set(docSnap.id, {
      id: docSnap.id,
      ...data,
      _kickoffDate: kickoffDate,
    });
  });
}

/* ------------------------------
   PREDICTIONS
-------------------------------*/
async function carregarPredictionsDoUsuario() {
  predictions = [];

  const q = query(
    collection(db, "predictions"),
    where("userId", "==", profileUserId)
  );

  const snapshot = await getDocs(q);
  snapshot.forEach((docSnap) => {
    predictions.push({ id: docSnap.id, ...docSnap.data() });
  });

  // 🔹 rodada mais recente primeiro
  predictions.sort((a, b) => {
    const rA = Number(a.round) || 0;
    const rB = Number(b.round) || 0;
    if (rA !== rB) return rB - rA;

    const dA = matchesMap.get(a.matchId)?._kickoffDate || new Date(0);
    const dB = matchesMap.get(b.matchId)?._kickoffDate || new Date(0);
    return dA - dB;
  });

  rounds = [...new Set(predictions.map((p) => Number(p.round)))]
    .filter(Boolean)
    .sort((a, b) => b - a);
}

/* ------------------------------
   RESUMO POR RODADA
-------------------------------*/
function montarResumoPorRodada() {
  if (!predictions.length) {
    roundSummaryEl.textContent = "Este usuário ainda não possui palpites.";
    return;
  }

  const pontos = {};
  predictions.forEach((p) => {
    if (!pontos[p.round]) pontos[p.round] = 0;
    pontos[p.round] += p.points || 0;
  });

  roundSummaryEl.innerHTML = Object.keys(pontos)
    .sort((a, b) => b - a)
    .map(
      (r) =>
        `<div class="profile-round-line">
          Rodada ${r}: <strong>${pontos[r]} pontos</strong>
        </div>`
    )
    .join("");
}

/* ------------------------------
   FILTRO
-------------------------------*/
function montarFiltroDeRodadas() {
  roundFilterEl.innerHTML = `<option value="">Todas as rodadas</option>`;

  rounds.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = `Rodada ${r}`;
    roundFilterEl.appendChild(opt);
  });

  roundFilterEl.addEventListener("change", () => {
    renderPredictions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ------------------------------
   RENDER PALPITES
-------------------------------*/
function renderPredictions() {
  if (!predictions.length) {
    predictionsListEl.textContent =
      "Este usuário ainda não tem palpites registrados.";
    return;
  }

  const filtro = roundFilterEl.value ? Number(roundFilterEl.value) : null;

  const lista = filtro
    ? predictions.filter((p) => Number(p.round) === filtro)
    : predictions;

  if (!lista.length) {
    predictionsListEl.textContent = "Nenhum palpite nesta rodada.";
    return;
  }

  const agora = new Date();

  const rows = lista.map((p) => {
    const match = matchesMap.get(p.matchId);
    const hasStarted = match && match._kickoffDate <= agora;

    const palpite = hasStarted
      ? `${p.homeGoalsPred} x ${p.awayGoalsPred}${p.usedBonus ? " (2x)" : ""}`
      : "⏳ Palpite oculto";

    const resultado =
      match?.status === "finished"
        ? `${match.homeScore} x ${match.awayScore}`
        : "-";

    return `
      <tr>
        <td>${p.round}</td>
        <td>
          <div>${match?.homeTeam} x ${match?.awayTeam}</div>
          <small>${match?._kickoffDate?.toLocaleString() || ""}</small>
        </td>
        <td>${palpite}</td>
        <td>${resultado}</td>
        <td>${p.points || 0}</td>
      </tr>
    `;
  });

  predictionsListEl.innerHTML = `
    <div class="profile-table-wrapper">
      <table class="profile-table">
        <thead>
          <tr>
            <th>Rodada</th>
            <th>Jogo</th>
            <th>Palpite</th>
            <th>Resultado</th>
            <th>Pontos</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

/* ------------------------------
   TÍTULOS E GANHOS (SEGURO)
-------------------------------*/
async function carregarTitulosEGanhos() {
  if (!titlesEl) return;

  // 🔹 por enquanto vazio (não quebra)
  titlesEl.innerHTML = `
    <div class="profile-titles-empty">
      Nenhum título conquistado ainda.
    </div>
  `;
}
