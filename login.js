// login.js - Firebase authentication for QUARTRIX login

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCP-Gha19gZ6ZkYCzZ9vh9QL2tKYmNVoCk",
  authDomain: "quartrix-eb95f.firebaseapp.com",
  databaseURL: "https://quartrix-eb95f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quartrix-eb95f",
  storageBucket: "quartrix-eb95f.firebasestorage.app",
  messagingSenderId: "589369640106",
  appId: "1:589369640106:web:7239da0bd98bae284fbcd3",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Fungsi login yang dipanggil dari HTML
window.login = async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const rememberMe = document.getElementById("rememberMe")?.checked || false;
  const errorMsg = document.getElementById("errorMsg");
  const loginBtn = document.getElementById("loginBtn");

  errorMsg.style.display = "none";

  /* ADMIN */
  if (username === "admin" && password === "admin123") {
    try {
      // Firebase Anonymous Auth untuk dapat uid
      const userCredential = await signInAnonymously(auth);
      const uid = userCredential.uid;
      
      // Simpan status admin ke Firebase database
      await set(ref(db, "admin/" + uid), {
        isAdmin: true,
        nama: "ADMIN",
        createdAt: new Date().toISOString()
      });
      
      // Simpan ke localStorage
      localStorage.setItem("isLogin", "true");
      localStorage.setItem("role", "admin");
      localStorage.setItem("nama", "ADMIN");
      localStorage.setItem("absen", "-");
      localStorage.setItem("uid", uid);
      
      // Remember Me - Simpan kredensial jika checkbox dicentang
      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("savedUsername", username);
        localStorage.setItem("savedPassword", password);
      } else {
        localStorage.setItem("rememberMe", "false");
        localStorage.removeItem("savedUsername");
        localStorage.removeItem("savedPassword");
      }
      
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Error during admin login:", error);
      errorMsg.innerText = "Terjadi kesalahan saat login. Silakan coba lagi.";
      errorMsg.style.display = "block";
    }
    return;
  }

  /* SISWA - Validasi dengan Firebase */
  if (!username || !password) {
    errorMsg.innerText = "Isi nama dan absen!";
    errorMsg.style.display = "block";
    return;
  }

  // Show loading state
  loginBtn.classList.add("loading");
  loginBtn.textContent = "Masuk...";

  try {
    const userRef = ref(db, "siswa/" + password);
    const snapshot = await get(userRef);

    // Remove loading state
    loginBtn.classList.remove("loading");
    loginBtn.textContent = "Masuk";

    if (snapshot.exists()) {
      const data = snapshot.val();
      // Validasi nama (case-insensitive)
      if (data.nama.toLowerCase() === username.toLowerCase()) {
        try {
          const userCredential = await signInAnonymously(auth);
          const uid = userCredential.uid;
          
          localStorage.setItem("isLogin", "true");
          localStorage.setItem("role", "siswa");
          localStorage.setItem("nama", data.nama);
          localStorage.setItem("absen", password);
          localStorage.setItem("uid", uid);
          
          // Remember Me - Simpan kredensial jika checkbox dicentang
          if (rememberMe) {
            localStorage.setItem("rememberMe", "true");
            localStorage.setItem("savedUsername", username);
            localStorage.setItem("savedPassword", password);
          } else {
            localStorage.setItem("rememberMe", "false");
            localStorage.removeItem("savedUsername");
            localStorage.removeItem("savedPassword");
          }
          
          window.location.href = "dashboard.html";
        } catch (authError) {
          console.error("Error during auth:", authError);
          errorMsg.innerText = "Terjadi kesalahan saat autentikasi. Silakan coba lagi.";
          errorMsg.style.display = "block";
        }
      } else {
        errorMsg.innerText = "Nama tidak cocok dengan absen!";
        errorMsg.style.display = "block";
      }
    } else {
      errorMsg.innerText = "Absen tidak ditemukan! Pastikan absen sudah terdaftar atau gunakan absen baru jika sudah diubah.";
      errorMsg.style.display = "block";
    }
  } catch (error) {
    console.error("Error during login:", error);
    loginBtn.classList.remove("loading");
    loginBtn.textContent = "Masuk";
    errorMsg.innerText = "Terjadi kesalahan. Silakan coba lagi.";
    errorMsg.style.display = "block";
  }
};

// Allow Enter key to submit and check for Remember Me on page load
document.addEventListener("DOMContentLoaded", () => {
  // CHECK: Jika user sudah login (Remember Me), redirect ke dashboard
  const isLogin = localStorage.getItem("isLogin");
  if (isLogin === "true") {
    // User sudah login, redirect ke dashboard
    window.location.href = "dashboard.html";
    return;
  }
  
  // LOAD: Isi otomatis jika ada data Remember Me
  const rememberMe = localStorage.getItem("rememberMe");
  if (rememberMe === "true") {
    const savedUsername = localStorage.getItem("savedUsername");
    const savedPassword = localStorage.getItem("savedPassword");
    
    if (savedUsername) {
      document.getElementById("username").value = savedUsername;
    }
    if (savedPassword) {
      document.getElementById("password").value = savedPassword;
    }
    
    // Centang checkbox Remember Me
    const rememberMeCheckbox = document.getElementById("rememberMe");
    if (rememberMeCheckbox) {
      rememberMeCheckbox.checked = true;
    }
  }
  
  const passwordInput = document.getElementById("password");
  const usernameInput = document.getElementById("username");

  if (passwordInput) {
    passwordInput.addEventListener("keypress", function(event) {
      if (event.key === "Enter") {
        window.login();
      }
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener("keypress", function(event) {
      if (event.key === "Enter") {
        passwordInput.focus();
      }
    });
  }
});
