
// Physics
export const GRAVITY = 0.6; // Slightly reduced baseline
export const JUMP_FORCE = -15; // Reduced for approx half height of previous 3x version
export const ROTATION_SPEED = 0.24; // Increased to 4/3 of previous (0.18 -> 0.24)
export const FRICTION = 0.99;
export const BASE_SPEED = 8;
export const MAX_SPEED = 20;
export const BOOST_SPEED = 25;
export const FLIGHT_SPEED = 28;
export const TERRAIN_SEGMENT_WIDTH = 40;
export const SLOPE_DROP = 15; // How much Y drops per segment (Downhill)

// Visuals
export const CRAYON_PALETTE = {
  PAPER: '#fdfbf7', // Warm paper
  SKY_TOP: '#7dd3fc', // Vibrant sky
  SKY_BOTTOM: '#bae6fd',
  PENGUIN_BODY: '#1e293b', // Darker charcoal
  PENGUIN_BELLY: '#f8fafc',
  PENGUIN_BEAK: '#fbbf24', // Golden yellow
  OBSTACLE_ROCK: '#64748b',
  OBSTACLE_TREE: '#22c55e', // Bright crayon green
  OBSTACLE_TREE_DARK: '#15803d',
  TRUNK: '#78350f',
  AVALANCHE: '#e2e8f0',
  STAR: '#fbbf24',
  SUNGLASSES: '#0f172a',
  TEXT_MAIN: '#334155'
};

// Resolution - Portrait Mode
export const GAME_WIDTH = 720; 
export const GAME_HEIGHT = 1280;
