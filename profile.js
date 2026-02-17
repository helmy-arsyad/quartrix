// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  remove,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

const currentAbsen = localStorage.getItem("absen");
// Wait for auth state to be ready before allowing writes
let isAuthReady = false;

onAuthStateChanged(auth, (user) => {
  if (user) {
    isAuthReady = true;
  }
});
const currentRole = localStorage.getItem("role");
const currentNama = localStorage.getItem("nama");

const defaultAvatar = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDE1MCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNzUiIGN5PSI3NSIgcj0iNzUiIGZpbGw9IiNmZmY1ZTYiLz48cGF0aCBkPSJNNzUgNzVDODAgNzUgODUgNzAgODUgNjVDNjg1IDU5IDgwIDU1IDc1IDU1QzY5IDU1IDY1IDU5IDY1IDY1QzY1IDcwIDY5IDc1IDc1IDc1WiIgZmlsbD0iIzNlMmMyMyIvPjxwYXRoIGQ9Ik04NSA2NUM4NSA3MCA4OCA3NSA5MSA3NUM5NCA3NSA5NSA3MCA5NSA2NUw5NSA1OEM5NCA1MyA5MSA0OCA4OCA0OEM4NSA0OCA4MiA1MyA4MiA1OEw4MiA2NUM4NSA2NVoiIGZpbGw9IiMzZTJjMjMiLz48L3N2Zz4=";

let profilData = { nama: currentNama || "", absen: currentAbsen || "", fotoURL: defaultAvatar };

if (!currentAbsen || !currentRole) {
  window.location.href = "login.html";
}

const urlParams = new URLSearchParams(window.location.search);
const profileAbsen = urlParams.get("absen");
const canEdit = currentRole !== "admin" && profileAbsen === currentAbsen;

async function initEditProfile() {
  if (!canEdit) {
    const editBtn = document.getElementById("editProfilBtn");
    if (editBtn) editBtn.style.display = "none";
    return;
  }

  try {
    const snapshot = await get(ref(db, "siswa/" + currentAbsen));
    if (snapshot.exists()) {
      profilData = snapshot.val();
      if (!profilData.fotoURL) profilData.fotoURL = defaultAvatar;
    }
  } catch (error) {
    console.error("Error:", error);
  }

  const editBtn = document.getElementById("editProfilBtn");
  const modal = document.getElementById("modalEditProfil");
  const closeBtn = document.querySelector(".close-modal-edit");
  const saveBtn = document.getElementById("btnSimpanProfil");
  const hapusFotoBtn = document.getElementById("hapusFotoBtn");

  if (editBtn && modal) editBtn.onclick = openEditModal;
  if (closeBtn) closeBtn.onclick = closeEditModal;
  if (modal) modal.onclick = (e) => { if (e.target === modal) closeEditModal(); };
  if (saveBtn) saveBtn.onclick = simpanProfil;
  if (hapusFotoBtn) hapusFotoBtn.onclick = hapusFoto;
}

function openEditModal() {
  const modal = document.getElementById("modalEditProfil");
  if (modal) {
    document.getElementById("editNama").value = profilData.nama || "";
    document.getElementById("editAbsen").value = profilData.absen || "";
    document.getElementById("editAbsenLogin").value = profilData.absen || "";
    modal.style.display = "flex";
  }
}

function closeEditModal() {
  const modal = document.getElementById("modalEditProfil");
  if (modal) modal.style.display = "none";
  const fileInput = document.getElementById("editFoto");
  if (fileInput) fileInput.value = "";
}

function hapusFoto() {
  profilData.fotoURL = defaultAvatar;
  const profilePhoto = document.getElementById("profilePhoto");
  if (profilePhoto) profilePhoto.src = defaultAvatar;
  alert("Foto profil berhasil dihapus!");
}

async function simpanProfil() {
  // Wait for auth to be ready
  if (!isAuthReady) {
    // Try to refresh auth state
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        if (user) {
          isAuthReady = true;
          resolve(doSaveProfile());
        } else {
          alert("Silakan login ulang untuk menyimpan profil!");
          window.location.href = "login.html";
        }
      });
    });
  }
  
  return doSaveProfile();
}

async function doSaveProfile() {
  const newNama = document.getElementById("editNama").value.trim();
  const newAbsen = document.getElementById("editAbsen").value.trim();
  const newAbsenLogin = document.getElementById("editAbsenLogin").value.trim();
  const fotoFile = document.getElementById("editFoto").files[0];

  if (!newNama || !newAbsen || !newAbsenLogin) return alert("Isi semua field!");

  let fotoURL = profilData.fotoURL;

  if (fotoFile) {
    fotoURL = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(fotoFile);
    });
  }

  const oldAbsen = currentAbsen;

  if (newAbsenLogin !== oldAbsen) {
    const snapshot = await get(ref(db, "siswa/" + newAbsenLogin));
    if (snapshot.exists()) return alert("Absen login sudah digunakan!");
  }

  try {
    await set(ref(db, "siswa/" + newAbsenLogin), {
      nama: newNama, absen: newAbsen, role: currentRole, fotoURL: fotoURL
    });

    localStorage.setItem("absen", newAbsenLogin);
    localStorage.setItem("nama", newNama);
    closeEditModal();
    alert("Profil berhasil disimpan!");

    if (newAbsenLogin !== oldAbsen) {
      await remove(ref(db, "siswa/" + oldAbsen));
      alert("Absen login diubah. Silakan login ulang.");
      localStorage.clear();
      window.location.href = "login.html";
    } else {
      window.location.reload();
    }
  } catch (error) {
    console.error("Error:", error);
    alert("Terjadi kesalahan!");
  }
}

window.closeEditModal = closeEditModal;
window.simpanProfil = simpanProfil;
window.hapusFoto = hapusFoto;

document.addEventListener("DOMContentLoaded", initEditProfile);
