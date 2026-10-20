import { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../firebase";

export function useRoom(roomId) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!roomId) return;

    const unsub = onSnapshot(doc(db, "rooms", roomId), (snap) => {
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() });
    });

    const unsubPlayers = onSnapshot(
      collection(db, "rooms", roomId, "players"),
      (snap) => {
        setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    const unsubPhotos = onSnapshot(
      collection(db, "rooms", roomId, "photos"),
      (snap) => {
        setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsub();
      unsubPlayers();
      unsubPhotos();
    };
  }, [roomId]);

  return { room, players, photos };
}
