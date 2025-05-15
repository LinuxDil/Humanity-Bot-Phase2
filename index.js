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
  try {
    console.log(chalk.green(figlet.textSync("Humanity Auto Claim", { horizontalLayout: "default" })));
  } catch {
    console.log(chalk.green("=== Humanity Auto Claim ==="));
  }
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
    console.log(chalk.hex('#FFA500')("💰 HP Point saat ini:", balance.balance.total_rewards));

    const rewardStatus = await call("/api/rewards/daily/check", token, agent);
    console.log("📊 Status:", rewardStatus.message);

    if (!rewardStatus.available) {
      console.log("⏳ Sudah klaim hari ini, Lewati...");
      return;
    }

    const claim = await call("/api/rewards/daily/claim", token, agent);
    
    if (claim && claim.data && claim.data.amount) {
      console.log("🎉 Klaim berhasil, HP Point:", claim.data.amount);
    } else if (claim.message && claim.message.includes('successfully claimed')) {
      console.log("🎉 Anda telah berhasil mengklaim HP Point hari ini.");
    } else {
      console.error("❌ Klaim gagal, data yang diterima tidak sesuai:", claim);
      return;
    }

    const updatedBalance = await call("/api/rewards/balance", token, agent, "GET");

    if (updatedBalance && updatedBalance.balance) {
      console.log(chalk.green("💰 HP Point setelah klaim:", updatedBalance.balance.total_rewards));
    } else {
      console.error("❌ Gagal memperbarui HP Point, data yang diterima tidak sesuai:", updatedBalance);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    logError(`Token #${index + 1} gagal: ${err.message}`);
  }

  const delay = Math.floor(Math.random() * 5000) + 15000;
  console.log(chalk.hex('#FFA500')(`⏳ Menunggu ${delay / 1000} detik...\n`));
  await new Promise(resolve => setTimeout(resolve, delay));
}

function countdown(seconds, onFinish) {
  let remainingTime = seconds;

  const interval = setInterval(() => {
    const hours = Math.floor(remainingTime / 3600);
    const minutes = Math.floor((remainingTime % 3600) / 60);
    const seconds = remainingTime % 60;

    const timeLeft = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    process.stdout.write(`⏳ Menunggu ${timeLeft} sebelum dijalankan lagi... jika ada masalah hubungi https://t.me/airdropseeker_official\r`);

    remainingTime--;

    if (remainingTime < 0) {
      clearInterval(interval);
      console.log("\n⏳ Countdown selesai, memulai putaran baru...");
      onFinish(); // lanjutkan ke putaran selanjutnya
    }
  }, 1000);
}

async function startRound() {
  console.log(chalk.bgGreen.black.bold(`\n🚀 Memulai proses klaim massal, total ${TOKENS.length} akun...`));

  for (let i = 0; i < TOKENS.length; i++) {
    await processToken(TOKENS[i], i);
  }

  console.log(chalk.green(`✅ Proses putaran ini selesai, mulai countdown 24 jam...`));
  countdown(24 * 60 * 60, startRound); // jalankan ulang bot setelah countdown selesai
}

function batchRun() {
  showBanner();
  startRound(); // mulai putaran pertama
}

batchRun();
