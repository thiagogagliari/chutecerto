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

// container para usuários no admin (adicione em admin.html)
const adminUsersListEl = document.getElementById("admin-users-list");

// form de criação
const createMatchForm = document.getElementById("create-match-form");
const roundInput = document.getElementById("round");
const homeTeamInput = document.getElementById("home-team");
const awayTeamInput = document.getElementById("away-team");
const kickoffInput = document.getElementById("kickoff");
const homeLogoInput = document.getElementById("home-logo-url");
const awayLogoInput = document.getElementById("away-logo-url");
const createMatchBtn = document.getElementById("create-match-btn");

let currentUser = null;
let currentUserProfile = null;

// ==== LOGOUT ====
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

// ==== AUTENTICAÇÃO E VERIFICAÇÃO DE ADMIN ====
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

  // carregar lista de usuários (se container estiver presente)
  if (adminUsersListEl) {
    carregarUsuariosAdmin().catch((err) =>
      console.error("Erro ao carregar usuários:", err)
    );
  }
});

// ==== FUNÇÃO PARA CARREGAR JOGOS NO ADMIN ====
async function carregarJogosAdmin() {
  if (!matchesListEl) return;
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

  // ordenar por rodada e horário
  matches.sort((a, b) => {
    if (a.roundNumber !== b.roundNumber) {
      return a.roundNumber - b.roundNumber;
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
        <button type="button" class="btn-secondary" id="save-${
          match.id
        }">💾 Salvar</button>
        <button type="button" class="btn-secondary" id="delete-${
          match.id
        }">🗑 Apagar</button>
      </div>
    `;

    matchesListEl.appendChild(row);

    // listeners de salvar / deletar
    document
      .getElementById(`save-${match.id}`)
      .addEventListener("click", () => salvarJogo(match.id));

    document
      .getElementById(`delete-${match.id}`)
      .addEventListener("click", () => deletarJogo(match.id));
  });
}

// ==== CADASTRAR NOVO JOGO ====
if (createMatchBtn) {
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
}

// ==== SALVAR JOGO (status e placar) ====
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

// ==== APAGAR JOGO ====
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

// ==== FUNÇÃO DE PONTUAÇÃO ====
// Regras (que combinamos):
// - Resultado correto (acertar vencedor ou empate): +3
// - Acertar gols do mandante: +2
// - Acertar gols do visitante: +2
// - Acertar diferença de gols: +3
// - Se usou bônus 2x: total * 2
function calcularPontosJogo(realHome, realAway, predHome, predAway, usedBonus) {
  let pontos = 0;

  const diffReal = realHome - realAway;
  const diffPred = predHome - predAway;

  const resReal = diffReal > 0 ? "H" : diffReal < 0 ? "A" : "D";
  const resPred = diffPred > 0 ? "H" : diffPred < 0 ? "A" : "D";

  // resultado (vencedor/empate)
  if (resReal === resPred) {
    pontos += 3;
  }

  // gols do mandante
  if (realHome === predHome) {
    pontos += 2;
  }

  // gols do visitante
  if (realAway === predAway) {
    pontos += 2;
  }

  // diferença de gols
  if (diffReal === diffPred) {
    pontos += 3;
  }

  if (usedBonus) {
    pontos *= 2;
  }

  return pontos;
}

// ==== RECALCULAR PONTUAÇÃO PARA UM JOGO FINALIZADO ====
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

    // atualizar prediction
    const predRef = doc(db, "predictions", predId);
    await updateDoc(predRef, { points: newPoints });

    // ajustar totalPoints do usuário
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

// ==== RESETAR PONTUAÇÃO PARA UM JOGO (quando não está finalizado) ====
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

    // zera a prediction
    const predRef = doc(db, "predictions", predId);
    await updateDoc(predRef, { points: 0 });

    // desconta do totalPoints do usuário
    // ajustar totalPoints do usuário
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
/* ============================
   NOVA PARTE: LISTAGEM DE USUÁRIOS (ADMIN)
   - mostra usuários com PIX mascarado
   - botão "Mostrar" recarrega do Firestore e permite copiar
   ============================ */

// máscara simples para exibir PIX parcialmente
function maskPix(pix) {
  if (!pix) return "—";
  const s = String(pix);
  if (s.length <= 6) {
    // ex: 123456 => **3456
    return s.replace(/.(?=.{2})/g, "*");
  }
  const prefix = s.slice(0, 3);
  const suffix = s.slice(-3);
  return `${prefix}...${suffix}`;
}

// carrega e renderiza usuários no admin
async function carregarUsuariosAdmin() {
  if (!adminUsersListEl) return;

  adminUsersListEl.innerHTML = "Carregando usuários...";

  const snaps = await getDocs(collection(db, "users"));
  const rows = [];

  snaps.forEach((uSnap) => {
    const u = uSnap.data();
    const uid = uSnap.id;
    rows.push({ uid, ...u });
  });

  // ordenar por username (opcional)
  rows.sort((a, b) => {
    const A = (a.username || a.displayName || a.uid || "").toLowerCase();
    const B = (b.username || b.displayName || b.uid || "").toLowerCase();
    return A.localeCompare(B);
  });

  // construir lista
  adminUsersListEl.innerHTML = "";
  if (!rows.length) {
    adminUsersListEl.innerHTML = "<div>Nenhum usuário cadastrado.</div>";
    return;
  }

  rows.forEach((u) => {
    const row = document.createElement("div");
    row.className = "admin-user-row";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "8px 6px";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.04)";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:600;">${
        u.username || u.displayName || u.uid
      }</div>
      <div style="font-size:0.9rem; opacity:0.85;">${u.email || ""}</div>
      <div style="font-size:0.85rem; opacity:0.8;">Time: ${
        u.favoriteTeamName || "-"
      }</div>
    `;

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "8px";

    const pixSpan = document.createElement("span");
    pixSpan.id = `pix-mask-${u.uid}`;
    pixSpan.textContent = maskPix(u.pixKey || "");
    pixSpan.style.fontFamily = "monospace";
    pixSpan.style.marginRight = "6px";

    const showBtn = document.createElement("button");
    showBtn.className = "btn-sm";
    showBtn.textContent = "Mostrar";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-sm";
    copyBtn.textContent = "Copiar";

    // montar
    right.appendChild(pixSpan);
    right.appendChild(showBtn);
    right.appendChild(copyBtn);
    row.appendChild(left);
    row.appendChild(right);
    adminUsersListEl.appendChild(row);

    // evento "Mostrar": recarrega do Firestore e exibe em prompt/confirm para copiar
    showBtn.addEventListener("click", async () => {
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const full = snap.exists() ? snap.data().pixKey || "" : "";
        if (!full) {
          alert("Usuário não cadastrou chave PIX.");
          return;
        }
        // opcional: atualizar a span com valor completo (mas cuidado com exposição)
        const wantReveal = confirm(
          `Chave PIX do usuário ${
            u.username || u.uid
          }:\n\n${full}\n\nClique OK para copiar para a área de transferência, Cancel para manter mascarado.`
        );
        if (wantReveal) {
          try {
            await navigator.clipboard.writeText(full);
            alert("Chave copiada para área de transferência.");
            // atualizar a máscara para mostrar (opcional)
            pixSpan.textContent = full;
          } catch {
            window.prompt("Copie a chave PIX abaixo:", full);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar chave PIX:", err);
        alert("Erro ao obter chave PIX.");
      }
    });

    // evento "Copiar": copia a chave atual (recarrega do Firestore para garantir valor)
    copyBtn.addEventListener("click", async () => {
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const full = snap.exists() ? snap.data().pixKey || "" : "";
        if (!full) {
          alert("Usuário não cadastrou chave PIX.");
          return;
        }
        try {
          await navigator.clipboard.writeText(full);
          alert("Chave PIX copiada!");
        } catch {
          window.prompt("Copie a chave PIX abaixo:", full);
        }
      } catch (err) {
        console.error("Erro ao copiar PIX:", err);
        alert("Erro ao copiar chave PIX.");
      }
    });
  });
}
