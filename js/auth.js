// js/auth.js
import { auth, db, storage } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");

// LOGIN
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      console.error(err);
      alert("Erro ao entrar: " + err.message);
    }
  });
}

// Mapeamento de times do coração -> nome + escudo
const TEAMS = {
  atleticomg: {
    name: "Atlético/MG",
    logoUrl:
      "https://static.flashscore.com/res/image/data/WbSJHDh5-UHhQ6Y1N.png",
  },
  bahia: {
    name: "Bahia",
    logoUrl:
      "https://static.flashscore.com/res/image/data/f5V5z1Cr-dKUmd286.png",
  },
  botafogorj: {
    name: "Botafogo/RJ",
    logoUrl:
      "https://static.flashscore.com/res/image/data/jBDSUABr-ldMpXQG1.png",
  },
  bragantino: {
    name: "RB Bragantino",
    logoUrl:
      "https://static.flashscore.com/res/image/data/llnonZDa-UkMF8Udb.png",
  },
  ceara: {
    name: "Ceará",
    logoUrl:
      "https://static.flashscore.com/res/image/data/lO0NK6f5-GxV9h1lf.png",
  },
  corinthians: {
    name: "Corinthians",
    logoUrl:
      "https://static.flashscore.com/res/image/data/lY91WW9r-6cpWH3kh.png",
  },
  cruzeiro: {
    name: "Cruzeiro",
    logoUrl:
      "https://static.flashscore.com/res/image/data/lCWrxmg5-SjJmyx86.png",
  },
  flamengo: {
    name: "Flamengo",
    logoUrl:
      "https://static.flashscore.com/res/image/data/ADvIaiZA-2R2JjDQC.png",
  },
  fluminense: {
    name: "Fluminense",
    logoUrl:
      "https://static.flashscore.com/res/image/data/WlxJgSdM-WUfDDYk1.png",
  },
  fortaleza: {
    name: "Fortaleza",
    logoUrl:
      "https://static.flashscore.com/res/image/data/ObufU2YA-MyVrJL5S.png",
  },
  gremio: {
    name: "Grêmio",
    logoUrl:
      "https://static.flashscore.com/res/image/data/QPdJscAr-tQsU6dGl.png",
  },
  internacional: {
    name: "Internacional/RS",
    logoUrl:
      "https://static.flashscore.com/res/image/data/4EdoEoil-ALgHCh57.png",
  },
  juventude: {
    name: "Juventude",
    logoUrl:
      "https://static.flashscore.com/res/image/data/CA0V6qXg-v5wBaFPD.png",
  },
  mirassol: {
    name: "Mirassol",
    logoUrl:
      "https://static.flashscore.com/res/image/data/SUmYTyAr-fVnYQB8j.png",
  },
  palmeiras: {
    name: "Palmeiras",
    logoUrl:
      "https://static.flashscore.com/res/image/data/xCtpyPHG-ALgHCh57.png",
  },
  santos: {
    name: "Santos",
    logoUrl:
      "https://static.flashscore.com/res/image/data/rJGaKUhl-hv442jSk.png",
  },
  saopaulo: {
    name: "São Paulo",
    logoUrl:
      "https://static.flashscore.com/res/image/data/YgK3qNCa-AkTesf41.png",
  },
  sportrecife: {
    name: "Sport Recife",
    logoUrl:
      "https://static.flashscore.com/res/image/data/O0aua6ZA-fezSJdFa.png",
  },
  vitoria: {
    name: "Vitória/BA",
    logoUrl:
      "https://static.flashscore.com/res/image/data/EglYBtxS-QwRlGht5.png",
  },
  vasco: {
    name: "Vasco",
    logoUrl:
      "https://static.flashscore.com/res/image/data/d2irXNjl-bam8o1Nj.png",
  },
  remo: {
    name: "Remo",
    logoUrl:
      "https://static.flashscore.com/res/image/data/dWTc9iBr-vsDPUWUH.png",
  },
  athletico: {
    name: "Athletico/PR",
    logoUrl:
      "https://static.flashscore.com/res/image/data/SdnmINcM-QaMaOfUh.png",
  },
  coritiba: {
    name: "Coritiba",
    logoUrl:
      "https://static.flashscore.com/res/image/data/xKm8lie5-bwYqIWsq.png",
  },
  chapecoense: {
    name: "Chapecoense",
    logoUrl:
      "https://static.flashscore.com/res/image/data/v9EKoUeM-CYex0lQl.png",
  },
  goias: {
    name: "Goiás",
    logoUrl:
      "https://static.flashscore.com/res/image/data/xd3edbeM-G2OQQubE.png",
  },
  vilanovago: {
    name: "Vila Nova/GO",
    logoUrl:
      "https://static.flashscore.com/res/image/data/GMMaJNh5-OjIDDdYc.png",
  },
  paysandu: {
    name: "Paysandu",
    logoUrl:
      "https://static.flashscore.com/res/image/data/OY3H2Kf5-zysCBcpf.png",
  },
  criciuma: {
    name: "Criciúma",
    logoUrl:
      "https://static.flashscore.com/res/image/data/E9b6grZg-0tyg52jq.png",
  },
  // adicione outros times aqui
};

// Validação simples de PIX: aceita email, telefone (apenas dígitos), CPF (11 dígitos) ou chave aleatória (>=8)
function isValidPixKey(k) {
  if (!k) return false;
  const v = k.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const digitsOnly = /^\d+$/;
  const cpfOnly = /^\d{11}$/;
  if (emailRe.test(v)) return true;
  if (cpfOnly.test(v)) return true;
  if (digitsOnly.test(v) && v.length >= 8 && v.length <= 15) return true;
  if (v.length >= 8) return true; // chave aleatória
  return false;
}

// CADASTRO
if (signupBtn) {
  signupBtn.addEventListener("click", async () => {
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const favoriteTeamId = document.getElementById("favorite-team").value;
    // novo input PIX no form de cadastro (opcional)
    const pixKeyInput = document.getElementById("signup-pix");
    const pixKey = pixKeyInput ? pixKeyInput.value.trim() : "";

    if (!username || !email || !password) {
      alert("Preencha username, email e senha.");
      return;
    }

    if (!favoriteTeamId) {
      alert("Selecione seu time do coração.");
      return;
    }

    const team = TEAMS[favoriteTeamId];
    if (!team) {
      alert("Time inválido. Tente novamente.");
      return;
    }

    // validar pixKey se preenchido
    if (pixKey && !isValidPixKey(pixKey)) {
      alert(
        "Chave PIX inválida. Informe email, CPF, telefone ou chave aleatória válida.",
      );
      return;
    }

    try {
      // verifica se username já existe (opcional)
      // você pode manter sua lógica de verificação com query se quiser.
      // Exemplo (descomentado) para impedir usernames duplicados:
      // const q = query(collection(db, "users"), where("username", "==", username));
      // const snaps = await getDocs(q);
      // if (!snaps.empty) { alert("Username já em uso."); return; }

      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCred.user;

      await setDoc(doc(db, "users", user.uid), {
        username,
        displayName: username,
        email,
        avatarUrl: team.logoUrl,
        favoriteTeamId,
        favoriteTeamName: team.name,
        role: "user",
        createdAt: new Date(),
        totalPoints: 0,
        bonusUsage: {},
        pixKey: pixKey || "",
      });

      alert("Cadastro realizado com sucesso!");
      window.location.href = "dashboard.html";
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        alert("Este email já está cadastrado. Use outro ou faça login.");
      } else {
        alert("Erro ao cadastrar: " + err.message);
      }
    }
  });
}

// Se já tiver logado e acessar index, pode redirecionar
onAuthStateChanged(auth, (user) => {
  // Se quiser, pode redirecionar automático
  // if (user) window.location.href = "dashboard.html";
});
