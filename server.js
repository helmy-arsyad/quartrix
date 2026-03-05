const express = require("express");
const bodyParser = require("body-parser");
const kirimNotifikasiTugas = require("./sendNotification");

const app = express();
app.use(bodyParser.json());

app.post("/sendNotification", async (req, res) => {
  const { mapel, deskripsi } = req.body;

  try {
    await kirimNotifikasiTugas(mapel, deskripsi);
    res.send("Notifikasi terkirim");
  } catch (err) {
    console.error(err);
    res.status(500).send("Gagal kirim notifikasi");
  }
});

app.listen(3000, () => {
  console.log("Server notifikasi berjalan di port 3000");
});