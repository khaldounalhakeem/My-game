class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    subtract(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    multiply(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }

    divide(scalar) {
        this.x /= scalar;
        this.y /= scalar;
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const len = this.length();
        if (len > 0) {
            this.divide(len);
        }
        return this;
    }

    copy() {
        return new Vector2(this.x, this.y);
    }

    static distance(v1, v2) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

class Ball {
    constructor(x, y) {
        this.pos = new Vector2(x, y);
        this.vel = new Vector2(0, 0);
        this.acc = new Vector2(0, 0);
        this.radius = 5;
        this.mass = 5;
        this.restitution = 0.95;
        this.friction = 0.98;
        this.gravity = 0.5;
        this.maxVel = 25;
    }

    applyForce(force) {
        const acc = force.copy().divide(this.mass);
        this.acc.add(acc);
    }

    update() {
        // Apply gravity
        this.acc.y += this.gravity;

        // Apply friction to velocity
        this.vel.multiply(this.friction);

        // Add acceleration to velocity
        this.vel.add(this.acc);

        // Limit maximum velocity
        if (this.vel.length() > this.maxVel) {
            this.vel.normalize().multiply(this.maxVel);
        }

        // Add velocity to position
        this.pos.add(this.vel);

        // Reset acceleration
        this.acc = new Vector2(0, 0);
    }

    collideWithWall(x, y, width, height) {
        // Top and bottom walls
        if (this.pos.y - this.radius < y) {
            this.pos.y = y + this.radius;
            this.vel.y *= -this.restitution;
        } else if (this.pos.y + this.radius > y + height) {
            this.pos.y = y + height - this.radius;
            this.vel.y *= -this.restitution;
        }

        // Left and right walls
        if (this.pos.x - this.radius < x) {
            this.pos.x = x + this.radius;
            this.vel.x *= -this.restitution;
        } else if (this.pos.x + this.radius > x + width) {
            this.pos.x = x + width - this.radius;
            this.vel.x *= -this.restitution;
        }
    }

    collideWithCar(car) {
        const distance = Vector2.distance(this.pos, car.pos);
        const minDistance = this.radius + car.radius;

        if (distance < minDistance) {
            // Collision detected
            const collisionNormal = this.pos.copy().subtract(car.pos).normalize();
            const separationDistance = minDistance - distance;

            // Separate ball from car
            this.pos.add(collisionNormal.copy().multiply(separationDistance));

            // Calculate relative velocity
            const relativeVel = this.vel.copy().subtract(car.vel);
            const velAlongNormal = relativeVel.dot(collisionNormal);

            // Do not resolve if velocities are separating
            if (velAlongNormal < 0) {
                const restitution = 0.8;
                const rMass = 1 / this.mass + 1 / car.mass;
                const impulse = -(1 + restitution) * velAlongNormal / rMass;

                const impulseVec = collisionNormal.copy().multiply(impulse);
                this.vel.add(impulseVec.copy().divide(this.mass));
                car.vel.subtract(impulseVec.copy().divide(car.mass));
            }

            return true;
        }
        return false;
    }

    reset(x, y) {
        this.pos = new Vector2(x, y);
        this.vel = new Vector2(0, 0);
        this.acc = new Vector2(0, 0);
    }
}

class Car {
    constructor(x, y, team) {
        this.pos = new Vector2(x, y);
        this.vel = new Vector2(0, 0);
        this.acc = new Vector2(0, 0);
        this.angle = 0;
        this.radius = 10;
        this.mass = 20;
        this.team = team;

        // Movement
        this.maxSpeed = 15;
        this.maxBoostSpeed = 20;
        this.acceleration = 0.5;
        this.rotationSpeed = 0.1;

        // Boost
        this.boost = 100;
        this.maxBoost = 100;
        this.boostRechargeRate = 0.3;
        this.isBoosting = false;

        // Jump
        this.isGrounded = true;
        this.jumpPower = 12;
        this.canJump = true;
        this.jumpCooldown = 0;

        // Input
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            boost: false
        };
    }

    update() {
        // Gravity
        if (!this.isGrounded) {
            this.acc.y += 0.5;
        }

        // Rotation based on input
        if (this.input.left) {
            this.angle -= this.rotationSpeed;
        }
        if (this.input.right) {
            this.angle += this.rotationSpeed;
        }

        // Movement based on input
        const targetSpeed = this.isBoosting && this.boost > 0 ? this.maxBoostSpeed : this.maxSpeed;
        const moveX = Math.cos(this.angle) * this.acceleration;
        const moveY = Math.sin(this.angle) * this.acceleration;

        if (this.input.forward) {
            this.acc.x += moveX;
            this.acc.y += moveY;

            if (this.isBoosting && this.boost > 0) {
                this.acc.x *= 1.5;
                this.acc.y *= 1.5;
                this.boost -= 2;
            }
        }

        if (this.input.backward) {
            this.acc.x -= moveX * 0.6;
            this.acc.y -= moveY * 0.6;
        }

        // Jump
        if (this.input.jump && this.isGrounded && this.canJump) {
            this.vel.y = -this.jumpPower;
            this.isGrounded = false;
            this.canJump = false;
            this.jumpCooldown = 5;
        }

        if (this.jumpCooldown > 0) {
            this.jumpCooldown--;
        } else {
            this.canJump = true;
        }

        // Apply acceleration
        this.vel.add(this.acc);

        // Limit speed
        const currentSpeed = this.vel.length();
        if (currentSpeed > targetSpeed) {
            this.vel.normalize().multiply(targetSpeed);
        }

        // Apply friction
        this.vel.multiply(0.95);

        // Update position
        this.pos.add(this.vel);

        // Reset acceleration
        this.acc = new Vector2(0, 0);

        // Recharge boost
        if (!this.isBoosting) {
            this.boost = Math.min(this.boost + this.boostRechargeRate, this.maxBoost);
        }
    }

    collideWithWall(x, y, width, height) {
        // Top and bottom
        if (this.pos.y - this.radius < y) {
            this.pos.y = y + this.radius;
            this.vel.y = 0;
            this.isGrounded = true;
        } else if (this.pos.y + this.radius > y + height) {
            this.pos.y = y + height - this.radius;
            this.vel.y *= -0.3;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        // Left and right
        if (this.pos.x - this.radius < x) {
            this.pos.x = x + this.radius;
            this.vel.x *= -0.5;
        } else if (this.pos.x + this.radius > x + width) {
            this.pos.x = x + width - this.radius;
            this.vel.x *= -0.5;
        }
    }

    collideWithCar(other) {
        const distance = Vector2.distance(this.pos, other.pos);
        const minDistance = this.radius + other.radius;

        if (distance < minDistance) {
            const collisionNormal = this.pos.copy().subtract(other.pos).normalize();
            const separationDistance = minDistance - distance;

            // Separate cars
            const separation = collisionNormal.copy().multiply(separationDistance / 2);
            this.pos.add(separation);
            other.pos.subtract(separation);

            return true;
        }
        return false;
    }

    reset(x, y) {
        this.pos = new Vector2(x, y);
        this.vel = new Vector2(0, 0);
        this.acc = new Vector2(0, 0);
        this.angle = 0;
        this.boost = this.maxBoost;
        this.isGrounded = true;
    }
}

class Goal {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.scored = false;
    }

    contains(pos, radius) {
        return pos.x + radius > this.x &&
               pos.x - radius < this.x + this.width &&
               pos.y + radius > this.y &&
               pos.y - radius < this.y + this.height;
    }
}
