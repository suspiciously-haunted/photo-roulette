import { doc, updateDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

export default function Results({ roomId, userId, players, onPlayAgain, onLeave }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const medals = ["🥇", "🥈", "🥉"];

  const clearPhotos = async () => {
    const snap = await getDocs(collection(db, "rooms", roomId, "photos"));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  };

  const playAgain = async () => {
    // Clear all photos so players upload fresh ones
    await clearPhotos();

    // Reset scores and guesses
    await Promise.all(players.map((p) =>
      updateDoc(doc(db, "rooms", roomId, "players", p.id), {
        score: 0, guess: null, guessTime: null, lastPoints: null,
      })
    ));

    await updateDoc(doc(db, "rooms", roomId), {
      status: "lobby",
      currentRound: 0,
      currentPhoto: null,
      usedPhotos: [],
    });

    onPlayAgain();
  };

  return (
    <div className="page results-page">
      <div className="results-header">
        <div className="trophy">🏆</div>
        <h2>Game Over!</h2>
        <p className="winner-announce">
          {winner?.name} wins with {winner?.score} point{winner?.score !== 1 ? "s" : ""}!
        </p>
      </div>

      <div className="final-scores">
        {sorted.map((player, i) => (
          <div key={player.id} className={`final-score-row ${i === 0 ? "winner-row" : ""}`}>
            <span className="medal">{medals[i] || `${i + 1}.`}</span>
            <span className="final-name">{player.name}{player.id === userId && " (you)"}</span>
            <span className="final-score">{player.score || 0} pts</span>
          </div>
        ))}
      </div>

      <div className="results-actions">
        <button className="btn btn-primary btn-large" onClick={playAgain}>
          🔄 Play Again
        </button>
        <button className="btn btn-ghost" onClick={onLeave}>
          🚪 Leave
        </button>
      </div>
    </div>
  );
}
