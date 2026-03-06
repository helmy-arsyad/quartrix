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
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua);
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

// Login anonymous secara otomatis TANPA retry (FIX #3)
async function initAuth() {
  try {
    // 🔥 FIX: Login 1x saja, tunggu auth state ready
    await signInOnce();
    console.log("Anonymous login berhasil");

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
  updateProfilUI();

  // Load profil dari Firebase
  get(profilRef).then((snapshot) => {
    if (snapshot.exists()) {
      profilData = snapshot.val();
      updateProfilUI();
    }
  });

  function updateProfilUI() {
    const foto = document.getElementById("profilFoto");
    const infoText = document.getElementById("infoText");

    foto.src = profilData?.fotoURL || foto.src;

    if (role === "admin") {
      infoText.innerText = "🎉 Anda login sebagai ADMIN! 🎉";
    } else {
      const namaDisplay = profilData?.nama || nama || "Pengguna";
      const absenDisplay = profilData?.absen || absen || "-";
      infoText.innerText = `👋 Halo, ${namaDisplay}! Selamat datang di QUARTRIX (Absen ${absenDisplay}) 🌟`;
    }
  }

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
  } else {
    jadwalDetail.innerHTML =
      "<p style='text-align:center;color:#666;'>Tidak ada jadwal untuk hari ini.</p>";
  }

  function tampilJadwal(hari, btn) {
    document
      .querySelectorAll(".hari-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
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

  /* TUGAS MENARIK DENGAN CHECKLIST */
  let tugasData = [];
  let tugasKeys = []; // Simpan key untuk hapus
  let tugasSelesai = {}; // Status selesai per tugas per siswa
  const tugasList = document.getElementById("tugasList");

  // Fixed: Using for...of loop instead of forEach to properly await async functions
  async function renderTugas() {
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
  document.getElementById("btnTambahTugas").addEventListener("click", async () => {
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
          deskripsi: deskripsi
        })
      });

      console.log("Notifikasi terkirim");
    } catch (err) {
      console.error("Gagal kirim notifikasi", err);
    }

    document.getElementById("mapelBaru").value = "";
    document.getElementById("tugasBaru").value = "";
  });

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
        deskripsi: desc
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
  btnTambahSiswa.addEventListener("click", async () => {
    const nama = namaBaru.value.trim().toUpperCase();
    const absen = absenBaru.value.trim();

    if (!nama || !absen) return alert("Isi semua field!");

    const existingRef = ref(db, "siswa/" + absen);
    const snapshot = await get(existingRef);
    if (snapshot.exists()) {
      return alert(
        "Absen sudah digunakan siswa lain! Pilih absen yang belum digunakan.",
      );
    }

    set(ref(db, "siswa/" + absen), {
      nama: nama,
      absen: absen,
      role: "siswa",
      fotoURL: "",
    });

    namaBaru.value = "";
    absenBaru.value = "";
    alert("Siswa berhasil ditambahkan ke Firebase!");
  });

  /* UBAH ABSEN SISWA (ADMIN) */
  const absenLama = document.getElementById("absenLama");
  const absenBaruAdmin = document.getElementById("absenBaruAdmin");
  const btnUbahAbsen = document.getElementById("btnUbahAbsen");
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
    dataLama.absen = baru; // Tambahkan ini

    // pindahkan data
    await set(ref(db, "siswa/" + baru), dataLama);
    await remove(oldRef);

    alert("Absen berhasil diubah!");
    absenLama.value = "";
    absenBaruAdmin.value = "";
  });

  /* LOGOUT */
  const logoutBtn = document.querySelector(".logout");
  logoutBtn.addEventListener("click", function () {
    localStorage.clear();
    location.href = "login.html";
  });

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
  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log("Audio notification not supported");
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

    // Cek apakah browser support Notification API
    if (!('Notification' in window)) {
      console.log('Browser tidak mendukung notifikasi');
      return;
    }

    // CEK DULU: Jika sudah granted, langsung ambil token
    if (Notification.permission === 'granted') {
      console.log('Permission already granted, getting FCM token...');
      await getFCMToken();
      return;
    }

    // Jika belum granted, baru minta izin
    try {
      console.log('Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('Permission result:', permission);

      if (permission === 'granted') {
        console.log('Notifikasi diizinkan! Ambil FCM token...');
        await getFCMToken();
      } else {
        console.log('Izin ditolak:', permission);
      }
    } catch (error) {
      console.error('Error minta izin notifikasi:', error);
    }
  }

  async function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        console.log("Service Worker registered:", registration);
        return registration;
      } catch (error) {
        console.error("Error register service worker:", error);
        return null;
      }
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
      const registration = await registerServiceWorker();
      if (!registration) return;

      messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey: "BNi-Tt9FG9CYQJTTRIgK5g-_6RvI-AZ4juWhxSfh01fKv4lpvzLKWHfNYAgnrzsPCkUh_sLOwzmFclURRJM6leQ",
        serviceWorkerRegistration: registration
      });

      if (!token) return;

      // CEK LEBIH KOMPLIT: Cek apakah token ini sudah ada di database
      const allTokensRef = ref(db, "fcmTokens");
      const allSnapshot = await get(allTokensRef);
      
      if (allSnapshot.exists()) {
        const allTokens = allSnapshot.val();
        // Cek apakah token sudah ada sebagai key
        if (allTokens.hasOwnProperty(token)) {
          console.log("Token sudah ada di database (sebagai key), skip save");
          return;
        }
      }

      // Simpan token dengan key = token
      const tokenRef = ref(db, "fcmTokens/" + token);
      await set(tokenRef, {
        nama: nama,
        absen: absen
      });

      console.log("Token disimpan ke fcmTokens:", token);

    } catch (error) {
      console.error("Error getting FCM token:", error);
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

    if (Notification.permission === 'denied') {
      alert('Notifikasi diblokir. Silakan aktifkan di pengaturan browser Anda (Settings > Notifications).');
      return;
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
      const fgMessaging = getMessaging(app);
      onMessage(fgMessaging, (payload) => {
        console.log('Foreground message received:', payload);

        // Show in-app notification
        const notificationTitle = payload.notification?.title || 'Tugas Baru!';
        const notificationBody = payload.notification?.body || 'Admin telah menambahkan tugas baru';

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
    } catch (error) {
      console.log('Foreground messaging not available:', error);
    }
  }
}

