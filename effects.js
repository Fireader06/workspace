// effects.js - Option A
// Each effect is an object with optional hooks: onHit, onUpdate, onBounce
// - onHit(ball, target, context)        -> called when a ball hits a brick/target
// - onUpdate(ball, dt, context)         -> called every frame for active effects (optional)
// - onBounce(ball, normal, context)     -> called when a ball bounces off something (optional)
// The game should attach an array of effect names to each ball, e.g. `ball.effects = ['Burn','Pierce']`.
// Then use the helper functions below to invoke the effects for the appropriate event.

// Usage (example):
// import { Effects, runEffectsOnHit } from './effects.js';
// runEffectsOnHit(ball, brick, { bricks: brickSystem.list, spawnBall, spawnBrick });

// Utility helpers
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

// safe accessor for nested status object
function ensureStatus(target) {
  if (!target.status) target.status = {};
  return target.status;
}

// Spawn helpers will be provided by the integrator in the context object where needed
// (spawnBall, spawnBrick, etc.)

export const Effects = {
  // ---------- Basic / Damage ----------
  Damage: {
    onHit(ball, target, ctx) {
      const amount = ctx?.damage ?? ball.stats?.damage ?? 0;
      target.health = (target.health ?? 0) - amount;
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  // deals immediate damage and applies a burning DoT
  Burn: {
    onHit(ball, target, ctx) {
      const base = ctx?.damage ?? ball.stats?.damage ?? 0;
      target.health = (target.health ?? 0) - Math.round(base * 0.5);
      const status = ensureStatus(target);
      status.burn = { duration: ctx?.duration ?? 120, dps: ctx?.dps ?? 2 };
      target.hitFlash = Math.max(target.hitFlash ?? 0, 8);
    },
    onUpdate(ball, dt, ctx) {
      // DoT handled by the game update loop if it processes target.status.burn
    },
  },

  Freeze: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.freeze = { duration: ctx?.duration ?? 60 };
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  Shock: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.shock = { duration: ctx?.duration ?? 30 };
      // small damage to nearby bricks if bricks list provided
      const bricks = ctx?.bricks;
      if (bricks) {
        for (const b of bricks) {
          if (b === target) continue;
          if (dist(b, target) < (ctx?.range ?? 120)) {
            b.health = (b.health ?? 0) - (ctx?.splash ?? 6);
            b.hitFlash = Math.max(b.hitFlash ?? 0, 6);
          }
        }
      }
    },
  },

  Poison: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.poison = { duration: ctx?.duration ?? 90, dps: ctx?.dps ?? 1 };
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  Slow: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.slow = {
        duration: ctx?.duration ?? 60,
        factor: ctx?.factor ?? 0.5,
      };
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  Heal: {
    onHit(ball, target, ctx) {
      target.health = (target.health ?? 0) + (ctx?.amount ?? 10);
      target.hitFlash = Math.max(target.hitFlash ?? 0, 4);
    },
  },

  Knockback: {
    onHit(ball, target, ctx) {
      target.vx = (target.vx ?? 0) + (ball.vx ?? 0) * (ctx?.force ?? 0.25);
      target.vy = (target.vy ?? 0) + (ball.vy ?? 0) * (ctx?.force ?? 0.25);
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  Pierce: {
    onHit(ball, target, ctx) {
      ball.piercesLeft = (ball.piercesLeft ?? ball.stats?.pierce ?? 1) - 1;
      // don't directly harm target beyond damage effect; damage should be handled by Damage or other effects
    },
  },

  areaOfEffect: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      const r = ctx?.radius ?? 80;
      for (const b of bricks) {
        if (dist(b, target) <= r) {
          b.health = (b.health ?? 0) - (ctx?.damage ?? ball.stats?.damage ?? 0);
          b.hitFlash = Math.max(b.hitFlash ?? 0, 6);
        }
      }
    },
  },

  Collision: {
    onHit(ball, target, ctx) {
      // Basic collision feedback: small impulse to target
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
      target.vx = (target.vx ?? 0) + (ball.vx ?? 0) * 0.1;
      target.vy = (target.vy ?? 0) + (ball.vy ?? 0) * 0.1;
    },
  },

  Duration: {
    /* metadata-only effect; handled by statuses */
  },

  CritChance: {
    onHit(ball, target, ctx) {
      // chance to apply crit damage
      const chance = ctx?.chance ?? ball.stats?.critChance ?? 0;
      if (Math.random() < chance) {
        const mult = ctx?.mult ?? ball.stats?.critMultiplier ?? 2;
        target.health =
          (target.health ?? 0) -
          (ctx?.damage ?? ball.stats?.damage ?? 0) * (mult - 1);
      }
    },
  },

  CritMultiplier: {},

  Chain: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      const chainRange = ctx?.chainRange ?? 120;
      const maxChains = ctx?.maxChains ?? 2;
      let count = 0;
      for (const b of bricks) {
        if (b === target) continue;
        if (count >= maxChains) break;
        if (dist(b, target) <= chainRange) {
          b.health =
            (b.health ?? 0) -
            (ctx?.damage ?? Math.round((ball.stats?.damage ?? 0) * 0.6));
          b.hitFlash = Math.max(b.hitFlash ?? 0, 6);
          count++;
        }
      }
    },
  },

  Ricochet: {
    onHit(ball, target, ctx) {
      // redirect ball toward nearest other brick
      const bricks = ctx?.bricks || [];
      let nearest = null;
      let nd = Infinity;
      for (const b of bricks) {
        if (b === target) continue;
        const d = dist(ball, b);
        if (d < nd) {
          nd = d;
          nearest = b;
        }
      }
      if (nearest) {
        const dx = nearest.x + nearest.width / 2 - ball.x;
        const dy = nearest.y + nearest.height / 2 - ball.y;
        const mag = Math.hypot(dx, dy) || 1;
        ball.vx = (dx / mag) * ball.speed;
        ball.vy = (dy / mag) * ball.speed;
      }
    },
  },

  Split: {
    onHit(ball, target, ctx) {
      const spawnBall = ctx?.spawnBall;
      if (typeof spawnBall !== "function") return;
      const count = ctx?.count ?? 2;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        spawnBall(
          ball.x,
          ball.y,
          ang,
          ball.stats,
          ball.gradientCSS,
          ball.phonics
        );
      }
      // mark original for removal if desired
      ball.markedForRemoval = ctx?.removeOriginal ?? true;
    },
  },

  Shield: {
    onHit(ball, target, ctx) {
      target.shield = Math.max((target.shield ?? 0) - (ctx?.amount ?? 5), 0);
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  ArmorBreak: {
    onHit(ball, target, ctx) {
      target.armor = Math.max(0, (target.armor ?? 0) - (ctx?.amount ?? 2));
      target.hitFlash = Math.max(target.hitFlash ?? 0, 8);
    },
  },

  Stun: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.stun = { duration: ctx?.duration ?? 40 };
      target.hitFlash = Math.max(target.hitFlash ?? 0, 8);
    },
  },

  Confuse: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.confuse = { duration: ctx?.duration ?? 80 };
    },
  },

  Weaken: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.weaken = {
        duration: ctx?.duration ?? 90,
        factor: ctx?.factor ?? 1.3,
      };
    },
  },

  Corrupt: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.corrupt = {
        duration: ctx?.duration ?? 150,
        decay: ctx?.decay ?? 0.5,
      };
    },
  },

  Gravity: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      const force = ctx?.force ?? 0.4;
      for (const b of bricks) {
        if (b === target) continue;
        const dx = target.x + target.width / 2 - (b.x + b.width / 2);
        const dy = target.y + target.height / 2 - (b.y + b.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        if (d < (ctx?.range ?? 250)) {
          b.vx = (b.vx ?? 0) + (dx / d) * force;
          b.vy = (b.vy ?? 0) + (dy / d) * force;
        }
      }
    },
  },

  Magnetize: {
    onHit(ball, target, ctx) {
      // attract ball toward target
      const dx = target.x + target.width / 2 - ball.x;
      const dy = target.y + target.height / 2 - ball.y;
      const mag = Math.hypot(dx, dy) || 1;
      ball.vx += (dx / mag) * (ctx?.strength ?? 0.2);
      ball.vy += (dy / mag) * (ctx?.strength ?? 0.2);
    },
  },

  Reflect: {
    onHit(ball, target, ctx) {
      ball.vx *= ctx?.mult ?? -1.2;
      ball.vy *= ctx?.mult ?? -1.2;
    },
  },

  ReboundBoost: {
    onHit(ball, target, ctx) {
      ball.vx += (Math.random() - 0.5) * (ctx?.strength ?? 2.0);
      ball.vy += (Math.random() - 0.5) * (ctx?.strength ?? 2.0);
    },
  },

  ImpactForce: {
    onHit(ball, target, ctx) {
      target.vx = (target.vx ?? 0) + (ball.vx ?? 0) * (ctx?.force ?? 0.5);
      target.vy = (target.vy ?? 0) + (ball.vy ?? 0) * (ctx?.force ?? 0.5);
    },
  },

  Frag: {
    onHit(ball, target, ctx) {
      // spawn small fragments as weak bricks (if spawnBrick provided)
      const spawnBrick = ctx?.spawnBrick;
      if (!spawnBrick) return;
      const count = ctx?.count ?? 3;
      for (let i = 0; i < count; i++) {
        spawnBrick({
          x: target.x + Math.random() * target.width - target.width / 2,
          y: target.y + Math.random() * target.height - target.height / 2,
          width: Math.max(8, target.width * 0.4),
          height: Math.max(8, target.height * 0.4),
          color: target.color,
          health: Math.max(1, Math.round((target.health ?? 10) * 0.25)),
        });
      }
    },
  },

  Shatter: {
    onHit(ball, target, ctx) {
      if (
        (target.health ?? 0) <
        (target.maxHealth ?? target.health ?? 0) * 0.2
      ) {
        target.health = (target.health ?? 0) - (ctx?.bonus ?? 30);
      }
    },
  },

  Bleed: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.bleed = { duration: ctx?.duration ?? 90, dps: ctx?.dps ?? 2 };
    },
  },

  Irradiate: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.irradiate = { duration: ctx?.duration ?? 120, dps: ctx?.dps ?? 1 };
    },
  },

  Echo: {
    onHit(ball, target, ctx) {
      // schedule a weaker aftershock on nearby bricks
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        if (b === target) continue;
        if (dist(b, target) < (ctx?.range ?? 110)) {
          b.health =
            (b.health ?? 0) -
            (ctx?.damage ?? Math.round((ball.stats?.damage ?? 0) * 0.4));
          b.hitFlash = Math.max(b.hitFlash ?? 0, 6);
        }
      }
    },
  },

  Overload: {
    onHit(ball, target, ctx) {
      // temporarily increases target vulnerability
      const status = ensureStatus(target);
      status.vulnerable = {
        duration: ctx?.duration ?? 45,
        mult: ctx?.mult ?? 1.5,
      };
    },
  },

  Charge: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.charge = { duration: ctx?.duration ?? 40 };
    },
  },

  // ---- Continues with many other effects implemented as no-ops or simple behaviors ----
  // For brevity, implement remaining effects as lightweight behaviors that can be expanded.

  Impulse: {
    onHit(ball, target, ctx) {
      target.vx = (target.vx ?? 0) + (ball.vx ?? 0) * 0.2;
      target.vy = (target.vy ?? 0) + (ball.vy ?? 0) * 0.2;
    },
  },

  Windburst: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      const r = ctx?.range ?? 120;
      for (const b of bricks) {
        if (dist(b, target) < r) {
          // push away
          const dx = b.x + b.width / 2 - (target.x + target.width / 2);
          const dy = b.y + b.height / 2 - (target.y + target.height / 2);
          const m = Math.hypot(dx, dy) || 1;
          b.vx = (b.vx ?? 0) + (dx / m) * (ctx?.force ?? 2);
          b.vy = (b.vy ?? 0) + (dy / m) * (ctx?.force ?? 2);
        }
      }
    },
  },

  Quake: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        if (dist(b, target) < (ctx?.range ?? 180)) {
          b.health = (b.health ?? 0) - (ctx?.damage ?? 8);
          b.hitFlash = Math.max(b.hitFlash ?? 0, 8);
        }
      }
    },
  },

  Barrier: {
    onHit(ball, target, ctx) {
      target.barrier = target.barrier ?? ctx?.strength ?? 10;
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  Focus: {
    onHit(ball, target, ctx) {
      // increase target draw highlight briefly
      target.focusTime = Math.max(target.focusTime ?? 0, ctx?.time ?? 40);
    },
  },

  Momentum: {
    onHit(ball, target, ctx) {
      ball.speed = Math.min(
        (ball.speed ?? 7) + (ctx?.bonus ?? 0.3),
        ctx?.max ?? 20
      );
    },
  },

  Amplify: {
    onHit(ball, target, ctx) {
      target.health = (target.health ?? 0) - (ctx?.extra ?? 6);
      target.hitFlash = Math.max(target.hitFlash ?? 0, 6);
    },
  },

  Scatter: {
    onHit(ball, target, ctx) {
      const spawnBall = ctx?.spawnBall;
      if (!spawnBall) return;
      const count = ctx?.count ?? 5;
      for (let i = 0; i < count; i++) {
        const a = (Math.random() - 0.5) * Math.PI;
        spawnBall(
          ball.x,
          ball.y,
          a,
          ball.stats,
          ball.gradientCSS,
          ball.phonics
        );
      }
      ball.markedForRemoval = true;
    },
  },

  Orbit: {
    onHit(ball, target, ctx) {
      ball.orbitTarget = target;
      ball.orbitTime = ctx?.time ?? 60;
    },
  },

  Clone: {
    onHit(ball, target, ctx) {
      const spawnBall = ctx?.spawnBall;
      if (!spawnBall) return;
      spawnBall(
        ball.x,
        ball.y,
        Math.random() * Math.PI * 2,
        ball.stats,
        ball.gradientCSS,
        ball.phonics
      );
    },
  },

  Spore: {
    onHit(ball, target, ctx) {
      const spawnBrick = ctx?.spawnBrick;
      if (!spawnBrick) return;
      for (let i = 0; i < 3; i++) {
        spawnBrick({
          x: target.x + (Math.random() - 0.5) * 20,
          y: target.y + (Math.random() - 0.5) * 20,
          width: Math.max(6, target.width * 0.4),
          height: Math.max(6, target.height * 0.4),
          health: Math.max(1, Math.round((target.health ?? 10) * 0.3)),
          color: target.color,
        });
      }
    },
  },

  Frenzy: {
    onHit(ball, target, ctx) {
      // temporary small multi-hit buff
      ball.frenzy = (ball.frenzy ?? 0) + (ctx?.stacks ?? 1);
    },
  },

  StaticField: {
    onHit(ball, target, ctx) {
      target.status.static = {
        duration: ctx?.duration ?? 60,
        strength: ctx?.strength ?? 1,
      };
    },
  },

  Entropy: {
    onHit(ball, target, ctx) {
      // pick a random other effect and apply it
      const keys = Object.keys(Effects).filter((k) => k !== "Entropy");
      const pick = keys[Math.floor(Math.random() * keys.length)];
      const eff = Effects[pick];
      if (eff && eff.onHit) eff.onHit(ball, target, ctx);
    },
  },

  Gloom: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.slow = {
        duration: ctx?.duration ?? 50,
        factor: ctx?.factor ?? 0.6,
      };
      status.blind = { duration: ctx?.duration ?? 40 };
    },
  },

  Rend: {
    onHit(ball, target, ctx) {
      target.armor = Math.max(0, (target.armor ?? 0) - (ctx?.amount ?? 2));
      target.hitFlash = Math.max(target.hitFlash ?? 0, 8);
    },
  },

  Pulse: {
    onHit(ball, target, ctx) {
      // small radial pulse knocks and damages nearby bricks
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        const d = dist(b, target);
        if (d < (ctx?.range ?? 120)) {
          const force = (1 - d / (ctx?.range ?? 120)) * (ctx?.force ?? 2);
          const dx = b.x + b.width / 2 - (target.x + target.width / 2);
          const dy = b.y + b.height / 2 - (target.y + target.height / 2);
          const m = Math.hypot(dx, dy) || 1;
          b.vx = (b.vx ?? 0) + (dx / m) * force;
          b.vy = (b.vy ?? 0) + (dy / m) * force;
          b.health = (b.health ?? 0) - (ctx?.damage ?? 4);
          b.hitFlash = Math.max(b.hitFlash ?? 0, 6);
        }
      }
    },
  },

  Flare: {
    onHit(ball, target, ctx) {
      target.health = (target.health ?? 0) - (ctx?.damage ?? 10);
      target.hitFlash = Math.max(target.hitFlash ?? 0, 10);
    },
  },

  Nova: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        if (dist(b, target) < (ctx?.range ?? 160)) {
          b.health = (b.health ?? 0) - (ctx?.damage ?? 12);
          b.hitFlash = Math.max(b.hitFlash ?? 0, 8);
        }
      }
    },
  },

  Cascade: {
    onHit(ball, target, ctx) {
      let remaining = ctx?.steps ?? 3;
      let current = target;
      const bricks = ctx?.bricks || [];
      while (remaining > 0) {
        let nearest = null;
        let nd = Infinity;
        for (const b of bricks) {
          if (b === current) continue;
          const d = dist(current, b);
          if (d < nd) {
            nd = d;
            nearest = b;
          }
        }
        if (!nearest || nd > (ctx?.maxJump ?? 150)) break;
        nearest.health = (nearest.health ?? 0) - (ctx?.damage ?? 8);
        nearest.hitFlash = Math.max(nearest.hitFlash ?? 0, 6);
        current = nearest;
        remaining--;
      }
    },
  },

  Tether: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      let nearest = null;
      let nd = Infinity;
      for (const b of bricks) {
        if (b === target) continue;
        const d = dist(target, b);
        if (d < nd) {
          nd = d;
          nearest = b;
        }
      }
      if (nearest) {
        target.tether = nearest;
        nearest.tether = target;
      }
    },
  },

  Mirage: {
    onHit(ball, target, ctx) {
      const spawnBrick = ctx?.spawnBrick;
      if (!spawnBrick) return;
      spawnBrick({
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
        health: 1,
        ghost: true,
        color: "rgba(180,180,255,0.45)",
      });
    },
  },

  Spectral: {
    onHit(ball, target, ctx) {
      // pass-through damage without bounce
      const dmg = ctx?.damage ?? ball.stats?.damage ?? 0;
      target.health = (target.health ?? 0) - dmg;
      ball.markedForRemoval = false; // keep ball
    },
  },

  Blight: {
    onHit(ball, target, ctx) {
      const status = ensureStatus(target);
      status.poison = { duration: ctx?.duration ?? 80, dps: ctx?.dps ?? 1 };
      status.weaken = {
        duration: ctx?.duration ?? 80,
        factor: ctx?.factor ?? 1.2,
      };
    },
  },

  Flicker: {
    onHit(ball, target, ctx) {
      // teleport target slightly
      target.x += (Math.random() - 0.5) * (ctx?.range ?? 30);
      target.y += (Math.random() - 0.5) * (ctx?.range ?? 30);
    },
  },

  ChainPull: {
    onHit(ball, target, ctx) {
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        if (b === target) continue;
        const d = dist(b, target);
        if (d < (ctx?.range ?? 140)) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const m = Math.hypot(dx, dy) || 1;
          b.vx = (b.vx ?? 0) + (dx / m) * (ctx?.force ?? 0.6);
          b.vy = (b.vy ?? 0) + (dy / m) * (ctx?.force ?? 0.6);
        }
      }
    },
  },

  Detonate: {
    onHit(ball, target, ctx) {
      target.health = (target.health ?? 0) - (ctx?.main ?? 20);
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        if (b === target) continue;
        if (dist(b, target) < (ctx?.radius ?? 200)) {
          b.health = (b.health ?? 0) - (ctx?.splash ?? 10);
          b.hitFlash = Math.max(b.hitFlash ?? 0, 10);
        }
      }
    },
  },

  Breach: {
    onHit(ball, target, ctx) {
      // ignore armor / shield for this hit
      const dmg = ctx?.damage ?? ball.stats?.damage ?? 0;
      target.health = (target.health ?? 0) - dmg;
    },
  },

  Volley: {
    onHit(ball, target, ctx) {
      const spawnBall = ctx?.spawnBall;
      if (!spawnBall) return;
      const count = ctx?.count ?? 5;
      for (let i = 0; i < count; i++) {
        const a =
          (Math.random() - 0.5) * (ctx?.spread ?? Math.PI / 3) +
          Math.atan2(ball.vy, ball.vx);
        spawnBall(
          ball.x,
          ball.y,
          a,
          ball.stats,
          ball.gradientCSS,
          ball.phonics
        );
      }
      ball.markedForRemoval = true;
    },
  },

  Burst: {
    onHit(ball, target, ctx) {
      // small multi-hit around target
      const bricks = ctx?.bricks || [];
      for (const b of bricks) {
        if (dist(b, target) < (ctx?.range ?? 100)) {
          b.health = (b.health ?? 0) - (ctx?.damage ?? 6);
          b.hitFlash = Math.max(b.hitFlash ?? 0, 6);
        }
      }
    },
  },

  Frostbite: Effects?.Frostbite ?? {},
  Incinerate: Effects?.Incinerate ?? {},
  ToxinCloud: Effects?.ToxinCloud ?? {},
  HyperBounce: Effects?.HyperBounce ?? {},
  Crush: {
    onHit(ball, target, ctx) {
      target.health = (target.health ?? 0) - (ctx?.damage ?? 15);
    },
  },
  Disrupt: {
    onHit(ball, target, ctx) {
      target.hitFlash = Math.max(target.hitFlash ?? 0, 8);
    },
  },
  Drain: {
    onHit(ball, target, ctx) {
      const amt = ctx?.amount ?? 5;
      target.health = (target.health ?? 0) - amt;
      if (ball.owner)
        ball.owner.health = (ball.owner.health ?? 0) + Math.round(amt * 0.5);
    },
  },
  EchoHit: {
    onHit(ball, target, ctx) {
      /* weaker followup */ target.health =
        (target.health ?? 0) - (ctx?.damage ?? 4);
    },
  },
};

// ---------- Runner helpers ----------
// Call these from your game code when you want effects to be applied.

/**
 * Run all "onHit" effects attached to a ball against a target.
 * - ball.effects: array of effect names (strings)
 * - ctx: optional context object (bricks list, spawnBall, spawnBrick, etc.)
 */
export function runEffectsOnHit(ball, target, ctx = {}) {
  if (!Array.isArray(ball.effects)) return;
  for (const name of ball.effects) {
    const e = Effects[name];
    if (e && typeof e.onHit === "function") {
      try {
        e.onHit(ball, target, ctx);
      } catch (err) {
        console.warn("Effect onHit error", name, err);
      }
    }
  }
}

/**
 * Run all "onUpdate" hooks for a ball each frame (dt in seconds or frames)
 */
export function runEffectsOnUpdate(ball, dt, ctx = {}) {
  if (!Array.isArray(ball.effects)) return;
  for (const name of ball.effects) {
    const e = Effects[name];
    if (e && typeof e.onUpdate === "function") {
      try {
        e.onUpdate(ball, dt, ctx);
      } catch (err) {
        console.warn("Effect onUpdate error", name, err);
      }
    }
  }
}

/**
 * Run all "onBounce" hooks for a ball when it bounces.
 * normal is the contact normal vector {x,y}
 */
export function runEffectsOnBounce(ball, normal, ctx = {}) {
  if (!Array.isArray(ball.effects)) return;
  for (const name of ball.effects) {
    const e = Effects[name];
    if (e && typeof e.onBounce === "function") {
      try {
        e.onBounce(ball, normal, ctx);
      } catch (err) {
        console.warn("Effect onBounce error", name, err);
      }
    }
  }
}

// Utility: apply a single named effect immediately (convenience)
export function applyEffectByName(name, ball, target, ctx = {}) {
  const e = Effects[name];
  if (!e) return;
  if (typeof e.onHit === "function") {
    try {
      e.onHit(ball, target, ctx);
    } catch (err) {
      console.warn("applyEffectByName error", name, err);
    }
  }
}
