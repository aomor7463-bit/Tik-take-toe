
import React from 'react';
import Square from './Square';
import type { SquareValue } from '../types';

interface BoardProps {
  squares: SquareValue[];
  onClick: (i: number) => void;
  winningLine: number[] | null;
}

const Board: React.FC<BoardProps> = ({ squares, onClick, winningLine }) => {
  const renderSquare = (i: number) => {
    return (
      <Square
        key={i}
        value={squares[i]}
        onClick={() => onClick(i)}
        isWinning={winningLine?.includes(i) || false}
      />
    );
  };

  return (
    <div className="grid grid-cols-3 gap-2 md:gap-4 p-2 bg-gray-900/50 rounded-xl">
      {Array(9).fill(null).map((_, i) => renderSquare(i))}
    </div>
  );
};

export default Board;
