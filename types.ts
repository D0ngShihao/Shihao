
export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Point {
  x: number;
  y: number;
}

export type ObstacleType = 'rock_small';
export type DecorationType = 'tree_tall' | 'tree_short' | 'cabin';

export interface Obstacle {
  x: number;
  y: number;
  type: ObstacleType;
  width: number;
  height: number;
  passed: boolean;
}

export interface Decoration {
  x: number;
  y: number;
  type: DecorationType;
  width: number;
  height: number;
  delivered?: boolean; // For cabins
}

export type PowerUpType = 'fish' | 'sunglasses';

export interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  collected: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number; // In radians
  isGrounded: boolean;
  isDead: boolean;
  score: number;
  boostTimer: number; // From perfect landings
  backflipCount: number; 
  totalBackflips: number;
  
  // Powerups / Inventory
  invincibleTimer: number; // From deliveries
  flightTimer: number;
  fishInventory: number; // Count of COOKED fish (max 3)
}

// Minigame Types
export type FishCookState = 'raw' | 'perfect' | 'burnt';

export interface GrillSlot {
  id: string;
  progress: number; // 0 to 100
  state: FishCookState;
  isCooking: boolean;
}
