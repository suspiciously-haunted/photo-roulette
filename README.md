# 📸 Photo Roulette

A multiplayer web game where players upload photos from their camera roll and guess whose photo is being shown.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Firebase
1. Go to [firebase.google.com](https://firebase.google.com) and create a new project
2. In the Firebase console, enable these services:
   - **Firestore Database** (start in test mode)
   - **Storage** (start in test mode)
   - **Authentication** → Sign-in method → Enable **Anonymous**
3. Go to Project Settings → Your Apps → Add a Web App
4. Copy the config values into `src/firebase.js`

### 3. Firebase Storage Rules
In Firebase Console → Storage → Rules, paste:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 4. Firestore Rules
In Firebase Console → Firestore → Rules, paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Run the game
```bash
npm run dev
```

Open `http://localhost:5173` in multiple browser tabs or share with friends!

## How to Play
1. Enter your name and create a room (or join with a code)
2. Each player uploads 1–5 photos from their device
3. The host starts the game
4. A random photo appears — guess who it belongs to!
5. Correct guess = 1 point. If nobody guesses correctly, the owner gets 2 points
6. After all photos are used, the highest score wins 🏆

## File Structure
```
src/
├── firebase.js          ← Firebase config (fill in your keys)
├── App.jsx              ← Main app + routing
├── App.css              ← All styles
├── main.jsx             ← Entry point
├── hooks/
│   ├── useAuth.js       ← Anonymous sign-in
│   └── useRoom.js       ← Real-time Firestore listener
└── pages/
    ├── Home.jsx         ← Create/join room
    ├── Lobby.jsx        ← Upload photos, wait for players
    ├── Game.jsx         ← Guess the photo
    └── Results.jsx      ← Final scoreboard
```
