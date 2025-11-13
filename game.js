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
  }
  update(speed) {
    this.y += speed;
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
    ctx.fillStyle = this.color;
    ctx.fill();
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
        this.list.splice(i, 1);
        continue;
      }
      b.draw(ctx);
      if (b.y > canvas.height) this.list.splice(i, 1);
    }
  },
};

// =================== PLAYER ===================
const player = { x: 0, y: 0, angle: 0, speed: 5, size: 28 };
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

document.addEventListener("mousemove", (e) => {
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  dot.style.left = `${mouseClientX}px`;
  dot.style.top = `${mouseClientY}px`;
  if (mouseInsideCanvas) {
    const rect = canvas.getBoundingClientRect();
    mouseCanvasX = e.clientX - rect.left;
    mouseCanvasY = e.clientY - rect.top;
  }
});

canvas.addEventListener("mouseenter", () => {
  mouseInsideCanvas = true;
  const rect = canvas.getBoundingClientRect();
  mouseCanvasX = mouseClientX - rect.left;
  mouseCanvasY = mouseClientY - rect.top;
});
canvas.addEventListener("mouseleave", () => (mouseInsideCanvas = false));
document.documentElement.style.cursor = "none";

canvas.addEventListener("click", () => {
  balls.push(new Ball(player.x, player.y, player.angle, StarterBall.stats));
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
    timestamp - brickSystem.lastSpawn > brickSystem.spawnInterval
  ) {
    brickSystem.spawn();
    brickSystem.lastSpawn = timestamp;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSpawnLimits();
  drawInventory(bounds);
  brickSystem.update();
  updatePlayer(bounds);
  drawPlayer();
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.update();
    if (b.markedForRemoval) balls.splice(i, 1);
    else b.draw(ctx);
  }
  requestAnimationFrame(update);
}
requestAnimationFrame(update);
