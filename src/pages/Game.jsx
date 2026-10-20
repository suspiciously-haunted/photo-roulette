import { useState, useEffect, useRef } from "react";
import { doc, updateDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useRoom } from "../hooks/useRoom";

const ROUND_TIME = 5;
const BREAKDOWN_SECS = 5;

const calcSpeedPoints = (msElapsed) => {
  const secTaken = Math.max(0.05, msElapsed / 1000);
  return Math.max(10.0, 100.0 / secTaken);
};

const FAKE_NAMES = [
  "Alex", "Jordan", "Morgan", "Taylor", "Casey", "Riley", "Jamie",
  "Quinn", "Avery", "Blake", "Cameron", "Drew", "Emery", "Finley",
];

function buildChoices(players, ownerId) {
  const owner = players.find((p) => p.id === ownerId);
  if (!owner) return players.slice(0, 4);
  const others = [...players.filter((p) => p.id !== ownerId)].sort(() => Math.random() - 0.5).slice(0, 3);
  const fakePool = [...FAKE_NAMES].sort(() => Math.random() - 0.5);
  while (others.length < 3) {
    const name = fakePool.pop();
    if (!name) break;
    if (!players.some((p) => p.name === name)) {
      others.push({ id: `fake_${name}`, name, fake: true });
    }
  }
  return [owner, ...others].sort(() => Math.random() - 0.5);
}

// Persist choices in sessionStorage keyed by photo url so refresh restores them
function saveChoices(photoUrl, choices) {
  try { sessionStorage.setItem(`choices_${photoUrl}`, JSON.stringify(choices)); } catch {}
}
function loadChoices(photoUrl) {
  try { return JSON.parse(sessionStorage.getItem(`choices_${photoUrl}`)) || null; } catch { return null; }
}

export default function Game({ roomId, userId }) {
  const { room, players, photos } = useRoom(roomId);

  // "guessing" = show photo + buttons, "breakdown" = show who chose what
  const [phase, setPhase] = useState("guessing");
  const [myGuess, setMyGuess] = useState(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [breakdownLeft, setBreakdownLeft] = useState(BREAKDOWN_SECS);
  const [advancing, setAdvancing] = useState(false);
  const [choices, setChoices] = useState([]);

  const roundStartRef = useRef(null);
  const revealedRef = useRef(false);
  const breakdownTimerRef = useRef(null);

  const isHost = room?.hostId === userId;
  const currentPhoto = room?.currentPhoto;
  const allGuessed = players.length > 0 && players.every((p) => p.guess !== null);

  // On new round (photo changes): reset everything, build choices
  useEffect(() => {
    if (!currentPhoto) return;
    setPhase("guessing");
    revealedRef.current = false;
    setMyGuess(null);
    setTimeLeft(ROUND_TIME);
    setBreakdownLeft(BREAKDOWN_SECS);
    setAdvancing(false);
    roundStartRef.current = Date.now();
    clearInterval(breakdownTimerRef.current);

    // Restore choices from sessionStorage (survives refresh), or build fresh
    const saved = loadChoices(currentPhoto.url);
    if (saved && saved.length > 0) {
      setChoices(saved);
    } else if (players.length > 0) {
      const c = buildChoices(players, currentPhoto.ownerId);
      setChoices(c);
      saveChoices(currentPhoto.url, c);
    }
  }, [currentPhoto?.url]);

  // Build choices once players arrive if not yet built
  useEffect(() => {
    if (currentPhoto && players.length > 0 && choices.length === 0) {
      const saved = loadChoices(currentPhoto.url);
      const c = saved?.length ? saved : buildChoices(players, currentPhoto.ownerId);
      setChoices(c);
      saveChoices(currentPhoto.url, c);
    }
  }, [players.length]);

  // Restore myGuess from players data after a refresh
  useEffect(() => {
    const me = players.find((p) => p.id === userId);
    if (me?.guess && !myGuess) setMyGuess(me.guess);
    if (me?.phase === "breakdown" && phase === "guessing") setPhase("breakdown");
  }, [players]);

  // Guessing countdown
  useEffect(() => {
    if (phase !== "guessing" || !currentPhoto) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;
        if (next <= 0) clearInterval(interval);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentPhoto?.url, phase]);

  // Trigger reveal when time runs out or everyone guessed
  useEffect(() => {
    if (phase === "guessing" && (timeLeft <= 0 || allGuessed) && !revealedRef.current && currentPhoto) {
      triggerReveal();
    }
  }, [timeLeft, allGuessed, phase]);

  // Breakdown auto-advance (host drives it, others follow via Firestore)
  useEffect(() => {
    if (phase !== "breakdown") return;
    setBreakdownLeft(BREAKDOWN_SECS);
    const interval = setInterval(() => {
      setBreakdownLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          if (isHost) nextRound();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    breakdownTimerRef.current = interval;
    return () => clearInterval(interval);
  }, [phase]);

  const triggerReveal = async () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setPhase("breakdown");

    if (!isHost) return;

    const owner = currentPhoto.ownerId;
    let anyCorrect = false;
    const updates = [];

    for (const player of players) {
      if (player.guess === owner) {
        anyCorrect = true;
        const pts = calcSpeedPoints(player.guessMs ?? ROUND_TIME * 1000);
        updates.push(updateDoc(doc(db, "rooms", roomId, "players", player.id), {
          score: (player.score || 0) + pts,
          lastPoints: pts,
          tooSlow: false,
          phase: "breakdown",
        }));
      } else if (player.guess === null) {
        updates.push(updateDoc(doc(db, "rooms", roomId, "players", player.id), {
          lastPoints: 0, tooSlow: true, phase: "breakdown",
        }));
      } else {
        updates.push(updateDoc(doc(db, "rooms", roomId, "players", player.id), {
          lastPoints: 0, tooSlow: false, phase: "breakdown",
        }));
      }
    }

    if (!anyCorrect) {
      const owner_ = players.find((p) => p.id === owner);
      if (owner_) {
        // Override the owner's update with bonus points
        updates.push(updateDoc(doc(db, "rooms", roomId, "players", owner), {
          score: (owner_.score || 0) + 3,
          lastPoints: 3,
          tooSlow: false,
          phase: "breakdown",
        }));
      }
    }

    await Promise.all(updates);
  };

  const submitGuess = async (guessedId) => {
    if (phase !== "guessing" || guessedId.startsWith?.("fake_")) return;
    setMyGuess(guessedId);
    const msElapsed = Date.now() - (roundStartRef.current || Date.now());
    await updateDoc(doc(db, "rooms", roomId, "players", userId), {
      guess: guessedId,
      guessMs: msElapsed,
    });
  };

  const nextRound = async () => {
    if (advancing) return;
    setAdvancing(true);
    clearInterval(breakdownTimerRef.current);

    const usedPhotos = room.usedPhotos || [];
    const available = photos.filter((p) => !usedPhotos.includes(p.id));

    await Promise.all(players.map((p) =>
      updateDoc(doc(db, "rooms", roomId, "players", p.id), {
        guess: null, guessMs: null, lastPoints: null, tooSlow: false, phase: "guessing",
      })
    ));

    const maxRounds = room.maxRounds || players.length * 5;
    const roundsDone = room.currentRound || 0;

    if (available.length === 0 || roundsDone >= maxRounds) {
      await clearPhotos();
      await updateDoc(doc(db, "rooms", roomId), { status: "results" });
    } else {
      const next = available[Math.floor(Math.random() * available.length)];
      await updateDoc(doc(db, "rooms", roomId), {
        currentPhoto: next,
        currentRound: roundsDone + 1,
        usedPhotos: [...usedPhotos, next.id],
      });
    }
    setAdvancing(false);
  };

  const clearPhotos = async () => {
    const snap = await getDocs(collection(db, "rooms", roomId, "photos"));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  };

  const correctOwner = players.find((p) => p.id === currentPhoto?.ownerId);
  const timerPct = (timeLeft / ROUND_TIME) * 100;
  const maxRounds = room?.maxRounds || players.length * 5;

  // ── BREAKDOWN SCREEN ──────────────────────────────────────────────────────
  if (phase === "breakdown") {
    return (
      <div className="page breakdown-page">
        <div className="breakdown-header">
          <div className="round-badge">Round {room?.currentRound} / {maxRounds}</div>
          <div className="breakdown-countdown">{breakdownLeft}s</div>
        </div>

        <div className="photo-area">
          {currentPhoto && <img src={currentPhoto.url} alt="" className="game-photo" />}
        </div>

        <div className="reveal-banner">
          📸 It was <strong>{correctOwner?.name}</strong>'s photo!
        </div>

        {/* Show each choice and who picked it */}
        <div className="breakdown-choices">
          {choices.map((choice) => {
            const isOwner = choice.id === currentPhoto?.ownerId;
            const whoChose = players.filter((p) => p.guess === choice.id);
            return (
              <div key={choice.id} className={`breakdown-choice ${isOwner ? "breakdown-correct" : ""}`}>
                <div className="breakdown-choice-label">
                  <span className="breakdown-name">{choice.name}</span>
                  {isOwner && <span className="breakdown-owner-tag">✓ owner</span>}
                </div>
                <div className="breakdown-guessers">
                  {whoChose.length === 0 ? (
                    <span className="breakdown-nobody">nobody</span>
                  ) : (
                    whoChose.map((p) => (
                      <span key={p.id} className={`breakdown-guesser ${isOwner ? "correct-guesser" : "wrong-guesser"}`}>
                        {p.name}{p.id === userId && " (you)"}
                        {p.lastPoints > 0 && ` +${parseFloat(p.lastPoints).toFixed(1)}pts`}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Too slow players */}
          {(() => {
            const slow = players.filter((p) => p.tooSlow);
            if (!slow.length) return null;
            return (
              <div className="breakdown-choice breakdown-too-slow">
                <div className="breakdown-choice-label">
                  <span className="breakdown-name">⏱ Too slow</span>
                </div>
                <div className="breakdown-guessers">
                  {slow.map((p) => (
                    <span key={p.id} className="breakdown-guesser slow-guesser">
                      {p.name}{p.id === userId && " (you)"}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {!isHost && <p className="waiting-msg">⏳ Next round in {breakdownLeft}s...</p>}
      </div>
    );
  }

  // ── GUESSING SCREEN ───────────────────────────────────────────────────────
  return (
    <div className="page game-page">
      <div className="game-header">
        <div className="round-badge">Round {room?.currentRound} / {maxRounds}</div>
        <div className={`timer ${timeLeft <= 3 ? "urgent" : ""}`}>{timeLeft}s</div>
      </div>

      <div className="timer-bar-track">
        <div
          className={`timer-bar-fill ${timeLeft <= 3 ? "urgent" : ""}`}
          style={{ width: `${timerPct}%`, transition: "width 1s linear" }}
        />
      </div>

      <div className="photo-area">
        {currentPhoto && <img src={currentPhoto.url} alt="Guess who!" className="game-photo" />}
      </div>

      <div className="guess-section">
        <h3>{myGuess ? "→ Tap another to change" : "Whose photo is this?"}</h3>
        <div className="guess-grid">
          {choices.map((choice) => {
            const iGuessed = myGuess === choice.id;
            return (
              <button
                key={choice.id}
                className={`guess-btn ${iGuessed ? "my-guess" : ""}`}
                onClick={() => submitGuess(choice.id)}
              >
                <span className="guess-name">{choice.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
