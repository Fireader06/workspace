// =================== CANVAS SETUP ===================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

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

// =================== UTILITIES ===================
let seed = 12345;
function seededRandom() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// For the level-up selection system
let levelUpChoices = [];

function lineIntersectsRect(x1, y1, x2, y2, rect) {
  // Get the min/max for X
  const left = rect.x;
  const right = rect.x + rect.width;

  // Get the min/max for Y
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // Line bounding box check first
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < left || minX > right) return false;
  if (maxY < top || minY > bottom) return false;

  // Parametric line intersection
  const dx = x2 - x1;
  const dy = y2 - y1;

  let t0 = 0;
  let t1 = 1;

  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else if (p > 0) {
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

function onAssignBallClick() {
  console.log("Assign Ball button clicked!");

  // Example action:
  // Cycle selected ball
  currentBallIndex = (currentBallIndex + 1) % inventory.length;
  selectedBall = inventory[currentBallIndex];

  // Or open a custom menu — whatever you want.
}

const phonicsList = ["ough", "ei", "wr", "ph", "kn", "tion", "dge", "igh"];

function openPhonicsMenu() {
  if (phonicsMenu) return;

  phonicsMenuOpen = true;
  gamePaused = true; // <<< use your real pause system

  phonicsMenu = document.createElement("select");
  phonicsMenu.style.position = "fixed";
  phonicsMenu.style.zIndex = "99999";
  phonicsMenu.style.left = "50%";
  phonicsMenu.style.top = "50%";
  phonicsMenu.style.transform = "translate(-50%, -50%)";
  phonicsMenu.style.fontSize = "20px";
  phonicsMenu.style.padding = "10px";
  phonicsMenu.style.borderRadius = "6px";

  phonicsList.forEach((p) => {
    const op = document.createElement("option");
    op.value = p;
    op.textContent = p.toUpperCase();
    phonicsMenu.appendChild(op);
  });

  document.body.appendChild(phonicsMenu);

  phonicsMenu.onchange = () => {
    selectedBall.phonics = phonicsMenu.value;
    closePhonicsMenu();
  };
}

function closePhonicsMenuClick() {
  closePhonicsMenu();
  window.removeEventListener("click", closePhonicsMenuClick);
}

function closePhonicsMenu() {
  if (phonicsMenu) {
    phonicsMenu.remove();
    phonicsMenu = null;
  }

  // restore normal gameplay only if dropdown caused the pause
  if (phonicsMenuOpen) {
    phonicsMenuOpen = false;
    gamePaused = false;
  }
}

function getTextColorForBall(c1) {
  // Extract HSL numbers
  const hsl = c1.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!hsl) return "white";

  const lightness = parseInt(hsl[3]);

  // If ball is bright → dark text
  // If ball is dark → bright text
  return lightness > 60 ? "black" : "white";
}

// =================== GAME VARIABLES ===================
let spawnRateScale = 0.15; // 1.0 = normal speed, <1 = slower, >1 = faster
let xpGainScale = 1.0; // scale XP gain from bricks (1 = normal, >1 = faster leveling)
let selectedBall = null; // will be set after StarterBall is defined
let autoShootTimer = 0;
const autoShootInterval = 1200; // milliseconds between shots
let currentBallIndex = 0;
let phonicsMenu = null;
let phonicsMenuOpen = false;

// =================== BALL DATA ===================
const StarterBall = {
  name: "StarterBall",
  description:
    "A simple, balanced orb that serves as the foundation for all others.",
  ability: "Bounce",
  gradient:
    "radial-gradient(circle at 30% 30%, hsl(220, 20%, 85%), hsl(220, 15%, 65%))",
  stats: { damage: 25, knockback: 5, pierce: 1 },
};
selectedBall = StarterBall;

// =================== BRICK SYSTEM ===================
class Brick {
  constructor(x, y, width, height, color, health) {
    Object.assign(this, { x, y, width, height, color, health });
    this.state = "normal"; // "normal", "charging", "rushing"
    this.chargeTimer = 0;
  }

  update(speed) {
    if (this.state === "normal") {
      this.y += speed;
      if (this.y + this.height >= dangerLineY) {
        this.state = "charging";
        this.chargeTimer = 40; // frames before rushing down
      }
    } else if (this.state === "charging") {
      this.y -= 0.5; // move up slightly
      this.chargeTimer--;
      if (this.chargeTimer <= 0) {
        this.state = "rushing";
      }
    } else if (this.state === "rushing") {
      this.y += 10; // rush down fast
      if (this.y > canvas.height) {
        this.markedForRemoval = true;
        player.health = Math.max(0, player.health - 10); // lose some health
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

    // flash red while charging
    if (this.state === "charging" && this.chargeTimer % 10 < 5) {
      ctx.fillStyle = "hsl(0, 70%, 50%)";
    } else {
      ctx.fillStyle = this.color;
    }

    ctx.fill();

    // health text
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      Math.ceil(this.health),
      this.x + this.width / 2,
      this.y + this.height / 2
    );
  }
}

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
    const { width, height, columns, spacing } = this;
    const totalWidth = columns * (width + spacing);
    const startX = (canvas.width - totalWidth) / 2;
    const brickCount = 1 + Math.floor(seededRandom() * 3);
    const chosenCols = new Set();
    while (chosenCols.size < brickCount)
      chosenCols.add(Math.floor(seededRandom() * columns));
    chosenCols.forEach((i) => {
      const x = startX + i * (width + spacing);
      const y = -height;
      const hue = 265 + seededRandom() * 20;
      const color = `hsl(${hue}, 40%, ${45 + seededRandom() * 8}%)`;
      const health = 40 + seededRandom() * 60;
      this.list.push(new Brick(x, y, width, height, color, health));
    });
  },

  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.update(this.speed);
      if (b.health <= 0) {
        // gain XP
        player.xp += 10 * xpGainScale; // you can adjust the base 10 value later
        if (player.xp >= player.maxXp) {
          player.xp -= player.maxXp;
          player.level++;
          player.maxXp = Math.floor(player.maxXp * 1.25);

          // show modal + pause game
          levelUpModal.visible = true;
          levelUpModal.fadingOut = false;
          levelUpModal.alpha = 0;
          gamePaused = true;

          // pick 3 random choices (excluding existing inventory names)
          const ownedNames = new Set(inventory.map((b) => b.name));
          const available = jsonData.filter((b) => !ownedNames.has(b.name));
          levelUpChoices = [];
          while (levelUpChoices.length < 3 && available.length > 0) {
            const index = Math.floor(Math.random() * available.length);
            levelUpChoices.push(available.splice(index, 1)[0]);
          }
        }
        this.list.splice(i, 1);
        continue;
      }
      b.draw(ctx);
      if (b.markedForRemoval || b.y > canvas.height) this.list.splice(i, 1);
    }
  },
};

let dangerLineY = canvas.height * 0.725;
window.addEventListener("resize", () => {
  // Recalculate canvas size and boundaries
  resizeCanvas();
  const bounds = drawSpawnLimits();

  // Clamp all existing bricks inside the updated boundaries
  for (const b of brickSystem.list) {
    const minX = bounds.left;
    const maxX = bounds.right - brickSystem.width;

    if (b.x < minX) b.x = minX;
    if (b.x > maxX) b.x = maxX;
  }

  // Update danger line as well
  dangerLineY = canvas.height * 0.725;
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

let levelUpModal = {
  visible: false,
  alpha: 0,
  fadingOut: false,
};

// === ESC PAUSE MENU ===
let escMenu = {
  visible: true, // <-- game starts paused
  alpha: 1,
};
let hardPaused = true; // separate pause from level-up pause

let gamePaused = false;

function resetPlayer() {
  player.x = canvas.width / 2;
  player.y = canvas.height - 80;
}
resetPlayer();

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
    player.angle = Math.atan2(mouseCanvasY - player.y, mouseCanvasX - player.x);
  }
}

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
  const x = bounds.right + 20; // position just right of the right boundary line
  const y = (canvas.height - barHeight) / 2;

  // background
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, barWidth, barHeight);

  // health fill
  const healthRatio = Math.max(0, player.health / player.maxHealth);
  const filledHeight = barHeight * healthRatio;
  const fillY = y + (barHeight - filledHeight);

  const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
  gradient.addColorStop(0, "hsl(120, 80%, 50%)"); // green top
  gradient.addColorStop(1, "hsl(0, 70%, 45%)"); // red bottom

  ctx.fillStyle = gradient;
  ctx.fillRect(x, fillY, barWidth, filledHeight);

  // outline
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);

  // label
  ctx.font = "bold 16px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText("HP", x + barWidth / 2, y - 8);
}

function updatePlayer(bounds) {
  if (keys["w"] || keys["arrowup"]) player.y -= player.speed;
  if (keys["s"] || keys["arrowdown"]) player.y += player.speed;
  if (keys["a"] || keys["arrowleft"]) player.x -= player.speed;
  if (keys["d"] || keys["arrowright"]) player.x += player.speed;

  // keep inside horizontal spawn bounds and bottom/top limits
  player.x = Math.max(
    bounds.left + player.size / 2,
    Math.min(bounds.right - player.size / 2, player.x)
  );
  player.y = Math.max(
    player.size / 2,
    Math.min(canvas.height - player.size / 2, player.y)
  );

  if (mouseInsideCanvas) {
    player.angle = Math.atan2(mouseCanvasY - player.y, mouseCanvasX - player.x);
  }

  // --- Player collision with bricks (circle vs rect) ---
  // Run this every frame so the player cannot move through moving bricks.
  const radius = player.size / 2;
  for (const b of brickSystem.list) {
    // closest point on rectangle to the player's center
    const closestX = Math.max(b.x, Math.min(player.x, b.x + b.width));
    const closestY = Math.max(b.y, Math.min(player.y, b.y + b.height));

    let dx = player.x - closestX;
    let dy = player.y - closestY;
    const dist2 = dx * dx + dy * dy;

    if (dist2 < radius * radius) {
      // overlapping: push the player out along the contact normal
      let dist = Math.sqrt(dist2);
      if (dist === 0) {
        // rare edge case: center exactly on edge/corner — nudge upward
        dx = 0;
        dy = -1;
        dist = 1;
      }
      const overlap = radius - dist;
      player.x += (dx / dist) * overlap;
      player.y += (dy / dist) * overlap;
    }
  }

  // clamp again in case collision pushed the player out of bounds
  player.x = Math.max(
    bounds.left + player.size / 2,
    Math.min(bounds.right - player.size / 2, player.x)
  );
  player.y = Math.max(
    player.size / 2,
    Math.min(canvas.height - player.size / 2, player.y)
  );
}

function drawXpBar(bounds) {
  const barWidth = 200;
  const barHeight = 26;
  const x = bounds.right + 75; // just to the right of the boundary line
  const y = (canvas.height - 200) / 2 - 150; // above the health bar

  // background
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, barWidth, barHeight);

  // XP fill
  const xpRatio = Math.min(1, player.xp / player.maxXp);
  const fillWidth = barWidth * xpRatio;
  const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
  gradient.addColorStop(0, "hsl(200, 80%, 60%)");
  gradient.addColorStop(1, "hsl(260, 80%, 65%)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, fillWidth, barHeight);

  // outline
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, barHeight);

  // text label
  ctx.font = "bold 14px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Lv ${player.level}`, x + barWidth / 2, y + barHeight / 2);
}

function drawLevelUpModal() {
  if (!levelUpModal.visible && levelUpModal.alpha <= 0) return;

  // fade logic
  if (levelUpModal.visible && !levelUpModal.fadingOut) {
    levelUpModal.alpha = Math.min(1, levelUpModal.alpha + 0.08);
  } else if (levelUpModal.fadingOut) {
    levelUpModal.alpha = Math.max(0, levelUpModal.alpha - 0.08);
    if (levelUpModal.alpha === 0) {
      levelUpModal.visible = false;
      levelUpModal.fadingOut = false;
    }
  }

  ctx.save();
  ctx.globalAlpha = levelUpModal.alpha;

  // dimmed background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boxWidth = 600;
  const boxHeight = 300;
  const x = (canvas.width - boxWidth) / 2;
  const y = (canvas.height - boxHeight) / 2;

  ctx.fillStyle = "rgba(40, 40, 60, 0.95)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 20);
  ctx.fill();
  ctx.strokeStyle = "hsl(280, 80%, 70%)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "bold 40px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "hsl(280, 85%, 75%)";
  ctx.fillText("LEVEL UP!", canvas.width / 2, y + 60);

  // show three choices
  const cardW = 160;
  const cardH = 180;
  const gap = 30;
  const totalW =
    levelUpChoices.length * cardW + (levelUpChoices.length - 1) * gap;
  let startX = (canvas.width - totalW) / 2;

  ctx.font = "18px Fredoka, sans-serif";
  levelUpChoices.forEach((ball, i) => {
    const bx = startX + i * (cardW + gap);
    const by = y + 90;

    // card
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    // gradient preview
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + cardW / 2, by + 50, 25, 0, Math.PI * 2);
    ctx.fillStyle = ball.gradient
      .replace("radial-gradient(", "")
      .replace(")", "");
    ctx.fill();
    ctx.restore();

    // text
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

function drawPhonicsDropdown(bounds) {
  const x = bounds.right + 20;
  const y = canvas.height / 2 + 190;
  const w = 140;
  const h = 40;

  drawPhonicsDropdown.bounds = { x, y, w, h };

  // box
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = "hsl(200, 60%, 65%)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // text
  ctx.font = "bold 16px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const txt = selectedBall.phonics
    ? selectedBall.phonics.toUpperCase()
    : "Assign Phonics";

  ctx.fillText(txt, x + w / 2, y + h / 2);
}

function drawAssignBallButton(bounds) {
  const btnWidth = 140;
  const btnHeight = 40;
  const x = bounds.right + 20;
  const y = canvas.height / 2 + 140; // under HP bar

  // Store button bounds so clicking works
  drawAssignBallButton.bounds = { x, y, w: btnWidth, h: btnHeight };

  // background
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x, y, btnWidth, btnHeight, 8);
  ctx.fill();

  // border
  ctx.strokeStyle = "hsl(280, 70%, 65%)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // text
  ctx.font = "bold 18px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Assign Ball", x + btnWidth / 2, y + btnHeight / 2);
}

// =================== COLLISION HELPER ===================
function sweepAABB(cx, cy, vx, vy, radius, rect) {
  let txEnter, tyEnter, txExit, tyExit;
  if (vx === 0) {
    txEnter = -Infinity;
    txExit = Infinity;
  } else {
    const invVX = 1 / vx;
    const xMin = rect.x - radius;
    const xMax = rect.x + rect.width + radius;
    const t1 = (xMin - cx) * invVX;
    const t2 = (xMax - cx) * invVX;
    txEnter = Math.min(t1, t2);
    txExit = Math.max(t1, t2);
  }
  if (vy === 0) {
    tyEnter = -Infinity;
    tyExit = Infinity;
  } else {
    const invVY = 1 / vy;
    const yMin = rect.y - radius;
    const yMax = rect.y + rect.height + radius;
    const t1 = (yMin - cy) * invVY;
    const t2 = (yMax - cy) * invVY;
    tyEnter = Math.min(t1, t2);
    tyExit = Math.max(t1, t2);
  }
  const tEnter = Math.max(txEnter, tyEnter);
  const tExit = Math.min(txExit, tyExit);
  if (tEnter < 0 || tEnter > tExit || tEnter > 1) return null;
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
    this.size = 22; // whatever size you want
    this.speed = 7;

    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;

    this.stats = stats;
    this.gradientCSS = gradient;
    this.phonics = phonics || null; // <<< permanent for the ball

    this.returning = false;
    this.markedForRemoval = false;
    this.hitCooldown = 0;
  }

  update() {
    // decrement cooldown each frame
    if (this.hitCooldown > 0) this.hitCooldown--;

    const bounds = drawSpawnLimits();
    const targetSpeed = 7;
    let remainingTime = 1.0;

    // safety epsilon to consume tiny/zero time steps and avoid infinite loops
    const MIN_CONSUME = 1e-4;

    // amount to nudge the ball out after a collision (ensure it's outside the rect)
    const separation = this.size / 2 + 0.5;

    // don't run sweep part if we're already returning to player
    while (remainingTime > 0 && !this.returning && !this.markedForRemoval) {
      this.prevX = this.x;
      this.prevY = this.y;

      let earliestT = 1.0;
      let hitBrick = null;
      let hitNormal = null;

      const stepVX = this.vx * remainingTime;
      const stepVY = this.vy * remainingTime;

      // === brick sweep collisions (skip bricks already marked for removal) ===
      for (const b of brickSystem.list) {
        if (b.markedForRemoval) continue;
        const res = sweepAABB(this.x, this.y, stepVX, stepVY, this.size / 2, b);
        if (res && res.t >= 0 && res.t < earliestT) {
          earliestT = res.t;
          hitBrick = b;
          hitNormal = res.normal;
        } else if (!res) {
          // fallback line test if numerical issues cause sweep to miss
          if (
            lineIntersectsRect(
              this.x,
              this.y,
              this.x + stepVX,
              this.y + stepVY,
              b
            )
          ) {
            // treat as a very-small-time contact (not exactly zero) to avoid zero-time loops
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

      // === left/right walls (guard against near-zero stepVX) ===
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

      // === top wall (guard against near-zero stepVY) ===
      if (Math.abs(stepVY) > 1e-8 && this.vy < 0) {
        const t = (this.size / 2 - this.y) / stepVY;
        if (t >= 0 && t < earliestT) {
          earliestT = t;
          hitBrick = null;
          hitNormal = { x: 0, y: 1 };
        }
      }

      // === bottom => set returning (guard against near-zero stepVY) ===
      if (Math.abs(stepVY) > 1e-8 && this.vy > 0) {
        const t = (canvas.height - this.size / 2 - this.y) / stepVY;
        if (t >= 0 && t < earliestT) {
          // mark returning and nudge vy upward a little; continue so the return branch runs next frame
          this.returning = true;
          this.vy = -Math.abs(this.vy) * 0.8;
          return;
        }
      }

      // === move to collision point (or full step if no collision) ===
      // earliestT is fraction of the step [0..1]
      const moveT = earliestT;
      this.x += stepVX * moveT;
      this.y += stepVY * moveT;

      // consume at least a tiny amount of remainingTime to ensure progress
      const consumed = Math.max(moveT, MIN_CONSUME);
      remainingTime *= 1 - consumed;

      // === handle collision ===
      if (earliestT < 1.0 && hitNormal) {
        // Only apply damage once per hit window
        if (this.hitCooldown === 0 && hitBrick) {
          hitBrick.health -= this.stats.damage;

          // If the brick dies from this hit, mark it for removal immediately
          if (hitBrick.health <= 0) {
            hitBrick.markedForRemoval = true;
          }

          // prevent multi-hit on the same frame / tiny window
          this.hitCooldown = 2; // frames
        }

        // reflect velocity across the (unit) normal: v' = v - 2*(v·n)*n
        const dot = this.vx * hitNormal.x + this.vy * hitNormal.y;
        this.vx = this.vx - 2 * dot * hitNormal.x;
        this.vy = this.vy - 2 * dot * hitNormal.y;

        // add slight randomness to avoid perfect repetitive bounces
        this.vx += (Math.random() - 0.5) * 1.0;
        this.vy += (Math.random() - 0.5) * 1.0;

        // normalize back to target speed to avoid slowdowns/explosions
        const spd = Math.hypot(this.vx, this.vy) || 1;
        this.vx = (this.vx / spd) * targetSpeed;
        this.vy = (this.vy / spd) * targetSpeed;

        // stronger separation to ensure ball is outside the rectangle
        this.x += hitNormal.x * separation;
        this.y += hitNormal.y * separation;

        // update angle for drawing / future shots
        this.angle = Math.atan2(this.vy, this.vx);

        // continue the loop to resolve remainingTime
      } else {
        // no collision happened; if we moved the full step, stop processing
        if (earliestT >= 1.0) remainingTime = 0;
      }

      // safety: if remainingTime becomes extremely small, break
      if (remainingTime <= 1e-6) break;
    } // end while

    // === returning to player ===
    if (this.returning && !this.markedForRemoval) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 10) {
        this.markedForRemoval = true;
      } else {
        const speed = 13;
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
      }
    }

    // final out-of-bounds cleanup
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
    const matches = (this.gradientCSS || "").match(/hsl\([^)]+\)/g) || [];
    const c1 = matches[0] || "hsl(220,20%,85%)";
    const c2 = matches[1] || matches[0] || "hsl(220,15%,65%)";

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

    // ====================================================
    // DRAW PHONICS TEXT (THIS MUST BE HERE)
    // ====================================================
    if (this.phonics) {
      // choose readable text color
      const textColor = getTextColorForBall(c1);

      ctx.font = "bold 12px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.strokeStyle = textColor === "white" ? "black" : "white";
      ctx.lineWidth = 3;
      ctx.strokeText(this.phonics.toUpperCase(), this.x, this.y + 1);

      ctx.fillStyle = textColor;
      ctx.fillText(this.phonics.toUpperCase(), this.x, this.y + 1);
    }
  }
}

const balls = [];

canvas.addEventListener("mouseenter", (e) => {
  mouseInsideCanvas = true;
  const rect = canvas.getBoundingClientRect();
  mouseCanvasX = mouseClientX - rect.left;
  mouseCanvasY = mouseClientY - rect.top;
});

canvas.addEventListener("mouseleave", () => {
  mouseInsideCanvas = false;
});

// =================== INPUT ===================
const keys = {};
document.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

document.addEventListener("keydown", (e) => {
  // ESC toggle pause (only if level-up modal not active)
  if (e.key === "Escape" && !levelUpModal.visible) {
    hardPaused = !hardPaused;
    escMenu.visible = hardPaused;
    if (hardPaused) {
      escMenu.alpha = 0;
    }
  }
});

let mouseClientX = window.innerWidth / 2,
  mouseClientY = window.innerHeight / 2,
  mouseCanvasX = player.x,
  mouseCanvasY = player.y,
  mouseInsideCanvas = false;

updateMouseInsideState();

const dot = document.createElement("div");
Object.assign(dot.style, {
  position: "fixed",
  width: "6px",
  height: "6px",
  background: "black",
  borderRadius: "50%",
  pointerEvents: "none",
  zIndex: "9999",
  transform: "translate(-50%, -50%)",
});
document.body.appendChild(dot);

canvas.addEventListener("click", (e) => {
  if (!levelUpModal.visible) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const boxWidth = 600;
  const boxHeight = 300;
  const y = (canvas.height - boxHeight) / 2;

  const cardW = 160;
  const cardH = 180;
  const gap = 30;
  const totalW =
    levelUpChoices.length * cardW + (levelUpChoices.length - 1) * gap;
  let startX = (canvas.width - totalW) / 2;

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
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && levelUpModal.visible && !levelUpModal.fadingOut) {
    levelUpModal.fadingOut = true;
  }
});

document.addEventListener("mousemove", (e) => {
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;

  dot.style.left = `${mouseClientX}px`;
  dot.style.top = `${mouseClientY}px`;

  updateMouseInsideState(); // <-- keeps state correct

  if (mouseInsideCanvas && !gamePaused) {
    const rect = canvas.getBoundingClientRect();
    player.angle = Math.atan2(
      mouseClientY - (rect.top + player.y),
      mouseClientX - (rect.left + player.x)
    );
  }
});

canvas.addEventListener("mouseleave", () => (mouseInsideCanvas = false));
document.documentElement.style.cursor = "none";

// right-click inventory: set selected ball
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

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // level-up modal clicks already handled
  if (levelUpModal.visible) return;

  const btn = drawAssignBallButton.bounds;
  if (btn && mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.h) {
    onAssignBallClick();
  }
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (levelUpModal.visible) return;

  // --- phonics dropdown ---
  const d = drawPhonicsDropdown.bounds;
  if (d && mx >= d.x && mx <= d.x + d.w && my >= d.y && my <= d.y + d.h) {
    openPhonicsMenu();
    return;
  }
});

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
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
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
      // use the ball's gradient if present
      const gstr = inventory[i].gradient || "hsl(220,20%,85%),hsl(220,15%,65%)";
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

// =================== BOUNDS DRAWING ===================
function drawSpawnLimits() {
  const totalWidth =
    brickSystem.columns * (brickSystem.width + brickSystem.spacing);
  const startX = (canvas.width - totalWidth) / 2;
  const endX = startX + totalWidth - brickSystem.spacing;
  const leftGradient = ctx.createLinearGradient(startX - 8, 0, startX + 6, 0);
  leftGradient.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  leftGradient.addColorStop(1, "rgba(231, 231, 231, 0.2)");
  const rightGradient = ctx.createLinearGradient(
    endX + brickSystem.width + 8,
    0,
    endX + brickSystem.width - 6,
    0
  );
  rightGradient.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  rightGradient.addColorStop(1, "rgba(231, 231, 231, 0.2)");
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

function drawEscMenu() {
  if (!escMenu.visible) return;

  // fade-in effect
  escMenu.alpha = Math.min(1, escMenu.alpha + 0.08);

  ctx.save();
  ctx.globalAlpha = escMenu.alpha;

  // dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // box
  const w = 420;
  const h = 250;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;

  ctx.fillStyle = "rgba(40,40,60,0.95)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.strokeStyle = "hsl(280, 80%, 70%)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "hsl(280, 85%, 75%)";
  ctx.font = "bold 48px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", canvas.width / 2, y + 90);

  ctx.fillStyle = "white";
  ctx.font = "20px Fredoka, sans-serif";
  ctx.fillText("Press ESC to continue", canvas.width / 2, y + 150);

  ctx.restore();
}

// =================== MAIN LOOP ===================
let lastTime = 0;
function update(timestamp) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;
  const bounds = drawSpawnLimits();
  if (
    !brickSystem.lastSpawn ||
    timestamp - brickSystem.lastSpawn >
      brickSystem.spawnInterval / spawnRateScale
  ) {
    brickSystem.spawn();
    brickSystem.lastSpawn = timestamp;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSpawnLimits();
  // If paused, draw UI only and skip logic updates
  if (gamePaused) {
    // still draw UI for context
    drawInventory(bounds);
    drawHealthBar(bounds);
    drawXpBar(bounds);
    drawPlayer();
    drawLevelUpModal(); // modal on top
    requestAnimationFrame(update);
    return;
  }
  // draw ESC pause menu if active
  if (hardPaused) {
    drawInventory(bounds);
    drawHealthBar(bounds);
    drawXpBar(bounds);
    drawPlayer();
    drawEscMenu();
    requestAnimationFrame(update);
    return; // stop gameplay updates
  }
  // draw red danger line only between spawn boundaries
  ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bounds.left, dangerLineY);
  ctx.lineTo(bounds.right, dangerLineY);
  ctx.stroke();
  drawInventory(bounds);
  drawHealthBar(bounds);
  drawXpBar(bounds);
  drawAssignBallButton(bounds);
  drawPhonicsDropdown(bounds);
  brickSystem.update();
  updatePlayer(bounds);
  drawPlayer();
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.update();
    if (b.markedForRemoval) balls.splice(i, 1);
    else b.draw(ctx);
  }
  drawLevelUpModal();
  // === Auto Shooting ===
  // === Auto Shooting: timer + one ball per type at a time ===
  autoShootTimer += deltaTime;

  if (autoShootTimer >= autoShootInterval) {
    autoShootTimer = 0;

    let attempts = 0;
    let shot = false;

    // Try each ball type once
    while (attempts < inventory.length && !shot) {
      const ballData = inventory[currentBallIndex % inventory.length];

      const alreadyActive = balls.some(
        (b) => b.stats === ballData.stats && b.gradientCSS === ballData.gradient
      );

      // Only shoot if no ball of this type is active
      if (!alreadyActive) {
        balls.push(
          new Ball(
            player.x,
            player.y,
            player.angle,
            ballData.stats,
            ballData.gradient,
            ballData.phonics // <<< permanently assigned when shot
          )
        );
        shot = true;
      }

      currentBallIndex++;
      attempts++;
    }
  }
  requestAnimationFrame(update);
}
requestAnimationFrame(update);
