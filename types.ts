
export type SquareValue = 'X' | 'O' | null;

export interface GameHistoryItem {
  id: string;
  opponentEmail: string | null;
  result: 'win' | 'loss' | 'draw';
  playedAt: {
    toDate: () => Date;
  };
  mode: 'friend' | 'random';
}

export interface UserProfile {
  uid: string;
  email: string | null;
  points: number;
  level: number;
  gameHistory?: GameHistoryItem[];
}

export interface GameState {
  board: SquareValue[];
  playerX: { uid: string; email: string | null };
  playerO: { uid: string; email: string | null } | null;
  turn: 'X' | 'O';
  status: 'waiting' | 'playing' | 'finished';
  winner: SquareValue | 'draw' | null;
}

export type GameMode = 'offline' | 'friend' | 'random';