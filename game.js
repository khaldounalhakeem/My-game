class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 1600;
        this.canvas.height = 900;

        // Game state
        this.gameState = 'menu'; // menu, playing, paused, gameOver, training
        this.gameTime = 300; // 5 minutes
        this.timeRemaining = this.gameTime;

        // Arena
        this.arenaX = 50;
        this.arenaY = 50;
        this.arenaWidth = 1500;
        this.arenaHeight = 800;

        this.fieldWidth = 1300;
        this.fieldHeight = 750;
        this.fieldX = this.arenaX + 100;
        this.fieldY = this.arenaY + 25;

        // Goals
        this.blueGoal = new Goal(this.fieldX - 50, this.fieldY + 200, 50, 350);
        this.orangeGoal = new Goal(this.fieldX + this.fieldWidth, this.fieldY + 200, 50, 350);

        // Game objects
        this.ball = new Ball(this.fieldX + this.fieldWidth / 2, this.fieldY + this.fieldHeight / 2);

        // Teams
        this.blueCars = [];
        this.orangeCars = [];
        this.allCars = [];

        // Scores
        this.blueScore = 0;
        this.orangeScore = 0;

        // Keyboard input
        this.keys = {};
        this.setupInput();

        // Physics iterations per frame
        this.physicsIterations = 4;
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;

            if (e.key === 'p' || e.key === 'P') {
                if (this.gameState === 'playing') {
                    this.pause();
                } else if (this.gameState === 'paused') {
                    this.resume();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    startGame() {
        this.blueCars = [];
        this.orangeCars = [];
        this.allCars = [];

        // Create player car (blue)
        const blueCar = new Car(this.fieldX + 200, this.fieldY + this.fieldHeight / 2, 'blue');
        this.blueCars.push(blueCar);
        this.allCars.push(blueCar);

        // Create AI opponents
        const orangeCar1 = new Car(this.fieldX + this.fieldWidth - 200, this.fieldY + this.fieldHeight / 2 - 100, 'orange');
        const orangeCar2 = new Car(this.fieldX + this.fieldWidth - 200, this.fieldY + this.fieldHeight / 2 + 100, 'orange');
        orangeCar1.ai = new AIController(orangeCar1, this.ball, this.blueGoal, this.fieldX, this.fieldY, this.fieldWidth, this.fieldHeight);
        orangeCar2.ai = new AIController(orangeCar2, this.ball, this.blueGoal, this.fieldX, this.fieldY, this.fieldWidth, this.fieldHeight);

        this.orangeCars.push(orangeCar1, orangeCar2);
        this.allCars.push(orangeCar1, orangeCar2);

        // Reset game
        this.blueScore = 0;
        this.orangeScore = 0;
        this.timeRemaining = this.gameTime;
        this.gameState = 'playing';
        this.lastFrameTime = Date.now();

        document.getElementById('menu').classList.add('hidden');
        document.getElementById('pauseMenu').classList.remove('visible');
        document.getElementById('gameOver').classList.remove('visible');

        this.gameLoop();
    }

    startTraining() {
        this.blueCars = [];
        this.orangeCars = [];
        this.allCars = [];

        // Create player car
        const blueCar = new Car(this.fieldX + this.fieldWidth / 2, this.fieldY + this.fieldHeight / 2, 'blue');
        this.blueCars.push(blueCar);
        this.allCars.push(blueCar);

        this.blueScore = 0;
        this.orangeScore = 0;
        this.timeRemaining = 9999;
        this.gameState = 'playing';
        this.lastFrameTime = Date.now();

        document.getElementById('menu').classList.add('hidden');
        document.getElementById('pauseMenu').classList.remove('visible');
        document.getElementById('gameOver').classList.remove('visible');

        this.gameLoop();
    }

    updateInput() {
        const playerCar = this.blueCars[0];
        if (!playerCar) return;

        playerCar.input.forward = this.keys['w'] || this.keys['arrowup'];
        playerCar.input.backward = this.keys['s'] || this.keys['arrowdown'];
        playerCar.input.left = this.keys['a'] || this.keys['arrowleft'];
        playerCar.input.right = this.keys['d'] || this.keys['arrowright'];
        playerCar.input.jump = this.keys[' '];
        playerCar.input.boost = this.keys['shift'];

        if (playerCar.input.boost) {
            playerCar.isBoosting = true;
        } else {
            playerCar.isBoosting = false;
        }
    }

    update() {
        if (this.gameState !== 'playing') return;

        this.updateInput();

        // Update AI
        for (let car of this.orangeCars) {
            if (car.ai) {
                car.ai.update(this.allCars);
            }
        }

        // Physics updates
        for (let i = 0; i < this.physicsIterations; i++) {
            // Update cars
            for (let car of this.allCars) {
                car.update();
                car.collideWithWall(this.fieldX, this.fieldY, this.fieldWidth, this.fieldHeight);
            }

            // Car to car collisions
            for (let i = 0; i < this.allCars.length; i++) {
                for (let j = i + 1; j < this.allCars.length; j++) {
                    this.allCars[i].collideWithCar(this.allCars[j]);
                }
            }

            // Ball physics
            this.ball.update();
            this.ball.collideWithWall(this.fieldX, this.fieldY, this.fieldWidth, this.fieldHeight);

            // Ball to car collisions
            for (let car of this.allCars) {
                this.ball.collideWithCar(car);
            }
        }

        // Check for goals
        if (this.orangeGoal.contains(this.ball.pos, this.ball.radius)) {
            this.blueScore++;
            this.resetField();
        }

        if (this.blueGoal.contains(this.ball.pos, this.ball.radius)) {
            this.orangeScore++;
            this.resetField();
        }

        // Update timer
        this.timeRemaining -= 1/60;
        if (this.timeRemaining <= 0) {
            this.endGame();
        }

        this.updateUI();
    }

    resetField() {
        this.ball.reset(this.fieldX + this.fieldWidth / 2, this.fieldY + this.fieldHeight / 2);

        for (let car of this.blueCars) {
            car.reset(this.fieldX + 200, this.fieldY + this.fieldHeight / 2);
        }

        for (let car of this.orangeCars) {
            car.reset(this.fieldX + this.fieldWidth - 200, this.fieldY + this.fieldHeight / 2);
        }
    }

    updateUI() {
        document.getElementById('blueScore').textContent = Math.floor(this.blueScore);
        document.getElementById('orangeScore').textContent = Math.floor(this.orangeScore);

        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = Math.floor(this.timeRemaining % 60);
        document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Stats display
        if (this.blueCars.length > 0) {
            const car = this.blueCars[0];
            const speed = Math.floor(car.vel.length() * 2);
            const boost = Math.floor(car.boost);
            document.getElementById('stats').innerHTML =
                `Speed: ${speed} mph<br>Boost: ${boost}%<br>Pos: (${Math.floor(car.pos.x)}, ${Math.floor(car.pos.y)})`;
        }
    }

    endGame() {
        this.gameState = 'gameOver';
        const gameOverDiv = document.getElementById('gameOver');
        const winner = this.blueScore > this.orangeScore ? 'BLUE TEAM WINS!' :
                      this.orangeScore > this.blueScore ? 'ORANGE TEAM WINS!' : 'TIE!';
        document.getElementById('winnerText').textContent = winner;
        document.getElementById('scoreText').textContent =
            `Blue: ${Math.floor(this.blueScore)} - Orange: ${Math.floor(this.orangeScore)}`;
        gameOverDiv.classList.add('visible');
    }

    pause() {
        this.gameState = 'paused';
        document.getElementById('pauseMenu').classList.add('visible');
    }

    resume() {
        this.gameState = 'playing';
        document.getElementById('pauseMenu').classList.remove('visible');
        this.gameLoop();
    }

    goToMenu() {
        this.gameState = 'menu';
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('pauseMenu').classList.remove('visible');
        document.getElementById('gameOver').classList.remove('visible');
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = 'rgba(135, 206, 235, 1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw arena
        this.drawArena();

        // Draw ball
        this.drawBall();

        // Draw cars
        for (let car of this.allCars) {
            this.drawCar(car);
        }

        // Draw goals
        this.drawGoals();

        // Draw center line
        this.drawCenterLine();
    }

    drawArena() {
        // Arena border
        this.ctx.strokeStyle = '#00a8ff';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(this.arenaX, this.arenaY, this.arenaWidth, this.arenaHeight);

        // Field background
        this.ctx.fillStyle = 'rgba(144, 238, 144, 0.3)';
        this.ctx.fillRect(this.fieldX, this.fieldY, this.fieldWidth, this.fieldHeight);

        // Field border
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.fieldX, this.fieldY, this.fieldWidth, this.fieldHeight);
    }

    drawBall() {
        this.ctx.fillStyle = '#FF6B00';
        this.ctx.beginPath();
        this.ctx.arc(this.ball.pos.x, this.ball.pos.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Ball shine
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.beginPath();
        this.ctx.arc(this.ball.pos.x - 2, this.ball.pos.y - 2, 2, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawCar(car) {
        this.ctx.save();
        this.ctx.translate(car.pos.x, car.pos.y);
        this.ctx.rotate(car.angle);

        // Car body
        this.ctx.fillStyle = car.team === 'blue' ? '#0066ff' : '#ff6600';
        this.ctx.fillRect(-8, -6, 16, 12);

        // Car direction indicator
        this.ctx.fillStyle = car.team === 'blue' ? '#0099ff' : '#ffaa33';
        this.ctx.fillRect(-2, -6, 4, 3);

        // Boost indicator
        if (car.isBoosting && car.boost > 0) {
            this.ctx.fillStyle = 'rgba(255, 150, 0, 0.8)';
            this.ctx.fillRect(-6, 6, 12, 2);
        }

        this.ctx.restore();

        // Boost bar
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(car.pos.x - 10, car.pos.y - 20, 20, 3);
        this.ctx.fillStyle = '#00ff00';
        this.ctx.fillRect(car.pos.x - 10, car.pos.y - 20, (car.boost / car.maxBoost) * 20, 3);
    }

    drawGoals() {
        // Blue goal
        this.ctx.fillStyle = 'rgba(0, 100, 255, 0.4)';
        this.ctx.fillRect(this.blueGoal.x, this.blueGoal.y, this.blueGoal.width, this.blueGoal.height);
        this.ctx.strokeStyle = '#0066ff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.blueGoal.x, this.blueGoal.y, this.blueGoal.width, this.blueGoal.height);

        // Orange goal
        this.ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
        this.ctx.fillRect(this.orangeGoal.x, this.orangeGoal.y, this.orangeGoal.width, this.orangeGoal.height);
        this.ctx.strokeStyle = '#ff6600';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.orangeGoal.x, this.orangeGoal.y, this.orangeGoal.width, this.orangeGoal.height);
    }

    drawCenterLine() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.fieldX + this.fieldWidth / 2, this.fieldY);
        this.ctx.lineTo(this.fieldX + this.fieldWidth / 2, this.fieldY + this.fieldHeight);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    gameLoop = () => {
        this.update();
        this.draw();

        if (this.gameState === 'playing') {
            requestAnimationFrame(this.gameLoop);
        }
    }
}

// Initialize game
const game = new Game();
