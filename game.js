// =================== game.js (FULL, cleaned & fixed) ===================
// - Fixed TDZ error (dangerLineY declared before use).
// - Mouse tracking works on start (no need to re-enter canvas).
// - Bricks clamped on resize (prevents falling outside bounds).
// - Robust sweepAABB + line fallback to avoid clipping.
// - Hit cooldown & separation to avoid multi-damage & sticking.
// - Phonics locking/unlocking behavior implemented.
// - ESC pause menu and level-up modal exist and behave as before.
// - Auto-shoot uses timer, shoots one ball per interval (with per-type limit).
// -------------------------------------------------------------------------
// CONFIG
// =================== PRE-GAME LOADING ===================
const GITHUB_RAW_DATA_URL =
  "https://raw.githubusercontent.com/Fireader06/workspace/main/data.js";
let ballRegistry = {}; // name -> ball json
let dataList = []; // array of ball objects from data.js

async function loadDataJS() {
  try {
    const r = await fetch(GITHUB_RAW_DATA_URL + "?ts=" + Date.now()); // cache-bust
    if (!r.ok) throw new Error("Failed to fetch data.js: " + r.status);
    const txt = await r.text();

    // data.js might be "export const jsonData = [...];" or "const jsonData = [...];"
    // Extract the first large array occurrence
    const m = txt.match(/\[[\s\S]*\]/m);
    if (!m) throw new Error("data.js: can't locate array");
    const arr = JSON.parse(m[0]);

    dataList = Array.isArray(arr) ? arr : [];
    ballRegistry = {};
    for (const b of dataList) {
      ballRegistry[b.name] = b;
    }
    console.log("Loaded data.js:", dataList.length, "balls");
  } catch (err) {
    console.error("loadDataJS error:", err);
  }
}

document.getElementById("level-up-btn").onclick = () => {
  hideOrbMenu();
  openLevelUpMenu();
};

document.getElementById("merge-btn").onclick = () => {
  hideOrbMenu();
  openMergeMenu();
};

// =================== CANVAS SETUP ===================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- core layout variables declared early ---
let dangerLineY = 0; // MUST be declared before resizeCanvas runs

function resizeCanvas() {
  // Set canvas size to parent container each resize
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;

  // Update derived layout variable
  dangerLineY = canvas.height * 0.725;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas(); // run once at startup

// =================== GLOBAL INPUT / MOUSE STATE ===================
let mouseClientX = window.innerWidth / 2;
let mouseClientY = window.innerHeight / 2;
let mouseCanvasX = 0;
let mouseCanvasY = 0;
let mouseInsideCanvas = false;
let snapshotTimer = 0;
this.flashTimer = 0;
this.flashing = false;

function updateMouseInsideState() {
  const rect = canvas.getBoundingClientRect();
  mouseInsideCanvas =
    mouseClientX >= rect.left &&
    mouseClientX <= rect.right &&
    mouseClientY >= rect.top &&
    mouseClientY <= rect.bottom;

  if (mouseInsideCanvas) {
    mouseCanvasX = mouseClientX - rect.left;
    mouseCanvasY = mouseClientY - rect.top;
  }
}

// Always keep mouse position updated by browser events
window.addEventListener("mousemove", (e) => {
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  updateMouseInsideState();
});
canvas.addEventListener("mouseenter", () => {
  updateMouseInsideState();
  mouseInsideCanvas = true;
});
canvas.addEventListener("mouseleave", () => {
  mouseInsideCanvas = false;
});

const dot = document.createElement("div");
Object.assign(dot.style, {
  position: "fixed",
  width: "6px",
  height: "6px",
  background: "black",
  borderRadius: "50%",
  pointerEvents: "none",
  zIndex: "2147483647",
  transform: "translate(-50%, -50%)",
});
document.body.appendChild(dot);

document.addEventListener("mousemove", (e) => {
  dot.style.left = e.clientX + "px";
  dot.style.top = e.clientY + "px";
});

// Hide cursor globally
document.body.style.cursor = "none";

// Optional: create overlay for dropdowns (covers OS rendering)
const overlay = document.createElement("div");
Object.assign(overlay.style, {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  pointerEvents: "none",
  zIndex: "2147483646", // just below the dot
});
document.body.appendChild(overlay);

// =================== UTILITIES ===================
let baseSeed = 12345;
let incremental = jsonData.length; // number of levels
let seedString = `${baseSeed}${String(incremental).padStart(3, "0")}`;
let seed = parseInt(seedString);

function seededRandom() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function seededInt(max) {
  return Math.floor(seededRandom() * max);
}

const savedSeed = localStorage.getItem("playSeed");
if (savedSeed !== null) {
  seed = parseInt(savedSeed);
  localStorage.removeItem("playSeed");
}

function saveLevelSnapshot() {
  const img = canvas.toDataURL("image/png");
  const entry = {
    timestamp: Date.now(),
    seed: seed,
    image: img,
  };

  let levels = JSON.parse(localStorage.getItem("levels") || "[]");

  // avoid duplicates if called often
  if (!levels.some((l) => l.seed === seed)) {
    levels.push(entry);
    localStorage.setItem("levels", JSON.stringify(levels));
  }
}

// Level-up choices
let levelUpChoices = [];

// Line intersects rect helper (Cohen–Sutherland-ish param clip)
function lineIntersectsRect(x1, y1, x2, y2, rect) {
  // Bounding-box quick reject
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < left || minX > right) return false;
  if (maxY < top || minY > bottom) return false;

  // Liang–Barsky parametric clipping
  const dx = x2 - x1;
  const dy = y2 - y1;

  let t0 = 0;
  let t1 = 1;

  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) {
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    clip(-dx, x1 - left) &&
    clip(dx, right - x1) &&
    clip(-dy, y1 - top) &&
    clip(dy, bottom - y1)
  ) {
    return true;
  }
  return false;
}

function handleOrbCollected(drop) {
  gamePaused = true;
  showOrbMenu();
}

function showOrbMenu() {
  document.getElementById("orb-menu").style.display = "block";
}

function hideOrbMenu() {
  document.getElementById("orb-menu").style.display = "none";
  gamePaused = false;
}

// =================== GAME VARIABLES ===================
let spawnRateScale = 0.15;
let xpGainScale = 1.0;
let selectedBall = null;
let autoShootTimer = 0;
const autoShootInterval = 1100;
let currentBallIndex = 0;

// phonics UI
let phonicsMenu = null;
let phonicsMenuOpen = false;
const phonicsList = ["ei", "wr", "ph", "kn", "tion", "dge", "igh", "oo", "ow"];

// =================== BALL DATA ===================
const StarterBall = {
  name: "StarterBall",
  description: "A simple balanced orb.",
  ability: "Bounce",
  gradient: "radial-gradient(circle at 30% 30%, hsl(0,0%,95%), hsl(0,0%,75%))", // white-ish
  stats: { damage: 25, knockback: 5, pierce: 1 },
  phonics: null, // no phonics initially
  basePhonics: true,
};
selectedBall = StarterBall;

// =================== BRICK CLASS ===================
class Brick {
  constructor(x, y, width, height, color, health) {
    Object.assign(this, { x, y, width, height, color, health });
    this.state = "normal";
    this.chargeTimer = 0;
    this.requiredPhonics = null;
    this.word = null;
    this.healthVisible = false;
    this.markedForRemoval = false;
    this.flashTimer = 0;
    this.flashing = false;
  }

  update(speed) {
    if (this.state === "normal") {
      this.y += speed;
      if (this.y + this.height >= dangerLineY) {
        this.state = "charging";
        this.chargeTimer = 40;
      }
    } else if (this.state === "charging") {
      this.y -= 0.5;
      this.chargeTimer--;
      if (this.chargeTimer <= 0) this.state = "rushing";
    } else if (this.state === "rushing") {
      this.y += 10;
      if (this.y > canvas.height) {
        this.markedForRemoval = true;

        // ----------------------------
        // BOSS-SUMMONED BRICKS → GAME OVER
        // ----------------------------
        if (this.summonedByBoss) {
          triggerGameOver();
          return;
        }

        // ----------------------------
        // NORMAL BRICKS → DAMAGE ONLY
        // ----------------------------
        player.health = Math.max(0, player.health - 10);
      }
    }
  }

  draw(ctx) {
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(this.x + r, this.y);
    ctx.lineTo(this.x + this.width - r, this.y);
    ctx.quadraticCurveTo(
      this.x + this.width,
      this.y,
      this.x + this.width,
      this.y + r
    );
    ctx.lineTo(this.x + this.width, this.y + this.height - r);
    ctx.quadraticCurveTo(
      this.x + this.width,
      this.y + this.height,
      this.x + this.width - r,
      this.y + this.height
    );
    ctx.lineTo(this.x + r, this.y + this.height);
    ctx.quadraticCurveTo(
      this.x,
      this.y + this.height,
      this.x,
      this.y + this.height - r
    );
    ctx.lineTo(this.x, this.y + r);
    ctx.quadraticCurveTo(this.x, this.y, this.x + r, this.y);
    ctx.closePath();

    if (this.state === "charging" && this.chargeTimer % 10 < 5)
      ctx.fillStyle = "hsl(0,70%,50%)";
    else ctx.fillStyle = this.color;

    ctx.fill();

    ctx.fillStyle = this.healthVisible ? "yellow" : "white";
    ctx.font = this.healthVisible
      ? "bold 20px Fredoka, sans-serif"
      : "bold 18px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    ctx.fillText(
      this.healthVisible ? Math.ceil(this.health) : this.word || "",
      cx,
      cy
    );
  }
}

let gameOver = false;

function triggerGameOver() {
  if (gameOver) return;
  gamePaused = true;
  gameOver = true;
}

function drawGameOver() {
  if (!gameOver) return;

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.font = "bold 70px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = "28px Fredoka, sans-serif";
  ctx.fillText(
    "Press ENTER To Restart",
    canvas.width / 2,
    canvas.height / 2 + 40
  );
}

// =================== BOSS CLASS (COMPLETE REPLACEMENT) ===================
class BossBrick extends Brick {
  constructor(x, y, size, color, health) {
    super(x, y, size, size, color, health);

    this.maxHealth = health;
    this.state = "dropping";
    this.healthVisible = true;
    this.speed = 2;

    this.armor = 0; // number of living armor bricks
    this.hasSpawnedOnce = false; // has boss already summoned once?
    this.summonCooldown = 0; // used for 30 sec timer after armor gone
    this.summonInterval = 1800; // 30 sec = 60fps * 30

    this.currentBatch = []; // track exact bricks belonging to this cycle
  }

  update() {
    // dropping phase
    if (this.state === "dropping") {
      this.y += this.speed;
      if (this.y >= 80) {
        this.y = 80;
        this.state = "boss";
      }
      return;
    }

    // -------------------------
    // ACTIVE BOSS PHASE
    // -------------------------
    if (this.state === "boss") {
      // Remove dead bricks from tracking
      this.currentBatch = this.currentBatch.filter(
        (b) => !b.markedForRemoval && b.health > 0
      );

      // Armor = number of living bricks in batch
      this.armor = this.currentBatch.length;

      // FIRST TIME: summon immediately
      if (!this.hasSpawnedOnce) {
        this.hasSpawnedOnce = true;
        this.summonBricks();
        return;
      }
      // FIRST TIME: summon immediately
      if (!this.hasSpawnedOnce) {
        this.hasSpawnedOnce = true;
        this.startSummonFlash();
        return;
      }

      // If armor > 0 → boss is immune (no summoning)
      if (this.armor > 0) {
        this.summonCooldown = 0;
        return;
      }

      // Armor is gone → begin 30 sec timer
      this.summonCooldown++;

      if (this.summonCooldown >= this.summonInterval) {
        this.summonCooldown = 0;
        this.startSummonFlash();
      }
    }
  }

  summonBricks() {
    const cols = brickSystem.columns;
    const bw = brickSystem.width;
    const bh = brickSystem.height;
    const spacing = brickSystem.spacing;

    const totalWidth = cols * (bw + spacing);
    const startX = (canvas.width - totalWidth) / 2;

    const bricksThisBatch = 3 + Math.floor(Math.random() * 2); // 3–4
    const chosenCols = new Set();

    // choose columns spaced out
    while (chosenCols.size < bricksThisBatch) {
      chosenCols.add(Math.floor(Math.random() * cols));
    }

    this.currentBatch = [];

    for (let col of chosenCols) {
      const x = startX + col * (bw + spacing);
      const y = -bh; // spawn at the top like normal bricks

      const brick = new Brick(x, y, bw, bh, "hsl(40,70%,55%)", 60);

      brick.summonedByBoss = true;
      brick.healthVisible = true;
      brick.word = "";

      brick.update = function () {
        this.y += 0.4; // slow fall
      };

      this.currentBatch.push(brick);
      brickSystem.list.push(brick);
    }
  }

  startSummonFlash() {
    this.flashing = true;
    this.flashTimer = 60; // 1 second of flashing
  }

  draw(ctx) {
    // Draw boss body
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(this.x + r, this.y);
    ctx.lineTo(this.x + this.width - r, this.y);
    if (this.flashing) {
      if (Math.floor(this.flashTimer / 5) % 2 === 0) {
        ctx.fillStyle = "white"; // flash white
      } else {
        ctx.fillStyle = this.color;
      }
      this.flashTimer--;
      if (this.flashTimer <= 0) {
        this.flashing = false;
        this.summonBricks();
      }
    } else {
      ctx.fillStyle = this.color;
    }
    ctx.quadraticCurveTo(
      this.x + this.width,
      this.y,
      this.x + this.width,
      this.y + r
    );
    ctx.lineTo(this.x + this.width, this.y + this.height - r);
    ctx.quadraticCurveTo(
      this.x + this.width,
      this.y + this.height,
      this.x + this.width - r,
      this.y + this.height
    );
    ctx.lineTo(this.x + r, this.y + this.height);
    ctx.quadraticCurveTo(
      this.x,
      this.y + this.height,
      this.x,
      this.y + this.height - r
    );
    ctx.lineTo(this.x, this.y + r);
    ctx.quadraticCurveTo(this.x, this.y, this.x + r, this.y);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();

    // Draw armor icons above boss
    const startX = this.x + this.width / 2;
    const startY = this.y - 30;
    const spacing = 25;

    for (let i = 0; i < this.armor; i++) {
      drawArmorIcon(ctx, startX + (i - (this.armor - 1) / 2) * spacing, startY);
    }
  }
}

function drawBossHealthBar() {
  if (!bossActive) return;

  const boss = brickSystem.list.find((b) => b instanceof BossBrick);
  if (!boss) return;

  const barWidth = canvas.width * 0.5;
  const barHeight = 28;
  const x = (canvas.width - barWidth) / 2;
  const y = 20;

  // background
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x, y, barWidth, barHeight);

  // health fill
  const ratio = Math.max(0, boss.health / boss.maxHealth);
  const filled = barWidth * ratio;

  ctx.fillStyle =
    boss.armor > 0
      ? "rgba(255,120,120,0.7)" // tinted when armored
      : "hsl(0, 70%, 50%)";

  ctx.fillRect(x, y, filled, barHeight);

  // outline
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);

  // text
  ctx.fillStyle = "white";
  ctx.font = "bold 20px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `BOSS HP: ${Math.ceil(boss.health)}`,
    x + barWidth / 2,
    y + barHeight / 2
  );
}

function drawArmorIcon(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = "cyan";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 10, y + 15);
  ctx.lineTo(x - 7, y + 25);
  ctx.lineTo(x + 7, y + 25);
  ctx.lineTo(x + 10, y + 15);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// =================== BRICK SYSTEM ===================
const brickSystem = {
  list: [],
  speed: 0.6,
  width: 70,
  height: 30,
  columns: 8,
  spacing: 8,
  spawnInterval: 1400,
  lastSpawn: 0,

  spawn() {
    if (bossActive) return; // stop normal bricks while boss exists

    const { width, height, columns, spacing } = this;
    const totalWidth = columns * (width + spacing);
    const startX = (canvas.width - totalWidth) / 2;
    const brickCount = 1 + Math.floor(seededRandom() * 3);
    const chosenCols = new Set();

    while (chosenCols.size < brickCount)
      chosenCols.add(Math.floor(seededRandom() * columns));

    const phonicsBank = {
      ough: ["though", "rough", "thought"],
      ei: ["veil", "reign", "their"],
      wr: ["write", "wreck", "wrist"],
      ph: ["phone", "graph", "phase"],
      kn: ["knee", "knife", "knock"],
      igh: ["light", "sight", "night"],
      dge: ["badge", "edge", "fudge"],
    };
    const phonicsKeys = Object.keys(phonicsBank);

    chosenCols.forEach((i) => {
      const x = startX + i * (width + spacing);
      const y = -height;
      const hue = 265 + seededRandom() * 20;
      const color = `hsl(${hue}, 40%, ${45 + seededRandom() * 8}%)`;
      const health = 40 + seededRandom() * 60;

      const brick = new Brick(x, y, width, height, color, health);
      brick.requiredPhonics = phonicsKeys[seededInt(phonicsKeys.length)];
      const words = phonicsBank[brick.requiredPhonics];
      brick.word = words[seededInt(words.length)];

      this.list.push(brick);
    });
  },

  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.update(this.speed);

      // Boss death
      if (b.health <= 0 && b.state === "boss") {
        bossActive = false;
        bossDefeated = true; // prevent respawn
        levelCompleted = true;
        levelCompleteAlpha = 0;
        this.list.splice(i, 1);
        continue;
      }

      // Normal brick death
      if (b.health <= 0 && b.state !== "boss") {
        if (Math.random() < 0.1) {
          drops.push(new OrbDrop(b.x, b.y));
        }
        player.xp += 10 * xpGainScale;
        if (player.xp >= player.maxXp) {
          player.xp -= player.maxXp;
          player.level++;
          player.maxXp = Math.floor(player.maxXp * 1.25);

          levelUpModal.visible = true;
          levelUpModal.fadingOut = false;
          levelUpModal.alpha = 0;
          gamePaused = true;

          const ownedNames = new Set(inventory.map((b) => b.name));
          const available = (
            typeof jsonData !== "undefined" ? jsonData : []
          ).filter((bb) => !ownedNames.has(bb.name));
          levelUpChoices = [];
          while (levelUpChoices.length < 3 && available.length > 0) {
            const index = Math.floor(Math.random() * available.length);
            levelUpChoices.push(available.splice(index, 1)[0]);
          }
        }
        this.list.splice(i, 1);
        continue;
        // create drop at brick position
      }

      if (b.markedForRemoval || b.y > canvas.height) {
        this.list.splice(i, 1);
        continue;
      }

      b.draw(ctx);
    }
  },
};

const drops = [];

class OrbDrop {
  constructor(x, y, kind = "orb") {
    this.x = x + brickSystem.width / 2;
    this.y = y + 10;
    this.radius = 12;
    this.vy = 1.2;
    this.kind = kind;
    this.collected = false;
    this.spawnTime = performance.now();
  }

  update() {
    this.y += this.vy;
    this.y += Math.sin((performance.now() - this.spawnTime) / 300) * 0.1;
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(170,200,255,0.95)";
    ctx.shadowColor = "rgba(100,160,255,0.9)";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  intersectsPlayer() {
    const dx = this.x - player.x;
    const dy = this.y - player.y;
    const r = this.radius + player.size / 2;
    return dx * dx + dy * dy <= r * r;
  }
}
// =================== BOSS SPAWNING ===================
let bossTimer = 0;
let bossActive = false;
let bossDefeated = false;

function updateBossTimer() {
  if (bossActive || bossDefeated) return; // pause timer if boss exists or defeated

  bossTimer++;
  const delay = getBossSpawnDelay();
  if (bossTimer >= delay) {
    spawnBoss();
    bossTimer = 0;
  }
}

function spawnBoss() {
  if (bossActive) return;

  bossActive = true;

  const size = 180;
  const x = canvas.width / 2 - size / 2;
  const y = -size; // start offscreen
  const color = "hsl(0,70%,45%)";
  const health = 2000;

  const boss = new BossBrick(x, y, size, color, health);
  brickSystem.list.push(boss);
}

function getBossSpawnDelay() {
  const baseDelay = 800;
  const reductionPerLevel = 15;
  return Math.max(200, baseDelay - reductionPerLevel * incremental);
}

// =================== LEVEL COMPLETED SCREEN ===================
let levelCompleted = false;
let levelCompleteAlpha = 0;

function drawLevelCompleted() {
  if (!levelCompleted) return;

  levelCompleteAlpha = Math.min(1, levelCompleteAlpha + 0.02);

  ctx.save();
  ctx.globalAlpha = levelCompleteAlpha;

  // Dim background
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Panel
  const w = 400,
    h = 200;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;

  ctx.fillStyle = "rgba(40,40,60,0.95)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.strokeStyle = "hsl(120,70%,70%)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Text
  ctx.fillStyle = "hsl(120,80%,85%)";
  ctx.font = "bold 48px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LEVEL COMPLETED", canvas.width / 2 - 20, y + 90);

  ctx.fillStyle = "white";
  ctx.font = "20px Fredoka, sans-serif";
  ctx.fillText("Press ENTER to continue", canvas.width / 2, y + 150);

  ctx.restore();
}

// ------------------ CONTINUE AFTER LEVEL ------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && levelCompleted) {
    levelCompleted = false;
    bossDefeated = false; // allow next boss spawn
    bossTimer = 0;
    gamePaused = false;
  }
});

document.addEventListener("keydown", (e) => {
  if (gameOver && e.key === "Enter") {
    location.reload(); // cleanest reset
  }
});

// =================== PLAYER ===================
const player = {
  x: 0,
  y: 0,
  angle: 0,
  speed: 5,
  size: 28,
  health: 100,
  maxHealth: 100,
  xp: 0,
  maxXp: 100,
  level: 1,
};

function resetPlayer() {
  player.x = canvas.width / 2;
  player.y = canvas.height - 80;
}
resetPlayer();

// =================== UI / MODALS / PAUSE ===================
let levelUpModal = { visible: false, alpha: 0, fadingOut: false };
let escMenu = { visible: true, alpha: 1 }; // start paused
let hardPaused = true;
let gamePaused = false;

// draw utilities
function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = "hsl(280, 75%, 45%)";
  ctx.beginPath();
  ctx.moveTo(player.size, 0);
  ctx.lineTo(-player.size * 0.6, player.size * 0.5);
  ctx.lineTo(-player.size * 0.6, -player.size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHealthBar(bounds) {
  const barWidth = 20;
  const barHeight = 200;
  const x = bounds.right + 20;
  const y = (canvas.height - barHeight) / 2;

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, barWidth, barHeight);

  const healthRatio = Math.max(0, player.health / player.maxHealth);
  const filledHeight = barHeight * healthRatio;
  const fillY = y + (barHeight - filledHeight);

  const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
  gradient.addColorStop(0, "hsl(120, 80%, 50%)");
  gradient.addColorStop(1, "hsl(0, 70%, 45%)");

  ctx.fillStyle = gradient;
  ctx.fillRect(x, fillY, barWidth, filledHeight);

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);

  ctx.font = "bold 16px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText("HP", x + barWidth / 2, y - 8);
}

function drawXpBar(bounds) {
  const barWidth = 200;
  const barHeight = 26;
  const x = bounds.right + 75;
  const y = (canvas.height - 200) / 2 - 150;

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, barWidth, barHeight);

  const xpRatio = Math.min(1, player.xp / player.maxXp);
  const fillWidth = barWidth * xpRatio;
  const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
  gradient.addColorStop(0, "hsl(200, 80%, 60%)");
  gradient.addColorStop(1, "hsl(260, 80%, 65%)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, fillWidth, barHeight);

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);

  ctx.font = "bold 14px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Lv ${player.level}`, x + barWidth / 2, y + barHeight / 2);
}

function drawLevelUpModal() {
  if (!levelUpModal.visible && levelUpModal.alpha <= 0) return;

  if (levelUpModal.visible && !levelUpModal.fadingOut)
    levelUpModal.alpha = Math.min(1, levelUpModal.alpha + 0.08);
  else if (levelUpModal.fadingOut) {
    levelUpModal.alpha = Math.max(0, levelUpModal.alpha - 0.08);
    if (levelUpModal.alpha === 0) {
      levelUpModal.visible = false;
      levelUpModal.fadingOut = false;
    }
  }

  ctx.save();
  ctx.globalAlpha = levelUpModal.alpha;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boxWidth = 600;
  const boxHeight = 300;
  const x = (canvas.width - boxWidth) / 2;
  const y = (canvas.height - boxHeight) / 2;

  ctx.fillStyle = "rgba(40,40,60,0.95)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 20);
  ctx.fill();
  ctx.strokeStyle = "hsl(280,80%,70%)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "bold 40px Fredoka, sans-serif";
  ctx.fillStyle = "hsl(280,85%,75%)";
  ctx.textAlign = "center";
  ctx.fillText("LEVEL UP!", canvas.width / 2, y + 60);

  // draw choices
  const cardW = 160,
    cardH = 180,
    gap = 30;
  const totalW =
    levelUpChoices.length * cardW + (levelUpChoices.length - 1) * gap;
  const startX = (canvas.width - totalW) / 2;
  ctx.font = "18px Fredoka, sans-serif";

  levelUpChoices.forEach((ball, i) => {
    const bx = startX + i * (cardW + gap);
    const by = y + 90;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    // preview ball
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + cardW / 2, by + 50, 25, 0, Math.PI * 2);
    ctx.fillStyle = ball.gradient
      .replace("radial-gradient(", "")
      .replace(")", "");
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(ball.name, bx + cardW / 2, by + 100);
    ctx.font = "14px Fredoka, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(ball.ability, bx + cardW / 2, by + 125);
  });

  ctx.font = "16px Fredoka, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(
    "Click a ball to choose it",
    canvas.width / 2,
    y + boxHeight - 15
  );

  ctx.restore();
}

// ESC pause UI
function drawEscMenu() {
  if (!escMenu.visible) return;
  escMenu.alpha = Math.min(1, escMenu.alpha + 0.08);

  ctx.save();
  ctx.globalAlpha = escMenu.alpha;

  // background dim
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const w = 420,
    h = 260;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;

  // panel
  ctx.fillStyle = "rgba(40,40,60,0.95)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.strokeStyle = "hsl(280,80%,70%)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // paused text
  ctx.fillStyle = "hsl(280,85%,75%)";
  ctx.font = "bold 48px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", canvas.width / 2, y + 80);

  // resume text updated
  ctx.fillStyle = "white";
  ctx.font = "20px Fredoka, sans-serif";
  ctx.fillText("Press R to Resume", canvas.width / 2, y + 135);

  // fullscreen button
  const btnW = 200,
    btnH = 40;
  const btnX = canvas.width / 2 - btnW / 2;
  const btnY = y + 170;

  escFullscreenButton = { x: btnX, y: btnY, w: btnW, h: btnH };

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, 10);
  ctx.fill();
  ctx.strokeStyle = "hsl(200,80%,65%)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "bold 18px Fredoka, sans-serif";
  ctx.fillText("Toggle Fullscreen", canvas.width / 2, btnY + 25);

  ctx.restore();
}

// ======================= STT + RECORDING MODULE (IMPROVED) ==========================
let sttModal = document.getElementById("sttModal");
let sttStatus = document.getElementById("sttStatus");
let sttTitle = document.getElementById("sttTitle");
let sttSubmit = document.getElementById("sttSubmit");

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let pendingPhonics = null;
let currentStream = null;
let lastRecordedBlob = null; // raw webm/opus blob produced by MediaRecorder

// ---- 1. Call this when a phonics is selected in the dropdown ----
async function beginPhonicsRecording(phonics) {
  pendingPhonics = phonics;
  gamePaused = true;

  sttTitle.textContent = `Say: "${phonics.toUpperCase()}"`;
  sttStatus.textContent = "Press SPACE to begin recording...";
  sttModal.style.display = "block";
}

// ---- 2. SPACE starts & stops recording ----
window.addEventListener("keydown", async (e) => {
  if (sttModal.style.display === "none") return;

  if (e.code === "Space" && !isRecording) {
    e.preventDefault();
    await startRecording();
  } else if (e.code === "Space" && isRecording) {
    e.preventDefault();
    await stopRecording();
  }
});

// ---- startRecording: request mic with good constraints and create MediaRecorder ----
async function startRecording() {
  // reset
  recordedChunks = [];
  lastRecordedBlob = null;
  isRecording = true;
  sttStatus.textContent = "Recording... press SPACE to stop";

  // Good constraints for cleaner capture (not all browsers support all of these)
  const constraints = {
    audio: {
      channelCount: 2,
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.error("Microphone permission / getUserMedia failed:", err);
    sttStatus.textContent = "Microphone access denied or failed.";
    isRecording = false;
    return;
  }

  // Always pick a supported MIME for MediaRecorder. Chrome/Edge/FF support webm/opus best.
  const mime = (() => {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
      return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus"))
      return "audio/ogg;codecs=opus";
    return ""; // let browser choose a default
  })();

  try {
    mediaRecorder = mime
      ? new MediaRecorder(currentStream, { mimeType: mime })
      : new MediaRecorder(currentStream);
  } catch (err) {
    console.error("MediaRecorder constructor failed:", err);
    sttStatus.textContent = "Recording failed to start.";
    // stop tracks to be safe
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
    isRecording = false;
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstart = () => {
    console.log(
      "DEBUG>>> MediaRecorder started, mimeType:",
      mediaRecorder.mimeType
    );
  };

  mediaRecorder.onstop = () => {
    // assemble raw webm/opus blob
    lastRecordedBlob = new Blob(recordedChunks, {
      type: mediaRecorder.mimeType || "application/octet-stream",
    });
    console.log(
      "DEBUG>>> MediaRecorder stopped. Blob size:",
      lastRecordedBlob.size,
      "type:",
      lastRecordedBlob.type
    );
    sttStatus.textContent = "Processing audio...";

    // stop microphone tracks
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
  };

  mediaRecorder.onerror = (ev) => {
    console.error("MediaRecorder error:", ev);
    sttStatus.textContent = "Recording error.";
  };

  // start
  try {
    mediaRecorder.start();
    // (optionally) you can use timeslice to get periodic dataavailable events:
    // mediaRecorder.start(1000);
  } catch (err) {
    console.error("mediaRecorder.start() failed:", err);
    sttStatus.textContent = "Start recording failed.";
    isRecording = false;
    // stop tracks
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
  }
}

// ---- stopRecording returns only when onstop completed and lastRecordedBlob is set ----
function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    isRecording = false;
    sttStatus.textContent = "No active recording.";
    return;
  }

  return new Promise((resolve) => {
    mediaRecorder.addEventListener(
      "stop",
      () => {
        isRecording = false;
        // allow UI to show submit
        sttStatus.textContent = "Ready. Press SUBMIT.";
        resolve();
      },
      { once: true }
    );

    try {
      mediaRecorder.stop();
    } catch (err) {
      console.error("mediaRecorder.stop() failed:", err);
      isRecording = false;
      resolve();
    }
  });
}

// ---- Convert WebM/Opus Blob to WAV PCM16 16k (client-side) ----
async function convertWebMToWav(webmBlob) {
  if (!webmBlob || webmBlob.size === 0)
    throw new Error("No blob provided for conversion");

  // debug: show raw blob info
  console.log(
    "DEBUG>>> convertWebMToWav: blob size",
    webmBlob.size,
    "type",
    webmBlob.type
  );

  const arrayBuffer = await webmBlob.arrayBuffer().catch((e) => {
    console.error("arrayBuffer() failed:", e);
    throw e;
  });

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // decodeAudioData can reject if the blob's container or codec is unsupported;
  // we catch that and rethrow so caller can optionally fallback to sending webm to server.
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0)); // slice to be safe
  } catch (err) {
    console.error(
      "decodeAudioData failed (browser may not support this blob):",
      err
    );
    audioCtx.close();
    throw err;
  }

  // Compute some diagnostics: duration, channels, RMS, peak
  const numChannels = audioBuffer.numberOfChannels;
  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  // compute mono mix for stats
  const len = audioBuffer.length;
  const chanData = new Float32Array(len);
  for (let c = 0; c < numChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) chanData[i] += ch[i] / numChannels;
  }
  // RMS & peak
  let sumSq = 0,
    peak = 0;
  for (let i = 0; i < chanData.length; i++) {
    const v = chanData[i];
    sumSq += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sumSq / chanData.length);
  console.log(
    `DEBUG>>> decoded audio: duration=${duration.toFixed(
      3
    )}s sr=${sampleRate}ch=${numChannels} rms=${rms.toExponential(
      3
    )} peak=${peak.toExponential(3)}`
  );

  // If nearly silent, warn and still continue
  if (peak < 0.0005 || rms < 0.0003) {
    console.warn(
      "DEBUG>>> audio appears nearly silent (low peak/rms). Check mic / gain / input device."
    );
  }

  // Target sample rate for model
  const targetRate = 16000;

  // If already at targetRate and mono, encode straight away
  if (sampleRate === targetRate && numChannels === 1) {
    // build WAV from decoded mono Float32Array
    const wav = encodeWAV(chanData, targetRate);
    audioCtx.close();
    console.log("DEBUG>>> encoded WAV size:", wav.size);
    return wav;
  }

  // Resample to targetRate and make mono using OfflineAudioContext
  // We create an OfflineAudioContext with 1 channel and length = ceil(duration * targetRate)
  const offlineCtx = new (window.OfflineAudioContext ||
    window.webkitOfflineAudioContext)(
    1,
    Math.ceil(duration * targetRate),
    targetRate
  );

  // Create a buffer for playback that contains our mono mix at the original sampleRate.
  const monoBuffer = audioCtx.createBuffer(1, len, sampleRate);
  monoBuffer.copyToChannel(chanData, 0, 0);

  // create source using the monoBuffer
  const source = offlineCtx.createBufferSource();
  // Note: even though monoBuffer.sampleRate != offlineCtx.sampleRate,
  // rendering the offline context will resample automatically.
  source.buffer = monoBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  // Render (resample)
  let rendered;
  try {
    rendered = await offlineCtx.startRendering();
  } catch (err) {
    console.error("OfflineAudioContext startRendering failed:", err);
    audioCtx.close();
    throw err;
  }

  const resampled = rendered.getChannelData(0);
  const wavBlob = encodeWAV(resampled, targetRate);
  audioCtx.close();
  console.log(
    "DEBUG>>> resampled WAV size:",
    wavBlob.size,
    "duration(s):",
    resampled.length / targetRate
  );
  return wavBlob;

  // helper: build WAV Blob from Float32Array (mono)
  function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, "RIFF");
    /* file length */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF type */
    writeString(view, 8, "WAVE");
    /* format chunk identifier */
    writeString(view, 12, "fmt ");
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sampleRate * blockAlign) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytesPerSample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, "data");
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true);

    // write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([view], { type: "audio/wav" });
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// ---- 3. Submit → send to API ----
sttSubmit.addEventListener("click", async () => {
  // ensure we have captured data
  if (!lastRecordedBlob || lastRecordedBlob.size === 0) {
    sttStatus.textContent = "No audio recorded.";
    return;
  }

  sttStatus.textContent = "Sending to STT API...";

  // Try to convert to WAV client-side; if conversion fails, fall back to sending the raw blob.
  let wavBlob;
  try {
    wavBlob = await convertWebMToWav(lastRecordedBlob);
  } catch (e) {
    console.error(
      "Conversion failed locally, will send original blob as fallback:",
      e
    );
    // fallback: send the original blob but warn server that it may need conversion
    wavBlob = lastRecordedBlob;
  }

  // debug: show final blob details
  console.log("DEBUG>>> Final blob to send:", {
    size: wavBlob.size,
    type: wavBlob.type,
  });

  const text = await sendAudioToSTT(wavBlob);

  if (!text) {
    sttStatus.textContent = "STT Error. Try again.";
    return;
  }

  checkPhonicsResult(text);
});

// -------------------------- helpers (existing functions kept as-is) --------------------------
// sendAudioToSTT, checkPhonicsResult, ipaToPhonics, etc.
// keep your sendAudioToSTT and checkPhonicsResult as in your last working version.
// --------------------------------------------------------------------------------------------

// ---- 3. Submit → send to API ----
sttSubmit.addEventListener("click", async () => {
  if (recordedChunks.length === 0) {
    sttStatus.textContent = "No audio recorded.";
    return;
  }

  sttStatus.textContent = "Sending to STT API...";

  const webmBlob = new Blob(recordedChunks, { type: "audio/webm" });

  // convert to WAV (PCM16 16k) — Whisper server expects wav or ffmpeg will handle conversion
  let wavBlob;
  try {
    wavBlob = await convertWebMToWav(webmBlob);
  } catch (e) {
    console.error("Conversion failed:", e);
    sttStatus.textContent = "Audio conversion failed locally.";
    return;
  }

  const text = await sendAudioToSTT(wavBlob);

  if (!text) {
    sttStatus.textContent = "STT Error. Try again.";
    return;
  }

  checkPhonicsResult(text);
});

// ========================= IPA → PHONICS MAP =========================
// Each key is an IPA sequence the model will produce.
// Each value is the phonics label from your list.

const ipaToPhonics = {
  ʃ: "sh",
  tʃ: "ch",
  ʧ: "ch",
  t͡ʃ: "ch",

  θ: "th", // voiceless
  ð: "th (voiced)", // voiced

  wʰ: "wh", // some models output aspiration
  ʍ: "wh",
  w: "wh", // fallback: sometimes "wh" reduces to /w/

  f: "ph", // ph = /f/

  k: "ck", // ck = /k/
  ŋ: "ng", // ng
  ʧ: "tch", // tch
  ʤ: "dge",
  dʒ: "dge",
  ʤ: "j",

  n̩: "kn",
  n: "n", // fallback
  ɹ̩: "wr",
  ɹ: "r",

  kw: "qu",
  kʷ: "qu",

  eɪ: "ai", // ai, ay, a_e
  eː: "ai",
  ɛɪ: "ai",

  iː: "ee", // ee, ea, ie
  i: "ee",

  oʊ: "oa", // oa, oe, o_e
  oː: "oa",

  i: "ie", // /ī/ or /ē/
  aɪ: "igh", // igh, y, ie
  aɪ̯: "igh",

  uː: "ui", // ui, ew, ue
  u: "ui",
  ʉ: "ui",

  juː: "u_e", // cube, mute, use

  oʊ: "ow (long)", // snow, grow
  aʊ: "ow (short)", // cow

  ɔɪ: "oi",
  ɔj: "oi",

  ɑr: "ar",
  aɹ: "ar",

  ɝ: "er",
  ɚ: "er",
  ɜː: "er",

  ɪr: "ir",
  ir: "ir",

  ʊr: "ur",
  ur: "ur",

  ɔr: "or",
  oɹ: "or",

  aʊ: "ou",
  aʊ̯: "ou",

  ɔɪ: "oy",
  ɔj: "oy",

  ɑː: "au",
  ɔː: "aw",

  uː: "oo (long)",
  ʊ: "oo (short)",

  n: "gn", // silent g fallback
  m: "mb",
  k: "lk",
  n: "mn",

  t: "bt", // silent b before t

  f: "gh", // /f/ or silent
  "": "gh", // silent gh fallback

  eɪ: "eigh",
  iː: "ei",

  i: "ey",
};

// ---- 4. Your STT API call ----
async function sendAudioToSTT(blob) {
  try {
    const form = new FormData();
    form.append("file", blob, "audio.wav");

    const res = await fetch(
      "https://picking-looked-cradle-favorite.trycloudflare.com/transcribe",
      {
        method: "POST",
        body: form,
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error("STT server error:", res.status, txt);
      sttStatus.textContent = `Server error: ${res.status}`;
      return null;
    }

    const data = await res.json();
    if (!data || !data.success) {
      console.error("STT returned error:", data);
      sttStatus.textContent = `STT failed: ${data?.detail || "unknown"}`;
      return null;
    }

    // FIX 🚨
    if (!data.phonemes) {
      console.warn("Phonemes missing:", data);
      return null;
    }

    const ipa = data.phonemes.trim();
    return ipa;
  } catch (e) {
    console.error("STT send error:", e);
    return null;
  }
}

// ========================= CHECK PHONICS (IPA MODE) =========================
function checkPhonicsResult(ipaText) {
  const ipa = ipaText.trim();
  const correct = pendingPhonics.toLowerCase();

  // Try to match the longest IPA sequences first
  const keys = Object.keys(ipaToPhonics).sort((a, b) => b.length - a.length);

  let detectedPhonics = null;

  for (const key of keys) {
    if (key && ipa.includes(key)) {
      detectedPhonics = ipaToPhonics[key];
      break;
    }
  }

  // If nothing matched, try fallback: raw IPA itself
  if (!detectedPhonics) {
    sttStatus.textContent = `Could not map IPA: "${ipa}"`;
    return;
  }

  // Check correctness
  if (detectedPhonics.toLowerCase() === correct) {
    sttStatus.textContent = `Correct! IPA "${ipa}" = "${detectedPhonics}". Assigned to ball.`;

    if (selectedBall) selectedBall.phonics = correct;

    setTimeout(closeSTTModal, 1200);
  } else {
    sttStatus.textContent = `Incorrect.\nYou said IPA "${ipa}" → "${detectedPhonics}".`;
  }
}

// =================== PHONICS UI ===================
function openPhonicsMenu() {
  // remove existing menu if any
  if (phonicsMenu) {
    phonicsMenu.remove();
    phonicsMenu = null;
    window.removeEventListener("click", closePhonicsMenuClick);
  }

  phonicsMenuOpen = true;
  gamePaused = true;

  // create container like ESC modal
  phonicsMenu = document.createElement("div");
  Object.assign(phonicsMenu.style, {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: "99999",
    width: "300px",
    backgroundColor: "rgba(40,40,60,0.95)",
    border: "3px solid hsl(280,80%,70%)",
    borderRadius: "20px",
    boxShadow: "0 0 20px rgba(0,0,0,0.6)",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    textAlign: "center",
  });

  // header text
  const title = document.createElement("div");
  title.textContent = "Select Phonics";
  Object.assign(title.style, {
    fontFamily: "Fredoka, sans-serif",
    fontWeight: "bold",
    fontSize: "28px",
    color: "hsl(280,85%,75%)",
    marginBottom: "10px",
  });
  phonicsMenu.appendChild(title);

  // add phonics options as buttons
  phonicsList.forEach((p) => {
    const btn = document.createElement("button");
    btn.textContent = p.toUpperCase();
    Object.assign(btn.style, {
      fontFamily: "Fredoka, sans-serif",
      fontWeight: "bold",
      fontSize: "20px",
      color: "white",
      backgroundColor: "rgba(0,0,0,0.35)",
      border: "2px solid hsl(280,85%,75%)",
      borderRadius: "8px",
      padding: "8px 0",
      cursor: "pointer",
    });

    btn.addEventListener("click", () => {
      beginPhonicsRecording(p);
      closePhonicsMenu();
    });

    phonicsMenu.appendChild(btn);
  });

  document.body.appendChild(phonicsMenu);

  // close when clicking outside
  setTimeout(() => window.addEventListener("click", closePhonicsMenuClick), 10);
}

function closePhonicsMenuClick(e) {
  if (!phonicsMenu) return;
  if (!phonicsMenu.contains(e.target)) closePhonicsMenu();
}

function closePhonicsMenu() {
  if (phonicsMenu) {
    phonicsMenu.remove();
    phonicsMenu = null;
  }
  window.removeEventListener("click", closePhonicsMenuClick);
  phonicsMenuOpen = false;
  gamePaused = false;
}

function getTextColorForBall(hslColor) {
  if (!hslColor) return "white";
  const m = hslColor.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
  if (!m) return "white";
  const lightness = parseInt(m[3], 10);
  return lightness > 60 ? "black" : "white";
}

// =================== DRAWABLE UI ELEMENTS ===================
function drawPhonicsDropdown(bounds) {
  const x = bounds.right + 20;
  const y = canvas.height / 2 + 190;
  const w = 140;
  const h = 40;
  drawPhonicsDropdown.bounds = { x, y, w, h };

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = "hsl(200,60%,65%)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "bold 16px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const txt =
    selectedBall && selectedBall.phonics
      ? selectedBall.phonics.toUpperCase()
      : "Assign Phonics";
  ctx.fillText(txt, x + w / 2, y + h / 2);
}

function drawAssignBallButton(bounds) {
  const btnWidth = 140,
    btnHeight = 40;
  const x = bounds.right + 20;
  const y = canvas.height / 2 + 140;
  drawAssignBallButton.bounds = { x, y, w: btnWidth, h: btnHeight };

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x, y, btnWidth, btnHeight, 8);
  ctx.fill();
  ctx.strokeStyle = "hsl(280,70%,65%)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "bold 18px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Assign Ball", x + btnWidth / 2, y + btnHeight / 2);
}

function startNextLevel() {
  // Reset seed for fresh randomness next level
  seed = Date.now() & 0xffffffff;

  // Clear all bricks (normal & boss)
  brickSystem.list.length = 0;

  // Reset boss flags
  bossActive = false;
  bossDefeated = false;
  bossTimer = 0;

  // Reset win screen flags
  levelCompleted = false;
  levelCompleteAlpha = 0;

  // Resume gameplay
  gamePaused = false;

  // Reset incremental scaling if you use it for difficulty
  incremental++;

  // Player stays the same level, xp, stats, etc.
}

// =================== COLLISION HELPER (swept AABB) ===================
// vx, vy are displacement for the step (not velocity per se)
function sweepAABB(cx, cy, vx, vy, radius, rect) {
  // Expand rect by radius
  const xMin = rect.x - radius;
  const xMax = rect.x + rect.width + radius;
  const yMin = rect.y - radius;
  const yMax = rect.y + rect.height + radius;

  let txEnter, txExit, tyEnter, tyExit;

  if (Math.abs(vx) < 1e-12) {
    txEnter = -Infinity;
    txExit = Infinity;
  } else {
    const invVX = 1 / vx;
    const t1 = (xMin - cx) * invVX;
    const t2 = (xMax - cx) * invVX;
    txEnter = Math.min(t1, t2);
    txExit = Math.max(t1, t2);
  }

  if (Math.abs(vy) < 1e-12) {
    tyEnter = -Infinity;
    tyExit = Infinity;
  } else {
    const invVY = 1 / vy;
    const t1 = (yMin - cy) * invVY;
    const t2 = (yMax - cy) * invVY;
    tyEnter = Math.min(t1, t2);
    tyExit = Math.max(t1, t2);
  }

  const tEnter = Math.max(txEnter, tyEnter);
  const tExit = Math.min(txExit, tyExit);

  if (tEnter < 0 || tEnter > tExit || tEnter > 1) return null;

  // Determine normal
  const normal = { x: 0, y: 0 };
  if (txEnter > tyEnter) normal.x = vx < 0 ? 1 : -1;
  else normal.y = vy < 0 ? 1 : -1;

  return { t: tEnter, normal };
}

// =================== BALL SYSTEM ===================
class Ball {
  constructor(x, y, angle, stats, gradient, phonics) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.size = 22; // increased size per request
    this.speed = 7;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.stats = stats || { damage: 25, knockback: 5, pierce: 1 };
    this.gradientCSS = gradient || StarterBall.gradient;
    this.phonics = phonics || null; // permanently assigned for the shot
    this.returning = false;
    this.markedForRemoval = false;
    this.hitCooldown = 0; // frames to avoid repeated hits
    this.prevX = this.x;
    this.prevY = this.y;
  }

  update() {
    // cooldown decrement
    if (this.hitCooldown > 0) this.hitCooldown--;

    // if returning, move directly to player
    if (this.returning) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) {
        this.markedForRemoval = true;
        return;
      }
      const speed = 13;
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
      return;
    }

    const bounds = drawSpawnLimits();
    const targetSpeed = this.speed;
    let remaining = 1.0;
    const MIN_CONSUME = 1e-4;
    const separation = this.size / 2 + 0.5;

    while (remaining > 0 && !this.returning && !this.markedForRemoval) {
      this.prevX = this.x;
      this.prevY = this.y;

      let earliestT = 1.0;
      let hitBrick = null;
      let hitNormal = null;

      // Step displacement for this iteration
      const stepVX = this.vx * remaining;
      const stepVY = this.vy * remaining;

      // === Brick collisions ===
      for (const b of brickSystem.list) {
        if (b.markedForRemoval) continue;
        const res = sweepAABB(this.x, this.y, stepVX, stepVY, this.size / 2, b);
        if (res && res.t >= 0 && res.t < earliestT) {
          earliestT = res.t;
          hitBrick = b;
          hitNormal = res.normal;
        } else if (!res) {
          // line fallback (rare) - use line intersection test
          if (
            lineIntersectsRect(
              this.x,
              this.y,
              this.x + stepVX,
              this.y + stepVY,
              b
            )
          ) {
            // treat as tiny-time hit and estimate normal
            earliestT = Math.min(earliestT, 1e-3);
            hitBrick = b;
            const cx = this.x + stepVX - (b.x + b.width / 2);
            const cy = this.y + stepVY - (b.y + b.height / 2);
            if (Math.abs(cx) > Math.abs(cy))
              hitNormal = { x: cx < 0 ? -1 : 1, y: 0 };
            else hitNormal = { x: 0, y: cy < 0 ? -1 : 1 };
          }
        }
      }

      // === left/right bounds collisions ===
      const leftWall = bounds.left + this.size / 2;
      const rightWall = bounds.right - this.size / 2;
      if (Math.abs(stepVX) > 1e-8) {
        if (this.vx < 0) {
          const t = (leftWall - this.x) / stepVX;
          if (t >= 0 && t < earliestT) {
            earliestT = t;
            hitBrick = null;
            hitNormal = { x: 1, y: 0 };
          }
        } else if (this.vx > 0) {
          const t = (rightWall - this.x) / stepVX;
          if (t >= 0 && t < earliestT) {
            earliestT = t;
            hitBrick = null;
            hitNormal = { x: -1, y: 0 };
          }
        }
      }

      // === top wall ===
      if (Math.abs(stepVY) > 1e-8 && this.vy < 0) {
        const t = (this.size / 2 - this.y) / stepVY;
        if (t >= 0 && t < earliestT) {
          earliestT = t;
          hitBrick = null;
          hitNormal = { x: 0, y: 1 };
        }
      }

      // === bottom => returning ===
      if (Math.abs(stepVY) > 1e-8 && this.vy > 0) {
        const t = (canvas.height - this.size / 2 - this.y) / stepVY;
        if (t >= 0 && t < earliestT) {
          this.returning = true;
          this.vy = -Math.abs(this.vy) * 0.8;
          return; // let returning path run next frame
        }
      }

      // move to collision point (or full step)
      const moveT = earliestT;
      this.x += stepVX * moveT;
      this.y += stepVY * moveT;

      // consume time
      const consumed = Math.max(moveT, MIN_CONSUME);
      remaining *= 1 - consumed;

      // handle collision
      if (earliestT < 1.0 && hitNormal) {
        // Damage logic (single application per hitCooldown)
        if (this.hitCooldown === 0 && hitBrick) {
          // -------------------------------
          // 1. SPECIAL: Boss damage rules
          // -------------------------------
          if (hitBrick instanceof BossBrick) {
            // Boss is protected if armor > 0
            if (hitBrick.armor > 0) {
              this.hitCooldown = 2; // still bounce
            } else {
              // Armor is gone → boss can take normal damage
              hitBrick.health -= this.stats.damage;
              if (hitBrick.health <= 0) hitBrick.markedForRemoval = true;
              this.hitCooldown = 2;
            }

            // Boss hit is fully handled — DO NOT run normal brick logic
            const dot = this.vx * hitNormal.x + this.vy * hitNormal.y;
            this.vx = this.vx - 2 * dot * hitNormal.x;
            this.vy = this.vy - 2 * dot * hitNormal.y;
            continue;
          }

          // --------------------------------
          // 2. NORMAL BRICK DAMAGE LOGIC
          // --------------------------------
          const ballHasPhonics = this.phonics && this.phonics.trim() !== "";
          const brickLocked = !hitBrick.healthVisible;

          // if locked & ball has phonics → unlock it
          if (brickLocked && ballHasPhonics) {
            hitBrick.healthVisible = true;
            hitBrick.word = "";
          }
          // if unlocked → apply damage
          else if (!brickLocked) {
            hitBrick.health -= this.stats.damage;
            if (hitBrick.health <= 0) {
              hitBrick.markedForRemoval = true;
            }
          }

          this.hitCooldown = 2;
        }

        // reflect velocity about normal
        const dot = this.vx * hitNormal.x + this.vy * hitNormal.y;
        this.vx = this.vx - 2 * dot * hitNormal.x;
        this.vy = this.vy - 2 * dot * hitNormal.y;

        // slight randomness
        this.vx += (Math.random() - 0.5) * 1.0;
        this.vy += (Math.random() - 0.5) * 1.0;

        // normalize to target speed
        const spd = Math.hypot(this.vx, this.vy) || 1;
        this.vx = (this.vx / spd) * targetSpeed;
        this.vy = (this.vy / spd) * targetSpeed;

        // strong separation to avoid re-collision
        this.x += hitNormal.x * separation;
        this.y += hitNormal.y * separation;

        // update angle for rendering
        this.angle = Math.atan2(this.vy, this.vx);
      } else {
        // no collision; if we used whole step, break
        if (earliestT >= 1.0) remaining = 0;
      }

      if (remaining <= 1e-6) break;
    } // end while

    // out-of-bounds cleanup
    if (
      this.x < -this.size ||
      this.x > canvas.width + this.size ||
      this.y < -this.size ||
      this.y > canvas.height + this.size
    ) {
      this.markedForRemoval = true;
    }
  }

  draw(ctx) {
    // parse two color stops
    const stops = (this.gradientCSS || "").match(/hsl\([^)]+\)/g) || [];
    const c1 = stops[0] || "hsl(220,20%,85%)";
    const c2 = stops[1] || stops[0] || "hsl(220,15%,65%)";

    const grad = ctx.createRadialGradient(
      this.x - this.size * 0.3,
      this.y - this.size * 0.3,
      5,
      this.x,
      this.y,
      this.size
    );
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
    ctx.fill();

    // phonics text shown on ball
    if (this.phonics) {
      ctx.fillStyle = getTextColorForBall(c1);
      ctx.font = "bold 14px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.phonics.toUpperCase(), this.x, this.y);
    }
  }
}

const balls = [];

// =================== INPUT HANDLERS ===================
const keys = {};
document.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

document.addEventListener("keydown", (e) => {
  // PRESS R TO RESUME
  if (e.key.toLowerCase() === "r") {
    if (hardPaused) {
      hardPaused = false;
      escMenu.visible = false;
    }
  }
});

let lastFullscreenToggle = 0; // timestamp of last toggle
const fullscreenCooldown = 2000; // 2000 ms = 2 seconds

// canvas click handling (inventory, phonics, level up)
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const fs = escFullscreenButton;
  if (
    fs &&
    mx >= fs.x &&
    mx <= fs.x + fs.w &&
    my >= fs.y &&
    my <= fs.y + fs.h
  ) {
    const now = Date.now();
    if (now - lastFullscreenToggle < fullscreenCooldown) {
      // cooldown not finished
      return;
    }

    if (!document.fullscreenElement) {
      canvas.requestFullscreen().catch((err) => console.error(err));
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
    }
    lastFullscreenToggle = now; // update the last toggle time
    return;
  }

  // if level-up modal visible, handle selection there
  if (levelUpModal.visible) {
    const boxWidth = 600,
      boxHeight = 300;
    const y = (canvas.height - boxHeight) / 2;
    const cardW = 160,
      cardH = 180,
      gap = 30;
    const totalW =
      levelUpChoices.length * cardW + (levelUpChoices.length - 1) * gap;
    const startX = (canvas.width - totalW) / 2;
    for (let i = 0; i < levelUpChoices.length; i++) {
      const bx = startX + i * (cardW + gap);
      const by = y + 90;
      if (mx >= bx && mx <= bx + cardW && my >= by && my <= by + cardH) {
        const chosen = levelUpChoices[i];
        inventory.push(chosen);
        selectedBall = chosen;
        levelUpModal.fadingOut = true;
        gamePaused = false;
        break;
      }
    }
    return;
  }

  // Assign Ball button
  const btn = drawAssignBallButton.bounds;
  if (
    btn &&
    mx >= btn.x &&
    mx <= btn.x + btn.w &&
    my >= btn.y &&
    my <= btn.y + btn.h
  ) {
    onAssignBallClick();
    return;
  }

  // Phonics dropdown
  const d = drawPhonicsDropdown.bounds;
  if (d && mx >= d.x && mx <= d.x + d.w && my >= d.y && my <= d.y + d.h) {
    openPhonicsMenu();
    return;
  }
});

// right-click to choose inventory ball
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const bounds = drawSpawnLimits();
  const inventoryWidth = 100;
  const inventoryX = bounds.left - inventoryWidth - 15;
  const inventoryY = 50;
  const slotSize = 40;
  const cols = 2,
    rows = 4,
    spacing = 10;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  for (let i = 0; i < inventory.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = inventoryX + col * (slotSize + spacing);
    const y = inventoryY + row * (slotSize + spacing);
    if (mx >= x && mx <= x + slotSize && my >= y && my <= y + slotSize) {
      selectedBall = inventory[i];
      break;
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (levelCompleted && e.code === "Enter") {
    spawnNextLevel();
  }
});

// Assign button helper
function onAssignBallClick() {
  // cycle through inventory as a simple example
  currentBallIndex = (currentBallIndex + 1) % inventory.length;
  selectedBall = inventory[currentBallIndex];
}

// =================== INVENTORY ===================
const inventory = [{ ...StarterBall }];

function drawInventory(bounds) {
  const inventoryWidth = 100;
  const inventoryX = bounds.left - inventoryWidth - 15;
  const inventoryY = 50;
  const slotSize = 40;
  const cols = 2,
    rows = 4,
    spacing = 10;

  ctx.save();
  ctx.font = "bold 20px Fredoka, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.textAlign = "center";
  ctx.fillText(
    "Inventory",
    inventoryX + inventoryWidth / 2 - 5,
    inventoryY - 15
  );

  for (let i = 0; i < rows * cols; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = inventoryX + col * (slotSize + spacing);
    const y = inventoryY + row * (slotSize + spacing);

    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, slotSize, slotSize, 6);
    ctx.fill();
    ctx.stroke();

    if (inventory[i]) {
      const gstr = inventory[i].gradient || StarterBall.gradient;
      const stops = gstr.match(/hsl\([^)]+\)/g) || [];
      const c1 = stops[0] || "hsl(220,20%,85%)";
      const c2 = stops[1] || stops[0] || "hsl(220,15%,65%)";

      const grad = ctx.createRadialGradient(
        x + slotSize * 0.3,
        y + slotSize * 0.3,
        5,
        x + slotSize / 2,
        y + slotSize / 2,
        slotSize / 1.2
      );
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(
        x + slotSize / 2,
        y + slotSize / 2,
        slotSize / 2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

// =================== SPAWN BOUNDS DRAWING ===================
function drawSpawnLimits() {
  const totalWidth =
    brickSystem.columns * (brickSystem.width + brickSystem.spacing);
  const startX = (canvas.width - totalWidth) / 2;
  const endX = startX + totalWidth - brickSystem.spacing;

  const leftGradient = ctx.createLinearGradient(startX - 8, 0, startX + 6, 0);
  leftGradient.addColorStop(0, "rgba(0,0,0,0.35)");
  leftGradient.addColorStop(1, "rgba(231,231,231,0.2)");

  const rightGradient = ctx.createLinearGradient(
    endX + brickSystem.width + 8,
    0,
    endX + brickSystem.width - 6,
    0
  );
  rightGradient.addColorStop(0, "rgba(0,0,0,0.35)");
  rightGradient.addColorStop(1, "rgba(231,231,231,0.2)");

  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.strokeStyle = leftGradient;
  ctx.moveTo(startX, 0);
  ctx.lineTo(startX, canvas.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.strokeStyle = rightGradient;
  ctx.moveTo(endX + brickSystem.width, 0);
  ctx.lineTo(endX + brickSystem.width, canvas.height);
  ctx.stroke();

  return { left: startX, right: endX + brickSystem.width };
}

// =================== MAIN LOOP ===================
let lastTime = performance.now();

function clampBricksToBounds() {
  // on big resize ensure bricks stay inside new spawn area
  const bounds = drawSpawnLimits();
  for (const b of brickSystem.list) {
    const minX = bounds.left;
    const maxX = bounds.right - brickSystem.width;
    if (b.x < minX) b.x = minX;
    if (b.x > maxX) b.x = maxX;
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();
  clampBricksToBounds();
});

function update(timestamp) {
  const deltaTime = Math.min(50, timestamp - lastTime);
  lastTime = timestamp;

  const bounds = drawSpawnLimits();

  // --- PAUSED STATE ---
  if (hardPaused) {
    drawGame(bounds); // draw EVERYTHING
    drawEscMenu(); // draw pause menu on top
    requestAnimationFrame(update);
    return;
  }

  // --- LEVEL UP (modal pause) ---
  if (gamePaused) {
    drawGame(bounds); // draw EVERYTHING
    drawLevelUpModal();
    requestAnimationFrame(update);
    return;
  }

  // --- ACTIVE GAMEPLAY ---
  updateGame(deltaTime, bounds);
  drawGame(bounds);

  requestAnimationFrame(update);
}

requestAnimationFrame(update);

function autoShoot() {
  let attempts = 0;
  let shot = false;
  const invLen = Math.max(1, inventory.length);

  while (attempts < invLen && !shot) {
    const ballData = inventory[currentBallIndex % invLen];

    const alreadyActive = balls.some(
      (bb) =>
        bb.stats === ballData.stats && bb.gradientCSS === ballData.gradient
    );

    if (!alreadyActive) {
      balls.push(
        new Ball(
          player.x,
          player.y,
          player.angle,
          ballData.stats,
          ballData.gradient,
          ballData.phonics
        )
      );
      shot = true;
    }

    currentBallIndex++;
    attempts++;
  }
}

function updateGame(deltaTime, bounds) {
  // 1. Brick spawning MUST be in here
  if (
    !brickSystem.lastSpawn ||
    performance.now() - brickSystem.lastSpawn >
      brickSystem.spawnInterval / spawnRateScale
  ) {
    brickSystem.spawn();
    brickSystem.lastSpawn = performance.now();
  }

  // 2. Update bricks
  brickSystem.update();

  updateBossTimer();

  // 3. Player movement
  updatePlayer(bounds);

  // 4. Balls
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.update();
    if (b.markedForRemoval) balls.splice(i, 1);
  }

  // 5. Autoshoot timer
  autoShootTimer += deltaTime;
  if (autoShootTimer >= autoShootInterval) {
    autoShootTimer = 0;
    autoShoot();
  }

  if (!hardPaused && !gamePaused) {
    snapshotTimer += deltaTime;
    if (snapshotTimer >= 15000) {
      snapshotTimer = 0;
      saveLevelSnapshot();
    }
  }
  // Update drops
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.update();

    // Check pickup
    if (d.intersectsPlayer()) {
      handleOrbCollected(d);
      drops.splice(i, 1);
      continue;
    }

    // Out of screen
    if (d.y > canvas.height + 40) {
      drops.splice(i, 1);
    }
  }
}

function drawGame(bounds) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawSpawnLimits();
  drawInventory(bounds);
  drawHealthBar(bounds);
  drawXpBar(bounds);
  drawBossHealthBar();
  drawAssignBallButton(bounds);
  drawPhonicsDropdown(bounds);
  drawGameOver();
  drawLevelCompleted();

  // draw danger line
  ctx.strokeStyle = "rgba(255,0,0,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bounds.left, dangerLineY);
  ctx.lineTo(bounds.right, dangerLineY);
  ctx.stroke();
  // Draw drops
  for (const d of drops) {
    d.draw(ctx);
  }

  // draw bricks
  brickSystem.list.forEach((b) => b.draw(ctx));

  // draw balls
  balls.forEach((b) => b.draw(ctx));

  drawPlayer();
  drawLevelUpModal();
}

// =================== PLAYER MOVEMENT / COLLISION WITH BRICKS ===================
function updatePlayer(bounds) {
  if (keys["w"] || keys["arrowup"]) player.y -= player.speed;
  if (keys["s"] || keys["arrowdown"]) player.y += player.speed;
  if (keys["a"] || keys["arrowleft"]) player.x -= player.speed;
  if (keys["d"] || keys["arrowright"]) player.x += player.speed;

  player.x = Math.max(
    bounds.left + player.size / 2,
    Math.min(bounds.right - player.size / 2, player.x)
  );
  player.y = Math.max(
    player.size / 2,
    Math.min(canvas.height - player.size / 2, player.y)
  );

  if (mouseInsideCanvas) {
    // compute player angle using canvas coords, accounts for rect offset
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + player.x;
    const cy = rect.top + player.y;
    player.angle = Math.atan2(mouseClientY - cy, mouseClientX - cx);
  }

  // ---- 6. Close modal ----
  function closeSTTModal() {
    sttModal.style.display = "none";
    gamePaused = false;
  }

  // collision push against bricks
  const radius = player.size / 2;
  for (const b of brickSystem.list) {
    const closestX = Math.max(b.x, Math.min(player.x, b.x + b.width));
    const closestY = Math.max(b.y, Math.min(player.y, b.y + b.height));
    let dx = player.x - closestX;
    let dy = player.y - closestY;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < radius * radius) {
      let dist = Math.sqrt(dist2);
      if (dist === 0) {
        dx = 0;
        dy = -1;
        dist = 1;
      }
      const overlap = radius - dist;
      player.x += (dx / dist) * overlap;
      player.y += (dy / dist) * overlap;
    }
  }

  player.x = Math.max(
    bounds.left + player.size / 2,
    Math.min(bounds.right - player.size / 2, player.x)
  );
  player.y = Math.max(
    player.size / 2,
    Math.min(canvas.height - player.size / 2, player.y)
  );
}

// =================== MISC DEBUG / HELPERS ===================
// You can easily add debugging toggles, or breakpoints here.
