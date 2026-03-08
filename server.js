const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const kirimNotifikasiTugas = require("./sendNotification");

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.post("/sendNotification", async (req, res) => {
  const { mapel, deskripsi, deadline } = req.body;

  try {
    await kirimNotifikasiTugas(mapel, deskripsi, deadline);
    res.send("Notifikasi terkirim");
  } catch (err) {
    console.error(err);
    res.status(500).send("Gagal kirim notifikasi");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server notifikasi berjalan di port " + PORT);
});