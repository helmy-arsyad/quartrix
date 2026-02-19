// login.js - Firebase authentication for QUARTRIX login
// FIXED: iOS Safari authentication issues

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

// Fungsi untuk mendeteksi apakah browser adalah iOS Safari
function isIOSafari() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua);
}

// Flag untuk mencegah double setup persistence
let persistenceSetupAttempted = false;

// Fungsi untuk setup Firebase Auth persistence
// FIX: PENTING - Persistence harus di-set SEBELUM operasi auth apapun
async function setupAuthPersistence() {
  // Cegah double setup
  if (persistenceSetupAttempted) {
    console.log("Persistence already setup, skipping...");
    return auth.currentUser || null;
  }
  
  persistenceSetupAttempted = true;
  
  try {
    // Cek apakah sudah ada session yang aktif
    if (auth.currentUser) {
      console.log("User already logged in:", auth.currentUser.uid);
      return auth.currentUser;
    }
    
    // 🔥 FIX UTAMA: Tentukan persistence berdasarkan browser SEBELUM auth operation
    // iOS Safari → Gunakan session persistence (lebih stabil)
    // Browser lain → Gunakan local persistence
    if (isIOSafari()) {
      await setPersistence(auth, browserSessionPersistence);
      console.log("iOS Safari → session persistence");
    } else {
      await setPersistence(auth, browserLocalPersistence);
      console.log("Other browsers → local persistence");
    }
    
    // Debug info untuk iOS
    console.log("[iOS Debug] User Agent:", navigator.userAgent);
    console.log("[iOS Debug] isIOSafari:", isIOSafari());
    console.log("[iOS Debug] LocalStorage available:", typeof localStorage !== 'undefined');
    
    return null;
  } catch (error) {
    console.error("Error setting auth persistence:", error);
    return null;
  }
}

// Fungsi untuk tunggu auth state siap (FIX #2)
// Ini krusial di Safari - jangan redirect sebelum auth state ready
function waitForAuthState() {
  return new Promise((resolve) => {
    // Langsung cek jika sudah ada user
    if (auth.currentUser) {
      console.log("User already available:", auth.currentUser.uid);
      resolve(auth.currentUser);
      return;
    }
    
    // Kalau belum ada, tunggu onAuthStateChanged
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        unsub();
        console.log("Auth state ready:", user.uid);
        resolve(user);
      }
    });
  });
}

// Fungsi untuk anonymous sign-in TANPA retry (FIX #3)
// Firebase Auth tidak boleh di-retry karena akan merusak internal state
async function signInOnce() {
  // Setup persistence SEBELUM login (penting!)
  await setupAuthPersistence();
  
  try {
    console.log("Anonymous sign-in attempt (1x only)");
    const result = await signInAnonymously(auth);
    console.log("Anonymous sign-in successful:", result.user.uid);
    
    // 🔥 FIX: Tunggu auth state benar-benar siap sebelum return
    await waitForAuthState();
    
    return result;
  } catch (error) {
    console.error("Anonymous sign-in failed:", error.message);
    throw error;
  }
}

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
      // Firebase Anonymous Auth - 1x saja, tunggu auth state ready
      const userCredential = await signInOnce();
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
      
      // Remember Me - Handle berbeda untuk iOS Safari (FIX #4)
      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("savedUsername", username);
        // 🔥 FIX: Jangan simpan password di iOS Safari
        if (!isIOSafari()) {
          localStorage.setItem("savedPassword", password);
        } else {
          localStorage.removeItem("savedPassword");
          console.log("iOS Safari: Password not saved for security");
        }
      } else {
        localStorage.setItem("rememberMe", "false");
        localStorage.removeItem("savedUsername");
        localStorage.removeItem("savedPassword");
      }
      
      // 🔥 FIX: Redirect setelah auth state siap
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Error during admin login:", error);
      
      // Berikan pesan error yang lebih spesifik
      let errorMessage = "Terjadi kesalahan saat login. Silakan coba lagi.";
      if (error.code === "auth/network-request-failed") {
        errorMessage = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.";
      } else if (error.code === "auth/popup-closed-by-user") {
        errorMessage = "Popup ditutup sebelum proses selesai. Silakan coba lagi.";
      } else if (error.code === "auth/internal-error") {
        errorMessage = "Terjadi kesalahan internal. Silakan coba lagi.";
      } else if (error.message && error.message.includes("net::ERR_CONNECTION_REFUSED")) {
        errorMessage = "Tidak dapat terhubung ke server. Silakan coba lagi nanti.";
      }
      
      errorMsg.innerText = errorMessage;
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
          // Gunakan 1x login saja, tunggu auth state ready
          const userCredential = await signInOnce();
          const uid = userCredential.uid;
          
          localStorage.setItem("isLogin", "true");
          localStorage.setItem("role", "siswa");
          localStorage.setItem("nama", data.nama);
          localStorage.setItem("absen", password);
          localStorage.setItem("uid", uid);
          
          // Remember Me - Handle berbeda untuk iOS Safari (FIX #4)
          if (rememberMe) {
            localStorage.setItem("rememberMe", "true");
            localStorage.setItem("savedUsername", username);
            // 🔥 FIX: Jangan simpan password di iOS Safari
            if (!isIOSafari()) {
              localStorage.setItem("savedPassword", password);
            } else {
              localStorage.removeItem("savedPassword");
              console.log("iOS Safari: Password not saved for security");
            }
          } else {
            localStorage.setItem("rememberMe", "false");
            localStorage.removeItem("savedUsername");
            localStorage.removeItem("savedPassword");
          }
          
          // 🔥 FIX: Redirect setelah auth state siap
          window.location.href = "dashboard.html";
        } catch (authError) {
          console.error("Error during auth:", authError);
          
          // Berikan pesan error yang lebih spesifik
          let errorMessage = "Terjadi kesalahan saat autentikasi. Silakan coba lagi.";
          if (authError.code === "auth/network-request-failed") {
            errorMessage = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.";
          } else if (authError.code === "auth/popup-closed-by-user") {
            errorMessage = "Popup ditutup sebelum proses selesai. Silakan coba lagi.";
          } else if (authError.code === "auth/internal-error") {
            errorMessage = "Terjadi kesalahan internal. Silakan coba lagi.";
          } else if (authError.message && authError.message.includes("net::ERR_CONNECTION_REFUSED")) {
            errorMessage = "Tidak dapat terhubung ke server. Silakan coba lagi nanti.";
          }
          
          errorMsg.innerText = errorMessage;
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
    
    // Berikan pesan error yang lebih spesifik
    let errorMessage = "Terjadi kesalahan. Silakan coba lagi.";
    if (error.code === "auth/network-request-failed") {
      errorMessage = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.";
    } else if (error.code === "permission-denied") {
      errorMessage = "Akses ditolak. Silakan hubungi admin.";
    } else if (error.message && error.message.includes("net::ERR_CONNECTION_REFUSED")) {
      errorMessage = "Tidak dapat terhubung ke server. Silakan coba lagi nanti.";
    }
    
    errorMsg.innerText = errorMessage;
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
