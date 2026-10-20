import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useRoom } from "./hooks/useRoom";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Results from "./pages/Results";
import "./App.css";

export default function App() {
  const userId = useAuth();
  const [roomId, setRoomId] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const { room, players } = useRoom(roomId);

  const handleJoin = (id, name) => {
    setRoomId(id);
    setPlayerName(name);
  };

  const handlePlayAgain = () => {};

  if (!userId) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Connecting...</p>
      </div>
    );
  }

  if (!roomId) {
    return <Home userId={userId} onJoin={handleJoin} />;
  }

  if (!room) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading room...</p>
      </div>
    );
  }

  if (room.status === "lobby") {
    return <Lobby roomId={roomId} userId={userId} playerName={playerName} />;
  }

  if (room.status === "playing") {
    return <Game roomId={roomId} userId={userId} />;
  }

  if (room.status === "results") {
    return <Results roomId={roomId} userId={userId} players={players} onPlayAgain={handlePlayAgain} />;
  }

  return null;
}