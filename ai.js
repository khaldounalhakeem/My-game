class AIController {
    constructor(car, ball, targetGoal, fieldX, fieldY, fieldWidth, fieldHeight) {
        this.car = car;
        this.ball = ball;
        this.targetGoal = targetGoal;
        this.fieldX = fieldX;
        this.fieldY = fieldY;
        this.fieldWidth = fieldWidth;
        this.fieldHeight = fieldHeight;

        this.state = 'idle'; // idle, chasing, shooting, defending
        this.stateTimer = 0;
        this.decisionInterval = 30; // frames between decisions
    }

    update(allCars) {
        this.stateTimer++;

        if (this.stateTimer > this.decisionInterval) {
            this.makeDecision(allCars);
            this.stateTimer = 0;
        }

        this.executeState();
    }

    makeDecision(allCars) {
        const ballDist = Vector2.distance(this.car.pos, this.ball.pos);
        const ballToGoal = Vector2.distance(this.ball.pos, new Vector2(this.targetGoal.x + this.targetGoal.width / 2, this.targetGoal.y + this.targetGoal.height / 2));

        // Decide behavior based on ball position and distance
        if (ballDist < 150) {
            // Ball is close, go after it
            this.state = 'chasing';
        } else if (ballToGoal < 300) {
            // Ball near target goal, move to intercept
            this.state = 'shooting';
        } else {
            // Idle or defend
            this.state = 'idle';
        }
    }

    executeState() {
        this.car.input.boost = false;

        switch (this.state) {
            case 'chasing':
                this.chaseBall();
                break;
            case 'shooting':
                this.shootAtGoal();
                break;
            case 'idle':
                this.patrol();
                break;
        }
    }

    chaseBall() {
        const directionToBall = this.ball.pos.copy().subtract(this.car.pos);
        const distanceToBall = directionToBall.length();

        if (distanceToBall < 1) return;

        directionToBall.normalize();

        // Calculate desired angle
        const desiredAngle = Math.atan2(directionToBall.y, directionToBall.x);
        this.steerToAngle(desiredAngle);

        this.car.input.forward = true;

        // Boost if far away
        if (distanceToBall > 200) {
            this.car.input.boost = Math.random() > 0.7;
        }

        // Jump if ball is in air
        if (this.ball.pos.y < this.fieldY + 150) {
            this.car.input.jump = true;
        }
    }

    shootAtGoal() {
        const directionToGoal = new Vector2(
            this.targetGoal.x + this.targetGoal.width / 2 - this.car.pos.x,
            this.targetGoal.y + this.targetGoal.height / 2 - this.car.pos.y
        );

        const distanceToGoal = directionToGoal.length();

        if (distanceToGoal < 1) return;

        directionToGoal.normalize();

        const desiredAngle = Math.atan2(directionToGoal.y, directionToGoal.x);
        this.steerToAngle(desiredAngle);

        this.car.input.forward = true;

        // Boost to goal if distance is reasonable
        if (distanceToGoal > 100 && distanceToGoal < 400) {
            this.car.input.boost = true;
        }
    }

    patrol() {
        // Patrol in the middle of the field
        const patrolX = this.fieldX + this.fieldWidth - 300;
        const patrolY = this.fieldY + this.fieldHeight / 2;

        const directionToPatrol = new Vector2(
            patrolX - this.car.pos.x,
            patrolY - this.car.pos.y
        );

        const distanceToPatrol = directionToPatrol.length();

        if (distanceToPatrol > 20) {
            directionToPatrol.normalize();
            const desiredAngle = Math.atan2(directionToPatrol.y, directionToPatrol.x);
            this.steerToAngle(desiredAngle);

            if (distanceToPatrol > 50) {
                this.car.input.forward = true;
            }
        } else {
            this.car.input.forward = false;
        }
    }

    steerToAngle(targetAngle) {
        let diff = targetAngle - this.car.angle;

        // Normalize angle difference
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) > 0.1) {
            if (diff > 0) {
                this.car.input.right = true;
                this.car.input.left = false;
            } else {
                this.car.input.left = true;
                this.car.input.right = false;
            }
        } else {
            this.car.input.left = false;
            this.car.input.right = false;
        }
    }
}
