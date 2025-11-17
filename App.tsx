
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { ref, set, onValue, remove, push } from 'firebase/database';
import { auth, db, rtdb } from './services/firebase';
import Auth from './components/Auth';
import Game from './components/Game';
import Modal from './components/Modal';
import type { UserProfile, GameMode, GameState, GameHistoryItem } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);

  const [isJoinModalOpen, setJoinModalOpen] = useState(false);
  const [joinGameId, setJoinGameId] = useState('');
  const [joinError, setJoinError] = useState('');

  const [isWaitingModalOpen, setWaitingModalOpen] = useState(false);
  const [createdGameId, setCreatedGameId] = useState('');
  
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(prev => ({...prev, ...docSnap.data()} as UserProfile));
            } else {
                 const newUserProfile: UserProfile = {
                    uid: currentUser.uid,
                    email: currentUser.email,
                    points: 0,
                    level: 1,
                };
                setDoc(userDocRef, newUserProfile);
                setUserProfile(newUserProfile);
            }
        });
        
        const historyCollectionRef = collection(db, 'users', currentUser.uid, 'games');
        const historyQuery = query(historyCollectionRef, orderBy('playedAt', 'desc'));
        const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
            const gameHistory = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            } as GameHistoryItem));
            setUserProfile(prev => prev ? { ...prev, gameHistory } : null);
        });

        setLoading(false);
        return () => {
            unsubscribeProfile();
            unsubscribeHistory();
        };

      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);
  
  const handleLogout = () => {
    signOut(auth);
    setGameMode(null);
    setGameId(null);
  };

  const startOfflineGame = () => {
    setGameMode('offline');
    setGameId(null);
  };

  const createFriendGame = async () => {
    if (!user || !userProfile) return;
    const gamesRef = ref(rtdb, 'games');
    const newGameRef = push(gamesRef);
    const newGameId = newGameRef.key;
    if (!newGameId) return;

    const newGame: GameState = {
      board: Array(9).fill(null),
      playerX: { uid: user.uid, email: userProfile.email },
      playerO: null,
      turn: 'X',
      status: 'waiting',
      winner: null,
    };
    await set(newGameRef, newGame);
    setCreatedGameId(newGameId);
    setWaitingModalOpen(true);

    onValue(ref(rtdb, `games/${newGameId}`), (snapshot) => {
        const gameData = snapshot.val();
        if(gameData && gameData.status === 'playing') {
            setGameId(newGameId);
            setGameMode('friend');
            setWaitingModalOpen(false);
        }
    }, { onlyOnce: true });
  };
  
  const handleJoinGame = async () => {
    if (!user || !joinGameId) return;
    const gameRef = ref(rtdb, `games/${joinGameId}`);
    onValue(gameRef, async (snapshot) => {
        const gameData: GameState = snapshot.val();
        if (gameData && gameData.status === 'waiting') {
            await set(ref(rtdb, `games/${joinGameId}/playerO`), { uid: user.uid, email: user.email });
            await set(ref(rtdb, `games/${joinGameId}/status`), 'playing');
            setGameId(joinGameId);
            setGameMode('friend');
            setJoinModalOpen(false);
            setJoinError('');
        } else {
            setJoinError('Game not found or is already full.');
        }
    }, { onlyOnce: true });
  };

  const findRandomMatch = async () => {
    if (!user || !userProfile) return;
    const queueRef = ref(rtdb, 'queue');
    
    setWaitingModalOpen(true);
    setCreatedGameId(''); // Clear for random match waiting message

    onValue(queueRef, async (snapshot) => {
      const queue = snapshot.val();
      let opponentKey: string | null = null;
      if (queue) {
        opponentKey = Object.keys(queue).find(key => key !== user.uid);
      }

      if (opponentKey && queue[opponentKey]) {
        // Found opponent, create game
        await remove(ref(rtdb, `queue/${opponentKey}`));
        
        const gamesRef = ref(rtdb, 'games');
        const newGameRef = push(gamesRef);
        const newGameId = newGameRef.key;
        if (!newGameId) return;
        
        const newGame: GameState = {
          board: Array(9).fill(null),
          playerX: { uid: queue[opponentKey].uid, email: queue[opponentKey].email },
          playerO: { uid: user.uid, email: userProfile.email },
          turn: 'X',
          status: 'playing',
          winner: null,
        };
        await set(newGameRef, newGame);
        await set(ref(rtdb, `matchmaking/${queue[opponentKey].uid}`), newGameId);
        
        setGameId(newGameId);
        setGameMode('random');
        setWaitingModalOpen(false);
      } else {
        // No opponent, add to queue
        const myQueueRef = ref(rtdb, `queue/${user.uid}`);
        await set(myQueueRef, { uid: user.uid, email: userProfile.email });
        
        const myMatchRef = ref(rtdb, `matchmaking/${user.uid}`);
        onValue(myMatchRef, (matchSnapshot) => {
            const matchedGameId = matchSnapshot.val();
            if(matchedGameId) {
                remove(myQueueRef);
                remove(myMatchRef);
                setGameId(matchedGameId);
                setGameMode('random');
                setWaitingModalOpen(false);
            }
        });
      }
    }, { onlyOnce: true });
  };


  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white text-2xl">Loading...</div>;
  }

  if (gameMode && (gameMode === 'offline' || gameId)) {
    return <Game gameId={gameId} gameMode={gameMode} user={userProfile} onExit={() => {setGameMode(null); setGameId(null);}} />;
  }
  
  if (!user) {
    return <Auth />;
  }

  const getResultColor = (result: string) => {
    if (result === 'win') return 'text-green-400';
    if (result === 'loss') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <div className="absolute top-4 right-4 flex items-center gap-4">
            {userProfile && (
                <button onClick={() => setProfileModalOpen(true)} className="text-right bg-gray-800 p-3 rounded-lg hover:bg-gray-700 transition">
                    <p className="font-semibold">{userProfile.email}</p>
                    <p className="text-sm text-gray-400">Level: {userProfile.level} | Points: {userProfile.points}</p>
                </button>
            )}
            <button onClick={handleLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-semibold">
                Logout
            </button>
        </div>
        
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-amber-400">Tic Tac Toe</h1>
        <p className="text-xl text-gray-400 mb-12">Select a game mode</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button onClick={startOfflineGame} className="p-8 bg-gray-800 rounded-xl hover:bg-gray-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg">
            <h2 className="text-2xl font-bold mb-2">Offline</h2>
            <p className="text-gray-400">Play against a friend on the same device.</p>
          </button>
          <button onClick={createFriendGame} className="p-8 bg-gray-800 rounded-xl hover:bg-gray-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg">
            <h2 className="text-2xl font-bold mb-2">Create Game</h2>
            <p className="text-gray-400">Create a game and invite a friend with a code.</p>
          </button>
          <button onClick={() => setJoinModalOpen(true)} className="p-8 bg-gray-800 rounded-xl hover:bg-gray-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg">
            <h2 className="text-2xl font-bold mb-2">Join Game</h2>
            <p className="text-gray-400">Enter a code to join your friend's game.</p>
          </button>
        </div>
        <div className="mt-6">
            <button onClick={findRandomMatch} className="w-full md:w-auto px-12 py-6 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:opacity-90 transition-all duration-300 transform hover:-translate-y-1 shadow-lg">
                <h2 className="text-2xl font-bold mb-2">Find Random Match</h2>
                <p className="text-gray-300">Play against a random opponent online.</p>
            </button>
        </div>
      </div>

      <Modal isOpen={isJoinModalOpen} onClose={() => setJoinModalOpen(false)} title="Join Game">
        <div className="flex flex-col gap-4">
            <input 
                type="text"
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                placeholder="Enter Game Code"
                className="w-full px-4 py-3 bg-gray-700 text-white border-2 border-gray-600 rounded-lg focus:outline-none focus:border-sky-500 transition"
            />
            {joinError && <p className="text-red-500">{joinError}</p>}
            <button onClick={handleJoinGame} className="w-full py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition">
                Join
            </button>
        </div>
      </Modal>

      <Modal isOpen={isWaitingModalOpen} title="Waiting for Opponent">
        <div className="text-center text-white">
            <div className="animate-pulse text-2xl my-4">Searching...</div>
            {createdGameId && (
                <div className="mt-4">
                    <p className="text-gray-400">Share this code with your friend:</p>
                    <p className="text-2xl font-mono bg-gray-700 p-3 rounded-lg mt-2 cursor-pointer" onClick={() => navigator.clipboard.writeText(createdGameId)}>
                        {createdGameId}
                    </p>
                </div>
            )}
            <button onClick={() => {
                setWaitingModalOpen(false);
                if (createdGameId) remove(ref(rtdb, `games/${createdGameId}`));
                if (user) remove(ref(rtdb, `queue/${user.uid}`));
            }} className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg">Cancel</button>
        </div>
      </Modal>

      <Modal isOpen={isProfileModalOpen} onClose={() => setProfileModalOpen(false)} title="Your Profile">
        {userProfile && (
            <div className="text-white space-y-4">
                 <div>
                    <p className="text-lg font-bold">{userProfile.email}</p>
                    <p className="text-md text-gray-300">Level: {userProfile.level} | Points: {userProfile.points}</p>
                 </div>
                 <hr className="border-gray-600"/>
                 <h3 className="text-xl font-semibold">Game History</h3>
                 <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                    {userProfile.gameHistory && userProfile.gameHistory.length > 0 ? (
                        userProfile.gameHistory.map((game) => (
                            <div key={game.id} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                                <div>
                                    <p className="font-semibold">vs {game.opponentEmail?.split('@')[0] || 'Unknown'}</p>
                                    <p className="text-xs text-gray-400">{game.playedAt?.toDate().toLocaleDateString()}</p>
                                </div>
                                <p className={`font-bold text-lg ${getResultColor(game.result)}`}>
                                    {game.result.toUpperCase()}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-400">No online games played yet.</p>
                    )}
                 </div>
            </div>
        )}
      </Modal>

    </div>
  );
};

export default App;