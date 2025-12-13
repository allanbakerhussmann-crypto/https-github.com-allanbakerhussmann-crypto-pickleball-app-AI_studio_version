// services/firebase.ts
// HMR-safe Firebase initialization + Vite env (VITE_FIREBASE_*) + production Cloud Functions URL

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth as getFirebaseAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  updateDoc,
  writeBatch,
  limit,
  runTransaction,
  deleteDoc,
  orderBy,
  addDoc,
  type Firestore
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import type {
  Tournament,
  UserProfile,
  Registration,
  Team,
  Division,
  Match,
  PartnerInvite,
  Club,
  UserRole,
  ClubJoinRequest,
  Court,
  StandingsEntry,
  SeedingMethod,
  TieBreaker,
  GenderCategory,
  TeamPlayer,
  MatchTeam,
  Competition,
  CompetitionEntry,
  CompetitionType,
  Notification,
  AuditLog,
  TeamRoster
} from '../types';

/* ---------------------- Config helpers with validation ---------------------- */

const STORAGE_KEY = 'pickleball_firebase_config';
const requiredFields = ['apiKey', 'projectId', 'appId'];

function isValidConfig(cfg: any) {
  if (!cfg || typeof cfg !== 'object') return false;
  return requiredFields.every(k => typeof cfg[k] === 'string' && cfg[k].length > 0);
}

const getStoredConfig = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isValidConfig(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse stored config', e);
  }
  return null;
};

/* Vite-style env reader (import.meta.env) */
const getEnvConfig = () => {
  // Vite exposes env vars on import.meta.env (only available in client code)
  const env = (typeof import.meta !== 'undefined' ? (import.meta as any).env : {}) || {};

  if (env.VITE_FIREBASE_API_KEY) {
    const cfg = {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
    };
    if (isValidConfig(cfg)) return cfg;
  }
  return null;
};

const defaultConfig = {
  apiKey: 'AIzaSyBPeYXnPobCZ7bPH0g_2IYOP55-1PFTWTE',
  authDomain: 'pickleball-app-dev.firebaseapp.com',
  projectId: 'pickleball-app-dev',
  storageBucket: 'pickleball-app-dev.firebasestorage.app',
  messagingSenderId: '906655677998',
  appId: '1:906655677998:web:b7fe4bb2f479ba79c069bf',
  measurementId: 'G-WWLE6K6J7Z'
};

/* Use env (Vite) -> localStorage -> default */
const firebaseConfig = (() => {
  const env = getEnvConfig();
  if (env) return env;

  const stored = getStoredConfig();
  if (stored) return stored;

  if (!isValidConfig(defaultConfig)) {
    throw new Error('Default firebase config is invalid or missing required fields.');
  }
  return defaultConfig;
})();

/* ---------------------- Initialize App (safe for HMR) ---------------------- */

let app: FirebaseApp;
try {
  if (typeof getApps === 'function' && getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
} catch (e: any) {
  console.error('Firebase initialization failed.', e);
  throw new Error('Firebase initialization failed: ' + (e?.message || String(e)));
}

/* Lazy Auth instance so all modules use the same auth registered on our app */
let authInstance: Auth | null = null;
export const getAuth = (): Auth => {
  if (!authInstance) {
    authInstance = getFirebaseAuth(app);
    if (!authInstance) throw new Error('Auth not initialized');
  }
  return authInstance;
};

/* Firestore / Storage bound to the same app */
export const db: Firestore = getFirestore(app);
export const storage = getStorage(app);

export function assertFirestore() {
  if (!db) throw new Error('Firestore not initialized - cannot call collection/doc APIs');
  return db;
}

/* ---------------------- Utilities & Cloud Function Wrapper ---------------------- */

export const hasCustomConfig = () => !!localStorage.getItem(STORAGE_KEY);

export const saveFirebaseConfig = (configJson: string) => {
  try {
    JSON.parse(configJson); // Validate
    localStorage.setItem(STORAGE_KEY, configJson);
    window.location.reload(); // Reload to apply
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

/**
 * Helper to call deployed HTTP Cloud Functions (always uses deployed URL).
 * Attaches the user's Firebase ID token in Authorization header.
 */
export const callCloudFunction = async (name: string, data: any): Promise<any> => {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be logged in to perform this action.');
  }

  const projectId = firebaseConfig.projectId || defaultConfig.projectId;
  const region = 'us-central1';
  // ALWAYS use the deployed Cloud Functions URL (production style)
  const url = `https://${region}-${projectId}.cloudfunctions.net/${name}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error?.message || json.error || `Function ${name} failed with status ${response.status}`);
    }
    return json.result || json;
  } catch (e: any) {
    console.error(`Error calling ${name}:`, e);
    throw e;
  }
};

/* ---------------------- User helpers ---------------------- */

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) return null;
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const createUserProfile = async (userId: string, data: UserProfile) => {
  await setDoc(
    doc(db, 'users', userId),
    {
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    { merge: true }
  );
};

export const updateUserProfileDoc = async (userId: string, data: Partial<UserProfile>) => {
  await updateDoc(doc(db, 'users', userId), { ...data, updatedAt: Date.now() });
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
  const q = query(collection(db, 'users'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as UserProfile);
};

export const getUsersByIds = async (ids: string[]): Promise<UserProfile[]> => {
  if (!ids || !ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results = await Promise.all(
    chunks.map(chunk => getDocs(query(collection(db, 'users'), where('id', 'in', chunk))))
  );
  return results.flatMap(r => r.docs.map(d => d.data() as UserProfile));
};

export const searchUsers = async (term: string): Promise<UserProfile[]> => {
  const all = await getAllUsers(200);
  const lower = term.toLowerCase();
  return all.filter(
    u => (u.displayName?.toLowerCase().includes(lower) ?? false) || (u.email?.toLowerCase().includes(lower) ?? false)
  );
};

/* Admin role management */
const updateRole = async (uid: string, role: string, action: 'add' | 'remove') => {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;
  const currentRoles = (snap.data() as UserProfile).roles || [];
  let newRoles = [...currentRoles];
  if (action === 'add' && !newRoles.includes(role as any)) newRoles.push(role as any);
  if (action === 'remove') newRoles = newRoles.filter(r => r !== role);
  await updateDoc(userRef, { roles: newRoles, updatedAt: Date.now() });
};

export const promoteToAppAdmin = (uid: string) => updateRole(uid, 'admin', 'add');
export const demoteFromAppAdmin = (uid: string) => updateRole(uid, 'admin', 'remove');
export const promoteToOrganizer = (uid: string) => updateRole(uid, 'organizer', 'add');
export const demoteFromOrganizer = (uid: string) => updateRole(uid, 'organizer', 'remove');
export const promoteToPlayer = (uid: string) => updateRole(uid, 'player', 'add');
export const demoteFromPlayer = (uid: string) => updateRole(uid, 'player', 'remove');

/* ---------------------- Tournaments / Divisions ---------------------- */

export const subscribeToTournaments = (userId: string, callback: (t: Tournament[]) => void) => {
  const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    const tours = snap.docs.map(d => d.data() as Tournament);
    callback(tours);
  });
};

export const getAllTournaments = async (limitCount = 100): Promise<Tournament[]> => {
  const q = query(collection(db, 'tournaments'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Tournament);
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
  if (!id) return null;
  const snap = await getDoc(doc(db, 'tournaments', id));
  return snap.exists() ? (snap.data() as Tournament) : null;
};

export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
  const batch = writeBatch(db);
  batch.set(doc(db, 'tournaments', tournament.id), { ...tournament, updatedAt: Date.now() }, { merge: true });

  if (divisions) {
    divisions.forEach(div => {
      batch.set(doc(db, 'divisions', div.id), { ...div, tournamentId: tournament.id, updatedAt: Date.now() }, { merge: true });
    });
  }
  await batch.commit();
};

/* ---------------------- Teams ---------------------- */

export const subscribeToTeams = (tournamentId: string, callback: (t: Team[]) => void) => {
  const q = query(collection(db, 'teams'), where('tournamentId', '==', tournamentId));
  return onSnapshot(q, snap => callback(snap.docs.map(d => d.data() as Team)));
};

export const deleteTeam = async (_tournamentId: string, teamId: string) => {
  await deleteDoc(doc(db, 'teams', teamId));
};

export const createTeamServer = async (data: any) => {
  return callCloudFunction('createTeam', data);
};

export const getUserTeamsForTournament = async (
  eventId: string,
  userId: string,
  type: 'tournament' | 'competition'
): Promise<Team[]> => {
  const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
  const q = query(collection(db, 'teams'), where(field, '==', eventId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Team).filter(t => t.players?.includes(userId));
};

export const getOpenTeamsForDivision = async (eventId: string, divisionId: string, type: 'tournament' | 'competition') => {
  const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
  const q = query(
    collection(db, 'teams'),
    where(field, '==', eventId),
    where('divisionId', '==', divisionId),
    where('status', '==', 'pending_partner')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Team);
};

export const getTeamsForDivision = async (eventId: string, divisionId: string, type: 'tournament' | 'competition') => {
  const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
  const q = query(collection(db, 'teams'), where(field, '==', eventId), where('divisionId', '==', divisionId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Team);
};

/* ---------------------- Matches ---------------------- */

export const subscribeToMatches = (tournamentId: string, callback: (m: Match[]) => void) => {
  const q = query(collection(db, 'matches'), where('tournamentId', '==', tournamentId));
  return onSnapshot(q, snap => callback(snap.docs.map(d => d.data() as Match)));
};

export const updateMatchScore = async (tournamentId: string, matchId: string, updates: Partial<Match>) => {
  await updateDoc(doc(db, 'matches', matchId), { ...updates, lastUpdatedAt: Date.now() });
};

/* ---------------------- Courts ---------------------- */

export const subscribeToCourts = (tournamentId: string, callback: (c: Court[]) => void) => {
  const q = query(collection(db, 'courts'), where('tournamentId', '==', tournamentId));
  return onSnapshot(q, snap => callback(snap.docs.map(d => d.data() as Court)));
};

export const getCourts = async (tournamentId: string): Promise<Court[]> => {
  const q = query(collection(db, 'courts'), where('tournamentId', '==', tournamentId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Court);
};

export const addCourt = async (court: Court) => {
  await setDoc(doc(db, 'courts', court.id), { ...court, createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
};

export const updateCourt = async (courtId: string, data: Partial<Court>) => {
  await updateDoc(doc(db, 'courts', courtId), { ...data, updatedAt: Date.now() });
};

/* ---------------------- Partner invites / registrations ---------------------- */

export const subscribeToUserPartnerInvites = (userId: string, callback: (invites: PartnerInvite[]) => void) => {
  const q = query(collection(db, 'partnerInvites'), where('inviteeId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => d.data() as PartnerInvite)));
};

export const respondToPartnerInvite = async (invite: PartnerInvite, action: 'accepted' | 'declined') => {
  const ref = doc(db, 'partnerInvites', invite.id);
  await updateDoc(ref, { status: action, respondedAt: Date.now() });
  if (action === 'accepted') {
    // Create a registration for the invitee if required
    const regId = `registration_${Date.now()}`;
    await setDoc(doc(db, 'registrations', regId), {
      id: regId,
      tournamentId: invite.tournamentId,
      divisionId: invite.divisionId,
      userId: invite.inviteeId,
      status: 'active',
      createdAt: Date.now()
    });
    return { tournamentId: invite.tournamentId, divisionId: invite.divisionId };
  }
  return null;
};

export const ensureRegistrationForUser = async (tournamentId: string, userId: string, divisionId?: string) => {
  // Check if a registration already exists
  const q = query(collection(db, 'registrations'), where('tournamentId', '==', tournamentId), where('userId', '==', userId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].data() as Registration;
  }
  // Create minimal registration
  const id = `registration_${Date.now()}`;
  const data: Registration = {
  ... (truncated) ...
