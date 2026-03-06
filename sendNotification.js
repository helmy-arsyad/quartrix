const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://quartrix-eb95f-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();

async function kirimNotifikasiTugas(mapel, deskripsi) {
  const snapshot = await db.ref("fcmTokens").once("value");

  if (!snapshot.exists()) {
    console.log("Tidak ada token siswa");
    return;
  }

  const tokens = [];

  snapshot.forEach((child) => {
    tokens.push(child.val().token);
  });

  const message = {
    notification: {
      title: "📝 Tugas Baru Ditambahkan",
      body: `${mapel} - ${deskripsi.substring(0, 60)}`,
    },
    tokens: tokens,
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  console.log("Notifikasi terkirim:", response.successCount);
}

module.exports = kirimNotifikasiTugas;