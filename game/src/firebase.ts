import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, update, onValue, get, runTransaction } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbbUlK6WcdtvUOqwAFf6B1Q7axUI1ZiO0",
  authDomain: "rizzz-games.firebaseapp.com",
  databaseURL: "https://rizzz-games-default-rtdb.firebaseio.com",
  projectId: "rizzz-games",
  storageBucket: "rizzz-games.firebasestorage.app",
  messagingSenderId: "427004499416",
  appId: "1:427004499416:web:623f0bad814fc5a4340ead",
  measurementId: "G-JDHTPKBSR8"
};

type SongStatus =
  | 'locked'
  | 'unlocked-unplayed'
  | 'unlocked-one-star'
  | 'unlocked-two-star'
  | 'unlocked-three-star'
  | 'unlocked-gold';

const STATUS_ORDER: SongStatus[] = [
  'locked',
  'unlocked-unplayed',
  'unlocked-one-star',
  'unlocked-two-star',
  'unlocked-three-star',
  'unlocked-gold',
];

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
const auth = getAuth(app);

export const usersRef = ref(database, "users");

const initialSongsStatus = Array.from({ length: 9 }, (_, i) =>
  i === 0 ? 'unlocked-unplayed' : 'locked'
);

/**
 * Creates a new user entry (or overwrites if it exists).
 * @param userId   The unique ID for this user
 * @param coins    Initial coin count (int)
 * @param highScore Initial high score (int)
 */

export function writeUserData(userId: string, coins: number, highScore: number): Promise<void> {
    return set(ref(database, `users/${userId}`), {
        coins,
        high_score: highScore,
    });
}

export function initAnonymousUser(): Promise<string> {
    // start the anonymous sign-in
    signInAnonymously(auth).catch(console.error);
  
    // wait until the user object is ready
    return new Promise((resolve, reject) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const user_id = user.uid;
          const userRef = ref(database, `users/${user_id}`);
          // seed the record if it doesn’t exist
          const snap = await get(userRef);
          if (!snap.exists()) {
            await set(userRef, { coins: 0, high_score: 0, songs: initialSongsStatus});
          }
          resolve(user_id);
        } else {
          reject("Auth failed");
        }
      });
    });
}

export function getUserCoins(userId: string): Promise<number> {
    return get(ref(database, `users/${userId}/coins`))
        .then(snap => snap.exists() ? snap.val() : 0)
        .catch(err => {
            console.error("Failed to get user coins:", err);
            throw err;
        });
}

export function getUserHighScore(userId: string): Promise<number> {
    return get(ref(database, `users/${userId}/high_score`))
        .then(snap => snap.exists() ? snap.val() : 0)
        .catch(err => {
            console.error("Failed to get user high score:", err);
            throw err;
        });
}

export function updateUserCoins(userId: string, coinsToAdd: number): Promise<void> {
    const coinRef = ref(database, `users/${userId}/coins`);
    return runTransaction(coinRef, (currentCoins) => {
      // currentCoins may be null on first write
      return (currentCoins ?? 0) + coinsToAdd;
    })
    .then(result => {
      if (!result.committed) {
        console.warn("Coins transaction aborted");
      }
    })
    .catch(err => {
      console.error("Failed to update coins:", err);
      throw err;
    });
  }

export function updateUserHighScore(userId: string, newHighScore: number) {
    return update(ref(database, `users/${userId}`), { high_score: newHighScore });
}

// Subscribe to changes
export function subscribeToUser(userId: string, callback: (data: any) => void) {
    return onValue(ref(database, `users/${userId}`), snap => callback(snap.val()));
}

// Get all song statuses for a user
export function getUserSongs(userId: string): Promise<SongStatus[]> {
  return get(ref(database, `users/${userId}/songs`))
    .then(snap => snap.exists() ? snap.val() : [...initialSongsStatus])
    .catch(err => {
      console.error("Failed to get user songs:", err);
      throw err;
    });
}

// Update the status of a specific song by index (0-based)
export async function updateUserSongStatusToNext(
  userId: string,
  songIndex: number,
  currentRound: number
): Promise<void> {
  const songRef = ref(database, `users/${userId}/songs/${songIndex}`);

  try {
    const snap = await get(songRef);
    if (!snap.exists()) {
      throw new Error(`No status found for song ${songIndex}`);
    }

    const currentStatus = snap.val() as SongStatus;
    const currentIndex = STATUS_ORDER.indexOf(currentStatus);

    if (currentRound < currentIndex) {return;}

    if (currentIndex === -1 || currentIndex >= STATUS_ORDER.length - 1) {
      console.warn(`Song ${songIndex} is already at max status or invalid: ${currentStatus}`);
      return;
    }

    const nextStatus = STATUS_ORDER[currentIndex + 1];
    await set(songRef, nextStatus);
  } catch (err) {
    console.error(`Failed to update song ${songIndex} to next status:`, err);
    throw err;
  }
}
