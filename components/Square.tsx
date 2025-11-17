
import React from 'react';
import type { SquareValue } from '../types';

interface SquareProps {
  value: SquareValue;
  onClick: () => void;
  isWinning: boolean;
}

const Square: React.FC<SquareProps> = ({ value, onClick, isWinning }) => {
  const textClass = value === 'X' ? 'text-sky-400' : 'text-amber-400';
  const bgClass = isWinning ? 'bg-green-500/30' : 'bg-gray-800 hover:bg-gray-700';

  return (
    <button
      className={`w-20 h-20 md:w-28 md:h-28 flex items-center justify-center rounded-lg shadow-lg transition-all duration-200 ${bgClass}`}
      onClick={onClick}
    >
      <span className={`text-5xl md:text-7xl font-bold ${textClass} transition-transform duration-200 transform group-hover:scale-110`}>
        {value}
      </span>
    </button>
  );
};

export default Square;
