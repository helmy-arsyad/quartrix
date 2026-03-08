// dashboard.js - Firebase authentication for QUARTRIX dashboard
// FIXED: iOS Safari authentication issues

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  push,
  remove,
  get,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// Config Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyCP-Gha19gZ6ZkYCzZ9vh9QL2tKYmNVoCk",
  authDomain: "quartrix-eb95f.firebaseapp.com",
  databaseURL:
    "https://quartrix-eb95f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quartrix-eb95f",
  storageBucket: "quartrix-eb95f.firebasestorage.app",
  messagingSenderId: "589369640106",
  appId: "1:589369640106:web:7239da0bd98bae284fbcd3",
  measurementId: "G-HG1GL8D03G",
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

// 🔥 FIX: Fungsi untuk ambil data user dari Firebase (fallback untuk iOS Safari)
// Ini akan digunakan ketika localStorage kosong tapi session Firebase Auth masih ada
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
// FIX: Persistence harus di-set SEBELUM operasi auth apapun
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
    console.log(
      "[iOS Debug] LocalStorage available:",
      typeof localStorage !== "undefined",
    );

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
    const unsub = onAuthStateChanged(auth, (user) => {
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
    // Ini penting untuk iOS Safari - Firebase akan coba restore session dari localStorage
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe(); // Stop listening setelah dapat response
      
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
      // Cek lagi apakah sudah ada user (mungkin callback belum sempat jalan)
      if (auth.currentUser) {
        console.log("[Session] User appeared after timeout:", auth.currentUser.uid);
        resolve(auth.currentUser);
      } else {
        console.log("[Session] Timeout waiting for session, creating new one...");
        // Unsubscribe dulu sebelum create baru ( unsubscribe adalah function, bukan Promise )
        try {
          unsubscribe();
        } catch (e) {
          console.log("[Session] Unsubscribe error (can be ignored):", e);
        }
        // Buat session baru
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

// Fungsi untuk sinkronkan status admin dari localStorage ke Firebase
async function syncAdminStatus() {
  const role = localStorage.getItem("role");
  const storedUid = localStorage.getItem("uid");

  if (role === "admin") {
    // Dapatkan uid dari current Firebase auth (bukan dari localStorage)
    const currentUid = auth.currentUser?.uid;

    if (currentUid) {
      // Gunakan uid dari current auth session
      const adminRef = ref(db, "admin/" + currentUid);
      const snapshot = await get(adminRef);
      if (!snapshot.exists()) {
        // Jika belum ada, buat node admin
        await set(adminRef, {
          isAdmin: true,
          nama: "ADMIN",
          createdAt: new Date().toISOString(),
        });
        console.log(
          "Admin status disinkronkan ke Firebase dengan uid:",
          currentUid,
        );
      }
      return currentUid;
    }
  }
  return null;
}

// Login anonymous dengan restore session - Lebih baik untuk iOS Safari
async function initAuth() {
  try {
    // 🔥 FIX: Gunakan restoreSession untuk mencoba restore session dulu
    await restoreSession();
    console.log("Anonymous login berhasil");

    // 🔥 FIX: Cek apakah localStorage kosong tapi session Firebase ada (iOS Safari)
    // Jika kosong, ambil data dari Firebase dan restore ke localStorage
    const storedRole = localStorage.getItem("role");
    const storedNama = localStorage.getItem("nama");
    const storedAbsen = localStorage.getItem("absen");
    
    if (!storedRole || !storedNama || !storedAbsen) {
      console.log("[iOS Fix] localStorage kosong, mencoba restore dari Firebase...");
      
      // Ambil uid dari Firebase auth session yang sudah direstore
      const currentUid = auth.currentUser?.uid;
      
      if (currentUid) {
        // Coba ambil data user dari Firebase
        const firebaseUserData = await getUserDataFromFirebase(currentUid);
        
        if (firebaseUserData) {
          console.log("[iOS Fix] Data ditemukan di Firebase, restore ke localStorage:", firebaseUserData);
          
          // Restore ke localStorage
          localStorage.setItem("role", firebaseUserData.role || "siswa");
          localStorage.setItem("nama", firebaseUserData.nama || "");
          localStorage.setItem("absen", firebaseUserData.absen || "");
          localStorage.setItem("uid", currentUid);
          localStorage.setItem("isLogin", "true");
          
          console.log("[iOS Fix] Session berhasil direstore dari Firebase!");
        } else {
          console.log("[iOS Fix] Data TIDAK ditemukan di Firebase, user harus login ulang");
        }
      }
    }

    try {
      // Sinkronkan status admin jika perlu
      await syncAdminStatus();
    } catch (syncError) {
      console.error("Error sync admin status:", syncError);
      // Lanjutkan meskipun sync gagal
    }

    initApp();
    // initFCM() dihapus karena sudah ditangani di initApp()
  } catch (error) {
    console.error("Error anonymous login:", error);

    // Tampilkan pesan error yang lebih spesifik ke user
    let errorMessage =
      "Gagal terhubung ke server. Silakan refresh halaman ini.";
    if (error.code === "auth/network-request-failed") {
      errorMessage =
        "Tidak dapat terhubung ke server. Periksa koneksi internet Anda dan refresh halaman.";
    } else if (error.code === "auth/popup-closed-by-user") {
      errorMessage =
        "Popup ditutup sebelum proses selesai. Silakan refresh halaman.";
    } else if (error.code === "auth/internal-error") {
      errorMessage = "Terjadi kesalahan internal. Silakan refresh halaman.";
    }

    // Tampilkan pesan error ke user
    document.body.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#5a3e2b;
      color:#fff;
      font-family:Poppins,sans-serif;
      text-align:center;
      padding:2rem;
    ">
      <div>
        <h2>⚠️ Terjadi Kesalahan</h2>
        <p>${errorMessage}</p>
        <p style="font-size:0.8rem;margin-top:10px;color:#ccc;">Error: ${error.message}</p>
        <button onclick="location.href='login.html'"
          style="
            margin-top:1rem;
            padding:12px 24px;
            border:none;
            border-radius:20px;
            font-weight:700;
            background:#ff8c42;
            color:#fff;
            cursor:pointer;
          ">
          🔑 Login Ulang
        </button>
      </div>
    </div>
  `;
  }
}

// Mulai proses autentikasi
initAuth();

async function hapusTugasDanStatus(tugasKey) {
  // Instead of removing, mark task as deleted (tidak tersedia)
  // This preserves the data in Firebase so profile data remains
  await set(ref(db, "tugas/" + tugasKey + "/tersedia"), false);
}

async function initApp() {
  /* LOGIN */
  const role = localStorage.getItem("role");
  const nama = localStorage.getItem("nama");
  const absen = localStorage.getItem("absen");
  if (!role || !nama || !absen) {
    document.body.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#5a3e2b;
      color:#fff;
      font-family:Poppins,sans-serif;
      text-align:center;
      padding:2rem;
    ">
      <div>
        <h2>⚠️ Sesi Login Habis</h2>
        <p>Silakan login ulang untuk melanjutkan.</p>
        <button onclick="location.href='login.html'"
          style="
            margin-top:1rem;
            padding:12px 24px;
            border:none;
            border-radius:20px;
            font-weight:700;
            background:#ff8c42;
            color:#fff;
            cursor:pointer;
          ">
          🔑 Login Ulang
        </button>
      </div>
    </div>
  `;
    return; // ⛔ STOP JS, tapi TIDAK BLANK
  }

  /* PROFIL */
  let profilData = {
    nama: nama,
    absen: absen,
    fotoURL:
      "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNmZmY1ZTYiLz4KPHBhdGggZD0iTTI1IDI1QzI3LjIgMjUgMjkgMjIuMiAyOSAyMEMyOSAxNy44IDI3LjIgMTYgMjUgMTZDMTYuOCAxNiAxNSAxNy44IDE1IDIwQzE1IDIyLjIgMTYuOCAyNSAyNSAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPHBhdGggZD0iTTMwIDI1QzMwIDI4LjMgMjduMyAzMSAyNSAzMUMyMi43IDMxIDIwIDI4LjMgMjAgMjVDMjAgMjEuNyAyMi43IDE5IDI1IDE5QzI3LjMgMTkgMzAgMjEuNyAzMCAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPC9zdmc+",
  };
  const profilRef = ref(db, "siswa/" + absen);

  // Update UI awal dengan data localStorage
  // FIX: Wait for DOM to be ready before updating UI
  function updateProfilUI() {
    const foto = document.getElementById("profilFoto");
    const infoText = document.getElementById("infoText");

    // FIX: Guard against null elements
    if (!foto || !infoText) {
      console.log("updateProfilUI: Elements not ready, will retry...");
      setTimeout(updateProfilUI, 100);
      return;
    }

    foto.src = profilData?.fotoURL || foto.src;

    if (role === "admin") {
      infoText.innerText = "🎉 Anda login sebagai ADMIN! 🎉";
    } else {
      const namaDisplay = profilData?.nama || nama || "Pengguna";
      const absenDisplay = profilData?.absen || absen || "-";
      infoText.innerText = `👋 Halo, ${namaDisplay}! Selamat datang di QUARTRIX (Absen ${absenDisplay}) 🌟`;
    }
  }

  // Load profil dari Firebase
  get(profilRef).then((snapshot) => {
    if (snapshot.exists()) {
      profilData = snapshot.val();
      updateProfilUI();
    }
  });

  // Modal edit profil - Changed to redirect to profile.html
  const editProfilBtn = document.getElementById("editProfilBtn");
  const lihatProfilBtn = document.getElementById("lihatProfilBtn");
  const modalProfil = document.getElementById("modalProfil");

  // Event listener for Lihat Profil button (view own profile)
  if (lihatProfilBtn) {
    lihatProfilBtn.addEventListener("click", () => {
      // Redirect to profile.html with absen parameter to view own profile
      window.location.href = "profile.html?absen=" + absen;
    });
  }

  if (editProfilBtn) {
    editProfilBtn.addEventListener("click", () => {
      if (role === "admin") return alert("Admin tidak bisa edit profil!");
      // Redirect to profile.html with absen parameter instead of showing modal
      window.location.href = "profile.html?absen=" + absen;
    });
  }

  if (modalProfil) {
    window.closeModal = () => (modalProfil.style.display = "none");
  }

  const hapusFotoBtn = document.getElementById("hapusFotoBtn");
  if (hapusFotoBtn) {
    hapusFotoBtn.addEventListener("click", () => {
      if (role === "admin") return alert("Admin tidak bisa hapus foto!");
      const avatarDefaultURL =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNmZmY1ZTYiLz4KPHBhdGggZD0iTTI1IDI1QzI3LjIgMjUgMjkgMjIuMiAyOSAyMEMyOSAxNy44IDI3LjIgMTYgMjUgMTZDMTYuOCAxNiAxNSAxNy44IDE1IDIwQzE1IDIyLjIgMTYuOCAyNSAyNSAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPHBhdGggZD0iTTMwIDI1QzMwIDI4LjMgMjduMyAzMSAyNSAzMUMyMi43IDMxIDIwIDI4LjMgMjAgMjVDMjAgMjEuNyAyMi43IDE5IDI1IDE5QzI3LjMgMTkgMzAgMjEuNyAzMCAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPC9zdmc+";
      profilData.fotoURL = avatarDefaultURL;
      document.getElementById("profilFoto").src = avatarDefaultURL;
      alert("Foto profil berhasil dihapus dan dikembalikan ke default!");
    });
  }

  window.simpanProfil = async () => {
    const newNama = document.getElementById("editNama").value.trim();
    const newAbsen = document.getElementById("editAbsen").value;
    const newAbsenLogin = document.getElementById("editAbsenLogin").value;
    const fotoFile = document.getElementById("editFoto").files[0];

    if (!newNama || !newAbsen || !newAbsenLogin)
      return alert("Isi semua field!");

    let fotoURL = profilData.fotoURL;
    if (fotoFile) {
      const reader = new FileReader();
      reader.onload = function (e) {
        fotoURL = e.target.result;
        updateProfil(newNama, newAbsen, newAbsenLogin, fotoURL);
      };
      reader.readAsDataURL(fotoFile);
      return; // Tunggu reader
    }

    updateProfil(newNama, newAbsen, newAbsenLogin, fotoURL);
  };

  function updateProfil(newNama, newAbsen, newAbsenLogin, fotoURL) {
    const oldAbsen = absen;

    // Cek apakah absen login baru sudah digunakan (kecuali jika sama dengan lama)
    if (newAbsenLogin !== oldAbsen) {
      const newRef = ref(db, "siswa/" + newAbsenLogin);
      get(newRef).then((snapshot) => {
        if (snapshot.exists()) {
          alert(
            "Absen login baru sudah digunakan siswa lain! Pilih absen yang belum digunakan.",
          );
          return;
        }
        // Lanjutkan jika tidak ada
        proceedUpdate(newNama, newAbsen, newAbsenLogin, fotoURL, oldAbsen);
      });
    } else {
      proceedUpdate(newNama, newAbsen, newAbsenLogin, fotoURL, oldAbsen);
    }
  }

  function proceedUpdate(newNama, newAbsen, newAbsenLogin, fotoURL, oldAbsen) {
    set(ref(db, "siswa/" + newAbsenLogin), {
      nama: newNama,
      absen: newAbsen,
      role: role,
      fotoURL: fotoURL,
    });

    localStorage.setItem("absen", newAbsenLogin);
    localStorage.setItem("nama", newNama);

    closeModal();
    alert("Profil berhasil disimpan!");

    if (newAbsenLogin !== oldAbsen) {
      remove(ref(db, "siswa/" + oldAbsen));
      alert(
        "Absen login telah diubah. Anda akan diarahkan ke halaman login untuk masuk dengan absen baru.",
      );
      localStorage.clear();
      location.href = "login.html";
    }
  }

  /* ADMIN */
  const adminPanel = document.getElementById("adminPanel");
  const tambahTugasPanel = document.getElementById("tambahTugasPanel");
  if (role === "admin") {
    if (adminPanel) adminPanel.style.display = "block";
    if (tambahTugasPanel) tambahTugasPanel.style.display = "block";
    if (editProfilBtn) editProfilBtn.style.display = "none"; // Admin tidak edit profil
    if (hapusFotoBtn) hapusFotoBtn.style.display = "none"; // Admin tidak hapus foto
    renderDaftarSiswa(); // Render daftar siswa sedang login untuk admin
    console.log("Panel admin dan tugas ditampilkan untuk role:", role);
  } else {
    console.log(
      "Role bukan admin, panel tidak ditampilkan. Role saat ini:",
      role,
    );
  }

  // Set user online saat login
  const onlineRef = ref(db, "online/" + absen);
  set(onlineRef, { nama: nama, role: role });
  onDisconnect(onlineRef).remove(); // Hapus saat disconnect

  function renderDaftarSiswa() {
    const daftarSiswaDiv = document.getElementById("daftarSiswa");
    if (!daftarSiswaDiv) return;

    onValue(ref(db, "online"), (snapshot) => {
      daftarSiswaDiv.innerHTML = "<ul>";

      snapshot.forEach((child) => {
        const absenKey = child.key;
        const data = child.val();

        daftarSiswaDiv.innerHTML += `
        <li>
          <span>${data.nama} (${data.role})</span>
          <span>Absen: ${absenKey} - Online</span>
        </li>
      `;
      });

      daftarSiswaDiv.innerHTML += "</ul>";
    });
  }

  /* IMPORT SISWA */
  const siswaData = [
    { nama: "AGUSTINE DYAH AYU RAHMADANI", absen: 1 },
    { nama: "AHMAD FAISHAL ZAUMAR", absen: 2 },
    { nama: "ALANA GEIZEL FAEDAH ALAM", absen: 3 },
    { nama: "ALYA NAFEEZA AZZAHRO", absen: 4 },
    { nama: "ANNISA PRIMADITA MUSAFA", absen: 5 },
    { nama: "ARYA ISSYA MAHENDRA", absen: 6 },
    { nama: "BERLIANA FAIRUZ IZDIHAR", absen: 7 },
    { nama: "CLEON ADLI DANENDRA OMAN", absen: 8 },
    { nama: "EIVEL FLORAYSA NADINDA ARDYALOVA", absen: 9 },
    { nama: "EVELYN GABRIEL ECHA CARERA", absen: 10 },
    { nama: "EZHAR AIRLANGGA RISTANSYAH", absen: 11 },
    { nama: "FALIA PUTRI ELLYZA", absen: 12 },
    { nama: "HANINDIA ASYAWA KAYNAHAYA", absen: 13 },
    { nama: "HANUNG ELYA PINANDITA", absen: 14 },
    { nama: "HELMY ARSYAD DARMAWAN", absen: 15 },
    { nama: "HENDARSO WIRATMOKO", absen: 16 },
    { nama: "JAGAD CAHYO ADY", absen: 17 },
    { nama: "JESSICA AFA MARTANIA", absen: 18 },
    { nama: "KAYLA AMANDA SYAMSAFINA", absen: 19 },
    { nama: "KEVIN APRILIO", absen: 20 },
    { nama: "LINTANG YULIDHA PUTRI", absen: 21 },
    { nama: "MUHAMMAD IBNU KHALDUN ALFAUZI", absen: 22 },
    { nama: "NABIL MAHIDARA ARTANTO", absen: 23 },
    { nama: "NABILA KIRANA CANTYA PUTRI", absen: 24 },
    { nama: "NADIA REYSSA IRVANA PUTRI", absen: 25 },
    { nama: "NATHANAEL ABIRA SETYO BUDI", absen: 26 },
    { nama: "NATHANIA NARESWARI BRAHMA PUTRI", absen: 27 },
    { nama: "NIDA ULHAQ NUR SYIFA", absen: 28 },
    { nama: "NISRNA MARYAM", absen: 29 },
    { nama: "PHILLIPUS ADE MAHENDRA PUTRA", absen: 30 },
    { nama: "PRISYA NOVI ANGGRAENI", absen: 31 },
    { nama: "RENITA ISNABILA", absen: 32 },
    { nama: "SEDYO SAKA PRATAMA", absen: 33 },
    { nama: "SELLA RAHMA YUNANDA", absen: 34 },
  ];

  // Ganti seluruh bagian btnImportSiswa.addEventListener dengan kode ini
  const btnImportSiswa = document.getElementById("btnImportSiswa");
  if (btnImportSiswa) {
    btnImportSiswa.addEventListener("click", async () => {
      // Pastikan 'async' di sini
      if (role !== "admin") return alert("Hanya admin yang bisa import siswa!");
      if (
        confirm(
          "Apakah Anda yakin ingin import semua 34 siswa? Ini akan menimpa data yang ada.",
        )
      ) {
        for (const siswa of siswaData) {
          // Cek apakah absen sudah ada
          const existingRef = ref(db, "siswa/" + siswa.absen);
          const snapshot = await get(existingRef); // 'await' sekarang di dalam fungsi async
          if (snapshot.exists()) {
            console.log(
              `Absen ${siswa.absen} sudah ada, skip import untuk ${siswa.nama}`,
            );
            continue; // Skip jika sudah ada
          }
          // Jika belum ada, import
          await set(ref(db, "siswa/" + siswa.absen), {
            nama: siswa.nama,
            absen: siswa.absen,
            role: "siswa",
            fotoURL:
              "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNmZmY1ZTYiLz4KPHBhdGggZD0iTTI1IDI1QzI3LjIgMjUgMjkgMjIuMiAyOSAyMEMyOSAxNy44IDI3LjIgMTYgMjUgMTZDMTYuOCAxNiAxNSAxNy44IDE1IDIwQzE1IDIyLjIgMTYuOCAyNSAyNSAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPHBhdGggZD0iTTMwIDI1QzMwIDI4LjMgMjduMyAzMSAyNSAzMUMyMi43IDMxIDIwIDI4LjMgMjAgMjVDMjAgMjEuNyAyMi43IDE5IDI1IDE5QzI3LjMgMTkgMzAgMjEuNyAzMCAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPC9zdmc+",
          });
        }
        alert("Import selesai! Siswa dengan absen duplikat dilewati.");
      }
    });
  }

  /* JADWAL MENARIK */
  const jadwalData = [
    {
      hari: "Senin",
      mataPelajaran: "PKWU",
      waktu: "08:15 - 09:45",
    },
    {
      hari: "Senin",
      mataPelajaran: "Kimia",
      waktu: "10:15 - 11:40",
    },
    {
      hari: "Senin",
      mataPelajaran: "Matematika Minat",
      waktu: "12:30 - 13:50",
    },
    {
      hari: "Senin",
      mataPelajaran: "Sejarah",
      waktu: "13:50 - 15:00",
    },
    {
      hari: "Selasa",
      mataPelajaran: "Bimbingan Konseling",
      waktu: "07:00 - 07:40",
    },
    {
      hari: "Selasa",
      mataPelajaran: "Matematika Wajib",
      waktu: "07:40 - 09:00",
    },
    {
      hari: "Selasa",
      mataPelajaran: "Penjaskes",
      waktu: "09:00 - 11:30",
    },
    {
      hari: "Selasa",
      mataPelajaran: "Fisika",
      waktu: "12:20 - 13:40",
    },
    {
      hari: "Selasa",
      mataPelajaran: "Bahasa Inggris",
      waktu: "13:40 - 15:00",
    },
    {
      hari: "Rabu",
      mataPelajaran: "Bahasa Indonesia",
      waktu: "07:00 - 08:20",
    },
    {
      hari: "Rabu",
      mataPelajaran: "Matematika Minat",
      waktu: "08:20 - 09:40",
    },
    {
      hari: "Rabu",
      mataPelajaran: "Seni Budaya",
      waktu: "10:10 - 11:30",
    },
    {
      hari: "Rabu",
      mataPelajaran: "Biologi",
      waktu: "12:20 - 13:40",
    },
    {
      hari: "Rabu",
      mataPelajaran: "Fisika",
      waktu: "13:40 - 15:00",
    },
    {
      hari: "Kamis",
      mataPelajaran: "Bahasa Jawa",
      waktu: "07:00 - 07:40",
    },
    {
      hari: "Kamis",
      mataPelajaran: "Kimia",
      waktu: "07:40 - 09:40",
    },
    {
      hari: "Kamis",
      mataPelajaran: "Biologi",
      waktu: "10:10 - 10:50",
    },
    {
      hari: "Kamis",
      mataPelajaran: "Agama",
      waktu: "12:20 - 13:40",
    },
    {
      hari: "Kamis",
      mataPelajaran: "Bahasa Indonesia",
      waktu: "13:40 - 15:00",
    },
    {
      hari: "Jumat",
      mataPelajaran: "Matematika Wajib",
      waktu: "07:00 - 08:30",
    },
    {
      hari: "Jumat",
      mataPelajaran: "BMQ",
      waktu: "08:30 - 09:15",
    },
    {
      hari: "Jumat",
      mataPelajaran: "PPKn",
      waktu: "09:45 - 11:15",
    },
  ];

  const hariList = [...new Set(jadwalData.map((j) => j.hari))];
  // Ambil daftar hari unik: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]

  const jadwalButtons = document.getElementById("jadwalButtons");
  const jadwalDetail = document.getElementById("jadwalDetail");

  if (jadwalButtons && jadwalDetail) {
    if (!jadwalData || jadwalData.length === 0) {
      jadwalDetail.innerHTML =
        "<p style='text-align:center;color:#666'>Jadwal belum tersedia.</p>";
    }

    // Fungsi untuk mendapatkan hari saat ini dalam bahasa Indonesia
    function getCurrentDay() {
      const days = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];
      const today = new Date().getDay();
      return days[today];
    }

    const currentDay = getCurrentDay();
    let tombolHariIni = null;

    hariList.forEach((h) => {
      const b = document.createElement("button");
      b.textContent = h;
      b.className = "hari-btn";
      b.onclick = () => tampilJadwal(h, b);
      jadwalButtons.appendChild(b);

      if (h === currentDay) tombolHariIni = b;
    });

    if (tombolHariIni) {
      tampilJadwal(currentDay, tombolHariIni);
    } else if (jadwalDetail) {
      jadwalDetail.innerHTML =
        "<p style='text-align:center;color:#666;'>Tidak ada jadwal untuk hari ini.</p>";
    }

    function tampilJadwal(hari, btn) {
      document
        .querySelectorAll(".hari-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (!jadwalDetail) return;
      jadwalDetail.innerHTML = "";
      jadwalData
        .filter((j) => j.hari === hari)
        .forEach((j) => {
          const card = document.createElement("div");
          card.className = "jadwal-card";
          card.innerHTML = `
          <div class="jadwal-mapel">${j.mataPelajaran}</div>
          <div class="jadwal-waktu">${j.waktu}</div>
        `;
          jadwalDetail.appendChild(card);
        });
    }
  }

  /* TUGAS MENARIK DENGAN CHECKLIST */
  let tugasData = [];
  let tugasKeys = []; // Simpan key untuk hapus
  let tugasSelesai = {}; // Status selesai per tugas per siswa
  const tugasList = document.getElementById("tugasList");

  // Fixed: Using for...of loop instead of forEach to properly await async functions
  async function renderTugas() {
    if (!tugasList) return;
    
    if (!tugasData || tugasData.length === 0) {
      tugasList.innerHTML =
        "<p style='text-align:center;color:#666'>Belum ada tugas 📭</p>";
      return;
    }

    tugasList.innerHTML = "";
    const now = new Date();

    // Process expired tasks first (sequentially to avoid race conditions)
    for (const [index, t] of tugasData.entries()) {
      const deadlineDate = new Date(t.deadline);
      const isExpired = deadlineDate < now; // Cek jika deadline sudah lewat

      // Jika expired, tandai sebagai dihapus di Firebase (tidak hapus data)
      if (isExpired) {
        await hapusTugasDanStatus(tugasKeys[index]); // Properly awaited now
      }
    }

    // Then render remaining tasks
    for (const [index, t] of tugasData.entries()) {
      const deadlineDate = new Date(t.deadline);
      const isExpired = deadlineDate < now;

      // Skip expired tasks
      if (isExpired) {
        continue;
      }

      // Filter tugas yang sudah dihapus (tersedia: false)
      if (t.tersedia === false) {
        continue; // Skip render tugas yang sudah dihapus
      }

      const card = document.createElement("div");
      card.className = "tugas-card";
      const isSelesai = tugasSelesai[tugasKeys[index]] || false;
      card.innerHTML = `
      <div class="tugas-mapel ${isSelesai ? "tugas-selesai" : ""}">${t.mapel}</div>
      <div class="tugas-desc ${isSelesai ? "tugas-selesai" : ""}">${t.deskripsi}</div>
      <div class="tugas-deadline ${isSelesai ? "tugas-selesai" : ""}">Deadline: ${t.deadline}</div>
      <div class="tugas-admin">
        ${role !== "admin" ? `<input type="checkbox" class="checkbox" ${isSelesai ? "checked" : ""} onchange="toggleSelesai('${tugasKeys[index]}', this.checked)">` : ""}
      </div>
    `;
      if (role === "admin") {
        const hapusBtn = document.createElement("button");
        hapusBtn.textContent = "Hapus";
        hapusBtn.className = "hapus-btn";
        hapusBtn.onclick = () => hapusTugas(tugasKeys[index]);
        card.querySelector(".tugas-admin").appendChild(hapusBtn);
      }
      tugasList.appendChild(card);
    }
  }

  // Load status selesai dari Firebase
  const selesaiRef = ref(db, "tugasSelesai/" + absen);
  onValue(selesaiRef, (snapshot) => {
    tugasSelesai = snapshot.val() || {};
    renderTugas(); // Render ulang saat status berubah
  });

  // Listen untuk perubahan tugas dari Firebase
  const tugasRef = ref(db, "tugas");
  onValue(tugasRef, (snapshot) => {
    const data = snapshot.val();
    tugasData = data ? Object.values(data) : [];
    tugasKeys = data ? Object.keys(data) : [];
    renderTugas();
    console.log("Tugas diperbarui:", tugasData);
  });

  // Event listener untuk tombol tambah tugas
  const btnTambahTugas = document.getElementById("btnTambahTugas");
  if (btnTambahTugas) {
    btnTambahTugas.addEventListener("click", async () => {
      const mapel = document.getElementById("mapelBaru").value;
      const deskripsi = document.getElementById("tugasBaru").value;
      const deadline = document.getElementById("deadlineBaru").value;

      if (!mapel || !deskripsi) {
        alert("Isi mapel dan deskripsi dulu");
        return;
      }

      // SIMPAN KE FIREBASE
      await push(ref(db, "tugas"), {
        mapel: mapel,
        deskripsi: deskripsi,
        deadline: deadline,
        waktu: Date.now()
      });

      console.log("Tugas tersimpan");

      // KIRIM NOTIFIKASI KE SERVER
      try {
        await fetch("https://quartrix-production.up.railway.app/sendNotification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            mapel: mapel,
            deskripsi: deskripsi,
            deadline: deadline
          })
        });

        console.log("Notifikasi terkirim");
      } catch (err) {
        console.error("Gagal kirim notifikasi", err);
      }

      document.getElementById("mapelBaru").value = "";
      document.getElementById("tugasBaru").value = "";
      document.getElementById("deadlineBaru").value = "";
    });
  }

  async function tambahTugas() {
    const mapel = mapelBaru.value.trim();
    const desc = tugasBaru.value.trim();
    const deadline = deadlineBaru.value;

    if (!mapel || !desc) {
      alert("Mapel dan deskripsi harus diisi!");
      return;
    }

    // kirim notifikasi ke server Railway
    await fetch("https://quartrix-production.up.railway.app/sendNotification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mapel: mapel,
        deskripsi: desc,
        deadline: deadline
      })
    });

    mapelBaru.value = "";
    tugasBaru.value = "";
    deadlineBaru.value = "";

    alert("Tugas berhasil dipublish kepada semua siswa!");
  }

  function hapusTugas(key) {
    if (role !== "admin") return;
    if (confirm("Yakin ingin hapus tugas ini?")) {
      hapusTugasDanStatus(key);
      alert("Tugas dan data pengerjaan siswa berhasil dihapus!");
    }
  }

  window.toggleSelesai = async (key, checked) => {
    if (role === "admin") return;
    tugasSelesai[key] = checked;

    // Simpan ke Firebase dengan error handling
    try {
      await set(selesaiRef, tugasSelesai);
      console.log("Tugas berhasil disimpan ke Firebase:", tugasSelesai);
    } catch (error) {
      console.error("Error menyimpan ke Firebase:", error);
      alert("Gagal menyimpan ke server. Tugas disimpan di lokal browser saja.");
    }

    // Simpan juga ke localStorage sebagai backup
    const localStorageKey = "tugasSelesai_" + absen;
    localStorage.setItem(localStorageKey, JSON.stringify(tugasSelesai));
    console.log(
      "Tugas disimpan ke localStorage:",
      localStorageKey,
      tugasSelesai,
    );

    renderTugas(); // Render ulang untuk efek visual
  };

  /* TAMBAH SISWA */
  const namaBaru = document.getElementById("namaBaru");
  const absenBaru = document.getElementById("absenBaru");
  const btnTambahSiswa = document.getElementById("btnTambahSiswa");
  if (btnTambahSiswa && namaBaru && absenBaru) {
    btnTambahSiswa.addEventListener("click", async () => {
      const nama = namaBaru.value.trim().toUpperCase();
      const absenValue = absenBaru.value.trim();

      if (!nama || !absenValue) return alert("Isi semua field!");

      const existingRef = ref(db, "siswa/" + absenValue);
      const snapshot = await get(existingRef);
      if (snapshot.exists()) {
        return alert(
          "Absen sudah digunakan siswa lain! Pilih absen yang belum digunakan.",
        );
      }

      set(ref(db, "siswa/" + absenValue), {
        nama: nama,
        absen: absenValue,
        role: "siswa",
        fotoURL: "",
      });

      namaBaru.value = "";
      absenBaru.value = "";
      alert("Siswa berhasil ditambahkan ke Firebase!");
    });
  }

  /* UBAH ABSEN SISWA (ADMIN) */
  const absenLama = document.getElementById("absenLama");
  const absenBaruAdmin = document.getElementById("absenBaruAdmin");
  const btnUbahAbsen = document.getElementById("btnUbahAbsen");
  if (btnUbahAbsen && absenLama && absenBaruAdmin) {
    btnUbahAbsen.addEventListener("click", async () => {
      const lama = absenLama.value;
      const baru = absenBaruAdmin.value;

      if (!lama || !baru) return alert("Isi semua field!");

      const newRef = ref(db, "siswa/" + baru);
      const newSnapshot = await get(newRef);
      if (newSnapshot.exists()) {
        return alert(
          "Absen baru sudah digunakan siswa lain! Pilih absen yang belum digunakan.",
        );
      }

      const oldRef = ref(db, "siswa/" + lama);
      const snapshot = await get(oldRef);

      if (!snapshot.exists()) {
        alert("Siswa tidak ditemukan");
        return;
      }

      const dataLama = snapshot.val();
      // Update absen di objek
      dataLama.absen = baru;

      // pindahkan data
      await set(ref(db, "siswa/" + baru), dataLama);
      await remove(oldRef);

      alert("Absen berhasil diubah!");
      absenLama.value = "";
      absenBaruAdmin.value = "";
    });
  }

  /* LOGOUT */
  const logoutBtn = document.querySelector(".logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      localStorage.clear();
      location.href = "login.html";
    });
  }

  /* DAFTAR SEMUA SISWA - Modal functionality */
  const btnDaftarSemuaSiswa = document.getElementById(
    "btnDaftarSemuaSiswaFloating",
  );
  const modalSemuaSiswa = document.getElementById("modalSemuaSiswa");
  const semuaSiswaList = document.getElementById("semuaSiswaList");
  const modalProfilSiswa = document.getElementById("modalProfilSiswa");

  // Fungsi untuk menutup modal daftar semua siswa
  window.closeModalSemuaSiswa = () => {
    if (modalSemuaSiswa) modalSemuaSiswa.style.display = "none";
  };

  // Fungsi untuk menutup modal profil siswa lain
  window.closeModalProfilSiswa = () => {
    if (modalProfilSiswa) modalProfilSiswa.style.display = "none";
  };

  // Event listener untuk tombol daftar semua siswa (jika ada di halaman)
  if (btnDaftarSemuaSiswa) {
    btnDaftarSemuaSiswa.addEventListener("click", async () => {
      if (!modalSemuaSiswa || !semuaSiswaList) return;

      modalSemuaSiswa.style.display = "flex";
      semuaSiswaList.innerHTML =
        "<p style='text-align:center;color:#666'>Memuat data siswa...</p>";

      // Ambil semua data siswa dari Firebase
      const siswaSnapshot = await get(ref(db, "siswa"));

      if (!siswaSnapshot.exists()) {
        semuaSiswaList.innerHTML =
          "<p style='text-align:center;color:#666'>Belum ada siswa yang terdaftar.</p>";
        return;
      }

      const siswaData = siswaSnapshot.val();
      const semuaSiswa = [];

      for (const absen in siswaData) {
        if (siswaData[absen].role !== "admin") {
          semuaSiswa.push({
            absen: absen,
            ...siswaData[absen],
          });
        }
      }

      // Urutkan berdasarkan absen
      semuaSiswa.sort((a, b) => parseInt(a.absen) - parseInt(b.absen));

      if (semuaSiswa.length === 0) {
        semuaSiswaList.innerHTML =
          "<p style='text-align:center;color:#666'>Belum ada siswa yang terdaftar.</p>";
        return;
      }

      // Tampilkan daftar siswa
      semuaSiswaList.innerHTML = "";
      semuaSiswa.forEach((siswa) => {
        const defaultFoto =
          "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNmZmY1ZTYiLz4KPHBhdGggZD0iTTI1IDI1QzI3LjIgMjUgMjkgMjIuMiAyOSAyMEMyOSAxNy44IDI3LjIgMTYgMjUgMTZDMTYuOCAxNiAxNSAxNy44IDE1IDIwQzE1IDIyLjIgMTYuOCAyNSAyNSAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPHBhdGggZD0iTTMwIDI1QzMwIDI4LjMgMjduMyAzMSAyNSAzMUMyMi43IDMxIDIwIDI4LjMgMjAgMjVDMjAgMjEuNyAyMi43IDE5IDI1IDE5QzI3LjMgMTkgMzAgMjEuNyAzMCAyNVoiIGZpbGw9IiMzZTJjMjMiLz4KPC9zdmc+";
        const fotoSrc = siswa.fotoURL || defaultFoto;

        const item = document.createElement("div");
        item.className = "semua-siswa-item";
        item.onclick = () => lihatProfilSiswa(siswa.absen, siswa.nama);
        item.innerHTML = `
          <img src="${fotoSrc}" alt="Foto ${siswa.nama}" onerror="this.src='${defaultFoto}'">
          <div class="info">
            <div class="nama">${siswa.nama || "Nama tidak tersedia"}</div>
            <div class="absen">Absen: ${siswa.absen}</div>
          </div>
          <div class="arrow">→</div>
        `;
        semuaSiswaList.appendChild(item);
      });
    });
  }

  // Fungsi untuk melihat profil siswa lain - Redirect ke profile.html
  function lihatProfilSiswa(absenSiswa, namaSiswa) {
    // Redirect ke halaman profile.html dengan parameter absen dan nama (fallback)
    const params = new URLSearchParams();
    params.set("absen", absenSiswa);
    if (namaSiswa) {
      params.set("nama", namaSiswa);
    }
    window.location.href = "profile.html?" + params.toString();
  }

  // Expose functions to window for onclick handlers
  window.lihatProfilSiswa = lihatProfilSiswa;

  /* ==========================================
     NOTIFIKASI WHATSAPP-STYLE - NEW TASKS
     ========================================== */

  // Fungsi untuk memainkan suara notifikasi
  // FIX: Create AudioContext with user gesture handling
  let audioContext = null;
  
  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume AudioContext if it's suspended (fixes "AudioContext was not allowed to start" warning)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(e => {
        console.log('Could not resume AudioContext:', e);
      });
    }
    return audioContext;
  }

  function playNotificationSound() {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.log("Audio notification not supported:", e);
    }
  }

  // Fungsi untuk menampilkan toast notifikasi WhatsApp-style
  window.showToastNotification = function (title, message, isNew = true) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="toast-icon">📝</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      ${isNew ? '<span class="toast-new-badge">BARU</span>' : ''}
    `;

    toastContainer.appendChild(toast);
    playNotificationSound();

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  };

  // Simpan timestamp terakhir посещение tugas
  function saveLastVisitTugas() {
    const now = new Date().toISOString();
    localStorage.setItem('lastVisitTugas_' + absen, now);
  }

  // Dapatkan timestamp terakhir посещение tugas
  function getLastVisitTugas() {
    return localStorage.getItem('lastVisitTugas_' + absen);
  }

  // Simpan ID tugas terakhir yang sudah dilihat
  function saveLastSeenTaskId(taskId) {
    localStorage.setItem('lastSeenTaskId_' + absen, taskId);
  }

  // Dapatkan ID tugas terakhir yang sudah dilihat
  function getLastSeenTaskId() {
    return localStorage.getItem('lastSeenTaskId_' + absen);
  }

  // Cek apakah ada tugas baru (untuk siswa saat load halaman)
  async function checkForNewTasks() {
    if (role === 'admin') return;

    try {
      const tugasSnapshot = await get(ref(db, 'tugas'));
      if (!tugasSnapshot.exists()) return;

      const tugasData = tugasSnapshot.val();
      const lastSeenTaskId = getLastSeenTaskId();
      const lastVisit = getLastVisitTugas();

      let newTasksCount = 0;
      let latestTask = null;
      const availableTasks = [];

      for (const [key, value] of Object.entries(tugasData)) {
        if (value.tersedia === false) continue;

        availableTasks.push({ ...value, key: key });

        if (lastVisit) {
          const taskCreated = value.createdAt || value.deadline;
          if (taskCreated && new Date(taskCreated) > new Date(lastVisit)) {
            newTasksCount++;
          }
        }

        if (!latestTask || (value.createdAt && (!latestTask.createdAt || new Date(value.createdAt) > new Date(latestTask.createdAt)))) {
          latestTask = { ...value, key: key };
        }
      }

      if (latestTask) {
        saveLastSeenTaskId(latestTask.key);
      }

      if (!lastVisit && availableTasks.length > 0) {
        window.showToastNotification(
          'Selamat Datang! 📚',
          `Ada ${availableTasks.length} tugas yang perlu diselesaikan`,
          false
        );
      } else if (newTasksCount > 0) {
        window.showToastNotification(
          'Tugas Baru! 📝',
          `Admin telah menambahkan ${newTasksCount} tugas baru. Check sekarang!`,
          true
        );
      }

      saveLastVisitTugas();

    } catch (error) {
      console.error('Error checking new tasks:', error);
    }
  }

  // Modifikasi Firebase listener untuk mendeteksi tugas baru secara real-time
  let previousTaskCount = 0;
  let firstLoad = true;

  onValue(tugasRef, (snapshot) => {
    const data = snapshot.val();
    tugasData = data ? Object.values(data) : [];
    tugasKeys = data ? Object.keys(data) : [];

    if (role !== 'admin' && !firstLoad) {
      const availableTasks = tugasData.filter(t => t.tersedia !== false);

      if (availableTasks.length > previousTaskCount && previousTaskCount > 0) {
        const latestTask = availableTasks
          .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
          })[0];

        if (latestTask) {
          window.showToastNotification(
            'Tugas Baru Ditambahkan! 📝',
            `${latestTask.mapel}: ${latestTask.deskripsi.substring(0, 50)}${latestTask.deskripsi.length > 50 ? '...' : ''}`,
            true
          );
        }
      }

      previousTaskCount = availableTasks.length;
    }

    firstLoad = false;
    renderTugas();

    if (role !== 'admin') {
      saveLastVisitTugas();
    }
  });

  // Pengecekan tugas baru saat halaman dimuat (untuk siswa)
  if (role !== 'admin') {
    setTimeout(() => {
      checkForNewTasks();
    }, 2000);
  }

  /* ==========================================
     FIREBASE CLOUD MESSAGING - PUSH NOTIFICATION
     ========================================== */

// Langsung minta izin notifikasi saat halaman dimuat (dengan cek permission dulu)
  async function requestNotificationImmediately() {
    // Skip untuk admin
    if (role === 'admin') {
      console.log('Admin user, skipping notification setup');
      return;
    }

    // 🔥 FIX: Deteksi iOS Safari - menggunakan notifikasi browser langsung sebagai fallback
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isIOSafari = isIOS && isSafari;

    // Cek apakah browser support Notification API
    if (!('Notification' in window)) {
      console.log('Browser tidak mendukung notifikasi');
      // Coba tampilkan toast info ke user
      if (window.showToastNotification) {
        window.showToastNotification(
          'Notifikasi Tidak Didukung',
          'Browser ini tidak mendukung push notification. Notifikasi dalam app akan tetap bekerja.',
          false
        );
      }
      return;
    }

    // 🔥 FIX: Untuk iOS Safari, gunakan notifikasi browser langsung sebagai gantinya
    if (isIOSafari) {
      console.log('iOS Safari detected - using browser notifications');
      
      // Coba minta izin notifikasi browser langsung
      if (Notification.permission === 'default' || Notification.permission === 'denied') {
        try {
          const permission = await Notification.requestPermission();
          console.log('iOS Safari notification permission:', permission);
          
          if (permission === 'granted') {
            // Beri tahu user bahwa notifikasi diaktifkan
            if (window.showToastNotification) {
              window.showToastNotification(
                'Notifikasi Aktif! 🔔',
                'Anda akan menerima notifikasi tugas baru.',
                false
              );
            }
          }
        } catch (e) {
          console.log('iOS Safari notification request failed:', e);
        }
      }
      
      // tetap lanjutkan ke FCM jika didukung, jika tidak berarti sudah tidak didukung
      console.log('iOS Safari: Using in-app notifications (toast) as primary notification method');
      return;
    }

    // CEK DULU: Jika sudah granted, langsung ambil token
    if (Notification.permission === 'granted') {
      console.log('Permission already granted, getting FCM token...');
      await getFCMToken();
      return;
    }

// CEK: Jika sudah denied sebelumnya, tetap coba minta izin lagi
    // Browser akan tetap menampilkan dialog izin (user harus klik "Allow")
    if (Notification.permission === 'denied') {
      console.log('Permission previously denied, will try again');
      // Tidak return di sini, biarkan mencoba lagi
      // User akan melihat dialog izin lagi
    }

    // Jika belum ada jawaban (default), baru minta izin
    // Tapi dengan delay kecil agar page loaded dulu
    setTimeout(async () => {
      try {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('Permission result:', permission);

        if (permission === 'granted') {
          console.log('Notifikasi diizinkan! Ambil FCM token...');
          await getFCMToken();
        } else if (permission === 'denied') {
          console.log('Izin ditolak oleh user');
          // Simpan status ini untuk mencegah retry berlebihan
          localStorage.setItem('notif_permission_denied', 'true');
        } else {
          console.log('Izin diabaikan (dismissed) oleh user');
        }
      } catch (error) {
        console.error('Error minta izin notifikasi:', error);
      }
    }, 1500); // Delay 1.5 detik agar page fully loaded
  }

  // Generate atau get device ID
  function getDeviceId() {
    let deviceId = localStorage.getItem('quartrix_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('quartrix_device_id', deviceId);
      console.log('New device ID generated:', deviceId);
    }
    return deviceId;
  }

  // Get device info
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let deviceType = 'desktop';
    let browser = 'unknown';
    let os = 'unknown';

    // Detect device type
    if (/iPad|iPhone|iPod/.test(ua)) {
      deviceType = 'ios';
    } else if (/Android/.test(ua)) {
      deviceType = 'android';
    } else if (/Windows Phone/.test(ua)) {
      deviceType = 'windows-phone';
    }

    // Detect browser
    if (/Chrome/.test(ua)) browser = 'chrome';
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'safari';
    else if (/Firefox/.test(ua)) browser = 'firefox';
    else if (/Edge/.test(ua)) browser = 'edge';

    // Detect OS
    if (/Windows/.test(ua)) os = 'windows';
    else if (/Mac/.test(ua)) os = 'macos';
    else if (/Linux/.test(ua)) os = 'linux';
    else if (/Android/.test(ua)) os = 'android';
    else if (/iOS|iPhone|iPad|iPod/.test(ua)) os = 'ios';

    return {
      deviceType,
      browser,
      os,
      userAgent: ua,
      timestamp: new Date().toISOString()
    };
  }

  async function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        console.log("Service Worker registered:", registration);
        
        // FIX: Wait for the Service Worker to be fully ready/activated
        // This fixes the race condition where FCM tries to subscribe before SW is active
        if (registration.active) {
          console.log("Service Worker is already active");
          return registration;
        }
        
        // Wait for the service worker to become active
        await new Promise((resolve) => {
          const worker = registration.installing || registration.waiting;
          if (worker) {
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated' || worker.state === 'active') {
                resolve();
              }
            });
          } else {
            resolve();
          }
        });
        
        console.log("Service Worker is now active");
        return registration;
      } catch (error) {
        console.error("Error register service worker:", error);
        return null;
      }
    }
    return null;
  }

  // Simpan token ke Firebase dan localStorage
  async function saveTokenToStorage(token) {
    if (!token || !absen) {
      console.log('Token atau absen tidak ada, skip save');
      return false;
    }

    const deviceId = getDeviceId();
    const deviceInfo = getDeviceInfo();

    try {
      // Simpan ke Firebase dengan struktur: fcmtokens/<token>
      const tokenRef = ref(db, "fcmtokens/" + token);
      await set(tokenRef, {
        nama: nama,
        absen: absen,
        deviceId: deviceId,
        deviceInfo: deviceInfo,
        lastActive: new Date().toISOString()
      });

      // Simpan ke localStorage sebagai backup
      localStorage.setItem('quartrix_fcm_token', token);
      localStorage.setItem('quartrix_fcm_token_absen', absen);
      localStorage.setItem('quartrix_fcm_token_time', new Date().toISOString());

      console.log('Token berhasil disimpan ke Firebase dan localStorage');
      console.log('Token:', token.substring(0, 20) + '...');
      console.log('Device ID:', deviceId);
      console.log('Device Info:', deviceInfo);

      return true;
    } catch (error) {
      console.error('Error menyimpan token:', error);
      return false;
    }
  }

  // Cek apakah token sudah ada di Firebase
  async function isTokenInFirebase(token) {
    try {
      const tokenRef = ref(db, "fcmtokens/" + token);
      const snapshot = await get(tokenRef);
      return snapshot.exists();
    } catch (error) {
      console.error('Error cek token di Firebase:', error);
      return false;
    }
  }

  // Get token dari localStorage jika ada
  function getTokenFromLocalStorage() {
    const savedToken = localStorage.getItem('quartrix_fcm_token');
    const savedAbsen = localStorage.getItem('quartrix_fcm_token_absen');
    
    if (savedToken && savedAbsen === absen) {
      console.log('Token ditemukan di localStorage');
      return savedToken;
    }
    return null;
  }

  async function getFCMToken() {
    // DEBUG: Cek nilai absen
    console.log("ABSEN:", absen);

    // GUARD: Jika absen tidak ada, skip
    if (!absen) {
      console.log("Absen belum ada, skip FCM");
      return;
    }

    try {
      console.log("Step 1: Registering Service Worker...");
      const registration = await registerServiceWorker();
      if (!registration) {
        console.error("Service Worker registration failed, cannot get FCM token");
        return;
      }
      console.log("Step 1: Service Worker registered successfully");

      console.log("Step 2: Getting Messaging instance...");
      messaging = getMessaging(app);
      if (!messaging) {
        console.error("Failed to get messaging instance");
        return;
      }
      console.log("Step 2: Messaging instance obtained");

      // Coba dulu dengan token yang sudah ada di localStorage
      const existingToken = getTokenFromLocalStorage();
      if (existingToken) {
        console.log('Step 3: Trying to use token from localStorage...');
        const isValid = await isTokenInFirebase(existingToken);
        if (isValid) {
          console.log('Token from localStorage is valid, no need to generate new one');
          // Tetap update lastActive
          await saveTokenToStorage(existingToken);
          return;
        } else {
          console.log('Token from localStorage is invalid in Firebase, generating new token');
          localStorage.removeItem('quartrix_fcm_token');
        }
      }

      // Generate token baru dengan timeout
      console.log('Step 4: Generating FCM token new...');
      console.log('Step 4a: Calling getToken with vapidKey and serviceWorkerRegistration');
      
      // Tambahkan timeout untuk getToken (maksimum 15 detik)
      const token = await Promise.race([
        getToken(messaging, {
          vapidKey: "BNi-Tt9FG9CYQJTTRIgK5g-_6RvI-AZ4juWhxSfh01fKv4lpvzLKWHfNYAgnrzsPCkUh_sLOwzmFclURRJM6leQ",
          serviceWorkerRegistration: registration
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("FCM token request timeout after 15 seconds")), 15000)
        )
      ]);

      console.log('Step 4b: getToken returned, token:', token ? token.substring(0, 20) + '...' : 'NULL');

      if (!token) {
        console.log('No token obtained from getToken');
        // Coba lagi dengan cara lain - tanpa serviceWorkerRegistration
        console.log('Retrying getToken without serviceWorkerRegistration...');
        try {
          const retryToken = await getToken(messaging, {
            vapidKey: "BNi-Tt9FG9CYQJTTRIgK5g-_6RvI-AZ4juWhxSfh01fKv4lpvzLKWHfNYAgnrzsPCkUh_sLOwzmFclURRJM6leQ"
          });
          console.log('Retry result:', retryToken ? retryToken.substring(0, 20) + '...' : 'NULL');
          if (retryToken) {
            await saveTokenToStorage(retryToken);
            return;
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
        }
        return;
      }

      // Simpan token
      console.log('Step 5: Saving token to storage...');
      await saveTokenToStorage(token);
      console.log('Step 5: Token saved successfully!');

    } catch (error) {
      console.error("Error getting FCM token:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      
      // Jika error timeout, coba pendekatan lain
      const isTimeout = error.message?.includes("timeout");
      
      if (isTimeout) {
        console.log("FCM getToken timeout - trying alternative approach...");
        
        // Coba pendekatan alternatif: tanpa serviceWorkerRegistration dan dengan timeout lebih pendek
        try {
          console.log("Trying alternative: getToken without SW registration...");
          const altToken = await Promise.race([
            getToken(messaging, {
              vapidKey: "BNi-Tt9FG9CYQJTTRIgK5g-_6RvI-AZ4juWhxSfh01fKv4lpvzLKWHfNYAgnrzsPCkUh_sLOwzmFclURRJM6leQ"
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Alt token timeout")), 8000)
            )
          ]);
          
          if (altToken) {
            console.log('Alternative approach succeeded! Token:', altToken.substring(0, 20) + '...');
            await saveTokenToStorage(altToken);
            return;
          }
        } catch (altError) {
          console.log("Alternative approach also failed:", altError.message);
        }
      }
      
      // Jika error karena FCM tidak didukung
      if (error.code === 'messaging/failed-start-background-token-fetch' || 
          error.code === 'messaging/unsupported-browser' ||
          error.message?.includes('permission')) {
        console.log('FCM is not supported in this browser, skip');
        return; // Stop di sini, jangan retry terus
      }
      
      // Coba lagi dengan delay 5 detik (hanya jika bukan timeout)
      if (!isTimeout) {
        console.log('Retrying getFCMToken in 5 seconds...');
        setTimeout(async () => {
          try {
            const retryMessaging = getMessaging(app);
            const retryToken = await Promise.race([
              getToken(retryMessaging, {
                vapidKey: "BNi-Tt9FG9CYQJTTRIgK5g-_6RvI-AZ4juWhxSfh01fKv4lpvzLKWHfNYAgnrzsPCkUh_sLOwzmFclURRJM6leQ"
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Retry timeout")), 10000)
              )
            ]);
            if (retryToken) {
              console.log('Retry successful, token:', retryToken.substring(0, 20) + '...');
              await saveTokenToStorage(retryToken);
            }
          } catch (retryError) {
            console.error('Retry also failed:', retryError.message);
          }
        }, 5000);
      } else {
        console.log("Skipping retry for timeout - FCM may not be supported in this environment");
        console.log("This usually happens on HTTP, Safari without proper config, or unsupported browsers");
      }
    }
  }

  // Variabel untuk messaging
  let messaging = null;

  // Minta notifikasi SEGERA setelah role diketahui (tanpa timeout)
  requestNotificationImmediately();

// Global function to request notification permission (called from badge click)
  window.requestNotificationPermission = async function () {
    console.log('Manual request for notification permission');

    if (!('Notification' in window)) {
      alert('Browser Anda tidak mendukung notifikasi!');
      return;
    }

    if (Notification.permission === 'granted') {
      alert('Notifikasi sudah diaktifkan! ✅');
      return;
    }

    // Jika denied, tetap coba minta izin lagi
    // Browser akan menampilkan dialog izin lagi
    if (Notification.permission === 'denied') {
      console.log('Permission previously denied, will try again');
      // Tidak return di sini, biarkan mencoba lagi
    }

    // Request permission
    const permission = await Notification.requestPermission();
    console.log('Permission result:', permission);

    if (permission === 'granted') {
      alert('Notifikasi berhasil diaktifkan! 🔔');
      await getFCMToken();
    } else {
      alert('Izin notifikasi ditolak.');
    }
  };

// Listen for foreground messages (if permission already granted)
  if (role !== 'admin') {
    try {
      // Check if Firebase Messaging is supported in this browser
      // Browsers without Service Worker support or proper notification APIs won't work
      if (!('serviceWorker' in navigator) || !('Notification' in window)) {
        console.log('Firebase Messaging is not supported in this browser');
        console.log('Foreground messaging not available: messaging/unsupported-browser');
        return;
      }

      const fgMessaging = getMessaging(app);
      
      // Setup message handler with better logging
      onMessage(fgMessaging, (payload) => {
        console.log('📬 Foreground message received:', payload);
        console.log('📬 Payload keys:', Object.keys(payload));
        console.log('📬 Notification:', payload.notification);
        console.log('📬 Data:', payload.data);

        // Extract notification data - support both notification and data formats
        const notificationTitle = payload.notification?.title || payload.data?.title || '📝 QUARTRIX - Tugas Baru!';
        const notificationBodyRaw = payload.notification?.body || payload.data?.body || 'Admin telah menambahkan tugas baru';
        const deadline = payload.data?.deadline || '';
        
        // Add deadline to notification body if available
        let notificationBody = notificationBodyRaw;
        if (deadline) {
          notificationBody = `${notificationBodyRaw}\n📅 Batas: ${deadline}`;
        }

        console.log('📬 Showing notification:', notificationTitle, notificationBody);

        // Show in-app toast notification
        window.showToastNotification(notificationTitle, notificationBody, true);

        // Also show browser notification if permission granted
        if (Notification.permission === 'granted') {
          // Check if browser supports notifications
          if ('Notification' in window) {
            const browserNotif = new Notification(notificationTitle, {
              body: notificationBody,
              icon: 'https://i.ibb.co.com/7xxVWwH7/IMG-8428.png',
              badge: 'https://i.ibb.co.com/7xxVWwH7/IMG-8428.png',
              tag: 'tugas-notification',
              requireInteraction: true,
              vibrate: [200, 100, 200]
            });

            browserNotif.onclick = function () {
              window.focus();
              this.close();
            };
          }
        }
      });
      
      console.log('✅ Foreground message listener registered');
    } catch (error) {
      console.log('❌ Foreground messaging error:', error.message);
    }
  }
}

