import fs from "fs";
import fetch from "node-fetch";
import fetchCookie from "fetch-cookie";
import { HttpsProxyAgent } from "https-proxy-agent";
import { CookieJar } from "tough-cookie";
import figlet from "figlet";
import chalk from "chalk";

const BASE_URL = "https://testnet.humanity.org";
const TOKEN_FILE = "tokens.txt";
const PROXY_FILE = "proxy.txt";
const LOG_FILE = "log.txt";

if (!fs.existsSync(TOKEN_FILE)) {
  console.error("❌ tokens.txt tidak ditemukan!");
  process.exit(1);
}

const TOKENS = fs.readFileSync(TOKEN_FILE, "utf-8").split("\n").map(t => t.trim()).filter(Boolean);
const PROXIES = fs.existsSync(PROXY_FILE)
  ? fs.readFileSync(PROXY_FILE, "utf-8").split("\n").map(p => p.trim()).filter(Boolean)
  : [];

function getRandomProxy() {
  if (PROXIES.length > 0) {
    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    return new HttpsProxyAgent(proxy);
  }
  return null;
}

function logError(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

function showBanner() {
  console.log(chalk.green(figlet.textSync("Humanity Auto Claim", { horizontalLayout: "default" })));
}

async function call(endpoint, token, agent, method = "POST", body = {}) {
  const url = BASE_URL + endpoint;
  const jar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, jar);

  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    token: token,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  };

  try {
    const res = await fetchWithCookies(url, {
      method,
      headers,
      agent,
      body: method === "GET" ? undefined : JSON.stringify(body)
    });

    let responseData;
    try {
      responseData = await res.json();
    } catch (jsonErr) {
      throw new Error(`Diterima data bukan JSON: ${jsonErr.message}`);
    }

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${responseData.message || "Kesalahan tidak diketahui"}`);
    }

    return responseData;
  } catch (err) {
    throw new Error(`Permintaan gagal (${endpoint}): ${err.message}`);
  }
}

async function processToken(token, index) {
  const agent = getRandomProxy();

  try {
    console.log(chalk.cyan(`\n🔹 Memulai proses Token #${index + 1}`));

    const userInfo = await call("/api/user/userInfo", token, agent);
    console.log("✅ Pengguna:", userInfo.data.nickName);
    console.log("✅ Dompet:", userInfo.data.ethAddress);

    const balance = await call("/api/rewards/balance", token, agent, "GET");
    console.log(chalk.green("💰 Hadiah saat ini:", balance.balance.total_rewards));

    const rewardStatus = await call("/api/rewards/daily/check", token, agent);
    console.log(chalk.bold("📊 Status:", rewardStatus.message));

    if (!rewardStatus.available) {
      console.log("⏳ Sudah klaim hari ini, Lewati...");
      return;
    }

    const claim = await call("/api/rewards/daily/claim", token, agent);
    
    // Periksa data klaim yang diterima
    if (claim && claim.data && claim.data.amount) {
        console.log("🎉 Klaim berhasil, hadiah:", claim.data.amount);
    } else if (claim.message && claim.message.includes('successfully claimed')) {
        console.log("🎉 Anda telah berhasil mengklaim hadiah hari ini.");
    } else {
        console.error("❌ Klaim gagal, data yang diterima tidak sesuai:", claim);
        return;  // Lewati permintaan ini dan lanjutkan ke yang berikutnya
    }

    const updatedBalance = await call("/api/rewards/balance", token, agent, "GET");

    // Periksa data saldo yang diperbarui
    if (updatedBalance && updatedBalance.balance) {
        console.log("💰 Hadiah setelah klaim:", updatedBalance.balance.total_rewards);
    } else {
        console.error("❌ Gagal memperbarui hadiah, data yang diterima tidak sesuai:", updatedBalance);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    logError(`Token #${index + 1} gagal: ${err.message}`);
  }

  // Hindari permintaan terlalu cepat
  const delay = Math.floor(Math.random() * 5000) + 5000;
  console.log(`⏳ Menunggu ${delay / 1000} detik...\n`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function batchRun() {
  showBanner();

  while (true) {
    console.log(chalk.bgGreen.black(`\n🚀 Memulai proses klaim massal, total ${TOKENS.length} akun...`));

    for (let i = 0; i < TOKENS.length; i++) {
      await processToken(TOKENS[i], i);
    }

    console.log(chalk.green(`✅ Proses putaran ini selesai, mulai countdown 6 jam...`));

    // Hitung mundur 6 jam (6 * 60 * 60 detik = 21600 detik)
    let remainingTime = 6 * 60 * 60; // dalam detik

    const interval = setInterval(() => {
      const hours = Math.floor(remainingTime / 3600);
      const minutes = Math.floor((remainingTime % 3600) / 60);
      const seconds = remainingTime % 60;

      const timeLeft = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      process.stdout.write(`⏳ Menunggu ${timeLeft} sebelum dijalankan lagi...\r`);

      remainingTime--;

      // Jika waktu mundur selesai
      if (remainingTime <= 0) {
        clearInterval(interval);
        console.log("\n⏳ Countdown selesai, memulai putaran baru...");
      }
    }, 1000); // Interval per detik

    // Tunggu sampai countdown selesai
    await new Promise(resolve => setTimeout(resolve, 21600 * 1000)); // Tunggu 6 jam
  }
}

batchRun();
