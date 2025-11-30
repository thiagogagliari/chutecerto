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

const logoutBtn = document.getElementById("logout-btn");
const profileTitleEl = document.getElementById("profile-title");
const userInfoEl = document.getElementById("profile-user-info");
const roundSummaryEl = document.getElementById("profile-round-summary");
const roundFilterEl = document.getElementById("profile-round-filter");
const predictionsListEl = document.getElementById("profile-predictions-list");

// pegar userId da URL
const params = new URLSearchParams(window.location.search);
const profileUserId = params.get("userId");

let loggedUser = null;
let profileUser = null;
let matchesMap = new Map(); // matchId -> matchData
let predictions = []; // todos os palpites desse usuário
let rounds = []; // rodadas onde ele palpitou

// logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  loggedUser = user;

  if (!profileUserId) {
    userInfoEl.innerHTML = "Usuário não especificado.";
    return;
  }

  await carregarUsuarioPerfil();
  await carregarMatches();
  await carregarPredictionsDoUsuario();

  montarResumoPorRodada();
  montarFiltroDeRodadas();
  renderPredictions();
});

// --------- Carregamento ---------

async function carregarUsuarioPerfil() {
  const userRef = doc(db, "users", profileUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    userInfoEl.innerHTML = "Usuário não encontrado.";
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
        <div class="profile-total-points">Pontos totais: <strong>${
          profileUser.totalPoints || 0
        }</strong></div>
        ${
          loggedUser.uid === profileUserId
            ? `<div class="profile-badge">Este é o seu perfil</div>`
            : ""
        }
      </div>
    </div>
  `;
}

async function carregarMatches() {
  matchesMap = new Map();
  const snapshot = await getDocs(collection(db, "matches"));
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const matchId = docSnap.id;

    let kickoffDate;
    if (data.kickoff?.toDate) {
      kickoffDate = data.kickoff.toDate();
    } else {
      kickoffDate = new Date(data.kickoff);
    }

    matchesMap.set(matchId, {
      id: matchId,
      ...data,
      _kickoffDate: kickoffDate,
    });
  });
}

async function carregarPredictionsDoUsuario() {
  predictions = [];
  const q = query(
    collection(db, "predictions"),
    where("userId", "==", profileUserId)
  );

  const snapshot = await getDocs(q);
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    predictions.push({
      id: docSnap.id,
      ...data,
    });
  });

  // ordena por round asc, depois kickoff
  predictions.sort((a, b) => {
    const rA = Number(a.round) || 0;
    const rB = Number(b.round) || 0;
    if (rA !== rB) return rA - rB;

    const matchA = matchesMap.get(a.matchId);
    const matchB = matchesMap.get(b.matchId);
    const dA = matchA?._kickoffDate || new Date(0);
    const dB = matchB?._kickoffDate || new Date(0);
    return dA - dB;
  });

  rounds = Array.from(
    new Set(predictions.map((p) => Number(p.round) || 0).filter((r) => r > 0))
  ).sort((a, b) => a - b);
}

// --------- Resumo por rodada ---------

function montarResumoPorRodada() {
  if (!predictions.length) {
    roundSummaryEl.innerHTML = "Este usuário ainda não possui palpites.";
    return;
  }

  const pontosPorRodada = {};
  predictions.forEach((p) => {
    const r = Number(p.round) || 0;
    if (!r) return;
    if (!pontosPorRodada[r]) pontosPorRodada[r] = 0;
    pontosPorRodada[r] += p.points || 0;
  });

  const linhas = Object.keys(pontosPorRodada)
    .map((r) => Number(r))
    .sort((a, b) => a - b)
    .map(
      (r) =>
        `<div class="profile-round-line">Rodada ${r}: <strong>${pontosPorRodada[r]} pontos</strong></div>`
    );

  roundSummaryEl.innerHTML = linhas.join("") || "Sem pontos por rodada ainda.";
}

// --------- Filtro de rodadas ---------

function montarFiltroDeRodadas() {
  // limpar
  roundFilterEl.innerHTML = `<option value="">Todas as rodadas</option>`;

  rounds.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = String(r);
    opt.textContent = `Rodada ${r}`;
    roundFilterEl.appendChild(opt);
  });

  roundFilterEl.addEventListener("change", () => {
    renderPredictions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// --------- Renderização dos palpites ---------

function renderPredictions() {
  if (!predictions.length) {
    predictionsListEl.innerHTML =
      "Este usuário ainda não tem palpites registrados.";
    return;
  }

  const filtroRodada = roundFilterEl.value ? Number(roundFilterEl.value) : null;

  let lista = predictions;
  if (filtroRodada) {
    lista = lista.filter((p) => Number(p.round) === filtroRodada);
  }

  if (!lista.length) {
    predictionsListEl.innerHTML = "Nenhum palpite nesta rodada.";
    return;
  }

  const agora = new Date();

  const linhasHtml = lista.map((p) => {
    const match = matchesMap.get(p.matchId);
    const round = Number(p.round) || 0;
    const pontos = p.points || 0;

    let matchInfo = "Jogo não encontrado";
    let dataInfo = "";
    let resultadoFinal = "";
    let hasStarted = false;

    if (match) {
      matchInfo = `${match.homeTeam} x ${match.awayTeam}`;
      dataInfo = match._kickoffDate ? match._kickoffDate.toLocaleString() : "";
      hasStarted = match._kickoffDate && match._kickoffDate <= agora;

      if (
        match.status === "finished" &&
        match.homeScore != null &&
        match.awayScore != null
      ) {
        resultadoFinal = `${match.homeScore} x ${match.awayScore}`;
      }
    }

    // 🔒 Só mostra o palpite depois que o jogo começar
    const podeMostrarPalpite = hasStarted;
    const palpiteTexto = podeMostrarPalpite
      ? `${p.homeGoalsPred} x ${p.awayGoalsPred}${p.usedBonus ? " (2x)" : ""}`
      : "⏳ Palpite oculto até o início do jogo";

    return `
      <tr>
        <td>${round || "-"}</td>
        <td>
          <div class="profile-match-main">${matchInfo}</div>
          <div class="profile-match-date">${dataInfo}</div>
        </td>
        <td>${palpiteTexto}</td>
        <td>${resultadoFinal || "-"}</td>
        <td>${pontos}</td>
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
        <tbody>
          ${linhasHtml.join("")}
        </tbody>
      </table>
    </div>
  `;
}
