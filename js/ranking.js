// js/ranking.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const rankingListEl = document.getElementById("ranking-list");
const currentUserInfoEl = document.getElementById("ranking-current-user");
const logoutBtn = document.getElementById("logout-btn");

const modeGeralBtn = document.getElementById("mode-geral");
const modeRoundBtn = document.getElementById("mode-round");

const roundNavEl = document.getElementById("round-nav-ranking");
const prevRoundBtn = document.getElementById("prev-round-btn");
const nextRoundBtn = document.getElementById("next-round-btn");
const roundLabelEl = document.getElementById("current-round-label");

const searchInput = document.getElementById("ranking-search");

let currentUser = null;

// dados em memória
let usersMap = new Map();
let predictionsByRound = {};
let rounds = [];
let currentRound = null;
let currentMode = "geral";
let searchTerm = "";

// pagamentos e prêmios
let paidByRound = {};
let prizeByRound = {};

// 🔹 rodadas finalizadas
let finishedRounds = new Set();

// logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// busca
searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  currentMode === "geral" ? renderRankingGeral() : renderRankingPorRodada();
});

// troca de modo
modeGeralBtn.addEventListener("click", () => {
  currentMode = "geral";
  modeGeralBtn.classList.add("active");
  modeRoundBtn.classList.remove("active");
  roundNavEl.classList.add("hidden");
  renderRankingGeral();
});

modeRoundBtn.addEventListener("click", () => {
  currentMode = "round";
  modeRoundBtn.classList.add("active");
  modeGeralBtn.classList.remove("active");
  roundNavEl.classList.remove("hidden");
  if (!rounds.length) return;
  if (currentRound === null) currentRound = rounds[rounds.length - 1];
  updateRoundLabel();
  renderRankingPorRodada();
});

// navegação
prevRoundBtn.addEventListener("click", () => {
  const idx = rounds.indexOf(currentRound);
  if (idx > 0) {
    currentRound = rounds[idx - 1];
    updateRoundLabel();
    renderRankingPorRodada();
  }
});

nextRoundBtn.addEventListener("click", () => {
  const idx = rounds.indexOf(currentRound);
  if (idx < rounds.length - 1) {
    currentRound = rounds[idx + 1];
    updateRoundLabel();
    renderRankingPorRodada();
  }
});

// autenticação
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  await carregarUsuarios();
  await carregarPredictions();
  await carregarRoundEntries();
  await carregarRoundPrizes();
  await carregarRodadasFinalizadas();

  currentMode = "geral";
  renderRankingGeral();
});

// --------- LOADERS ---------

async function carregarUsuarios() {
  usersMap.clear();
  const snap = await getDocs(collection(db, "users"));
  snap.forEach((d) => {
    const data = d.data();
    usersMap.set(d.id, {
      id: d.id,
      username: data.username || "",
      avatarUrl: data.avatarUrl || "",
      totalPoints: data.totalPoints || 0,
    });
  });
}

async function carregarPredictions() {
  predictionsByRound = {};
  rounds = [];

  const snap = await getDocs(collection(db, "predictions"));
  snap.forEach((d) => {
    const p = d.data();
    if (!p.round || !p.userId) return;

    if (!predictionsByRound[p.round]) {
      predictionsByRound[p.round] = {};
    }
    predictionsByRound[p.round][p.userId] =
      (predictionsByRound[p.round][p.userId] || 0) + (p.points || 0);
  });

  rounds = Object.keys(predictionsByRound)
    .map(Number)
    .sort((a, b) => a - b);
  if (rounds.length && currentRound === null) {
    currentRound = rounds[rounds.length - 1];
  }
}

async function carregarRoundEntries() {
  paidByRound = {};
  const snap = await getDocs(collection(db, "roundEntries"));
  snap.forEach((d) => {
    const r = d.data();
    if (!r.round || !r.userId) return;
    if (!paidByRound[r.round]) paidByRound[r.round] = new Set();
    paidByRound[r.round].add(r.userId);
  });
}

async function carregarRoundPrizes() {
  prizeByRound = {};
  const snap = await getDocs(collection(db, "roundPrizes"));
  snap.forEach((d) => {
    const data = d.data();
    const round = Number(data.round || d.id);
    prizeByRound[round] = data;
  });
}

// 🔹 detectar rodadas finalizadas
async function carregarRodadasFinalizadas() {
  finishedRounds = new Set();
  const snap = await getDocs(collection(db, "matches"));
  const map = {};

  snap.forEach((d) => {
    const m = d.data();
    if (!m.round) return;
    if (!map[m.round]) map[m.round] = { total: 0, finished: 0 };
    map[m.round].total++;
    if (m.status === "finished") map[m.round].finished++;
  });

  Object.entries(map).forEach(([r, v]) => {
    if (v.total === v.finished) finishedRounds.add(Number(r));
  });
}

// --------- RANKING GERAL ---------

function renderRankingGeral() {
  rankingListEl.innerHTML = "";

  const list = Array.from(usersMap.values())
    .filter((u) => u.username.toLowerCase().includes(searchTerm))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  list.forEach((user, index) => {
    const isChampion = index === 0;

    const item = document.createElement("div");
    item.className =
      "ranking-item" +
      (user.id === currentUser.uid ? " ranking-me" : "") +
      (isChampion ? " champion-highlight" : "");

    item.innerHTML = `
      <div class="ranking-pos">${index + 1}</div>
      <img src="${user.avatarUrl}" class="ranking-avatar" />
      <div class="ranking-name">
        <span>${user.username}</span>
        ${isChampion ? `<span class="champion-label">Campeão Geral</span>` : ""}
      </div>
      <div class="ranking-points">${user.totalPoints} pts</div>
    `;

    item.onclick = () =>
      (window.location.href = `user-profile.html?userId=${user.id}`);

    rankingListEl.appendChild(item);
  });
}

// --------- RANKING POR RODADA ---------

function updateRoundLabel() {
  roundLabelEl.textContent = `Rodada ${currentRound}`;
}

function renderRankingPorRodada() {
  rankingListEl.innerHTML = "";

  const roundFinished = finishedRounds.has(currentRound);
  const data = predictionsByRound[currentRound] || {};

  const list = Array.from(usersMap.values())
    .map((u) => ({
      ...u,
      roundPoints: data[u.id] || 0,
    }))
    .filter((u) => u.username.toLowerCase().includes(searchTerm))
    .sort((a, b) => b.roundPoints - a.roundPoints);

  list.forEach((user, index) => {
    const isChampion = index === 0 && roundFinished && user.roundPoints > 0;

    const item = document.createElement("div");
    item.className =
      "ranking-item" +
      (user.id === currentUser.uid ? " ranking-me" : "") +
      (isChampion ? " champion-highlight" : "");

    item.innerHTML = `
      <div class="ranking-pos">${index + 1}</div>
      <img src="${user.avatarUrl}" class="ranking-avatar" />
      <div class="ranking-name">
        <span>${user.username}</span>
        ${
          isChampion
            ? `<span class="champion-label">Campeão da Rodada</span>`
            : ""
        }
      </div>
      <div class="ranking-points">${user.roundPoints} pts</div>
    `;

    item.onclick = () =>
      (window.location.href = `user-profile.html?userId=${user.id}`);

    rankingListEl.appendChild(item);
  });
}
