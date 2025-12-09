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
let usersMap = new Map(); // userId -> { username, avatarUrl, totalPoints }
let predictionsByRound = {}; // roundNumber -> { userId -> pontosNaRodada }
let rounds = []; // [1, 2, 3, ...]
let currentRound = null;
let currentMode = "geral"; // "geral" ou "round"
let searchTerm = ""; // filtro pelo nome do usuário

// 🔹 NOVOS: pagamentos e prêmios por rodada
let paidByRound = {}; // roundNumber -> Set(userId)
let prizeByRound = {}; // roundNumber -> { totalAmount, enabled, positions }

// logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// busca
searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  if (currentMode === "geral") {
    renderRankingGeral();
  } else {
    renderRankingPorRodada();
  }
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
  if (!rounds.length) {
    rankingListEl.innerHTML = "Ainda não há rodadas com pontuação.";
    currentUserInfoEl.textContent = "";
    return;
  }
  if (currentRound === null) {
    currentRound = rounds[rounds.length - 1]; // última rodada com pontos
  }
  updateRoundLabel();
  renderRankingPorRodada();
});

// navegação entre rodadas
prevRoundBtn.addEventListener("click", () => {
  if (!rounds.length || currentRound === null) return;
  const idx = rounds.indexOf(currentRound);
  if (idx > 0) {
    currentRound = rounds[idx - 1];
    updateRoundLabel();
    renderRankingPorRodada();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

nextRoundBtn.addEventListener("click", () => {
  if (!rounds.length || currentRound === null) return;
  const idx = rounds.indexOf(currentRound);
  if (idx >= 0 && idx < rounds.length - 1) {
    currentRound = rounds[idx + 1];
    updateRoundLabel();
    renderRankingPorRodada();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// autenticação
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  rankingListEl.innerHTML = "Carregando ranking...";

  // carregar dados
  await carregarUsuarios();
  await carregarPredictions();
  await carregarRoundEntries(); // 🔹 quem pagou
  await carregarRoundPrizes(); // 🔹 prêmio por rodada

  // modo padrão: geral
  currentMode = "geral";
  modeGeralBtn.classList.add("active");
  modeRoundBtn.classList.remove("active");
  roundNavEl.classList.add("hidden");

  renderRankingGeral();
});

// --------- Carregamento de dados ---------

async function carregarUsuarios() {
  usersMap = new Map();

  const snapshot = await getDocs(collection(db, "users"));
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    usersMap.set(docSnap.id, {
      id: docSnap.id,
      username: data.username || "sem_nome",
      avatarUrl: data.avatarUrl || "",
      totalPoints: data.totalPoints || 0,
      favoriteTeamName: data.favoriteTeamName || "",
    });
  });
}

async function carregarPredictions() {
  predictionsByRound = {};
  rounds = [];

  const snapshot = await getDocs(collection(db, "predictions"));

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const roundNumber = Number(data.round) || 0;
    const userId = data.userId;
    const points = data.points || 0;

    if (!roundNumber || !userId) return;

    if (!predictionsByRound[roundNumber]) {
      predictionsByRound[roundNumber] = {};
    }
    if (!predictionsByRound[roundNumber][userId]) {
      predictionsByRound[roundNumber][userId] = 0;
    }
    predictionsByRound[roundNumber][userId] += points;
  });

  rounds = Object.keys(predictionsByRound)
    .map((r) => Number(r))
    .filter((r) => !isNaN(r))
    .sort((a, b) => a - b);

  // rodada padrão para modo por rodada: última com pontos
  if (rounds.length && currentRound === null) {
    currentRound = rounds[rounds.length - 1];
  }
}

// 🔹 NOVO: quem pagou por rodada (roundEntries)
async function carregarRoundEntries() {
  paidByRound = {};

  const snapshot = await getDocs(collection(db, "roundEntries"));
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const roundNumber = Number(data.round) || 0;
    const userId = data.userId;

    if (!roundNumber || !userId) return;

    if (!paidByRound[roundNumber]) {
      paidByRound[roundNumber] = new Set();
    }
    paidByRound[roundNumber].add(userId);
  });
}

// 🔹 NOVO: prêmio por rodada (roundPrizes)
async function carregarRoundPrizes() {
  prizeByRound = {};

  const snapshot = await getDocs(collection(db, "roundPrizes"));
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    let roundNumber = Number(data.round) || 0;
    if (!roundNumber) {
      // fallback: tenta pelo próprio id do doc
      roundNumber = Number(docSnap.id) || 0;
    }
    if (!roundNumber) return;

    prizeByRound[roundNumber] = {
      totalAmount: data.totalAmount || 0,
      enabled: data.enabled !== false,
      positions: data.positions || 1,
    };
  });
}

// --------- Ranking Geral ---------

function renderRankingGeral() {
  rankingListEl.innerHTML = "";

  const usersArray = Array.from(usersMap.values());

  if (!usersArray.length) {
    rankingListEl.innerHTML = "Nenhum usuário encontrado.";
    currentUserInfoEl.textContent = "";
    return;
  }

  // filtro por nome
  const filtrados = usersArray.filter((u) =>
    u.username.toLowerCase().includes(searchTerm)
  );

  if (!filtrados.length) {
    rankingListEl.innerHTML = "Nenhum usuário encontrado para essa busca.";
    currentUserInfoEl.textContent = "";
    return;
  }

  // ordena por totalPoints desc, depois por username
  filtrados.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.username.localeCompare(b.username);
  });

  const meIndex = filtrados.findIndex((u) => u.id === currentUser.uid);
  const minhaPosicao = meIndex >= 0 ? meIndex + 1 : "-";
  const meusPontos = meIndex >= 0 ? filtrados[meIndex].totalPoints : 0;

  currentUserInfoEl.innerHTML = `
    <p>Ranking geral: você está na posição <strong>${minhaPosicao}</strong> com 
    <strong>${meusPontos}</strong> pontos.</p>
  `;

  filtrados.forEach((user, index) => {
    const pos = index + 1;

    let posLabel = pos;
    let medalClass = "";
    if (pos === 1) {
      posLabel = "1º";
      medalClass = "medal-gold";
    } else if (pos === 2) {
      posLabel = "2º";
      medalClass = "medal-silver";
    } else if (pos === 3) {
      posLabel = "3º";
      medalClass = "medal-bronze";
    }

    const item = document.createElement("div");
    item.className =
      "ranking-item" + (user.id === currentUser.uid ? " ranking-me" : "");

    const avatarHtml = user.avatarUrl
      ? `<img src="${user.avatarUrl}" class="ranking-avatar" />`
      : `<div class="ranking-avatar-placeholder"></div>`;

    item.innerHTML = `
      <div class="ranking-pos ${medalClass}">${posLabel}</div>
      <div>${avatarHtml}</div>
      <div class="ranking-name">
        <div>${user.username}</div>
        ${
          user.favoriteTeamName
            ? `<div class="ranking-team">Time do coração: ${user.favoriteTeamName}</div>`
            : ""
        }
      </div>
      <div class="ranking-points">${user.totalPoints} pts</div>
      <div class="ranking-move move-same">–</div>
    `;

    // clique para ver perfil
    item.addEventListener("click", () => {
      window.location.href = `user-profile.html?userId=${user.id}`;
    });

    rankingListEl.appendChild(item);
  });
}

// --------- Ranking por rodada ---------

function updateRoundLabel() {
  if (!rounds.length || currentRound === null) {
    roundLabelEl.textContent = "Nenhuma rodada";
    prevRoundBtn.disabled = true;
    nextRoundBtn.disabled = true;
    return;
  }

  roundLabelEl.textContent = `Rodada ${currentRound}`;

  const idx = rounds.indexOf(currentRound);
  prevRoundBtn.disabled = idx <= 0;
  nextRoundBtn.disabled = idx === -1 || idx >= rounds.length - 1;
}

function renderRankingPorRodada() {
  rankingListEl.innerHTML = "";

  if (!rounds.length || currentRound === null) {
    rankingListEl.innerHTML = "Ainda não há rodadas com pontuação.";
    currentUserInfoEl.textContent = "";
    return;
  }

  const roundPoints = predictionsByRound[currentRound] || {};

  // monta ranking da rodada atual
  let rankingAtual = [];
  usersMap.forEach((user, userId) => {
    const ptsRodada = roundPoints[userId] || 0;
    rankingAtual.push({
      ...user,
      roundPoints: ptsRodada,
    });
  });

  // filtro por nome
  rankingAtual = rankingAtual.filter((u) =>
    u.username.toLowerCase().includes(searchTerm)
  );

  if (!rankingAtual.length) {
    rankingListEl.innerHTML =
      "Nenhum usuário encontrado para essa busca nesta rodada.";
    currentUserInfoEl.textContent = "";
    return;
  }

  // usuários com mais pontos na rodada primeiro
  rankingAtual.sort((a, b) => {
    if (b.roundPoints !== a.roundPoints) {
      return b.roundPoints - a.roundPoints;
    }
    // desempate por totalPoints geral
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.username.localeCompare(b.username);
  });

  // ranking da rodada anterior (para comparar sobe / desce)
  let rankingAnterior = [];
  let posAnteriorMap = new Map(); // userId -> posição na rodada anterior

  const idxRound = rounds.indexOf(currentRound);
  if (idxRound > 0) {
    const roundAnterior = rounds[idxRound - 1];
    const roundPointsAnt = predictionsByRound[roundAnterior] || {};

    rankingAnterior = [];
    usersMap.forEach((user, userId) => {
      const ptsRodadaAnt = roundPointsAnt[userId] || 0;
      rankingAnterior.push({
        ...user,
        roundPoints: ptsRodadaAnt,
      });
    });

    rankingAnterior.sort((a, b) => {
      if (b.roundPoints !== a.roundPoints) {
        return b.roundPoints - a.roundPoints;
      }
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.username.localeCompare(b.username);
    });

    rankingAnterior.forEach((u, index) => {
      posAnteriorMap.set(u.id, index + 1);
    });
  }

  // 🔹 info de pagamento e prêmio pro usuário logado
  const paidSet = paidByRound[currentRound] || new Set();
  const paidCount = paidSet.size || 0;
  const userIsPaid = paidSet.has(currentUser.uid);

  const prizeInfo = prizeByRound[currentRound];
  let prizeText = "";

  if (prizeInfo && prizeInfo.enabled && prizeInfo.totalAmount > 0) {
    prizeText = `Prêmio da rodada: <strong>R$ ${prizeInfo.totalAmount},00</strong> com ${paidCount} participante(s) pago(s).`;
  } else if (paidCount > 0) {
    const totalAmount = paidCount * 10;
    prizeText = `Prêmio estimado da rodada: <strong>R$ ${totalAmount},00</strong> com ${paidCount} participante(s) pago(s).`;
  } else {
    prizeText = `Nenhum pagamento registrado ainda para esta rodada.`;
  }

  const meIndex = rankingAtual.findIndex((u) => u.id === currentUser.uid);
  const minhaPosicao = meIndex >= 0 ? meIndex + 1 : "-";
  const meusPontosRodada = meIndex >= 0 ? rankingAtual[meIndex].roundPoints : 0;

  const paymentStatusText = userIsPaid
    ? `Status de pagamento: <span class="badge-inline badge-paid-inline">✅</span>`
    : `Status de pagamento: <span class="badge-inline badge-unpaid-inline">⛔</span>`;

  currentUserInfoEl.innerHTML = `
    <p>Rodada ${currentRound}: você está na posição <strong>${minhaPosicao}</strong> com 
    <strong>${meusPontosRodada}</strong> pontos nesta rodada.</p>
    <p>${paymentStatusText}</p>
    <p>${prizeText}</p>
  `;

  // renderizar linhas
  rankingAtual.forEach((user, index) => {
    const pos = index + 1;
    const ptsRodada = user.roundPoints;

    let posLabel = pos;
    let medalClass = "";
    if (pos === 1 && ptsRodada > 0) {
      posLabel = "🥇";
      medalClass = "medal-gold";
    } else if (pos === 2 && ptsRodada > 0) {
      posLabel = "🥈";
      medalClass = "medal-silver";
    } else if (pos === 3 && ptsRodada > 0) {
      posLabel = "🥉";
      medalClass = "medal-bronze";
    }

    // cálculo de sobe/desce
    let moveLabel = "–";
    let moveClass = "move-same";

    const posAnterior = posAnteriorMap.size
      ? posAnteriorMap.get(user.id)
      : null;
    if (posAnterior == null) {
      if (ptsRodada > 0 && idxRound > 0) {
        moveLabel = "🆕 novo";
        moveClass = "move-new";
      } else {
        moveLabel = "–";
        moveClass = "move-same";
      }
    } else {
      const diff = posAnterior - pos; // se diff > 0 => subiu
      if (diff > 0) {
        moveLabel = `🔺 +${diff}`;
        moveClass = "move-up";
      } else if (diff < 0) {
        moveLabel = `🔻 ${diff}`;
        moveClass = "move-down";
      } else {
        moveLabel = "➖ 0";
        moveClass = "move-same";
      }
    }

    // 🔹 selo pago/não pago
    const paidSetForRound = paidByRound[currentRound] || new Set();
    const isPaid = paidSetForRound.has(user.id);
    const seloHtml = isPaid
      ? `<span class="ranking-badge ranking-badge-paid">✅</span>`
      : `<span class="ranking-badge ranking-badge-unpaid">⛔</span>`;

    const item = document.createElement("div");
    item.className =
      "ranking-item" + (user.id === currentUser.uid ? " ranking-me" : "");

    const avatarHtml = user.avatarUrl
      ? `<img src="${user.avatarUrl}" class="ranking-avatar" />`
      : `<div class="ranking-avatar-placeholder"></div>`;

    item.innerHTML = `
      <div class="ranking-pos ${medalClass}">${posLabel}</div>
      <div>${avatarHtml}</div>
      <div class="ranking-name">
        <div class="ranking-name-main">
          <span>${user.username}</span>
          ${seloHtml}
        </div>
        ${
          user.favoriteTeamName
            ? `<div class="ranking-team">Time do coração: ${user.favoriteTeamName}</div>`
            : ""
        }
      </div>
      <div class="ranking-points">${ptsRodada} pts</div>
      <div class="ranking-move ${moveClass}">${moveLabel}</div>
    `;

    // clique para ver perfil
    item.addEventListener("click", () => {
      window.location.href = `user-profile.html?userId=${user.id}`;
    });

    rankingListEl.appendChild(item);
  });
}
