// =================== CANVAS SETUP ===================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// =================== UTILITIES ===================
let seed = 12345;
function seededRandom() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// =================== GAME VARIABLES ===================
let spawnRateScale = 0.15; // 1.0 = normal speed, <1 = slower, >1 = faster
let xpGainScale = 1.0; // scale XP gain from bricks (1 = normal, >1 = faster leveling)

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
        }
        this.list.splice(i, 1);
        continue;
      }
      b.draw(ctx);
      if (b.markedForRemoval || b.y > canvas.height) this.list.splice(i, 1);
    }
  },
};

let dangerLineY = canvas.height * 0.6; // about 3/5 down the screen
window.addEventListener("resize", () => {
  dangerLineY = canvas.height * 0.6;
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

  // semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // modal box
  const boxWidth = 400;
  const boxHeight = 220;
  const x = (canvas.width - boxWidth) / 2;
  const y = (canvas.height - boxHeight) / 2;

  ctx.fillStyle = "rgba(40, 40, 60, 0.9)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 20);
  ctx.fill();

  // glowing border
  ctx.strokeStyle = "hsl(280, 80%, 70%)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // title
  ctx.font = "bold 46px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "hsl(280, 85%, 75%)";
  ctx.fillText("LEVEL UP!", canvas.width / 2, y + 80);

  // subtext
  ctx.font = "22px Fredoka, sans-serif";
  ctx.fillStyle = "white";
  ctx.fillText(`You reached Level ${player.level}`, canvas.width / 2, y + 130);

  // hint
  ctx.font = "16px Fredoka, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("Press ESC to continue", canvas.width / 2, y + 175);

  ctx.restore();
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
  constructor(x, y, angle, stats) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.size = 16;
    this.speed = 7;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.stats = stats;
    this.returning = false;
  }

  update() {
    const bounds = drawSpawnLimits();
    const targetSpeed = 7;
    let remainingTime = 1.0;

    while (remainingTime > 0) {
      let earliestT = 1.0;
      let hitBrick = null,
        hitNormal = null;

      for (const b of brickSystem.list) {
        const res = sweepAABB(
          this.x,
          this.y,
          this.vx,
          this.vy,
          this.size / 2,
          b
        );
        if (res && res.t < earliestT) {
          earliestT = res.t;
          hitBrick = b;
          hitNormal = res.normal;
        }
      }

      const leftWall = bounds.left + this.size / 2;
      const rightWall = bounds.right - this.size / 2;
      if (this.vx < 0) {
        const t = (leftWall - this.x) / this.vx;
        if (t >= 0 && t < earliestT) {
          earliestT = t;
          hitNormal = { x: 1, y: 0 };
          hitBrick = null;
        }
      } else if (this.vx > 0) {
        const t = (rightWall - this.x) / this.vx;
        if (t >= 0 && t < earliestT) {
          earliestT = t;
          hitNormal = { x: -1, y: 0 };
          hitBrick = null;
        }
      }

      if (this.vy < 0) {
        const t = (this.size / 2 - this.y) / this.vy;
        if (t >= 0 && t < earliestT) {
          earliestT = t;
          hitNormal = { x: 0, y: 1 };
          hitBrick = null;
        }
      }

      if (this.vy > 0 && !this.returning) {
        const t = (canvas.height - this.size / 2 - this.y) / this.vy;
        if (t >= 0 && t < earliestT) {
          this.returning = true;
          this.vy = -Math.abs(this.vy) * 0.8;
          return;
        }
      }

      this.x += this.vx * earliestT;
      this.y += this.vy * earliestT;
      remainingTime -= earliestT;

      if (earliestT < 1.0 && hitNormal) {
        if (hitBrick) hitBrick.health -= this.stats.damage;
        const dot = this.vx * hitNormal.x + this.vy * hitNormal.y;
        this.vx -= 2 * dot * hitNormal.x;
        this.vy -= 2 * dot * hitNormal.y;
        this.vx += (Math.random() - 0.5) * 1.2;
        this.vy += (Math.random() - 0.5) * 1.2;
        const spd = Math.hypot(this.vx, this.vy);
        this.vx = (this.vx / spd) * targetSpeed;
        this.vy = (this.vy / spd) * targetSpeed;
        this.x += hitNormal.x * 0.2;
        this.y += hitNormal.y * 0.2;
      } else remainingTime = 0;
    }

    if (this.returning) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) this.markedForRemoval = true;
      else {
        const speed = 13;
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
      }
    }
  }

  draw(ctx) {
    const grad = ctx.createRadialGradient(
      this.x - this.size * 0.3,
      this.y - this.size * 0.3,
      5,
      this.x,
      this.y,
      this.size
    );
    grad.addColorStop(0, "hsl(220, 20%, 85%)");
    grad.addColorStop(1, "hsl(220, 15%, 65%)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

const balls = [];

// =================== INPUT ===================
const keys = {};
document.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

let mouseClientX = window.innerWidth / 2,
  mouseClientY = window.innerHeight / 2,
  mouseCanvasX = player.x,
  mouseCanvasY = player.y,
  mouseInsideCanvas = false;

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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && levelUpModal.visible) {
    levelUpModal.fadingOut = true;
    gamePaused = false;
  }
});

document.addEventListener("mousemove", (e) => {
  // Always update dot position so it follows the mouse
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  dot.style.left = `${mouseClientX}px`;
  dot.style.top = `${mouseClientY}px`;

  // Only update in-canvas tracking and player aiming if not paused
  const rect = canvas.getBoundingClientRect();
  if (mouseInsideCanvas) {
    mouseCanvasX = e.clientX - rect.left;
    mouseCanvasY = e.clientY - rect.top;

    if (!gamePaused) {
      player.angle = Math.atan2(
        mouseCanvasY - player.y,
        mouseCanvasX - player.x
      );
    }
  }
});
canvas.addEventListener("mouseleave", () => (mouseInsideCanvas = false));
document.documentElement.style.cursor = "none";

canvas.addEventListener("click", () => {
  // only spawn if no active balls
  if (balls.length === 0) {
    balls.push(new Ball(player.x, player.y, player.angle, StarterBall.stats));
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
      const grad = ctx.createRadialGradient(
        x + slotSize * 0.3,
        y + slotSize * 0.3,
        5,
        x + slotSize / 2,
        y + slotSize / 2,
        slotSize / 1.2
      );
      grad.addColorStop(0, "hsl(220, 20%, 85%)");
      grad.addColorStop(1, "hsl(220, 15%, 65%)");
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

// =================== MAIN LOOP ===================
function update(timestamp) {
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
  requestAnimationFrame(update);
}
requestAnimationFrame(update);
