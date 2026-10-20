import { useState } from "react";
import { addDoc, collection, doc, updateDoc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useRoom } from "../hooks/useRoom";

const MAX_PHOTOS = 20;
const MAX_SIZE_BYTES = 500 * 1024; // tighter limit since we allow more photos

export default function Lobby({ roomId, userId, playerName }) {
  const { room, players, photos } = useRoom(roomId);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState([]); // {dataUrl, file} awaiting approval
  const [myApprovedPhotos, setMyApprovedPhotos] = useState([]);
  const [starting, setStarting] = useState(false);

  const isHost = room?.hostId === userId;
  const myUploadCount = photos.filter((p) => p.ownerId === userId).length;
  const remainingSlots = MAX_PHOTOS - myUploadCount;
  const canStart =
    players.length >= 2 &&
    players.every((p) => photos.filter((ph) => ph.ownerId === p.id).length >= 1);

  const compressToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_DIM = 800;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
          else { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        const tryEncode = () => {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const bytes = Math.ceil((dataUrl.split(",")[1].length * 3) / 4);
          if (bytes <= MAX_SIZE_BYTES || quality <= 0.2) resolve(dataUrl);
          else { quality -= 0.1; tryEncode(); }
        };
        tryEncode();
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
      img.src = objectUrl;
    });
  };

  // Pick random photos from the file picker and show them for approval one by one
  const handlePickPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";

    // Shuffle and pick up to remainingSlots
    const shuffled = files.sort(() => Math.random() - 0.5).slice(0, remainingSlots);

    setUploadError("");
    setUploadProgress({ done: 0, total: shuffled.length });

    const compressed = [];
    for (let i = 0; i < shuffled.length; i++) {
      try {
        const dataUrl = await compressToBase64(shuffled[i]);
        compressed.push(dataUrl);
      } catch {
        // skip unreadable files
      }
      setUploadProgress({ done: i + 1, total: shuffled.length });
    }
    setUploadProgress(null);

    if (compressed.length === 0) {
      setUploadError("No valid photos found. Try again.");
      return;
    }

    // Show them for approval one at a time
    setPendingPhotos(compressed);
  };

  const approvePhoto = async (dataUrl) => {
    // Save to Firestore
    await addDoc(collection(db, "rooms", roomId, "photos"), {
      url: dataUrl,
      ownerId: userId,
      ownerName: playerName,
    });
    setMyApprovedPhotos((prev) => [...prev, dataUrl]);
    setPendingPhotos((prev) => prev.slice(1));
  };

  const rejectPhoto = () => {
    setPendingPhotos((prev) => prev.slice(1));
  };

  // Clear all photos from Firestore before starting
  const startGame = async () => {
    setStarting(true);
    const allPhotos = photos;
    const randomPhoto = allPhotos[Math.floor(Math.random() * allPhotos.length)];
    const maxRounds = players.length * 5;
    await updateDoc(doc(db, "rooms", roomId), {
      maxRounds,
      status: "playing",
      currentPhoto: randomPhoto,
      currentRound: 1,
      usedPhotos: [randomPhoto.id],
    });
    setStarting(false);
  };

  // Approval screen — shown when there's a pending photo
  if (pendingPhotos.length > 0) {
    return (
      <div className="page approval-page">
        <div className="approval-header">
          <h2>Random pick — keep it?</h2>
          <p className="approval-sub">We randomly selected this from your photos</p>
        </div>
        <div className="approval-photo-wrap">
          <img src={pendingPhotos[0]} className="approval-photo" alt="pending" />
        </div>
        <div className="approval-count">
          Photo {myApprovedPhotos.length + 1} of up to {myApprovedPhotos.length + pendingPhotos.length}
        </div>
        <div className="approval-actions">
          <button className="btn-reject" onClick={rejectPhoto}>✕ Skip</button>
          <button className="btn-approve" onClick={() => approvePhoto(pendingPhotos[0])}>✓ Allow</button>
        </div>
        <p className="approval-hint">Skip it and we'll try another random one.</p>
      </div>
    );
  }

  return (
    <div className="page lobby-page">
      <div className="lobby-header">
        <h2>Room Code</h2>
        <div className="room-code">{roomId}</div>
        <p className="share-hint">Share this code with friends!</p>
      </div>

      <div className="lobby-content">
        <div className="lobby-section">
          <h3>Players ({players.length})</h3>
          <div className="player-list">
            {players.map((p) => {
              const count = photos.filter((ph) => ph.ownerId === p.id).length;
              return (
                <div key={p.id} className="player-chip">
                  <span className="player-name">
                    {p.name} {p.id === userId && "(you)"}
                    {room?.hostId === p.id && " 👑"}
                  </span>
                  <span className={`photo-count ${count > 0 ? "ready" : ""}`}>
                    {count > 0 ? `${count} photo${count > 1 ? "s" : ""} ✓` : "no photos yet"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lobby-section">
          <h3>Your Photos ({myUploadCount}/{MAX_PHOTOS})</h3>
          <p className="upload-hint">
            Select your entire camera roll and we'll randomly pick photos for you to approve or skip.
          </p>

          {myApprovedPhotos.length > 0 && (
            <div className="photo-preview-grid">
              {myApprovedPhotos.map((url, i) => (
                <img key={i} src={url} alt="" className="photo-thumb" />
              ))}
            </div>
          )}

          {uploadProgress && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
              </div>
              <p className="progress-text">Reading photos {uploadProgress.done}/{uploadProgress.total}...</p>
            </div>
          )}

          {uploadError && <p className="error-msg">{uploadError}</p>}

          {remainingSlots > 0 && !uploadProgress && (
            <label className="upload-btn">
              📂 Open Camera Roll — select all your photos
              <input type="file" accept="image/*" multiple onChange={handlePickPhotos} style={{ display: "none" }} />
            </label>
          )}

          {remainingSlots === 0 && <p className="upload-done">✅ All {MAX_PHOTOS} photos approved!</p>}
        </div>

        {isHost && (
          <div className="host-controls">
            {!canStart && (
              <p className="start-hint">
                {players.length < 2 ? "Need at least 2 players to start" : "Waiting for all players to add at least 1 photo..."}
              </p>
            )}
            <button
              className={`btn btn-primary btn-large ${!canStart ? "disabled" : ""}`}
              onClick={startGame}
              disabled={!canStart || starting}
            >
              {starting ? "Starting..." : "🚀 Start Game"}
            </button>
          </div>
        )}

        {!isHost && <p className="waiting-msg">⏳ Waiting for the host to start the game...</p>}
      </div>
    </div>
  );
}
