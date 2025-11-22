
import React, { useRef, useEffect, useCallback } from 'react';
import { 
  GameState, Player, Point, Obstacle, Decoration, Particle, PowerUp 
} from '../types';
import { 
  GRAVITY, JUMP_FORCE, ROTATION_SPEED, FRICTION, 
  BASE_SPEED, MAX_SPEED, BOOST_SPEED, FLIGHT_SPEED, TERRAIN_SEGMENT_WIDTH, SLOPE_DROP,
  CRAYON_PALETTE, GAME_WIDTH, GAME_HEIGHT 
} from '../constants';
import { audioService } from '../services/audioService';

interface GameCanvasProps {
  gameState: GameState;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number, speed: number, powerUp: string | null, avalancheDist: number) => void;
  fishInventory: number;
  onCollectFish: () => void;
  onDeliverFish: () => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  gameState, 
  onGameOver, 
  onScoreUpdate,
  fishInventory,
  onCollectFish,
  onDeliverFish
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const isHoldingRef = useRef<boolean>(false);

  // CRITICAL FIX: Use a ref to track inventory so the game loop always sees the latest value
  // without needing to restart the loop (stale closure fix).
  const fishInventoryRef = useRef(fishInventory);
  useEffect(() => {
    fishInventoryRef.current = fishInventory;
  }, [fishInventory]);

  // Refs for callbacks to ensure game loop always sees the latest functions
  const callbacksRef = useRef({ onGameOver, onScoreUpdate, onCollectFish, onDeliverFish });
  useEffect(() => {
    callbacksRef.current = { onGameOver, onScoreUpdate, onCollectFish, onDeliverFish };
  }, [onGameOver, onScoreUpdate, onCollectFish, onDeliverFish]);

  // Game State Refs
  const playerRef = useRef<Player>({
    x: 200, y: 0, vx: BASE_SPEED, vy: 0, rotation: 0,
    isGrounded: false, isDead: false, score: 0, boostTimer: 0,
    backflipCount: 0, totalBackflips: 0, invincibleTimer: 0, flightTimer: 0,
    fishInventory: 0
  });
  
  const terrainRef = useRef<Point[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const decorationsRef = useRef<Decoration[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const cameraRef = useRef({ x: 0, y: 0, shake: 0 });
  const avalancheXRef = useRef<number>(-500);
  const frameCountRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const patternRef = useRef<HTMLCanvasElement | null>(null);

  // Create Paper Texture Pattern
  const createPaperPattern = () => {
    if (patternRef.current) return;
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 128;
    pCanvas.height = 128;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      pCtx.fillStyle = CRAYON_PALETTE.PAPER;
      pCtx.fillRect(0,0,128,128);
      // Add noise
      for(let i=0; i<400; i++) {
        pCtx.fillStyle = Math.random() > 0.5 ? '#f1f5f9' : '#fff7ed';
        pCtx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
      }
    }
    patternRef.current = pCanvas;
  };

  // Initialization
  const initGame = useCallback(() => {
    createPaperPattern();
    playerRef.current = {
      x: 100, y: 200, vx: BASE_SPEED, vy: 0, rotation: 0,
      isGrounded: false, isDead: false, score: 0, boostTimer: 0,
      backflipCount: 0, totalBackflips: 0, invincibleTimer: 0, flightTimer: 0,
      fishInventory: 0
    };
    
    // Generate initial terrain (Downhill slope)
    terrainRef.current = [];
    let ty = 200;
    for (let i = 0; i < GAME_WIDTH * 2; i += TERRAIN_SEGMENT_WIDTH) {
      ty += SLOPE_DROP + (Math.random() - 0.5) * 10; 
      terrainRef.current.push({ x: i, y: ty });
    }

    obstaclesRef.current = [];
    decorationsRef.current = [];
    powerUpsRef.current = [];
    particlesRef.current = [];
    avalancheXRef.current = -800;
    cameraRef.current = { x: 0, y: 0, shake: 0 };
    startTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      initGame();
      audioService.init();
      audioService.startBGM();
      requestRef.current = requestAnimationFrame(gameLoop);
    } else {
      audioService.stopBGM();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      audioService.stopBGM();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);


  // Input Handling
  const handleInputStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to avoid double-firing or ghost clicks on touch devices
    if ('touches' in e) {
      // e.preventDefault(); 
    }

    const canvas = canvasRef.current;
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        let clientY = 0;
        if ('touches' in e) {
            clientY = e.touches[0].clientY;
        } else {
            clientY = (e as React.MouseEvent).clientY;
        }
        // DEAD ZONE: Only the bottom 120px (Grill UI area) is ignored.
        const clickY = clientY - rect.top;
        if (clickY > rect.height - 120) return;
    }

    if (gameState !== GameState.PLAYING) return;
    isHoldingRef.current = true;
    
    const p = playerRef.current;
    
    // Improved Jump Trigger Reliability
    if (p.isGrounded) {
      // Standard Jump
      p.vy = JUMP_FORCE;
      p.isGrounded = false;
      // Critical: Lift player IMMEDIATELY by a larger margin to ensure 
      // they don't get snapped back to ground by collision logic in the next frame.
      p.y -= 10; 
      audioService.playJump();
      createParticles(p.x, p.y + 20, 5, '#fff');
    } else if (p.flightTimer > 0) {
      // Flap wings in flight mode
      p.vy = JUMP_FORCE * 0.6;
    }
  };

  const handleInputEnd = () => {
    isHoldingRef.current = false;
  };

  // --- Core Logic ---

  const createParticles = (x: number, y: number, count: number, color: string) => {
    for(let i=0; i<count; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        maxLife: 1.0,
        size: Math.random() * 6 + 3,
        color
      });
    }
  };

  const updateTerrain = (playerX: number) => {
    const terrain = terrainRef.current;
    const lastPoint = terrain[terrain.length - 1];
    
    // Add new terrain ahead
    if (lastPoint.x < playerX + GAME_WIDTH * 2) { 
      const nextX = lastPoint.x + TERRAIN_SEGMENT_WIDTH;
      const noise = Math.sin(nextX * 0.01) * 15 + (Math.random() - 0.5) * 10;
      let nextY = lastPoint.y + SLOPE_DROP + noise;

      terrain.push({ x: nextX, y: nextY });

      // Spawning Logic
      
      // Decorations: Trees (Higher density generally)
      if (Math.random() < 0.10) {
          // Increased Cabin rate to 2x (was 0.05, now 0.10)
          if (Math.random() < 0.10) { // Cabins
             decorationsRef.current.push({
                 x: nextX + 20, y: nextY + 10,
                 type: 'cabin',
                 width: 80, height: 80,
                 delivered: false
             });
          } else {
             // Trees
             decorationsRef.current.push({
                 x: nextX + Math.random() * 20,
                 y: nextY + 10, 
                 type: Math.random() > 0.3 ? 'tree_tall' : 'tree_short',
                 width: 40, height: 100
             });
          }
      }

      // Gameplay Elements
      // Obstacles (Rocks): Reduced to 50% of previous (0.02 -> 0.01)
      if (Math.random() < 0.01) { 
        obstaclesRef.current.push({
            x: nextX,
            y: nextY, 
            type: 'rock_small',
            width: 40, 
            height: 30,
            passed: false
        });
      } 
      // PowerUps
      // Adjusted probablities:
      // Fish: ~0.84% (0.012 * 0.7) - Reduced to 70%
      // Sunglasses: ~0.36% (0.012 * 0.3)
      else if (Math.random() < 0.012) {
         // We want Sunglasses to be rare (~30% of drops now)
         const type = Math.random() > 0.3 ? 'fish' : 'sunglasses';
         
         powerUpsRef.current.push({
             x: nextX, y: nextY - 60,
             type: type,
             collected: false
         });
      }
    }

    // Cleanup
    const cleanupX = playerX - GAME_WIDTH;
    if (terrain[0].x < cleanupX) terrain.shift();
    if (obstaclesRef.current.length > 0 && obstaclesRef.current[0].x < cleanupX) obstaclesRef.current.shift();
    if (decorationsRef.current.length > 0 && decorationsRef.current[0].x < cleanupX) decorationsRef.current.shift();
    if (powerUpsRef.current.length > 0 && powerUpsRef.current[0].x < cleanupX) powerUpsRef.current.shift();
  };

  const getGroundY = (x: number): { y: number, angle: number } => {
    const t = terrainRef.current;
    for (let i = 0; i < t.length - 1; i++) {
      if (x >= t[i].x && x < t[i+1].x) {
        const p1 = t[i];
        const p2 = t[i+1];
        const ratio = (x - p1.x) / (p2.x - p1.x);
        const y = p1.y + (p2.y - p1.y) * ratio;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        return { y, angle };
      }
    }
    return { y: 100000, angle: 0 }; 
  };

  const updatePhysics = () => {
    const p = playerRef.current;
    p.fishInventory = fishInventoryRef.current; // Sync from Ref, not Prop!

    // Timers
    if (p.invincibleTimer > 0) p.invincibleTimer--;
    if (p.flightTimer > 0) p.flightTimer--;
    if (p.boostTimer > 0) p.boostTimer--;

    // Speed Logic
    let targetSpeed = BASE_SPEED;
    if (p.invincibleTimer > 0) targetSpeed = MAX_SPEED * 1.2;
    else if (p.flightTimer > 0) targetSpeed = FLIGHT_SPEED;
    else if (p.boostTimer > 0) targetSpeed = BOOST_SPEED; 
    else targetSpeed = MAX_SPEED;

    // Gravity Assist
    if (p.vx < targetSpeed) {
        p.vx += 0.1; 
    } else {
        p.vx *= FRICTION;
    }

    p.x += p.vx;
    p.y += p.vy;

    // --- Asymmetric Gravity ---
    if (p.flightTimer <= 0) {
        if (p.vy < 0) {
            // Rising: 0.6
            p.vy += GRAVITY;
        } else {
            // Falling: 0.3
            p.vy += 0.3; 
        }
    } else {
        p.vy += GRAVITY * 0.3;
        if (p.vy > 2) p.vy = 2;
    }


    // Floor collision
    const { y: groundY, angle: groundAngle } = getGroundY(p.x);
    const collisionThreshold = p.flightTimer > 0 ? groundY - 150 : groundY - 15;

    if (p.y >= collisionThreshold && p.vy >= 0) {
      
      if (p.flightTimer > 0) {
          p.y = collisionThreshold;
          p.vy = 0;
          return; 
      }

      if (!p.isGrounded) {
        // Landing Logic
        let normRot = p.rotation % (Math.PI * 2);
        if (normRot > Math.PI) normRot -= Math.PI * 2;
        if (normRot < -Math.PI) normRot += Math.PI * 2;
        
        const angleDiff = Math.abs(normRot - groundAngle);
        
        // Thresholds in Radians
        const PERFECT_THRESHOLD = 30 * (Math.PI / 180);  // 30 Degrees (Increased from 25)
        const CRASH_THRESHOLD = 70 * (Math.PI / 180);    // 70 Degrees

        if (angleDiff > CRASH_THRESHOLD && p.invincibleTimer <= 0) {
           // CRASH
           p.vx = 2; 
           audioService.playCrash();
           cameraRef.current.shake = 25;
           createParticles(p.x, p.y, 15, CRAYON_PALETTE.PENGUIN_BODY);
           p.rotation = groundAngle; 
        } else {
           // SAFE or PERFECT
           if (p.backflipCount > 0) {
               if (angleDiff < PERFECT_THRESHOLD) {
                   const bonusFrames = 60 + (p.backflipCount * 30);
                   p.boostTimer = bonusFrames;
                   audioService.playCheer(); 
                   createParticles(p.x, p.y, 20, '#fbbf24'); 
                   const points = p.backflipCount * 300;
                   p.score += points;
               } else {
                   const points = p.backflipCount * 150;
                   p.score += points;
               }
           }
        }
      }

      p.y = collisionThreshold; 
      p.vy = 0;
      p.isGrounded = true;
      p.backflipCount = 0;
      p.rotation = groundAngle; 
      
    } else {
      p.isGrounded = false;
      
      if (isHoldingRef.current && p.flightTimer <= 0) {
        const heightFromGround = groundY - p.y;
        if (heightFromGround > 50) { 
            p.rotation -= ROTATION_SPEED;
            const totalRot = Math.abs(p.rotation);
            const rotations = Math.floor((totalRot + Math.PI/2) / (Math.PI * 2));
            if (rotations > p.backflipCount) {
                p.backflipCount = rotations;
            }
        }
      }
    }

    // Obstacle Collision
    if (p.invincibleTimer <= 0 && p.flightTimer <= 0) {
        obstaclesRef.current.forEach(obs => {
          if (obs.passed) return;
          const obsHeight = obs.height;
          const obsY = getGroundY(obs.x).y;
          
          // Tightened hitbox: Reduced width to +/- 7px (was 13)
          if (p.x > obs.x - 7 && p.x < obs.x + 7) {
             if (p.y > obsY - obsHeight) {
                 p.vx = 2; 
                 obs.passed = true;
                 audioService.playCrash();
                 cameraRef.current.shake = 20;
                 createParticles(p.x, p.y, 10, CRAYON_PALETTE.OBSTACLE_ROCK);
             }
          }
        });
    }

    // Decoration Interaction (Cabins)
    decorationsRef.current.forEach(dec => {
       if (dec.type === 'cabin' && !dec.delivered) {
           // Wide detection for delivery + Vertical check
           if (p.x > dec.x - 100 && p.x < dec.x + 100) {
               // Vertical check: Player must be reasonably close to ground level (within 100px height)
               if (Math.abs(p.y - dec.y) < 100) {
                   if (p.fishInventory > 0) {
                       dec.delivered = true;
                       callbacksRef.current.onDeliverFish(); 
                       audioService.playApplause(); 
                       
                       // Reward: Flight
                       p.flightTimer = 80; // Reduced from 133
                       p.score += 500;
                       createParticles(dec.x, dec.y - 40, 15, '#ef4444'); 
                   }
               }
           }
       }
    });

    // PowerUp Collision
    powerUpsRef.current.forEach(pu => {
        if (pu.collected) return;
        const dist = Math.hypot(p.x - pu.x, p.y - pu.y);
        if (dist < 50) {
            pu.collected = true;
            if (pu.type === 'fish') {
                callbacksRef.current.onCollectFish(); 
                audioService.playPowerUp('fish');
                createParticles(p.x, p.y, 10, '#3b82f6'); 
            } else {
                // Reward: Invincibility
                p.invincibleTimer = 180; 
                p.vy = -10; // Small hop
                audioService.playPowerUp('sunglasses');
                createParticles(p.x, p.y, 20, CRAYON_PALETTE.SUNGLASSES);
            }
        }
    });

    // Avalanche Logic
    const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
    
    // Acceleration Logic (5 Stages):
    // Base: 9
    // 0-30s: rate 0.15 => Speed 13.5
    // 30-90s: rate 0.20 => Speed 25.5 (13.5 + 12)
    // 90-120s: rate 0.075 => Speed 27.75 (25.5 + 2.25)
    // 120-180s: rate 0.03 => Speed 29.55 (27.75 + 1.8)
    // 180s+: rate 0.01
    
    const baseSpeed = 9;
    let avTargetSpeed = baseSpeed;

    if (elapsedSeconds < 30) {
        avTargetSpeed = baseSpeed + (0.15 * elapsedSeconds);
    } else if (elapsedSeconds < 90) {
        const speedAt30 = 13.5; // 9 + 0.15*30
        avTargetSpeed = speedAt30 + (0.2 * (elapsedSeconds - 30));
    } else if (elapsedSeconds < 120) {
        const speedAt90 = 25.5; // 13.5 + 0.2*60
        avTargetSpeed = speedAt90 + (0.075 * (elapsedSeconds - 90));
    } else if (elapsedSeconds < 180) {
        const speedAt120 = 27.75; // 25.5 + 0.075*30
        avTargetSpeed = speedAt120 + (0.03 * (elapsedSeconds - 120));
    } else {
        const speedAt180 = 29.55; // 27.75 + 0.03*60
        avTargetSpeed = speedAt180 + (0.01 * (elapsedSeconds - 180));
    }

    if (p.invincibleTimer > 0) avTargetSpeed -= 2;
    avalancheXRef.current += avTargetSpeed;
    
    if (avalancheXRef.current > p.x + 100) avalancheXRef.current = p.x + 100; 

    if (avalancheXRef.current > p.x - 30) {
      p.isDead = true;
      if (gameState === GameState.PLAYING) {
         callbacksRef.current.onGameOver(Math.floor(p.x / 10)); 
      }
    }

    // HUD & Music Speed Update
    let status = null;
    if (p.invincibleTimer > 0) status = 'INVINCIBLE!';
    else if (p.flightTimer > 0) status = 'DELIVERY FLIGHT!';
    else if (p.boostTimer > 0) status = 'SPEED BOOST!';

    const avDist = Math.max(0, Math.floor((p.x - avalancheXRef.current) / 10));
    
    // Dynamic Music Speed if danger is close (Changed to 200m)
    if (avDist < 200) {
        audioService.setEmergencyMode(true);
    } else {
        audioService.setEmergencyMode(false);
    }

    callbacksRef.current.onScoreUpdate(Math.floor(p.x / 10), p.vx, status, avDist); 
  };

  // --- Drawing Helpers ---
  
  const roughLine = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.lineWidth = width * 0.7;
    ctx.moveTo(x1 + (Math.random()-0.5)*2, y1 + (Math.random()-0.5)*2);
    ctx.lineTo(x2 + (Math.random()-0.5)*2, y2 + (Math.random()-0.5)*2);
    ctx.stroke();
  };

  const roughCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
     ctx.fillStyle = color;
     ctx.beginPath();
     for(let i=0; i<=Math.PI*2; i+=0.5) {
         const rOffset = r + (Math.random()-0.5)*3;
         ctx.lineTo(x + Math.cos(i)*rOffset, y + Math.sin(i)*rOffset);
     }
     ctx.fill();
  };

  const drawPenguin = (ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) => {
    const p = playerRef.current;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // Aura
    if (p.invincibleTimer > 0 || p.boostTimer > 0) {
        if (Math.floor(Date.now() / 50) % 2 === 0) {
            ctx.fillStyle = p.invincibleTimer > 0 ? 'rgba(251, 191, 36, 0.5)' : 'rgba(56, 189, 248, 0.5)';
            ctx.beginPath();
            ctx.arc(0, 0, 40, 0, Math.PI*2);
            ctx.fill();
        }
    }

    // Ski
    roughLine(ctx, -25, 18, 25, 18, '#d97706', 6);

    // Delivery Backpack
    ctx.fillStyle = '#ef4444'; 
    ctx.beginPath();
    ctx.rect(-15, -25, 20, 20); 
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b91c1c';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Fish', -12, -12);

    // Body
    roughCircle(ctx, 0, -5, 22, CRAYON_PALETTE.PENGUIN_BODY);
    roughCircle(ctx, -2, -5, 14, CRAYON_PALETTE.PENGUIN_BELLY);

    // Beak
    ctx.fillStyle = CRAYON_PALETTE.PENGUIN_BEAK;
    ctx.beginPath();
    ctx.moveTo(10, -10);
    ctx.lineTo(28, -5);
    ctx.lineTo(10, 0);
    ctx.fill();

    // Eye
    roughCircle(ctx, 8, -12, 4, '#fff');
    roughCircle(ctx, 10, -12, 1.5, '#000');

    // Scarf
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.quadraticCurveTo(-20, -5 - (p.vx * 0.8), -35, -2 + Math.sin(frameCountRef.current * 0.3) * 10);
    ctx.stroke();

    // Sunglasses (Invincible mode now)
    if (p.invincibleTimer > 0) {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.rect(5, -16, 12, 6);
        ctx.rect(18, -16, 12, 6);
        ctx.fill();
    }

    ctx.restore();

    // Speed Lines (Wind) Effect
    if (p.boostTimer > 0 || p.flightTimer > 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot); // Match player rotation
      const numLines = 5;
      for(let i=0; i<numLines; i++) {
         const lx = -40 - Math.random() * 60;
         const ly = (Math.random() - 0.5) * 60;
         const len = 40 + Math.random() * 40;
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
         ctx.lineWidth = 2;
         ctx.beginPath();
         ctx.moveTo(lx, ly);
         ctx.lineTo(lx - len, ly); // Stream behind
         ctx.stroke();
      }
      ctx.restore();
    }
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const p = playerRef.current;
    
    cameraRef.current.y = p.y - GAME_HEIGHT * 0.3;
    cameraRef.current.x = p.x - GAME_WIDTH * 0.4;

    let shakeX = 0, shakeY = 0;
    if (cameraRef.current.shake > 0) {
      shakeX = (Math.random() - 0.5) * cameraRef.current.shake;
      shakeY = (Math.random() - 0.5) * cameraRef.current.shake;
      cameraRef.current.shake *= 0.9;
    }

    // BG
    ctx.fillStyle = CRAYON_PALETTE.PAPER;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    if (patternRef.current) {
        const pat = ctx.createPattern(patternRef.current, 'repeat');
        if (pat) {
            ctx.fillStyle = pat;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        }
    }

    ctx.save();
    ctx.translate(-cameraRef.current.x + shakeX, -cameraRef.current.y + shakeY);

    // Parallax Sun
    const sunY = cameraRef.current.y + 100;
    const sunX = cameraRef.current.x + 500;
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 60, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4;
    for(let i=0; i<8; i++) {
        const angle = i * (Math.PI/4) + frameCountRef.current * 0.01;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle)*70, sunY + Math.sin(angle)*70);
        ctx.lineTo(sunX + Math.cos(angle)*100, sunY + Math.sin(angle)*100);
        ctx.stroke();
    }

    // Draw Decorations (Back layer)
    decorationsRef.current.forEach(dec => {
        if(dec.x < cameraRef.current.x - 100 || dec.x > cameraRef.current.x + GAME_WIDTH + 100) return;
        const groundY = getGroundY(dec.x).y;
        ctx.save();
        ctx.translate(dec.x, groundY);
        
        if (dec.type === 'cabin') {
            // Draw Cabin
            ctx.fillStyle = '#7c2d12'; // Wood
            ctx.fillRect(-30, -60, 60, 60);
            ctx.fillStyle = '#fff'; // Snow roof
            ctx.beginPath();
            ctx.moveTo(-40, -60);
            ctx.lineTo(0, -90);
            ctx.lineTo(40, -60);
            ctx.fill();
            // Door
            ctx.fillStyle = dec.delivered ? '#22c55e' : '#451a03'; // Green if delivered
            ctx.fillRect(-10, -30, 20, 30);
            // Smoke
            if (!dec.delivered) {
                ctx.fillStyle = '#e2e8f0';
                const sOffset = Math.sin(frameCountRef.current * 0.05) * 10;
                roughCircle(ctx, 20, -90 - (frameCountRef.current % 40), 5 + (frameCountRef.current % 20)*0.2, '#e2e8f0');
            }
        } else {
            // Draw Tree
            const h = dec.height;
            const w = dec.width;
            ctx.fillStyle = '#854d0e'; 
            ctx.fillRect(-w/6, -h/4, w/3, h/4);
            ctx.fillStyle = '#65a30d'; 
            const drawTri = (yOff: number, scale: number) => {
                ctx.beginPath();
                ctx.moveTo(-w * scale, yOff);
                ctx.lineTo(0, yOff - w * 1.5 * scale);
                ctx.lineTo(w * scale, yOff);
                ctx.fill();
            };
            drawTri(-h/4, 1.2);
            drawTri(-h/2, 1.0);
            if(dec.type === 'tree_tall') drawTri(-h * 0.75, 0.8);
        }
        ctx.restore();
    });

    // Draw Terrain
    const t = terrainRef.current;
    if (t.length > 1) {
      ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y);
      for (let i = 1; i < t.length - 1; i++) {
        const xc = (t[i].x + t[i + 1].x) / 2;
        const yc = (t[i].y + t[i + 1].y) / 2;
        ctx.quadraticCurveTo(t[i].x, t[i].y, xc, yc);
      }
      ctx.lineTo(t[t.length-1].x, t[t.length-1].y + GAME_HEIGHT); 
      ctx.lineTo(t[0].x, t[0].y + GAME_HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y);
      for (let i = 1; i < t.length - 1; i++) {
        const xc = (t[i].x + t[i + 1].x) / 2;
        const yc = (t[i].y + t[i + 1].y) / 2;
        ctx.quadraticCurveTo(t[i].x, t[i].y, xc, yc);
      }
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineCap = 'round';
      ctx.setLineDash([15, 10]); 
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Obstacles (Rocks only now)
    obstaclesRef.current.forEach(obs => {
      if(obs.x < cameraRef.current.x - 100 || obs.x > cameraRef.current.x + GAME_WIDTH + 100) return;
      
      const groundY = getGroundY(obs.x).y;
      ctx.save();
      ctx.translate(obs.x, groundY);
      roughCircle(ctx, 0, -15, 20, CRAYON_PALETTE.OBSTACLE_ROCK);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(-5, -20, 5, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    // Draw PowerUps
    powerUpsRef.current.forEach(pu => {
        if (pu.collected) return;
        ctx.save();
        ctx.translate(pu.x, pu.y + Math.sin(frameCountRef.current * 0.1) * 10);
        
        if (pu.type === 'fish') {
            // Draw Raw Fish
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(15, 0); ctx.lineTo(25, -10); ctx.lineTo(25, 10);
            ctx.fill();
            // Eye
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, -2, 3, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-11, -2, 1, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = CRAYON_PALETTE.SUNGLASSES;
            ctx.beginPath();
            ctx.rect(-20, -10, 40, 20);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(-15, 10); ctx.lineTo(-5, -10); ctx.lineTo(0, -10); ctx.lineTo(-10, 10);
            ctx.fill();
        }
        ctx.restore();
    });

    // Draw Player
    drawPenguin(ctx, p.x, p.y, p.rotation);

    // Draw Particles
    particlesRef.current.forEach((part) => {
      part.x += part.vx;
      part.y += part.vy;
      part.life -= 0.02;
      ctx.globalAlpha = part.life;
      roughCircle(ctx, part.x, part.y, part.size, part.color);
      ctx.globalAlpha = 1.0;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // Draw Avalanche
    const avX = avalancheXRef.current;
    ctx.fillStyle = CRAYON_PALETTE.AVALANCHE;
    ctx.beginPath();
    ctx.moveTo(avX, cameraRef.current.y + GAME_HEIGHT + 200);
    ctx.lineTo(avX, cameraRef.current.y - 200);
    for(let y = cameraRef.current.y - 200; y < cameraRef.current.y + GAME_HEIGHT + 200; y+= 60) {
      ctx.lineTo(avX + 60 + Math.random() * 30, y);
    }
    ctx.fill();
    
    // Snow spray
    for(let i=0; i<10; i++) {
        const py = cameraRef.current.y + Math.random() * GAME_HEIGHT;
        const px = avX + 80 + Math.random() * 40;
        ctx.globalAlpha = 0.6;
        roughCircle(ctx, px, py, 20 + Math.random() * 20, '#fff');
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  };

  const gameLoop = (time: number) => {
    if (gameState !== GameState.PLAYING) return;
    frameCountRef.current++;
    updateTerrain(playerRef.current.x);
    updatePhysics();
    render();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <canvas
      ref={canvasRef}
      width={GAME_WIDTH}
      height={GAME_HEIGHT}
      className="w-full h-full touch-none cursor-pointer block"
      onMouseDown={handleInputStart}
      onMouseUp={handleInputEnd}
      onMouseLeave={handleInputEnd}
      onTouchStart={handleInputStart}
      onTouchEnd={handleInputEnd}
    />
  );
};

export default GameCanvas;
