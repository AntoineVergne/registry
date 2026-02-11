// ============================================================
// SNAKE CLASH - Local multiplayer snake game
// ============================================================

const CELL = 20;
const COLS = 30;
const ROWS = 30;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const ROUNDS_TO_WIN = 3;
const INITIAL_SPEED = 120; // ms per tick
const SPEED_INCREMENT = 2; // ms faster per food eaten
const MIN_SPEED = 50;

// Directions
const DIR = {
    UP:    { x:  0, y: -1 },
    DOWN:  { x:  0, y:  1 },
    LEFT:  { x: -1, y:  0 },
    RIGHT: { x:  1, y:  0 },
};

// ---- DOM references ----
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH;
canvas.height = HEIGHT;

const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameMessage = document.getElementById('game-message');
const p1ScoreEl = document.getElementById('p1-score-value');
const p2ScoreEl = document.getElementById('p2-score-value');
const roundInfo = document.getElementById('round-info');
const finalResult = document.getElementById('final-result');
const finalScores = document.getElementById('final-scores');

// ---- Game state ----
let mode = null; // '1p', '2p', 'ai'
let gameLoop = null;
let speed = INITIAL_SPEED;
let paused = false;
let roundActive = false;

let snakes = [];
let foods = [];
let scores = [0, 0];
let roundScores = [0, 0];

// ============================================================
// Snake class
// ============================================================
class Snake {
    constructor(startX, startY, dir, color, glowColor, isAI = false) {
        this.body = [{ x: startX, y: startY }];
        // Add a few initial segments
        for (let i = 1; i < 3; i++) {
            this.body.push({ x: startX - dir.x * i, y: startY - dir.y * i });
        }
        this.dir = { ...dir };
        this.nextDir = { ...dir };
        this.color = color;
        this.glowColor = glowColor;
        this.alive = true;
        this.isAI = isAI;
        this.growCount = 0;
    }

    setDirection(newDir) {
        // Prevent 180-degree turns
        if (this.dir.x + newDir.x === 0 && this.dir.y + newDir.y === 0) return;
        this.nextDir = { ...newDir };
    }

    update() {
        if (!this.alive) return;
        this.dir = { ...this.nextDir };

        const head = this.body[0];
        const newHead = {
            x: head.x + this.dir.x,
            y: head.y + this.dir.y,
        };

        this.body.unshift(newHead);

        if (this.growCount > 0) {
            this.growCount--;
        } else {
            this.body.pop();
        }
    }

    grow(amount = 1) {
        this.growCount += amount;
    }

    headPos() {
        return this.body[0];
    }

    checkWallCollision() {
        const h = this.headPos();
        return h.x < 0 || h.x >= COLS || h.y < 0 || h.y >= ROWS;
    }

    checkSelfCollision() {
        const h = this.headPos();
        for (let i = 1; i < this.body.length; i++) {
            if (this.body[i].x === h.x && this.body[i].y === h.y) return true;
        }
        return false;
    }

    checkCollisionWith(other) {
        const h = this.headPos();
        for (const seg of other.body) {
            if (seg.x === h.x && seg.y === h.y) return true;
        }
        return false;
    }

    draw() {
        for (let i = 0; i < this.body.length; i++) {
            const seg = this.body[i];
            const isHead = i === 0;
            const alpha = this.alive ? 1 : 0.3;

            if (isHead) {
                // Head with glow
                ctx.shadowColor = this.glowColor;
                ctx.shadowBlur = 12;
                ctx.fillStyle = this.alive ? '#fff' : '#555';
                roundRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2, 4);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Eyes
                if (this.alive) {
                    this.drawEyes(seg);
                }
            } else {
                // Body segment
                const t = i / this.body.length;
                ctx.globalAlpha = alpha * (1 - t * 0.3);
                ctx.fillStyle = this.color;
                roundRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4, 3);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    drawEyes(head) {
        const cx = head.x * CELL + CELL / 2;
        const cy = head.y * CELL + CELL / 2;
        const eyeOffset = 4;
        const eyeSize = 2.5;

        let e1x, e1y, e2x, e2y;
        if (this.dir.x === 1) { e1x = cx + 4; e1y = cy - eyeOffset; e2x = cx + 4; e2y = cy + eyeOffset; }
        else if (this.dir.x === -1) { e1x = cx - 4; e1y = cy - eyeOffset; e2x = cx - 4; e2y = cy + eyeOffset; }
        else if (this.dir.y === -1) { e1x = cx - eyeOffset; e1y = cy - 4; e2x = cx + eyeOffset; e2y = cy - 4; }
        else { e1x = cx - eyeOffset; e1y = cy + 4; e2x = cx + eyeOffset; e2y = cy + 4; }

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(e1x, e1y, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e2x, e2y, eyeSize, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ============================================================
// Food
// ============================================================
class Food {
    constructor(x, y, type = 'normal') {
        this.x = x;
        this.y = y;
        this.type = type; // 'normal', 'super', 'speed'
        this.spawnTime = Date.now();
    }

    draw() {
        const cx = this.x * CELL + CELL / 2;
        const cy = this.y * CELL + CELL / 2;
        const pulse = Math.sin(Date.now() / 200) * 0.15 + 0.85;

        if (this.type === 'normal') {
            ctx.shadowColor = '#f43f5e';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath();
            ctx.arc(cx, cy, (CELL / 2 - 3) * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else if (this.type === 'super') {
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            // Star shape
            drawStar(cx, cy, 5, (CELL / 2 - 2) * pulse, (CELL / 4) * pulse);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else if (this.type === 'speed') {
            ctx.shadowColor = '#a78bfa';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#a78bfa';
            // Diamond shape
            ctx.beginPath();
            const s = (CELL / 2 - 3) * pulse;
            ctx.moveTo(cx, cy - s);
            ctx.lineTo(cx + s, cy);
            ctx.lineTo(cx, cy + s);
            ctx.lineTo(cx - s, cy);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    get value() {
        if (this.type === 'super') return 3;
        if (this.type === 'speed') return 1;
        return 1;
    }

    get growAmount() {
        if (this.type === 'super') return 3;
        return 1;
    }
}

// ============================================================
// AI logic
// ============================================================
function aiDecide(aiSnake, otherSnake) {
    const head = aiSnake.headPos();
    let bestDir = aiSnake.dir;
    let bestScore = -Infinity;

    const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

    for (const d of dirs) {
        // Skip reverse
        if (d.x + aiSnake.dir.x === 0 && d.y + aiSnake.dir.y === 0) continue;

        const nx = head.x + d.x;
        const ny = head.y + d.y;

        // Wall check
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;

        // Self collision check
        let blocked = false;
        for (const seg of aiSnake.body) {
            if (seg.x === nx && seg.y === ny) { blocked = true; break; }
        }
        if (blocked) continue;

        // Other snake collision
        if (otherSnake) {
            for (const seg of otherSnake.body) {
                if (seg.x === nx && seg.y === ny) { blocked = true; break; }
            }
        }
        if (blocked) continue;

        // Score this direction
        let score = 0;

        // Prefer moving toward nearest food
        let nearestDist = Infinity;
        for (const food of foods) {
            const dist = Math.abs(food.x - nx) + Math.abs(food.y - ny);
            if (dist < nearestDist) nearestDist = dist;
        }
        score -= nearestDist;

        // Prefer staying away from walls
        const wallDist = Math.min(nx, ny, COLS - 1 - nx, ROWS - 1 - ny);
        score += wallDist * 0.5;

        // Count open spaces (simple lookahead)
        let openSpaces = 0;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const cx = nx + dx;
                const cy = ny + dy;
                if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
                    let free = true;
                    for (const seg of aiSnake.body) {
                        if (seg.x === cx && seg.y === cy) { free = false; break; }
                    }
                    if (free) openSpaces++;
                }
            }
        }
        score += openSpaces * 0.3;

        // Add small randomness for unpredictability
        score += Math.random() * 2;

        if (score > bestScore) {
            bestScore = score;
            bestDir = d;
        }
    }

    aiSnake.setDirection(bestDir);
}

// ============================================================
// Utility drawing functions
// ============================================================
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawStar(cx, cy, spikes, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawGrid() {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= WIDTH; x += CELL) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += CELL) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
    }
}

// ============================================================
// Game functions
// ============================================================
function getRandomEmptyCell() {
    const occupied = new Set();
    for (const snake of snakes) {
        for (const seg of snake.body) {
            occupied.add(`${seg.x},${seg.y}`);
        }
    }
    for (const food of foods) {
        occupied.add(`${food.x},${food.y}`);
    }

    let attempts = 0;
    while (attempts < 1000) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (!occupied.has(`${x},${y}`)) return { x, y };
        attempts++;
    }
    return { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
}

function spawnFood() {
    const pos = getRandomEmptyCell();
    const rand = Math.random();
    let type = 'normal';
    if (rand > 0.92) type = 'super';
    else if (rand > 0.82) type = 'speed';
    foods.push(new Food(pos.x, pos.y, type));
}

function initRound() {
    speed = INITIAL_SPEED;
    foods = [];
    roundActive = true;

    // Player 1: green, starts left
    const p1 = new Snake(5, Math.floor(ROWS / 2), DIR.RIGHT, '#4ade80', 'rgba(74,222,128,0.6)');

    if (mode === '1p') {
        snakes = [p1];
    } else {
        const isAI = mode === 'ai';
        // Player 2 / AI: blue, starts right
        const p2 = new Snake(COLS - 6, Math.floor(ROWS / 2), DIR.LEFT, '#60a5fa', 'rgba(96,165,250,0.6)', isAI);
        snakes = [p1, p2];
    }

    // Spawn initial food
    for (let i = 0; i < 3; i++) spawnFood();

    updateScoreboard();
}

function updateScoreboard() {
    p1ScoreEl.textContent = scores[0];
    if (snakes.length > 1) {
        p2ScoreEl.textContent = scores[1];
        document.getElementById('p2-score').classList.remove('hidden');
    } else {
        document.getElementById('p2-score').classList.add('hidden');
    }
    if (mode !== '1p') {
        roundInfo.textContent = `First to ${ROUNDS_TO_WIN}`;
    } else {
        roundInfo.textContent = 'Score';
    }
}

function showMessage(text, duration = 1500) {
    gameMessage.textContent = text;
    gameMessage.classList.remove('hidden');
    if (duration > 0) {
        setTimeout(() => gameMessage.classList.add('hidden'), duration);
    }
}

function tick() {
    if (paused || !roundActive) return;

    // AI decision
    for (const snake of snakes) {
        if (snake.isAI && snake.alive) {
            aiDecide(snake, snakes.find(s => s !== snake));
        }
    }

    // Move snakes
    for (const snake of snakes) {
        snake.update();
    }

    // Check food collisions
    for (const snake of snakes) {
        if (!snake.alive) continue;
        const head = snake.headPos();
        for (let i = foods.length - 1; i >= 0; i--) {
            if (foods[i].x === head.x && foods[i].y === head.y) {
                const food = foods[i];
                snake.grow(food.growAmount);
                const idx = snakes.indexOf(snake);
                if (mode === '1p') {
                    scores[0] += food.value;
                } else {
                    scores[idx] += food.value;
                }
                foods.splice(i, 1);
                spawnFood();

                // Speed up slightly
                speed = Math.max(MIN_SPEED, speed - SPEED_INCREMENT);
                clearInterval(gameLoop);
                gameLoop = setInterval(tick, speed);

                updateScoreboard();
            }
        }
    }

    // Check collisions (death)
    for (let i = 0; i < snakes.length; i++) {
        const snake = snakes[i];
        if (!snake.alive) continue;

        if (snake.checkWallCollision() || snake.checkSelfCollision()) {
            snake.alive = false;
        }

        // Check collision with other snakes
        for (let j = 0; j < snakes.length; j++) {
            if (i === j) continue;
            if (snake.checkCollisionWith(snakes[j])) {
                snake.alive = false;
            }
        }
    }

    // Check head-on collision (both die)
    if (snakes.length === 2 && snakes[0].alive && snakes[1].alive) {
        const h0 = snakes[0].headPos();
        const h1 = snakes[1].headPos();
        if (h0.x === h1.x && h0.y === h1.y) {
            snakes[0].alive = false;
            snakes[1].alive = false;
        }
    }

    // Periodically spawn extra food
    if (foods.length < 2 || (foods.length < 5 && Math.random() < 0.02)) {
        spawnFood();
    }

    // Draw
    render();

    // Check round end
    checkRoundEnd();
}

function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawGrid();

    for (const food of foods) food.draw();
    for (const snake of snakes) snake.draw();
}

function checkRoundEnd() {
    if (mode === '1p') {
        if (!snakes[0].alive) {
            roundActive = false;
            showMessage('Game Over!', 0);
            setTimeout(showGameOver, 1500);
        }
        return;
    }

    const alive = snakes.filter(s => s.alive);

    if (alive.length <= 0) {
        // Both dead - draw
        roundActive = false;
        showMessage('Draw!', 1500);
        setTimeout(startRound, 2000);
    } else if (alive.length === 1 && snakes.length === 2) {
        const winnerIdx = snakes.indexOf(alive[0]);
        roundScores[winnerIdx]++;
        roundActive = false;

        if (roundScores[winnerIdx] >= ROUNDS_TO_WIN) {
            showMessage(`Player ${winnerIdx + 1} Wins!`, 0);
            setTimeout(showGameOver, 1500);
        } else {
            showMessage(`Player ${winnerIdx + 1} scores!`, 1500);
            setTimeout(startRound, 2000);
        }
    }
}

function startRound() {
    gameMessage.classList.add('hidden');
    initRound();

    clearInterval(gameLoop);

    // Countdown
    let count = 3;
    showMessage(count, 0);
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            showMessage(count, 0);
        } else {
            clearInterval(countdownInterval);
            showMessage('GO!', 800);
            gameLoop = setInterval(tick, speed);
        }
    }, 700);
}

function startGame(gameMode) {
    mode = gameMode;
    scores = [0, 0];
    roundScores = [0, 0];

    menuScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    startRound();
}

function showGameOver() {
    clearInterval(gameLoop);
    gameMessage.classList.add('hidden');
    gameScreen.classList.add('hidden');
    gameoverScreen.classList.remove('hidden');

    if (mode === '1p') {
        finalResult.textContent = `Final Score: ${scores[0]}`;
        finalResult.style.color = '#4ade80';
        finalScores.innerHTML = '';
    } else {
        if (roundScores[0] > roundScores[1]) {
            finalResult.textContent = 'Player 1 Wins!';
            finalResult.style.color = '#4ade80';
        } else if (roundScores[1] > roundScores[0]) {
            finalResult.textContent = mode === 'ai' ? 'AI Wins!' : 'Player 2 Wins!';
            finalResult.style.color = '#60a5fa';
        } else {
            finalResult.textContent = 'Draw!';
            finalResult.style.color = '#fbbf24';
        }
        finalScores.innerHTML = `
            <span class="p1">P1: ${scores[0]} pts (${roundScores[0]} rounds)</span>
            <span class="p2">${mode === 'ai' ? 'AI' : 'P2'}: ${scores[1]} pts (${roundScores[1]} rounds)</span>
        `;
    }
}

function showMenu() {
    clearInterval(gameLoop);
    gameScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
}

// ============================================================
// Input handling
// ============================================================
document.addEventListener('keydown', (e) => {
    if (!snakes.length) return;

    // Player 1 - WASD
    const p1 = snakes[0];
    if (p1 && p1.alive) {
        switch (e.key.toLowerCase()) {
            case 'w': p1.setDirection(DIR.UP); break;
            case 's': p1.setDirection(DIR.DOWN); break;
            case 'a': p1.setDirection(DIR.LEFT); break;
            case 'd': p1.setDirection(DIR.RIGHT); break;
        }
    }

    // Player 2 - Arrow keys (only if not AI)
    if (snakes.length > 1 && !snakes[1].isAI && snakes[1].alive) {
        const p2 = snakes[1];
        switch (e.key) {
            case 'ArrowUp': p2.setDirection(DIR.UP); e.preventDefault(); break;
            case 'ArrowDown': p2.setDirection(DIR.DOWN); e.preventDefault(); break;
            case 'ArrowLeft': p2.setDirection(DIR.LEFT); e.preventDefault(); break;
            case 'ArrowRight': p2.setDirection(DIR.RIGHT); e.preventDefault(); break;
        }
    }

    // Pause with Escape
    if (e.key === 'Escape' && roundActive) {
        paused = !paused;
        if (paused) showMessage('PAUSED', 0);
        else gameMessage.classList.add('hidden');
    }
});

// ============================================================
// Button handlers
// ============================================================
document.getElementById('btn-1player').addEventListener('click', () => startGame('1p'));
document.getElementById('btn-2player').addEventListener('click', () => startGame('2p'));
document.getElementById('btn-ai').addEventListener('click', () => startGame('ai'));
document.getElementById('btn-rematch').addEventListener('click', () => startGame(mode));
document.getElementById('btn-menu').addEventListener('click', showMenu);
