import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import { Chess } from 'chess.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

interface ChessBoardProps {
  fen?: string;
  orientation?: 'white' | 'black';
  onMove?: (from: string, to: string, promotion?: string) => void;
  onSquareClick?: (square: string) => void;
  onDrop?: (piece: string, square: string) => void;
  movable?: boolean;
  pocketPieces?: Map<string, number>; // For piece drops
  debug?: boolean; // Enable debug logging
}

/**
 * ChessBoard Component
 * 
 * Renders an interactive chess board using Chessground library.
 * Supports standard moves and piece drops for bughouse.
 */
export function ChessBoard({
  fen,
  orientation = 'white',
  onMove,
  onSquareClick,
  movable = true,
  debug = false,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const chessgroundRef = useRef<Api | null>(null);
  const chessRef = useRef<Chess>(new Chess());

  if (debug) console.log('[PLAYER] ChessBoard render - FEN:', fen, 'movable:', movable, 'orientation:', orientation);

  // Calculate legal moves for current position
  const getLegalMoves = (currentFen?: string) => {
    const fenToUse = currentFen || fen;
    if (!fenToUse) return new Map();
    
    try {
      chessRef.current.load(fenToUse);
      const moves = chessRef.current.moves({ verbose: true });
      const dests = new Map();
      
      moves.forEach(move => {
        if (!dests.has(move.from)) {
          dests.set(move.from, []);
        }
        dests.get(move.from).push(move.to);
      });
      
      if (debug) console.log('[PLAYER] Legal moves calculated for FEN:', fenToUse, 'moves:', moves.length, 'dests:', dests.size);
      return dests;
    } catch (error) {
      console.error('Error calculating legal moves:', error);
      return new Map();
    }
  };

  useEffect(() => {
    if (!boardRef.current) return;

    if (debug) console.log('[PLAYER] Initializing Chessground...');

    // Initialize Chessground
    const config: Config = {
      orientation,
      movable: {
        free: false,
        color: movable ? orientation : undefined,
        dests: movable ? getLegalMoves() : new Map(),
        events: {
          after: (orig, dest) => {
            if (onMove) {
              // Check if it's a promotion move
              const promotion = shouldPromote(orig, dest) ? 'q' : undefined;
              onMove(orig, dest, promotion);
            }
          },
        },
      },
      events: {
        select: (square) => {
          console.log('[PLAYER] Square clicked:', square);
          if (onSquareClick) {
            onSquareClick(square);
          }
        },
      },
      draggable: {
        enabled: movable,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      animation: {
        enabled: true,
        duration: 200,
      },
      premovable: {
        enabled: false,
      },
    };

    if (fen) {
      config.fen = fen;
    }

    chessgroundRef.current = Chessground(boardRef.current, config);

    return () => {
      if (debug) console.log('[PLAYER] Destroying Chessground...');
      chessgroundRef.current?.destroy();
    };
  }, []);

  // Update position when FEN changes  
  useEffect(() => {
    if (chessgroundRef.current && fen) {
      if (debug) console.log('[PLAYER] FEN/movable changed, updating board:', fen, 'movable:', movable);
      
      try {
        chessRef.current.load(fen);
      } catch (e) {
        console.error('[PLAYER] Failed to load FEN:', e);
        return;
      }
      
      const legalMoves = getLegalMoves(fen);
      if (debug) console.log('[PLAYER] Setting movable color:', movable ? orientation : undefined, 'dests size:', legalMoves.size);
      
      // Get turn from FEN
      const turn = fen.split(' ')[1] === 'w' ? 'white' : 'black';
      
      chessgroundRef.current.set({ 
        fen,
        turnColor: turn,
        movable: {
          free: false,
          color: movable ? orientation : undefined,
          dests: movable ? legalMoves : new Map(),
        },
        draggable: {
          enabled: movable,
          showGhost: true,
        },
      });
      
      if (debug) console.log('[PLAYER] Chessground config updated');
    }
  }, [fen, movable, orientation]);

  // Update orientation
  useEffect(() => {
    if (chessgroundRef.current) {
      chessgroundRef.current.set({ orientation });
    }
  }, [orientation]);

  const shouldPromote = (_from: string, to: string): boolean => {
    // Simple promotion detection - check if pawn reaches last rank
    const toRank = to[1];
    
    return (
      (toRank === '8' && orientation === 'white') ||
      (toRank === '1' && orientation === 'black')
    );
  };

  return (
    <div 
      ref={boardRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        maxWidth: '500px',
        maxHeight: '500px',
      }} 
    />
  );
}
