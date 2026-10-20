import { useState } from "react";
import { doc, setDoc, getDoc, collection, setDoc as setPlayerDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function Home({ userId, onJoin }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const generateCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();

  const addPlayerToRoom = async (roomId, playerName) => {
    await setDoc(doc(db, "rooms", roomId, "players", userId), {
      name: playerName,
      score: 0,
      guess: null,
      ready: false,
    });
  };

  const createRoom = async () => {
    if (!name.trim()) return setError("Enter your name first!");
    setLoading(true);
    const roomId = generateCode();
    await setDoc(doc(db, "rooms", roomId), {
      status: "lobby",
      hostId: userId,
      currentRound: 0,
      currentPhoto: null,
      usedPhotos: [],
    });
    await addPlayerToRoom(roomId, name.trim());
    onJoin(roomId, name.trim());
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!name.trim()) return setError("Enter your name first!");
    if (!code.trim()) return setError("Enter a room code!");
    setLoading(true);
    const roomSnap = await getDoc(doc(db, "rooms", code.toUpperCase()));
    if (!roomSnap.exists()) {
      setError("Room not found! Check the code.");
      setLoading(false);
      return;
    }
    if (roomSnap.data().status !== "lobby") {
      setError("Game already started!");
      setLoading(false);
      return;
    }
    await addPlayerToRoom(code.toUpperCase(), name.trim());
    onJoin(code.toUpperCase(), name.trim());
    setLoading(false);
  };

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="title-block">
          <div className="title-badge">📸</div>
          <h1 className="game-title">PHOTO<br />ROULETTE</h1>
          <p className="subtitle">Whose camera roll is it anyway?</p>
        </div>

        <div className="home-card">
          <div className="input-group">
            <label>YOUR NAME</label>
            <input
              type="text"
              placeholder="Enter your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            className="btn btn-primary"
            onClick={createRoom}
            disabled={loading}
          >
            {loading ? "Creating..." : "🎲 Create Room"}
          </button>

          <div className="divider"><span>or join one</span></div>

          <div className="join-row">
            <input
              type="text"
              placeholder="Room code..."
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={5}
              className="code-input"
            />
            <button
              className="btn btn-secondary"
              onClick={joinRoom}
              disabled={loading}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
