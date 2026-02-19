// login.js - Firebase authentication for QUARTRIX login

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
async function setupAuthPersistence() {
  // Cegah double setup
  if (persistenceSetupAttempted) {
    console.log("Persistence already setup, skipping...");
    return auth.currentUser || null;
  }
  
  persistenceSetupAttempted = true;
  
  try {
    // Cek apakah sudah ada session
    if (auth.currentUser) {
      console.log("User already logged in:", auth.currentUser.uid);
      return auth.currentUser;
    }
    
    // Coba set persistence - gunakan local untuk persist lebih lama di iOS
    // Jika gagal, fallback ke session
    try {
      await setPersistence(auth, browserLocalPersistence);
      console.log("Auth persistence set to: local");
    } catch (persistenceError) {
      console.warn("Local persistence failed, trying session:", persistenceError);
      await setPersistence(auth, browserSessionPersistence);
      console.log("Auth persistence set to: session");
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

// Fungsi untuk retry anonymous sign-in dengan exponential backoff dan retry lebih banyak
async function signInWithRetry(maxRetries = 5, initialDelay = 1000) {
  let lastError = null;
  
  // Setup persistence sebelum login
  await setupAuthPersistence();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Anonymous sign-in attempt ${attempt}/${maxRetries}`);
      const result = await signInAnonymously(auth);
      console.log("Anonymous sign-in successful:", result.user.uid);
      return result;
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error.message);
      lastError = error;
      
      // Check for specific iOS errors
      if (error.code === "auth/network-request-failed" || 
          error.message.includes("net::ERR_CONNECTION_REFUSED")) {
        // Longer delay for network issues on iOS
        const delay = initialDelay * Math.pow(2, attempt - 1) * (isIOSafari() ? 1.5 : 1);
        console.log(`Waiting ${delay}ms before retry...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else if (error.code === "auth/popup-closed-by-user") {
        // User closed popup - don't retry automatically
        throw error;
      } else {
        // Other errors - still retry with backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt - 1)));
        }
      }
    }
  }
  
  throw lastError;
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
      // Firebase Anonymous Auth untuk dapat uid - dengan retry penuh (5x)
      const userCredential = await signInWithRetry(5);
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
          // Gunakan retry mechanism penuh (5x) untuk anonymous auth di iOS
          const userCredential = await signInWithRetry(5);
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
