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
      "https://content001.bet365.bet.br/SoccerSilks/AtleticoMineiro_HomeFront_25_26.svg",
  },
  bahia: {
    name: "Bahia",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Bahia_HomeFront_25_26.svg",
  },
  botafogorj: {
    name: "Botafogo/RJ",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Botafogo_Front_Home_25_26.svg",
  },
  bragantino: {
    name: "RB Bragantino",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Red%20Bull%20Bragantino_Home_25_26.svg",
  },
  ceara: {
    name: "Ceará",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Ceara_Home_front_25_26.svg",
  },
  corinthians: {
    name: "Corinthians",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Corinthians_Front_2526.svg",
  },
  cruzeiro: {
    name: "Cruzeiro",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Cruzeiro_Home_front_25_26.svg",
  },
  flamengo: {
    name: "Flamengo",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Flamengo_Home_25.svg",
  },
  fluminense: {
    name: "Fluminense",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Fluminense_Home_25.svg",
  },
  fortaleza: {
    name: "Fortaleza",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Fortaleza_Home_Front_2526.svg",
  },
  gremio: {
    name: "Grêmio",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Gremio_home_front_25_26.svg",
  },
  internacional: {
    name: "Internacional/RS",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Internacional_HomeFront_25_26.svg",
  },
  juventude: {
    name: "Juventude",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Juventude_home_front_25_26.svg",
  },
  mirassol: {
    name: "Mirassol",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Mirassol_HomeFront_25_26.svg",
  },
  palmeiras: {
    name: "Palmeiras",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Palmeiras%20Home%2025_26.svg",
  },
  santos: {
    name: "Santos",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Santos%20home_front_25_26.svg",
  },
  saopaulo: {
    name: "São Paulo",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Sao%20Paulo%20Home_front25_26.svg",
  },
  sportrecife: {
    name: "Sport Recife",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Sport%20Recife%20Home%2025_26.svg",
  },
  vitoria: {
    name: "Vitória/BA",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Vitoria%20Home_front_25_26.svg",
  },
  vasco: {
    name: "Vasco",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Serie%20A%20Vasco_Da_Gama_Home_Front_25_26.svg",
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
      "https://static.flashscore.com/res/image/data/E9b6grZg-WQONyUDH.png",
  },
  arsenal: {
    name: "Arsenal",
    logoUrl:
      "https://content001.bet365.bet.br/SoccerSilks/Arsenal_HomeFront_25_26.svg",
  },
  // adicione outros times aqui
};

// CADASTRO
if (signupBtn) {
  signupBtn.addEventListener("click", async () => {
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const favoriteTeamId = document.getElementById("favorite-team").value;

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

    try {
      // verifica se username já existe
      // (mantém a sua lógica anterior de Firestore se tiver)
      // ...

      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
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
