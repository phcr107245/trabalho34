/**
 * ============================================================================
 * NEON FLAPPY 80s — ARCADE SYNTHWAVE EDITION
 * Pure JavaScript, HTML5 Canvas, Web Audio API, LocalStorage
 * ============================================================================
 */

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
  // Canvas Logical Dimensions
  WIDTH: 480,
  HEIGHT: 720,
  HORIZON_Y: 430,
  GROUND_Y: 650,

  // Player Physics
  GRAVITY: 1100,           // Pixels / sec^2
  FLAP_FORCE: -370,        // Pixels / sec
  MAX_FALL_SPEED: 650,     // Terminal velocity
  PLAYER_X: 110,           // Fixed horizontal position
  PLAYER_RADIUS: 14,       // Collision radius (forgiving hitbox)
  PLAYER_WIDTH: 42,
  PLAYER_HEIGHT: 26,

  // Obstacles (Neon Tech Portals)
  INITIAL_PIPE_SPEED: 180, // Pixels / sec
  MAX_PIPE_SPEED: 290,     // Max speed cap
  SPEED_INCREASE_PER_SCORE: 2.5,
  INITIAL_GAP: 156,        // Vertical opening height
  MIN_GAP: 136,            // Minimum gap at high scores
  PORTAL_WIDTH: 64,        // Width of portal pillars
  SPAWN_INTERVAL: 1.85,    // Seconds between spawns
  MIN_PORTAL_HEIGHT: 65,   // Min safe height from ceiling/ground

  // Particles & FX
  MAX_PARTICLES: 160,
  SCREEN_SHAKE_DURATION: 0.35,
  SCREEN_SHAKE_MAGNITUDE: 9,

  // Colors Palette
  COLORS: {
    pink: '#ff00cc',
    cyan: '#00eaff',
    purple: '#7a00ff',
    crimson: '#ff2a6d',
    yellow: '#ffe600',
    green: '#39ff14',
    bgDark: '#050014',
    bgDeep: '#12002b',
    gridLine: '#ff00aa',
    gridCyan: '#00eaff'
  }
};

// ============================================================================
// CANVAS & CONTEXT SETUP
// ============================================================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const soundBtn = document.getElementById('sound-btn');

let canvasScale = 1;
let canvasOffsetX = 0;
let canvasOffsetY = 0;

function setupCanvasDpi() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CONFIG.WIDTH * dpr);
  canvas.height = Math.round(CONFIG.HEIGHT * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const container = canvas.parentElement;
  if (container) {
    const rect = container.getBoundingClientRect();
    canvasScale = rect.width / CONFIG.WIDTH;
    canvasOffsetX = rect.left;
    canvasOffsetY = rect.top;
  }
}

// ============================================================================
// GAME STATE
// ============================================================================
const MENU = 'MENU';
const PLAYING = 'PLAYING';
const GAME_OVER = 'GAME_OVER';

let gameState = MENU;
let score = 0;
let bestScore = 0;
let currentSpeed = CONFIG.INITIAL_PIPE_SPEED;
let currentGap = CONFIG.INITIAL_GAP;
let gameTime = 0;
let lastTime = 0;
let spawnTimer = 0;
let scoreAnimScale = 1.0;
let screenFlashAlpha = 0;
let flashColor = '#ffffff';
let shakeTime = 0;
let shakeOffset = { x: 0, y: 0 };
let gameOverCooldown = 0; // Prevents accidental instant restart
let isNewBestScore = false;

// ============================================================================
// AUDIO (Procedural Web Audio API — No External Files)
// ============================================================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
      }
    } catch (e) {
      console.warn('Web Audio API não suportado:', e);
    }
  }

  ensureRunning() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (soundBtn) {
      soundBtn.textContent = `AUDIO: ${this.enabled ? 'ON' : 'OFF'}`;
      soundBtn.style.borderColor = this.enabled ? CONFIG.COLORS.cyan : '#666';
      soundBtn.style.color = this.enabled ? CONFIG.COLORS.cyan : '#888';
    }
    return this.enabled;
  }

  // 80s Laser Wing Flap
  playFlap() {
    if (!this.enabled) return;
    this.ensureRunning();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (err) {
      // Ignora falhas de áudio isoladas
    }
  }

  // Synth Chime Score Sound
  playScore() {
    if (!this.enabled) return;
    this.ensureRunning();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [659.25, 987.77, 1318.51]; // E5, B5, E6 synth chime
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.14, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.19);
      });
    } catch (err) {}
  }

  // Heavy 80s Digital Crunch Collision
  playCollision() {
    if (!this.enabled) return;
    this.ensureRunning();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (err) {}
  }

  // Melancholic Descending Retro Game Over
  playGameOver() {
    if (!this.enabled) return;
    this.ensureRunning();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 415.30, 349.23, 261.63]; // C5, Ab4, F4, C4
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);

        gain.gain.setValueAtTime(0.12, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.22);
      });
    } catch (err) {}
  }

  // Rising Arcade Coin-Up Power Sound
  playStart() {
    if (!this.enabled) return;
    this.ensureRunning();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (err) {}
  }
}

const audio = new SoundEngine();

// ============================================================================
// INPUT HANDLING
// ============================================================================
function handleInput() {
  audio.ensureRunning();

  if (gameState === MENU) {
    audio.playStart();
    startGame();
  } else if (gameState === PLAYING) {
    player.flap();
  } else if (gameState === GAME_OVER) {
    if (gameOverCooldown <= 0) {
      audio.playStart();
      resetGame();
      startGame();
    }
  }
}

// Keyboard events
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    handleInput();
  } else if (e.code === 'Enter') {
    e.preventDefault();
    if (gameState === MENU || gameState === GAME_OVER) {
      handleInput();
    }
  }
});

// Mouse and Touch events on Canvas
canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  handleInput();
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleInput();
}, { passive: false });

if (soundBtn) {
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.toggle();
  });
}

// Window resize handling
window.addEventListener('resize', () => {
  setupCanvasDpi();
});

// ============================================================================
// PLAYER (NEON CYBER BIRD)
// ============================================================================
const player = {
  x: CONFIG.PLAYER_X,
  y: 350,
  vy: 0,
  rotation: 0,
  wingAngle: 0,
  wingTimer: 0,
  alive: true,
  idleFloatTimer: 0,

  reset() {
    this.x = CONFIG.PLAYER_X;
    this.y = 350;
    this.vy = 0;
    this.rotation = 0;
    this.wingAngle = 0;
    this.wingTimer = 0;
    this.alive = true;
    this.idleFloatTimer = 0;
  },

  flap() {
    if (!this.alive) return;
    this.vy = CONFIG.FLAP_FORCE;
    this.wingTimer = 0; // Trigger wing flap snap
    audio.playFlap();

    // Spawn flap burst particles behind thruster
    for (let i = 0; i < 4; i++) {
      createParticle(
        this.x - 18,
        this.y + (Math.random() * 8 - 4),
        -currentSpeed * 0.4 - Math.random() * 80,
        (Math.random() - 0.5) * 60,
        0.35,
        Math.random() * 3 + 2,
        Math.random() > 0.5 ? CONFIG.COLORS.cyan : CONFIG.COLORS.pink,
        'TRAIL'
      );
    }
  },

  update(dt) {
    if (gameState === MENU) {
      // Gentle floating sine wave motion in menu
      this.idleFloatTimer += dt * 3.5;
      this.y = 330 + Math.sin(this.idleFloatTimer) * 16;
      this.rotation = Math.sin(this.idleFloatTimer) * 0.08;
      this.wingAngle = Math.sin(this.idleFloatTimer * 3) * 0.4;
      return;
    }

    if (this.alive) {
      // Gravity acceleration
      this.vy += CONFIG.GRAVITY * dt;
      if (this.vy > CONFIG.MAX_FALL_SPEED) {
        this.vy = CONFIG.MAX_FALL_SPEED;
      }

      this.y += this.vy * dt;

      // Smooth rotation based on vertical velocity
      const targetRotation = Math.min(Math.max((this.vy / 500) * 0.9, -0.55), 1.1);
      this.rotation += (targetRotation - this.rotation) * (dt * 12);

      // Wing flapping animation
      this.wingTimer += dt * 18;
      this.wingAngle = Math.sin(this.wingTimer) * 0.55;

      // Continuous thruster particle stream
      createParticle(
        this.x - 16,
        this.y + (Math.random() * 4 - 2),
        -currentSpeed * 0.6 - Math.random() * 60,
        (Math.random() - 0.5) * 30,
        0.28,
        Math.random() * 3 + 1.5,
        Math.random() > 0.4 ? CONFIG.COLORS.cyan : CONFIG.COLORS.pink,
        'TRAIL'
      );
    }
  },

  draw() {
    if (!this.alive) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Glowing Neon Aura around the bird
    ctx.shadowBlur = 18;
    ctx.shadowColor = CONFIG.COLORS.pink;

    // --- Cyber Thruster Flame ---
    const flameSize = 10 + Math.sin(gameTime * 25) * 4;
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.lineTo(-16 - flameSize, 0);
    ctx.lineTo(-16, 4);
    ctx.closePath();
    ctx.fillStyle = CONFIG.COLORS.cyan;
    ctx.shadowColor = CONFIG.COLORS.cyan;
    ctx.fill();

    // --- Cyber Fuselage (Body) ---
    ctx.beginPath();
    ctx.moveTo(22, 0);       // Nose / Beak
    ctx.lineTo(4, -12);      // Forehead
    ctx.lineTo(-14, -8);     // Back spine
    ctx.lineTo(-18, 0);      // Tail / Thruster
    ctx.lineTo(-14, 8);      // Underbelly back
    ctx.lineTo(8, 7);        // Underbelly front
    ctx.closePath();

    const bodyGrad = ctx.createLinearGradient(-18, -12, 22, 12);
    bodyGrad.addColorStop(0, '#1a0533');
    bodyGrad.addColorStop(0.5, '#4a0072');
    bodyGrad.addColorStop(1, '#ff007f');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Neon edge highlight on fuselage
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = CONFIG.COLORS.pink;
    ctx.stroke();

    // --- Cyber Cockpit Visor ---
    ctx.beginPath();
    ctx.moveTo(6, -8);
    ctx.lineTo(16, -2);
    ctx.lineTo(7, 2);
    ctx.lineTo(2, -3);
    ctx.closePath();
    ctx.fillStyle = CONFIG.COLORS.cyan;
    ctx.shadowColor = CONFIG.COLORS.cyan;
    ctx.shadowBlur = 14;
    ctx.fill();

    // Eye visor glint
    ctx.beginPath();
    ctx.arc(10, -3, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // --- Animated Articulated Cyber Wing ---
    ctx.save();
    ctx.translate(-2, 0);
    ctx.rotate(this.wingAngle);

    // Wing Body
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -18);
    ctx.lineTo(-4, -18);
    ctx.lineTo(10, -4);
    ctx.closePath();

    const wingGrad = ctx.createLinearGradient(-14, -18, 10, 0);
    wingGrad.addColorStop(0, CONFIG.COLORS.cyan);
    wingGrad.addColorStop(0.7, CONFIG.COLORS.purple);
    wingGrad.addColorStop(1, CONFIG.COLORS.pink);
    ctx.fillStyle = wingGrad;
    ctx.fill();

    ctx.lineWidth = 1.8;
    ctx.strokeStyle = CONFIG.COLORS.cyan;
    ctx.shadowColor = CONFIG.COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.stroke();

    // Tech Wing Panel Line
    ctx.beginPath();
    ctx.moveTo(-6, -14);
    ctx.lineTo(2, -5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }
};

// ============================================================================
// OBSTACLES (NEON TECH PORTALS)
// ============================================================================
let obstacles = [];

class TechPortal {
  constructor(x, gapY, gapSize) {
    this.x = x;
    this.width = CONFIG.PORTAL_WIDTH;
    this.gapY = gapY;
    this.gapSize = gapSize;
    this.topHeight = gapY - gapSize / 2;
    this.bottomY = gapY + gapSize / 2;
    this.scored = false;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.x -= currentSpeed * dt;
    this.pulsePhase += dt * 5;
  }

  draw() {
    const pulse = (Math.sin(this.pulsePhase) + 1) * 0.5; // 0 to 1

    // Draw Top Portal
    this.drawPortalColumn(this.x, 0, this.width, this.topHeight, true, pulse);

    // Draw Bottom Portal
    const bottomHeight = CONFIG.GROUND_Y - this.bottomY;
    this.drawPortalColumn(this.x, this.bottomY, this.width, bottomHeight, false, pulse);

    // Draw Holographic Laser Gate Edge at the opening
    this.drawLaserOpening(pulse);
  }

  drawPortalColumn(x, y, w, h, isTop, pulse) {
    if (h <= 0) return;

    ctx.save();

    // 1. Column Dark Tech Body
    const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyGrad.addColorStop(0, '#0a0319');
    bodyGrad.addColorStop(0.3, '#1f0d3d');
    bodyGrad.addColorStop(0.7, '#140529');
    bodyGrad.addColorStop(1, '#06010f');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x, y, w, h);

    // 2. Outer Glowing Neon Rails
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = CONFIG.COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.shadowColor = CONFIG.COLORS.cyan;

    // Left vertical rail
    ctx.beginPath();
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 2, y + h);
    ctx.stroke();

    // Right vertical rail
    ctx.strokeStyle = CONFIG.COLORS.pink;
    ctx.shadowColor = CONFIG.COLORS.pink;
    ctx.beginPath();
    ctx.moveTo(x + w - 2, y);
    ctx.lineTo(x + w - 2, y + h);
    ctx.stroke();

    // 3. Horizontal Cyber Grid / Circuit Ribs
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 234, 255, 0.4)';
    ctx.shadowBlur = 0;
    const step = 24;
    const startY = y + (step - (y % step));
    for (let cy = startY; cy < y + h - 14; cy += step) {
      ctx.beginPath();
      ctx.moveTo(x + 6, cy);
      ctx.lineTo(x + w - 6, cy);
      ctx.stroke();

      // Mini glowing tech LED node
      ctx.fillStyle = (cy % (step * 2) === 0) ? CONFIG.COLORS.yellow : CONFIG.COLORS.green;
      ctx.fillRect(x + w / 2 - 2, cy - 2, 4, 4);
    }

    // 4. Portal Emitter Cap at the Gap End
    const capH = 18;
    const capY = isTop ? (y + h - capH) : y;

    // Emitter base glow
    ctx.fillStyle = '#26004d';
    ctx.fillRect(x - 3, capY, w + 6, capH);

    ctx.lineWidth = 2;
    ctx.strokeStyle = isTop ? CONFIG.COLORS.cyan : CONFIG.COLORS.pink;
    ctx.shadowBlur = 15;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.strokeRect(x - 3, capY, w + 6, capH);

    // Emitter Energy Core Bar
    const coreGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    coreGrad.addColorStop(0, CONFIG.COLORS.pink);
    coreGrad.addColorStop(0.5, '#ffffff');
    coreGrad.addColorStop(1, CONFIG.COLORS.cyan);
    ctx.fillStyle = coreGrad;
    ctx.fillRect(x + 4, capY + 4, w - 8, capH - 8);

    ctx.restore();
  }

  drawLaserOpening(pulse) {
    ctx.save();
    // Soft holographic energy shimmer between portal caps
    const laserAlpha = 0.15 + pulse * 0.2;
    ctx.fillStyle = `rgba(0, 234, 255, ${laserAlpha})`;
    ctx.fillRect(this.x + 8, this.topHeight, this.width - 16, this.gapSize);

    // Subtle edge laser lines
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(255, 0, 204, ${0.4 + pulse * 0.4})`;
    ctx.shadowBlur = 10;
    ctx.shadowColor = CONFIG.COLORS.pink;

    ctx.beginPath();
    ctx.moveTo(this.x + 12, this.topHeight);
    ctx.lineTo(this.x + 12, this.bottomY);
    ctx.moveTo(this.x + this.width - 12, this.topHeight);
    ctx.lineTo(this.x + this.width - 12, this.bottomY);
    ctx.stroke();

    ctx.restore();
  }
}

function spawnObstacle() {
  // Safe vertical bounds for opening
  const minY = CONFIG.MIN_PORTAL_HEIGHT + currentGap / 2;
  const maxY = CONFIG.GROUND_Y - CONFIG.MIN_PORTAL_HEIGHT - currentGap / 2;
  const gapY = minY + Math.random() * (maxY - minY);

  obstacles.push(new TechPortal(CONFIG.WIDTH + 20, gapY, currentGap));
}

function updateObstacles(dt) {
  spawnTimer += dt;
  if (spawnTimer >= CONFIG.SPAWN_INTERVAL) {
    spawnTimer = 0;
    spawnObstacle();
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.update(dt);

    // Check if player passed obstacle to score point
    if (!obs.scored && obs.x + obs.width < player.x) {
      obs.scored = true;
      addScore();
    }

    // Remove offscreen obstacles
    if (obs.x + obs.width < -40) {
      obstacles.splice(i, 1);
    }
  }
}

function drawObstacles() {
  for (let i = 0; i < obstacles.length; i++) {
    obstacles[i].draw();
  }
}

// ============================================================================
// PARTICLES SYSTEM
// ============================================================================
let particles = [];

function createParticle(x, y, vx, vy, life, size, color, type) {
  if (particles.length >= CONFIG.MAX_PARTICLES) {
    // Drop oldest particle if limit reached
    particles.shift();
  }
  particles.push({
    x, y, vx, vy,
    life,
    maxLife: life,
    size,
    color,
    type
  });
}

// Explosive burst on crash or score
function createParticleBurst(x, y, count, colors, type) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (type === 'DEATH' ? 60 : 40) + Math.random() * (type === 'DEATH' ? 240 : 160);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const life = 0.4 + Math.random() * (type === 'DEATH' ? 0.7 : 0.5);
    const size = Math.random() * 4 + 2;
    const color = colors[Math.floor(Math.random() * colors.length)];

    createParticle(x, y, vx, vy, life, size, color, type);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Ambient floating motes wrap around
    if (p.type === 'AMBIENT') {
      if (p.y < 0) p.y = CONFIG.HEIGHT;
      if (p.x < 0) p.x = CONFIG.WIDTH;
    } else {
      // Natural drag
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
  }
}

function drawParticles() {
  ctx.save();
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const alpha = Math.max(0, p.life / p.maxLife);

    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 10;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;

    if (p.type === 'DEATH') {
      // Cyber diamond debris
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.size);
      ctx.lineTo(p.x + p.size, p.y);
      ctx.lineTo(p.x, p.y + p.size);
      ctx.lineTo(p.x - p.size, p.y);
      ctx.closePath();
      ctx.fill();
    } else {
      // Glowing circular particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Ambient Synth Dust Generator
function initAmbientParticles() {
  for (let i = 0; i < 22; i++) {
    createParticle(
      Math.random() * CONFIG.WIDTH,
      Math.random() * CONFIG.HEIGHT,
      -15 - Math.random() * 25,
      (Math.random() - 0.5) * 12,
      99999, // Permanent ambient
      Math.random() * 2 + 1,
      Math.random() > 0.5 ? 'rgba(0, 234, 255, 0.7)' : 'rgba(255, 0, 204, 0.7)',
      'AMBIENT'
    );
  }
}

// ============================================================================
// BACKGROUND (SYNTHWAVE SKY, STARS, SUN, MOUNTAINS, PERSPECTIVE GRID)
// ============================================================================
const stars = [];
for (let i = 0; i < 65; i++) {
  stars.push({
    x: Math.random() * CONFIG.WIDTH,
    y: Math.random() * (CONFIG.HORIZON_Y - 40),
    radius: Math.random() * 1.6 + 0.6,
    baseAlpha: 0.3 + Math.random() * 0.7,
    twinkleSpeed: 1 + Math.random() * 3,
    color: Math.random() > 0.3 ? '#ffffff' : (Math.random() > 0.5 ? CONFIG.COLORS.cyan : CONFIG.COLORS.pink)
  });
}

let gridOffset = 0;
let mountainOffsetFar = 0;
let mountainOffsetNear = 0;

function drawBackground(dt) {
  // Scroll parallax layers
  const effectiveSpeed = (gameState === PLAYING ? currentSpeed : CONFIG.INITIAL_PIPE_SPEED * 0.5);
  gridOffset = (gridOffset + effectiveSpeed * dt * 0.9) % 40;
  mountainOffsetFar = (mountainOffsetFar + effectiveSpeed * dt * 0.08) % CONFIG.WIDTH;
  mountainOffsetNear = (mountainOffsetNear + effectiveSpeed * dt * 0.2) % CONFIG.WIDTH;

  // 1. Sky Gradient (Deep purple/blue space into horizon magenta glow)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CONFIG.HORIZON_Y);
  skyGrad.addColorStop(0, '#04000d');
  skyGrad.addColorStop(0.45, '#12002b');
  skyGrad.addColorStop(0.8, '#2a0054');
  skyGrad.addColorStop(1, '#5a0066');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HORIZON_Y);

  // 2. Twinkling Stars
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const alpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(gameTime * s.twinkleSpeed + i));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = s.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Giant 80s Synthwave Sun
  drawSynthwaveSun();

  // 4. Geometric Mountains with Neon Rims
  drawMountains(mountainOffsetFar, 75, '#150529', '#7a00ff', 0.6);
  drawMountains(mountainOffsetNear, 45, '#1d0738', '#ff00cc', 1.0);

  // 5. Synthwave Perspective Floor Grid
  drawPerspectiveGrid();

  // 6. Glowing Horizon Laser Line
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = CONFIG.COLORS.cyan;
  ctx.shadowBlur = 18;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.beginPath();
  ctx.moveTo(0, CONFIG.HORIZON_Y);
  ctx.lineTo(CONFIG.WIDTH, CONFIG.HORIZON_Y);
  ctx.stroke();

  // Horizon Neon Glow Fill
  const horizGrad = ctx.createLinearGradient(0, CONFIG.HORIZON_Y - 15, 0, CONFIG.HORIZON_Y + 15);
  horizGrad.addColorStop(0, 'rgba(255, 0, 204, 0)');
  horizGrad.addColorStop(0.5, 'rgba(255, 0, 204, 0.45)');
  horizGrad.addColorStop(1, 'rgba(0, 234, 255, 0)');
  ctx.fillStyle = horizGrad;
  ctx.fillRect(0, CONFIG.HORIZON_Y - 15, CONFIG.WIDTH, 30);
  ctx.restore();
}

// Iconic Segmented Synthwave Sun
function drawSynthwaveSun() {
  const sunX = CONFIG.WIDTH / 2;
  const sunY = CONFIG.HORIZON_Y - 45;
  const sunRadius = 78;
  const pulse = Math.sin(gameTime * 2) * 1.5;

  ctx.save();

  // Clip to upper hemisphere above horizon
  ctx.beginPath();
  ctx.rect(0, 0, CONFIG.WIDTH, CONFIG.HORIZON_Y);
  ctx.clip();

  // Sun Outer Glow
  ctx.shadowBlur = 45;
  ctx.shadowColor = '#ff0077';

  // Sun Gradient (Yellow -> Orange -> Hot Pink)
  const sunGrad = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
  sunGrad.addColorStop(0, '#fff34d');
  sunGrad.addColorStop(0.3, '#ffaa00');
  sunGrad.addColorStop(0.7, '#ff0066');
  sunGrad.addColorStop(1, '#ff00cc');

  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius + pulse, 0, Math.PI * 2);
  ctx.fill();

  // Classic Horizontal Cutout Slices (Synthwave Venetian Blinds)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#12002b'; // Matches dark sky horizon color
  const numSlices = 7;
  for (let i = 0; i < numSlices; i++) {
    const sliceY = sunY - 10 + i * 13;
    const sliceHeight = 2.0 + i * 1.4; // Gets progressively thicker toward bottom
    if (sliceY > sunY - sunRadius && sliceY < CONFIG.HORIZON_Y) {
      ctx.fillRect(sunX - sunRadius - 10, sliceY, (sunRadius + 10) * 2, sliceHeight);
    }
  }

  ctx.restore();
}

// Geometric Wireframe Mountains
function drawMountains(offset, height, fillColor, rimColor, rimWidth) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CONFIG.WIDTH, CONFIG.HORIZON_Y);
  ctx.clip();

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = rimWidth;
  ctx.shadowBlur = 10;
  ctx.shadowColor = rimColor;

  const peakWidth = 80;
  const baseY = CONFIG.HORIZON_Y;

  ctx.beginPath();
  ctx.moveTo(-100, baseY);

  // Repeat peaks with seamless offset
  for (let x = -peakWidth * 2 - offset; x < CONFIG.WIDTH + peakWidth * 2; x += peakWidth) {
    const peakX = x + peakWidth / 2;
    const peakY = baseY - height - Math.abs(Math.sin((x + 100) * 0.02)) * (height * 0.7);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(x + peakWidth, baseY);
  }

  ctx.lineTo(CONFIG.WIDTH + 100, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// 3D Perspective Synthwave Floor Grid
function drawPerspectiveGrid() {
  const horizon = CONFIG.HORIZON_Y;
  const bottom = CONFIG.HEIGHT;
  const height = bottom - horizon;

  ctx.save();

  // Floor Dark Gradient
  const floorGrad = ctx.createLinearGradient(0, horizon, 0, bottom);
  floorGrad.addColorStop(0, '#0d0022');
  floorGrad.addColorStop(0.5, '#190038');
  floorGrad.addColorStop(1, '#050012');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, horizon, CONFIG.WIDTH, height);

  // Vanishing point at horizon center
  const vpX = CONFIG.WIDTH / 2;
  const vpY = horizon;

  // 1. Perspective Longitudinal Lines (Radiating out from vanishing point)
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = CONFIG.COLORS.gridCyan;
  ctx.shadowBlur = 8;
  ctx.shadowColor = CONFIG.COLORS.gridCyan;

  const numLines = 16;
  for (let i = -numLines / 2; i <= numLines / 2; i++) {
    const targetBottomX = vpX + i * 55;
    ctx.beginPath();
    ctx.moveTo(vpX + i * 2, vpY);
    ctx.lineTo(targetBottomX, bottom);
    ctx.stroke();
  }

  // 2. Moving Transversal Lines (Exponential spacing for 3D depth)
  ctx.strokeStyle = CONFIG.COLORS.gridLine;
  ctx.shadowColor = CONFIG.COLORS.gridLine;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.8;

  const numHorizontal = 11;
  for (let i = 0; i < numHorizontal; i++) {
    // Offset normalized [0, 1)
    const norm = (i / numHorizontal + (gridOffset / 40) / numHorizontal) % 1;
    // Exponential curve: dense near horizon, wide near bottom
    const y = horizon + Math.pow(norm, 2.3) * height;

    if (y > horizon + 2) {
      // Alpha fades as it approaches the distant horizon
      ctx.globalAlpha = Math.min(1, Math.pow(norm, 1.2) * 1.2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CONFIG.WIDTH, y);
      ctx.stroke();
    }
  }

  // Ground collision line (Floor laser boundary)
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = CONFIG.COLORS.pink;
  ctx.shadowBlur = 15;
  ctx.shadowColor = CONFIG.COLORS.pink;
  ctx.beginPath();
  ctx.moveTo(0, CONFIG.GROUND_Y);
  ctx.lineTo(CONFIG.WIDTH, CONFIG.GROUND_Y);
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================
function checkCollisions() {
  if (!player.alive || gameState !== PLAYING) return;

  // 1. Ceiling & Ground Collision
  if (player.y - CONFIG.PLAYER_RADIUS <= 0 || player.y + CONFIG.PLAYER_RADIUS >= CONFIG.GROUND_Y) {
    gameOver();
    return;
  }

  // 2. Obstacles (Portals) Collision
  // Using a slightly inset hitbox for forgiving, fair and fun gameplay
  const hitRadius = CONFIG.PLAYER_RADIUS * 0.78;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const obsLeft = obs.x + 4;
    const obsRight = obs.x + obs.width - 4;

    // Check horizontal overlap
    if (player.x + hitRadius > obsLeft && player.x - hitRadius < obsRight) {
      // Check vertical collision with Upper Portal or Lower Portal
      if (player.y - hitRadius < obs.topHeight || player.y + hitRadius > obs.bottomY) {
        gameOver();
        return;
      }
    }
  }
}

// ============================================================================
// SCORE SYSTEM & LOCAL STORAGE
// ============================================================================
function loadBestScore() {
  try {
    const saved = localStorage.getItem('neon_flappy_best_score');
    if (saved !== null) {
      bestScore = parseInt(saved, 10) || 0;
    }
  } catch (err) {
    console.warn('LocalStorage inacessível:', err);
    bestScore = 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem('neon_flappy_best_score', bestScore.toString());
  } catch (err) {
    console.warn('Erro ao salvar no LocalStorage:', err);
  }
}

function addScore() {
  score++;
  scoreAnimScale = 1.6; // Scale pop effect
  screenFlashAlpha = 0.25;
  flashColor = CONFIG.COLORS.cyan;

  // Sound chime
  audio.playScore();

  // Burst glowing particles at scoring point
  createParticleBurst(player.x + 20, player.y, 18, [
    CONFIG.COLORS.cyan,
    CONFIG.COLORS.yellow,
    '#ffffff'
  ], 'SCORE');

  // Gradual controlled difficulty scaling
  currentSpeed = Math.min(
    CONFIG.MAX_PIPE_SPEED,
    CONFIG.INITIAL_PIPE_SPEED + score * CONFIG.SPEED_INCREASE_PER_SCORE
  );

  currentGap = Math.max(
    CONFIG.MIN_GAP,
    CONFIG.INITIAL_GAP - score * 0.4
  );

  // Check best score immediately
  if (score > bestScore) {
    bestScore = score;
    isNewBestScore = true;
    saveBestScore();
  }
}

// Format number as 5-digit arcade score (e.g. 00042)
function padScore(num) {
  return num.toString().padStart(5, '0');
}

// ============================================================================
// GAME STATES & CONTROLLER
// ============================================================================
function startGame() {
  gameState = PLAYING;
  obstacles = [];
  particles = [];
  initAmbientParticles();
  score = 0;
  isNewBestScore = false;
  currentSpeed = CONFIG.INITIAL_PIPE_SPEED;
  currentGap = CONFIG.INITIAL_GAP;
  spawnTimer = CONFIG.SPAWN_INTERVAL * 0.7; // First obstacle arrives shortly
  player.reset();
  player.flap();
}

function resetGame() {
  player.reset();
  obstacles = [];
  score = 0;
  isNewBestScore = false;
  currentSpeed = CONFIG.INITIAL_PIPE_SPEED;
  currentGap = CONFIG.INITIAL_GAP;
  spawnTimer = 0;
  shakeTime = 0;
  screenFlashAlpha = 0;
}

function gameOver() {
  if (gameState !== PLAYING) return;

  gameState = GAME_OVER;
  player.alive = false;
  gameOverCooldown = 0.45; // Cooldown before restart can be triggered

  // Play audio
  audio.playCollision();
  setTimeout(() => {
    audio.playGameOver();
  }, 120);

  // Camera Shake
  shakeTime = CONFIG.SCREEN_SHAKE_DURATION;

  // Flash crimson
  screenFlashAlpha = 0.55;
  flashColor = CONFIG.COLORS.crimson;

  // Big Death Explosion
  createParticleBurst(player.x, player.y, 45, [
    CONFIG.COLORS.pink,
    CONFIG.COLORS.cyan,
    CONFIG.COLORS.yellow,
    CONFIG.COLORS.crimson,
    '#ffffff'
  ], 'DEATH');

  // Save record
  if (score > bestScore) {
    bestScore = score;
    isNewBestScore = true;
  }
  saveBestScore();
}

// ============================================================================
// HUD & INTERFACES (MENU, HUD, GAME OVER)
// ============================================================================
function drawHUD() {
  ctx.save();
  ctx.font = "900 24px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.textAlign = 'center';

  // 1. In-Game Live Score (Pulsing Scale Pop)
  const scoreY = 56;
  ctx.save();
  ctx.translate(CONFIG.WIDTH / 2, scoreY);
  ctx.scale(scoreAnimScale, scoreAnimScale);

  ctx.shadowBlur = 18;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.fillStyle = CONFIG.COLORS.cyan;
  ctx.fillText(padScore(score), 0, 0);

  // Inner bright stroke
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(padScore(score), 0, 0);
  ctx.restore();

  // 2. Best Score in Top Right
  ctx.font = "700 13px 'Courier New', monospace";
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff99e6';
  ctx.shadowBlur = 8;
  ctx.shadowColor = CONFIG.COLORS.pink;
  ctx.fillText(`BEST ${padScore(bestScore)}`, CONFIG.WIDTH - 20, 32);

  // Speed level indicator
  const speedLevel = Math.floor((currentSpeed - CONFIG.INITIAL_PIPE_SPEED) / 10) + 1;
  ctx.textAlign = 'left';
  ctx.fillStyle = CONFIG.COLORS.yellow;
  ctx.shadowColor = CONFIG.COLORS.yellow;
  ctx.fillText(`SPD x${speedLevel}`, 20, 32);

  ctx.restore();
}

function drawMenu() {
  ctx.save();
  ctx.textAlign = 'center';

  // 1. Arcade Title "NEON FLAPPY"
  const titleY = 165;
  const pulse = Math.sin(gameTime * 3) * 2;

  // Background Title Shadow
  ctx.font = "900 46px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.shadowBlur = 25;
  ctx.shadowColor = CONFIG.COLORS.pink;
  ctx.fillStyle = CONFIG.COLORS.pink;
  ctx.fillText("NEON FLAPPY", CONFIG.WIDTH / 2 + pulse, titleY);

  // Foreground Title Inner
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = CONFIG.COLORS.cyan;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.shadowBlur = 15;
  ctx.strokeText("NEON FLAPPY", CONFIG.WIDTH / 2 + pulse, titleY);

  // 2. Subtitle "80s ARCADE EDITION"
  ctx.font = "800 15px 'Courier New', monospace";
  ctx.letterSpacing = '3px';
  ctx.fillStyle = CONFIG.COLORS.yellow;
  ctx.shadowBlur = 12;
  ctx.shadowColor = CONFIG.COLORS.yellow;
  ctx.fillText("★ 80s ARCADE EDITION ★", CONFIG.WIDTH / 2, titleY + 34);

  // 3. Best Score Badge
  ctx.font = "700 14px 'Courier New', monospace";
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.fillText(`RECORD: ${padScore(bestScore)}`, CONFIG.WIDTH / 2, titleY + 70);

  // 4. Instructions Prompt (Flashing Retro Neon)
  const promptAlpha = 0.5 + 0.5 * Math.sin(gameTime * 4.5);
  ctx.globalAlpha = promptAlpha;

  ctx.font = "900 18px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.fillStyle = CONFIG.COLORS.cyan;
  ctx.shadowBlur = 14;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.fillText("PRESS SPACE TO START", CONFIG.WIDTH / 2, 490);

  ctx.font = "700 13px 'Courier New', monospace";
  ctx.fillStyle = CONFIG.COLORS.pink;
  ctx.shadowColor = CONFIG.COLORS.pink;
  ctx.fillText("OR TAP SCREEN TO FLY", CONFIG.WIDTH / 2, 516);

  ctx.restore();
}

function drawGameOver() {
  ctx.save();
  ctx.textAlign = 'center';

  // 1. Dark Backdrop Overlay
  ctx.fillStyle = 'rgba(5, 0, 20, 0.72)';
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  // 2. "GAME OVER" Text
  const titleY = 175;
  ctx.font = "900 48px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.fillStyle = CONFIG.COLORS.crimson;
  ctx.shadowBlur = 28;
  ctx.shadowColor = CONFIG.COLORS.crimson;
  ctx.fillText("GAME OVER", CONFIG.WIDTH / 2, titleY);

  // 3. Score Card Box
  const cardX = 60;
  const cardY = 225;
  const cardW = CONFIG.WIDTH - 120;
  const cardH = 190;

  // Card Background
  ctx.fillStyle = 'rgba(18, 0, 43, 0.9)';
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Card Neon Border
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = CONFIG.COLORS.cyan;
  ctx.shadowBlur = 18;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  // Card Corner Accents
  ctx.fillStyle = CONFIG.COLORS.pink;
  ctx.fillRect(cardX - 4, cardY - 4, 8, 8);
  ctx.fillRect(cardX + cardW - 4, cardY - 4, 8, 8);
  ctx.fillRect(cardX - 4, cardY + cardH - 4, 8, 8);
  ctx.fillRect(cardX + cardW - 4, cardY + cardH - 4, 8, 8);

  // New Record Banner
  if (isNewBestScore) {
    ctx.font = "800 13px 'Courier New', monospace";
    ctx.fillStyle = CONFIG.COLORS.yellow;
    ctx.shadowBlur = 12;
    ctx.shadowColor = CONFIG.COLORS.yellow;
    ctx.fillText("★ NEW RECORD HIGH SCORE ★", CONFIG.WIDTH / 2, cardY + 32);
  } else {
    ctx.font = "700 13px 'Courier New', monospace";
    ctx.fillStyle = '#ff99e6';
    ctx.fillText("NEON RETRO STATS", CONFIG.WIDTH / 2, cardY + 32);
  }

  // Score
  ctx.font = "700 15px 'Courier New', monospace";
  ctx.fillStyle = '#a8b2d1';
  ctx.fillText("SCORE", CONFIG.WIDTH / 2, cardY + 68);

  ctx.font = "900 32px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.fillStyle = CONFIG.COLORS.cyan;
  ctx.shadowBlur = 15;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.fillText(padScore(score), CONFIG.WIDTH / 2, cardY + 104);

  // Best Score
  ctx.font = "700 14px 'Courier New', monospace";
  ctx.fillStyle = '#a8b2d1';
  ctx.fillText("BEST", CONFIG.WIDTH / 2, cardY + 138);

  ctx.font = "800 24px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.fillStyle = CONFIG.COLORS.pink;
  ctx.shadowBlur = 12;
  ctx.shadowColor = CONFIG.COLORS.pink;
  ctx.fillText(padScore(bestScore), CONFIG.WIDTH / 2, cardY + 168);

  // 4. "PLAY AGAIN" Button
  const btnY = 460;
  const btnW = 220;
  const btnH = 50;
  const btnX = (CONFIG.WIDTH - btnW) / 2;

  // Button Glow & Background
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
  btnGrad.addColorStop(0, '#ff00aa');
  btnGrad.addColorStop(1, '#7a00ff');
  ctx.fillStyle = btnGrad;
  ctx.fillRect(btnX, btnY, btnW, btnH);

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = CONFIG.COLORS.yellow;
  ctx.shadowBlur = 16;
  ctx.shadowColor = CONFIG.COLORS.yellow;
  ctx.strokeRect(btnX, btnY, btnW, btnH);

  // Button Label
  ctx.font = "900 18px 'Trebuchet MS', 'Arial Black', sans-serif";
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ffffff';
  ctx.fillText("PLAY AGAIN", CONFIG.WIDTH / 2, btnY + 32);

  // Subtext prompt
  const restartAlpha = 0.5 + 0.5 * Math.sin(gameTime * 5);
  ctx.globalAlpha = restartAlpha;
  ctx.font = "700 13px 'Courier New', monospace";
  ctx.fillStyle = CONFIG.COLORS.cyan;
  ctx.shadowColor = CONFIG.COLORS.cyan;
  ctx.fillText("SPACE, ENTER OR TOUCH TO RESTART", CONFIG.WIDTH / 2, btnY + 80);

  ctx.restore();
}

// ============================================================================
// UPDATE LOGIC (Delta-Time based physics)
// ============================================================================
function update(dt) {
  // Cap delta time to prevent tunneling after tab inactivity
  if (dt > 0.1) dt = 0.1;

  gameTime += dt;

  if (gameOverCooldown > 0) {
    gameOverCooldown -= dt;
  }

  // Score pop animation decay
  if (scoreAnimScale > 1.0) {
    scoreAnimScale -= dt * 2.8;
    if (scoreAnimScale < 1.0) scoreAnimScale = 1.0;
  }

  // Screen Flash decay
  if (screenFlashAlpha > 0) {
    screenFlashAlpha -= dt * 2.5;
    if (screenFlashAlpha < 0) screenFlashAlpha = 0;
  }

  // Screen Shake decay
  if (shakeTime > 0) {
    shakeTime -= dt;
    const mag = (shakeTime / CONFIG.SCREEN_SHAKE_DURATION) * CONFIG.SCREEN_SHAKE_MAGNITUDE;
    shakeOffset.x = (Math.random() * 2 - 1) * mag;
    shakeOffset.y = (Math.random() * 2 - 1) * mag;
  } else {
    shakeOffset.x = 0;
    shakeOffset.y = 0;
  }

  // Update Player
  player.update(dt);

  // Update Obstacles during PLAYING state
  if (gameState === PLAYING) {
    updateObstacles(dt);
    checkCollisions();
  }

  // Update Particles
  updateParticles(dt);
}

// ============================================================================
// DRAW
// ============================================================================
function draw(dt) {
  ctx.save();

  // Apply Camera Screen Shake
  if (shakeTime > 0) {
    ctx.translate(shakeOffset.x, shakeOffset.y);
  }

  // 1. Draw Synthwave Environment (Sky, Stars, Sun, Mountains, Grid)
  drawBackground(dt);

  // 2. Draw Obstacles (Tech Portals)
  drawObstacles();

  // 3. Draw Player Bird
  player.draw();

  // 4. Draw Particles (Trails, Bursts, Ambient)
  drawParticles();

  // 5. Draw Screen Flash on point/death
  if (screenFlashAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = screenFlashAlpha;
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    ctx.restore();
  }

  // 6. Draw State HUD / Overlays
  if (gameState === PLAYING) {
    drawHUD();
  } else if (gameState === MENU) {
    drawMenu();
  } else if (gameState === GAME_OVER) {
    drawGameOver();
  }

  ctx.restore();
}

// ============================================================================
// GAME LOOP
// ============================================================================
function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  // Cap dt to standard frame duration if tab was backgrounded or during cold start
  if (dt > 0.1 || dt <= 0) {
    dt = 0.016;
  }

  update(dt);
  draw(dt);

  requestAnimationFrame(gameLoop);
}

// ============================================================================
// INITIALIZATION
// ============================================================================
function init() {
  loadBestScore();
  setupCanvasDpi();
  initAmbientParticles();
  requestAnimationFrame(gameLoop);
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  init();
});
