
import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState, GrillSlot, FishCookState } from './types';
import { Play, RefreshCw, Music, VolumeX, Trophy, Star, AlertTriangle, Utensils, Check, Trash2 } from 'lucide-react';
import { audioService } from './services/audioService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [avalancheDist, setAvalancheDist] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  
  // Minigame State
  const [fishInventory, setFishInventory] = useState(0); // Count of cooked fish
  const [grillSlots, setGrillSlots] = useState<GrillSlot[]>([
     { id: '1', progress: 0, state: 'raw', isCooking: false },
     { id: '2', progress: 0, state: 'raw', isCooking: false },
     { id: '3', progress: 0, state: 'raw', isCooking: false }
  ]);

  const startGame = () => {
    setScore(0);
    setGameState(GameState.PLAYING);
    setStatus(null);
    setFishInventory(0);
    setGrillSlots([
        { id: '1', progress: 0, state: 'raw', isCooking: false },
        { id: '2', progress: 0, state: 'raw', isCooking: false },
        { id: '3', progress: 0, state: 'raw', isCooking: false }
    ]);
  };

  const handleGameOver = (finalScore: number) => {
    setGameState(GameState.GAME_OVER);
    if (finalScore > highScore) {
      setHighScore(finalScore);
    }
  };

  const handleScoreUpdate = (currentScore: number, currentSpeed: number, currentStatus: string | null, dist: number) => {
    setScore(currentScore);
    setStatus(currentStatus);
    setAvalancheDist(dist);
  };

  const toggleAudio = () => {
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  // --- Cooking Logic ---

  useEffect(() => {
      let interval: number;
      if (gameState === GameState.PLAYING) {
          interval = window.setInterval(() => {
              setGrillSlots(prev => prev.map(slot => {
                  if (!slot.isCooking) return slot;
                  
                  // Cooking Speed
                  const newProgress = slot.progress + 0.8; 
                  
                  let newState: FishCookState = slot.state;
                  if (newProgress > 100) newState = 'burnt';
                  else if (newProgress > 60) newState = 'perfect'; // 60-100 is good

                  // Auto-discard burnt
                  if (newState === 'burnt') {
                      audioService.playSizzle(); // fizzle out
                      return { ...slot, isCooking: false, progress: 0, state: 'raw' };
                  }

                  return { ...slot, progress: newProgress, state: newState };
              }));
          }, 50);
      }
      return () => clearInterval(interval);
  }, [gameState]);

  const handleCollectFish = () => {
      // Use functional update to access the FRESH state, fixing the bug where it always picked index 0
      setGrillSlots(prev => {
          const idx = prev.findIndex(s => !s.isCooking);
          if (idx !== -1) {
              const next = [...prev];
              next[idx] = { ...next[idx], isCooking: true, progress: 0, state: 'raw' };
              return next;
          }
          return prev;
      });
      audioService.playSizzle();
  };

  const handleSlotTap = (index: number) => {
      const slot = grillSlots[index];
      if (!slot.isCooking) return;

      if (slot.state === 'perfect') {
          // Collect immediately (simplified one-step process)
          if (fishInventory < 3) {
              // Borrowing sound, game canvas handles the actual deliver sound later
              audioService.playDelivery(); 
              setFishInventory(p => p + 1);
              setGrillSlots(prev => {
                  const next = [...prev];
                  next[index] = { ...next[index], isCooking: false, progress: 0, state: 'raw' };
                  return next;
              });
          }
      } else {
          // Tapped too early - Shake effect (visual only handled by css mostly)
      }
  };

  const handleDeliverFish = () => {
      setFishInventory(p => Math.max(0, p - 1));
  };

  return (
    <div className="relative w-full h-screen bg-slate-200 overflow-hidden select-none flex justify-center">
      {/* Main Container */}
      <div className="relative w-full max-w-md h-full bg-[#fdfbf7] shadow-2xl flex flex-col">
        
        {/* Game Layer */}
        <div className="absolute inset-0 z-10">
          <GameCanvas 
            gameState={gameState}
            onGameOver={handleGameOver}
            onScoreUpdate={handleScoreUpdate}
            fishInventory={fishInventory}
            onCollectFish={handleCollectFish}
            onDeliverFish={handleDeliverFish}
          />
        </div>

        {/* UI Overlay Layer */}
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col p-6 justify-between">
          
          {/* Header / HUD */}
          <div className="flex justify-between items-start pointer-events-auto">
            <div className="flex flex-col gap-2">
               <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-2 border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(30,41,59,0.2)]">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Distance</span>
                  <div className="text-3xl font-black text-slate-800 font-mono tracking-tighter">{score}m</div>
               </div>

               {/* Avalanche Warning */}
               {gameState === GameState.PLAYING && (
                  <div className={`transition-all duration-300 rounded-xl px-3 py-1 border-2 flex items-center gap-2 shadow-sm ${
                      avalancheDist < 50 ? 'bg-red-100 border-red-500 text-red-600 animate-pulse' : 'bg-white/80 border-slate-300 text-slate-600'
                  }`}>
                      <AlertTriangle size={16} />
                      <span className="font-bold text-sm">Snow: {avalancheDist}m</span>
                  </div>
               )}
            </div>

            {/* Right Side Stats */}
            <div className="flex flex-col items-end gap-2">
                <button 
                onClick={toggleAudio}
                className="bg-white/90 p-3 rounded-full hover:bg-white transition-all active:scale-95 border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(30,41,59,0.2)]"
                >
                {isMuted ? <VolumeX size={24} className="text-slate-500"/> : <Music size={24} className="text-sky-500"/>}
                </button>

                {/* Inventory Count */}
                {gameState === GameState.PLAYING && (
                    <div className="bg-red-500 text-white rounded-xl px-3 py-2 border-2 border-slate-800 shadow-sm flex flex-col items-center">
                        <div className="text-[10px] uppercase font-bold opacity-80">Backpack</div>
                        <div className="font-black text-xl flex items-center gap-1">
                             <Utensils size={18}/> {fishInventory} / 3
                        </div>
                    </div>
                )}
            </div>
          </div>

          {/* Status Messages (Center) */}
          {status && (
             <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 animate-bounce z-30">
                <div className="bg-yellow-400 text-slate-900 px-6 py-2 rounded-full font-black text-xl border-2 border-slate-900 shadow-lg flex items-center gap-2 whitespace-nowrap transform rotate-[-2deg]">
                   <Star fill="black" size={20}/> {status}
                </div>
             </div>
          )}

          {/* --- GRILL MINIGAME UI (Bottom) --- */}
          {gameState === GameState.PLAYING && (
              <div className="pointer-events-auto mt-auto mb-0 w-full bg-slate-800 rounded-3xl p-3 border-4 border-slate-600 shadow-2xl relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-1 rounded-t-xl text-xs font-bold border-t-2 border-x-2 border-slate-600">
                      FISH GRILL
                  </div>
                  <div className="flex justify-around items-center h-24">
                      {grillSlots.map((slot, idx) => (
                          <button 
                            key={idx}
                            disabled={!slot.isCooking}
                            onClick={() => handleSlotTap(idx)}
                            className={`relative w-20 h-20 rounded-full border-4 transition-all transform active:scale-95 overflow-hidden
                                ${!slot.isCooking ? 'bg-slate-700 border-slate-600' : ''}
                                ${slot.isCooking && slot.state === 'raw' ? 'bg-blue-200 border-blue-400' : ''}
                                ${slot.isCooking && slot.state === 'perfect' ? 'bg-orange-300 border-orange-500 animate-pulse scale-105 shadow-[0_0_15px_rgba(251,191,36,0.6)]' : ''}
                            `}
                          >
                              {!slot.isCooking && <div className="text-slate-500 text-xs font-mono">EMPTY</div>}
                              
                              {slot.isCooking && (
                                  <>
                                    {/* Progress Ring - Fixed geometry for 80x80 button (w-20 h-20) */}
                                    <svg className="absolute inset-0 transform -rotate-90 w-full h-full">
                                        <circle 
                                            cx="50%" cy="50%" r="36" 
                                            fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="6"
                                        />
                                        <circle 
                                            cx="50%" cy="50%" r="36" 
                                            fill="none" 
                                            stroke={slot.state === 'perfect' ? '#c2410c' : '#3b82f6'}
                                            strokeWidth="6"
                                            strokeDasharray="226" 
                                            strokeDashoffset={226 - (226 * slot.progress) / 100}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    
                                    {/* Fish Icon */}
                                    <div className={`absolute inset-0 flex items-center justify-center text-3xl transition-transform duration-300
                                        ${slot.state === 'perfect' ? 'animate-bounce' : ''}
                                    `}>
                                        🐟
                                    </div>
                                  </>
                              )}
                          </button>
                      ))}
                  </div>
              </div>
          )}

          {/* Menus */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
            
            {/* Main Menu */}
            {gameState === GameState.MENU && (
              <div className="bg-white/95 backdrop-blur-md p-8 rounded-[2rem] shadow-2xl text-center w-full max-w-xs pointer-events-auto border-4 border-slate-800 transform transition-all hover:scale-[1.02] relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-4 bg-sky-400"></div>
                 
                <div className="mb-6">
                  <div className="text-7xl mb-2 animate-pulse">🐧</div>
                  <h1 className="text-4xl font-black text-slate-800 tracking-tight leading-[0.9]">
                    DELIVERY<br/>
                    <span className="text-sky-500">ESCAPE</span>
                  </h1>
                  <div className="mt-4 inline-block bg-slate-100 px-3 py-1 rounded-lg text-sm font-bold text-slate-500 transform rotate-2 border border-slate-300">
                     Vertical Edition
                  </div>
                </div>
                
                <div className="space-y-2 mb-6 text-left bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm">
                   <p className="flex items-center gap-2 font-bold text-slate-700">
                      👇 Tap to Jump (Avoid Rocks)
                   </p>
                   <p className="flex items-center gap-2 font-bold text-slate-700">
                      🌀 Hold to Flip (Perfect Land = Boost)
                   </p>
                   <p className="flex items-center gap-2 font-bold text-slate-700">
                      🐟 Cook Fish in the Grill below!
                   </p>
                   <p className="flex items-center gap-2 font-bold text-slate-700">
                      🏠 Pass Cabins to Deliver
                   </p>
                </div>

                <button 
                  onClick={() => {
                    audioService.init();
                    startGame();
                  }}
                  className="w-full bg-sky-400 hover:bg-sky-500 text-white text-2xl font-black py-4 rounded-2xl shadow-[0px_6px_0px_0px_#0369a1] active:shadow-none active:translate-y-[6px] transition-all flex items-center justify-center gap-3 border-2 border-slate-800"
                >
                  <Play fill="currentColor" size={32} /> DELIVER!
                </button>
              </div>
            )}

            {/* Game Over */}
            {gameState === GameState.GAME_OVER && (
              <div className="bg-white/95 backdrop-blur-md p-8 rounded-[2rem] shadow-2xl text-center w-full max-w-xs pointer-events-auto border-4 border-slate-800 animate-in fade-in zoom-in duration-300">
                <h2 className="text-4xl font-black text-slate-800 mb-2">BURIED! ❄️</h2>
                <p className="text-slate-500 mb-8 font-medium">The delivery failed!</p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200">
                    <div className="text-xs uppercase font-bold text-slate-400 mb-1">Score</div>
                    <div className="text-3xl font-black text-slate-800">{score}m</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-2xl border-2 border-yellow-200">
                    <div className="text-xs uppercase font-bold text-yellow-600 mb-1 flex items-center justify-center gap-1"><Trophy size={12}/> Best</div>
                    <div className="text-3xl font-black text-slate-800">{Math.max(score, highScore)}m</div>
                  </div>
                </div>

                <button 
                  onClick={startGame}
                  className="w-full bg-sky-400 hover:bg-sky-500 text-white text-2xl font-black py-5 rounded-2xl shadow-[0px_6px_0px_0px_#0369a1] active:shadow-none active:translate-y-[6px] transition-all flex items-center justify-center gap-3 border-2 border-slate-800"
                >
                  <RefreshCw size={28} strokeWidth={3} /> RETRY
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
