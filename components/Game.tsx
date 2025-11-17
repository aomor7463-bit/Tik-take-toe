
import React, { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set, update, increment } from 'firebase/database';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { rtdb, db } from '../services/firebase';
import Board from './Board';
import Modal from './Modal';
import type { SquareValue, GameState, GameMode, UserProfile } from '../types';

const calculateWinner = (squares: SquareValue[]): { winner: SquareValue; line: number[] } | null => {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { winner: squares[a], line: lines[i] };
    }
  }
  return null;
};

interface GameProps {
  gameId: string | null;
  gameMode: GameMode;
  user: UserProfile | null;
  onExit: () => void;
}

const Game: React.FC<GameProps> = ({ gameId, gameMode, user, onExit }) => {
  const [board, setBoard] = useState<SquareValue[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [status, setStatus] = useState('Loading...');

  const playerSymbol = user?.uid === gameState?.playerX.uid ? 'X' : user?.uid === gameState?.playerO?.uid ? 'O' : null;

  const handleOnlineMove = async (i: number) => {
    if (!gameId || !gameState || gameState.status !== 'playing' || gameState.board[i] || gameState.turn !== playerSymbol) {
      return;
    }
    
    const newBoard = [...gameState.board];
    newBoard[i] = gameState.turn;
    const gameRef = ref(rtdb, `games/${gameId}`);
    
    const winnerInfo = calculateWinner(newBoard);
    let newStatus = 'playing';
    let newWinner: SquareValue | 'draw' | null = null;
    
    if (winnerInfo) {
      newStatus = 'finished';
      newWinner = winnerInfo.winner;
    } else if (newBoard.every(Boolean)) {
      newStatus = 'finished';
      newWinner = 'draw';
    }

    const updates: Partial<GameState> = {
      board: newBoard,
      turn: gameState.turn === 'X' ? 'O' : 'X',
      status: newStatus as 'playing' | 'finished',
      winner: newWinner,
    };
    
    await update(gameRef, updates);

    if (newStatus === 'finished') {
        // Update winner points and level
        if (newWinner && newWinner !== 'draw') {
            const winnerUid = newWinner === 'X' ? gameState.playerX.uid : gameState.playerO?.uid;
            if (winnerUid) {
                const userDocRef = doc(db, 'users', winnerUid);
                await updateDoc(userDocRef, {
                    points: increment(20),
                    level: increment(1)
                });
            }
        }
        
        // Record game history for both players
        const playerX = gameState.playerX;
        const playerO = gameState.playerO;
        if (playerX && playerO && gameId && (gameMode === 'friend' || gameMode === 'random')) {
            const gameResultData = {
                gameId: gameId,
                mode: gameMode,
                playedAt: serverTimestamp(),
            };

            const playerXResult = newWinner === 'draw' ? 'draw' : (newWinner === 'X' ? 'win' : 'loss');
            const playerOResult = newWinner === 'draw' ? 'draw' : (newWinner === 'O' ? 'win' : 'loss');

            const playerXHistoryRef = collection(db, 'users', playerX.uid, 'games');
            await addDoc(playerXHistoryRef, {
                ...gameResultData,
                opponentEmail: playerO.email,
                result: playerXResult,
            });

            const playerOHistoryRef = collection(db, 'users', playerO.uid, 'games');
            await addDoc(playerOHistoryRef, {
                ...gameResultData,
                opponentEmail: playerX.email,
                result: playerOResult,
            });
        }
    }
  };

  const handleOfflineMove = (i: number) => {
    const newBoard = [...board];
    if (calculateWinner(newBoard) || newBoard[i]) {
      return;
    }
    newBoard[i] = isXNext ? 'X' : 'O';
    setBoard(newBoard);
    setIsXNext(!isXNext);
  };

  const handleClick = (i: number) => {
    if (isGameOver) return;
    if (gameMode === 'offline') {
      handleOfflineMove(i);
    } else {
      handleOnlineMove(i);
    }
  };
  
  const resetOfflineGame = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setIsGameOver(false);
  };
  
  const handleRematch = async () => {
      if(!gameId || !gameState) return;
      const newBoard = Array(9).fill(null);
      const gameRef = ref(rtdb, `games/${gameId}`);
      await update(gameRef, {
          board: newBoard,
          status: 'playing',
          turn: 'X',
          winner: null,
      });
      setIsGameOver(false);
  }

  useEffect(() => {
    if (gameMode !== 'offline' && gameId) {
      const gameRef = ref(rtdb, `games/${gameId}`);
      const unsubscribe = onValue(gameRef, (snapshot) => {
        const data = snapshot.val() as GameState;
        if (data) {
          setGameState(data);
          if (data.status === 'finished') {
              setIsGameOver(true);
          }
        } else {
            onExit();
        }
      });
      return () => unsubscribe();
    }
  }, [gameId, gameMode, onExit]);

  useEffect(() => {
    if (gameMode === 'offline') {
      const winnerInfo = calculateWinner(board);
      const isDraw = board.every(Boolean);
      if (winnerInfo || isDraw) {
        setIsGameOver(true);
      }
      const statusText = winnerInfo ? `Winner: ${winnerInfo.winner}` : isDraw ? "It's a Draw!" : `Next player: ${isXNext ? 'X' : 'O'}`;
      setStatus(statusText);
    } else if (gameState) {
      let statusText = '';
      if(gameState.status === 'waiting') {
        statusText = 'Waiting for opponent...';
      } else if (gameState.status === 'playing') {
        if(playerSymbol === gameState.turn){
            statusText = "Your turn";
        } else {
            statusText = `Waiting for ${gameState.turn}...`;
        }
      } else if (gameState.status === 'finished') {
          if (gameState.winner === 'draw') statusText = "It's a Draw!";
          else if (gameState.winner === playerSymbol) statusText = 'You Won!';
          else statusText = 'You Lost!';
      }
      setStatus(statusText);
    }
  }, [board, isXNext, gameMode, gameState, playerSymbol]);

  const currentBoard = gameMode === 'offline' ? board : gameState?.board || Array(9).fill(null);
  const winnerInfo = calculateWinner(currentBoard);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-amber-400">Tic Tac Toe</h1>
          <button onClick={onExit} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition">Exit</button>
        </div>

        <div className="bg-gray-800 p-4 rounded-xl shadow-lg mb-4">
             <div className="flex justify-between items-center text-lg">
                <span className={`p-2 rounded-lg ${gameState?.turn === 'X' && 'bg-sky-500/30'}`}>
                    <strong className="text-sky-400">X:</strong> {gameMode === 'offline' ? 'Player 1' : gameState?.playerX.email?.split('@')[0] || 'Player X'}
                </span>
                <span className={`p-2 rounded-lg ${gameState?.turn === 'O' && 'bg-amber-500/30'}`}>
                    <strong className="text-amber-400">O:</strong> {gameMode === 'offline' ? 'Player 2' : gameState?.playerO?.email?.split('@')[0] || 'Waiting...'}
                </span>
            </div>
        </div>
        
        <Board squares={currentBoard} onClick={handleClick} winningLine={winnerInfo?.line || null} />
        
        <div className="text-center mt-6 text-2xl font-semibold h-8">
            <p>{status}</p>
        </div>
      </div>
      
      <Modal isOpen={isGameOver} title="Game Over">
        <div className="text-center text-white">
          <h3 className="text-3xl font-bold mb-4">{status}</h3>
          <div className="flex justify-center gap-4 mt-6">
            <button onClick={gameMode === 'offline' ? resetOfflineGame : handleRematch} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-transform transform hover:scale-105">
              Play Again
            </button>
            <button onClick={onExit} className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-transform transform hover:scale-105">
              Go to Menu
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Game;