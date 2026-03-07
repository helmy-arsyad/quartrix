// login.js - Firebase authentication for QUARTRIX login
// FIXED: iOS Safari authentication issues

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ✅ SAFE STORAGE FUNCTIONS - Safari iOS compatibility
function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    console.warn("localStorage get blocked:", key);
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.warn("localStorage set blocked:", key);
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {}
}

// Fungsi untuk simpan data user ke Firebase (untuk iOS Safari session recovery)
async function saveUserDataToFirebase(uid, role, nama, absen) {
  try {
    const userRef = ref(db, "users/" + uid);
    await set(userRef, {
      role: role,
      nama: nama,
      absen: absen,
      lastLogin: new Date().toISOString(),
      isOnline: true
    });
    console.log("[Firebase] User data saved to Firebase:", { uid, role, nama, absen });
    return true;
  } catch (error) {
    console.error("[Firebase] Error saving user data:", error);
    return false;
  }
}

// Fungsi untuk ambil data user dari Firebase (fallback untuk iOS Safari)
async function getUserDataFromFirebase(uid) {
  try {
    const userRef = ref(db, "users/" + uid);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      console.log("[Firebase] User data retrieved from Firebase:", snapshot.val());
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.error("[Firebase] Error getting user data:", error);
    return null;
  }
}

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
  // Deteksi iOS Safari termasuk WKWebView (native app browser)
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isWKWebView = /wkwebview/i.test(ua);
  return (isIOS && isSafari) || isWKWebView;
}

// Fungsi untuk mendeteksi apakah browser support localStorage dengan benar
function isLocalStorageAvailable() {
  try {
    const test = '__test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
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
    // iOS Safari → Gunakan local persistence untuk session yang lebih lama
    // Browser lain → Gunakan local persistence juga
    // NOTE: session persistence clears when browser is closed, local persists
    await setPersistence(auth, browserLocalPersistence);
    
    if (isIOSafari()) {
      console.log("iOS Safari → local persistence (persistent session)");
    } else {
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

// Fungsi BARU untuk restore session - Lebih baik untuk iOS Safari
// Ini akan mencoba restore session dulu, baru create baru jika perlu
async function restoreSession() {
  // Setup persistence dulu
  await setupAuthPersistence();

  // Coba tunggu session dari persistence (iOS Safari perlu waktu ini)
  console.log("[Session] Trying to restore existing session...");
  
  return new Promise(async (resolve, reject) => {
    // Cek apakah sudah ada user yang login
    if (auth.currentUser) {
      console.log("[Session] User already logged in:", auth.currentUser.uid);
      resolve(auth.currentUser);
      return;
    }

    // Kalau belum ada, tunggu callback dari Firebase (session restoration)
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      
      if (user) {
        console.log("[Session] Session restored successfully:", user.uid);
        resolve(user);
      } else {
        // Tidak ada session yang bisa direstore, buat baru
        console.log("[Session] No existing session, creating new one...");
        try {
          const result = await signInAnonymously(auth);
          console.log("[Session] New anonymous user created:", result.user.uid);
          resolve(result.user);
        } catch (error) {
          console.error("[Session] Failed to create new session:", error);
          reject(error);
        }
      }
    });

    // Timeout - Jika tidak ada response dalam 5 detik, buat session baru
    setTimeout(() => {
      if (auth.currentUser) {
        console.log("[Session] User appeared after timeout:", auth.currentUser.uid);
        resolve(auth.currentUser);
      } else {
        console.log("[Session] Timeout waiting for session, creating new one...");
        unsubscribe().catch(() => {});
        signInAnonymously(auth)
          .then(result => {
            console.log("[Session] New anonymous user after timeout:", result.user.uid);
            resolve(result.user);
          })
          .catch(error => {
            console.error("[Session] Failed to create session after timeout:", error);
            reject(error);
          });
      }
    }, 5000);
  });
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
      
// 🔥 FIX: Simpan data user ke Firebase untuk iOS Safari session recovery
      // Admin disimpan dengan role "admin" agar bisa restore dengan benar
      await saveUserDataToFirebase(uid, "admin", "ADMIN", "-");
      
      // Simpan ke localStorage ✅ PAKAI SAFE VERSION
      safeSet("isLogin", "true");
      safeSet("role", "admin");
      safeSet("nama", "ADMIN");
      safeSet("absen", "-");
      safeSet("uid", uid);
      
      // Remember Me - Handle berbeda untuk iOS Safari (FIX #4)
      if (rememberMe) {
        safeSet("rememberMe", "true");
        safeSet("savedUsername", username);
        // 🔥 FIX: Jangan simpan password di iOS Safari
        if (!isIOSafari()) {
          safeSet("savedPassword", password);
        } else {
          safeRemove("savedPassword");
          console.log("iOS Safari: Password not saved for security");
        }
      } else {
        safeSet("rememberMe", "false");
        safeRemove("savedUsername");
        safeRemove("savedPassword");
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
          
          // 🔥 FIX: Simpan data user ke Firebase untuk iOS Safari session recovery
          await saveUserDataToFirebase(uid, "siswa", data.nama, password);
          
          // Simpan ke localStorage ✅ PAKAI SAFE VERSION
          safeSet("isLogin", "true");
          safeSet("role", "siswa");
          safeSet("nama", data.nama);
          safeSet("absen", password);
          safeSet("uid", uid);
          
          // Remember Me - Handle berbeda untuk iOS Safari (FIX #4)
          if (rememberMe) {
            safeSet("rememberMe", "true");
            safeSet("savedUsername", username);
            // 🔥 FIX: Jangan simpan password di iOS Safari
            if (!isIOSafari()) {
              safeSet("savedPassword", password);
            } else {
              safeRemove("savedPassword");
              console.log("iOS Safari: Password not saved for security");
            }
          } else {
            safeSet("rememberMe", "false");
            safeRemove("savedUsername");
            safeRemove("savedPassword");
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

// ✅ HAPUS AUTO REDIRECT - Tidak ada redirect otomatis di load
// Safari iOS tidak stabil di fase ini

// Allow Enter key to submit and check for Remember Me on page load
document.addEventListener("DOMContentLoaded", () => {
  // LOAD: Isi otomatis jika ada data Remember Me ✅ PAKAI SAFE VERSION
  const rememberMe = safeGet("rememberMe");
  if (rememberMe === "true") {
    const savedUsername = safeGet("savedUsername");
    const savedPassword = safeGet("savedPassword");
    
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

// ✅ PASTIKAN login() TERDAFTAR - Safari iOS tidak drop function reference
window.login = window.login;
console.log("login.js loaded OK");
