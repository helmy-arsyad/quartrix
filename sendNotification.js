const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://quartrix-eb95f-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();

async function kirimNotifikasiTugas(mapel, deskripsi, deadline) {

const snapshot = await db.ref("fcmtokens").once("value");

  if (!snapshot.exists()) {
    console.log("Tidak ada token siswa - siswa perlu membuka dashboard dulu untuk menerima notifikasi");
    return { success: 0, message: "Tidak ada token tersimpan" };
  }

  const tokens = [];

  snapshot.forEach((child) => {
    // Key adalah token itu sendiri
    tokens.push(child.key);
  });

  const uniqueTokens = [...new Set(tokens)];
  
  console.log("Mengirim notifikasi ke", uniqueTokens.length, "tokens");

  // Format deadline dengan format yang lebih readable
  const deadlineInfo = deadline ? `📅 Batas: ${deadline}` : '';
  const timestamp = new Date().toLocaleString('id-ID', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Buat body notifikasi yang lebih lengkap
  const notificationBody = deadline 
    ? `${mapel}\n${deskripsi}\n${deadlineInfo}`
    : `${mapel}\n${deskripsi}`;

  // Format pesan untuk FCM - menggunakan notification field untuk foreground
  // dan data field untuk background
  const message = {
    notification: {
      title: "📝 QUARTRIX - Tugas Baru!",
      body: notificationBody
    },
    data: {
      title: "📝 QUARTRIX - Tugas Baru!",
      body: notificationBody,
      mapel: mapel,
      deskripsi: deskripsi,
      deadline: deadline || '',
      timestamp: timestamp,
      click_action: "dashboard.html"
    },
    tokens: uniqueTokens,
    webpush: {
      notification: {
        icon: "https://i.ibb.co.com/7xxVWwH7/IMG-8428.png",
        badge: "https://i.ibb.co.com/7xxVWwH7/IMG-8428.png",
        tag: "tugas-notification",
        requireInteraction: true,
        timestamp: Date.now(),
        vibrate: [200, 100, 200, 100, 200]
      },
      fcmOptions: {
        link: "/dashboard.html"
      }
    }
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log("Total token:", uniqueTokens.length);
    console.log("Berhasil:", response.successCount);
    console.log("Gagal:", response.failureCount);
    
    // Log details of failures if any
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error("Token gagal:", uniqueTokens[idx], resp.error.message);
        }
      });
    }
    
    return { 
      success: response.successCount, 
      failed: response.failureCount 
    };
  } catch (error) {
    console.error("Error sending multicast:", error);
    throw error;
  }
}

module.exports = kirimNotifikasiTugas;
