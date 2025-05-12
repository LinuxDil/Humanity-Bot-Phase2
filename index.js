import fs from "fs";
import { TOKEN_FILE } from "./config.js";
import { call } from "./modules/api.js";
import { getRandomProxy } from "./modules/proxy.js";
import { logError } from "./modules/logger.js";
import { showBanner, wait } from "./modules/util.js";

if (!fs.existsSync(TOKEN_FILE)) {
  console.error("❌ File tokens.txt tidak ditemukan!");
  process.exit(1);
}

const TOKENS = fs.readFileSync(TOKEN_FILE, "utf-8").split("\n").map(t => t.trim()).filter(Boolean);

async function processToken(token, index) {
  const agent = getRandomProxy();

  try {
    console.log(`\n🔹 Memproses Token #${index + 1}`);

    const userInfo = await call("/api/user/userInfo", token, agent);
    console.log("✅ Nama Pengguna:", userInfo.data.nickName);
    console.log("✅ Alamat Wallet:", userInfo.data.ethAddress);

    const balance = await call("/api/rewards/balance", token, agent, "GET");
    console.log("💰 Total Hadiah Saat Ini:", balance.balance.total_rewards);

    const rewardStatus = await call("/api/rewards/daily/check", token, agent);
    console.log("📊 Status:", rewardStatus.message);

    if (!rewardStatus.available) {
      console.log("⏳ Sudah klaim hari ini, lewati...");
      return;
    }

    const claim = await call("/api/rewards/daily/claim", token, agent);

    if (claim?.data?.amount) {
      console.log("🎉 Klaim berhasil, hadiah yang didapat:", claim.data.amount);
    } else if (claim.message?.includes("successfully claimed")) {
      console.log("🎉 Kamu sudah berhasil klaim hadiah hari ini.");
    } else {
      console.error("❌ Gagal klaim hadiah. Respon tidak sesuai harapan:", claim);
      return;
    }

    const updatedBalance = await call("/api/rewards/balance", token, agent, "GET");

    if (updatedBalance?.balance) {
      console.log("💰 Hadiah Setelah Klaim:", updatedBalance.balance.total_rewards);
    } else {
      console.error("❌ Gagal mendapatkan saldo terbaru:", updatedBalance);
    }

  } catch (err) {
    console.error("❌ Terjadi kesalahan:", err.message);
    logError(`Token #${index + 1} gagal: ${err.message}`);
  }

  const delay = Math.floor(Math.random() * 5000) + 5000;
  console.log(`⏳ Menunggu ${delay / 1000} detik...\n`);
  await wait(delay);
}

async function batchRun() {
  showBanner();
  while (true) {
    console.log(`\n🚀 Memulai klaim untuk ${TOKENS.length} akun...`);

    for (let i = 0; i < TOKENS.length; i++) {
      await processToken(TOKENS[i], i);
    }

    console.log("✅ Semua akun telah diproses, tunggu 6 jam untuk eksekusi berikutnya...\n");
    await wait(6 * 60 * 60 * 1000); // 6 jam
  }
}

batchRun();
