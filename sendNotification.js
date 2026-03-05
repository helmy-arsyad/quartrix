const admin = require("firebase-admin");
const fetch = require("node-fetch");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://quartrix-eb95f-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();

const SERVER_KEY =
  "BNi-Tt9FG9CYQJTTRIgK5g-_6RvI-AZ4juWhxSfh01fKv4lpvzLKWHfNYAgnrzsPCkUh_sLOwzmFclURRJM6leQ";

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

  for (const token of tokens) {
    await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "key=" + SERVER_KEY,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: "📝 Tugas Baru Ditambahkan",
          body: `${mapel} - ${deskripsi.substring(0, 60)}`,
        },
      }),
    });
  }

  console.log("Notifikasi terkirim ke semua siswa");
}

module.exports = kirimNotifikasiTugas;