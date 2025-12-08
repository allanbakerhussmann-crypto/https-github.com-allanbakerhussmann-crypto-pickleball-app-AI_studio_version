import React, { useState, useEffect } from 'react';
import type { Tournament, Division, UserProfile, Team, TournamentRegistration } from '../types';
import { 
  subscribeToDivisions, 
  getUserTeamsForTournament, 
  getRegistration, 
  saveRegistration 
} from '../services/firebase';

interface TournamentEventSelectionProps {
  tournament: Tournament;
  userProfile: UserProfile;
  initialDivisionId?: string;
  onCancel?: () => void;
  onNext: (selectedEventIds: string[]) => void;
}

// Calculate age from birthDate string (YYYY-MM-DD)
const getAge = (birthDateString?: string) => {
  if (!birthDateString) return null;
  const today = new Date();
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Returns eligibility status and reason for a division
const checkEligibility = (div: Division, user: UserProfile): { eligible: boolean; reason?: string } => {
  // 1. Gender restriction
  if (div.gender === 'men' && user.gender !== 'male') {
    return { eligible: false, reason: 'Men only' };
  }
  if (div.gender === 'women' && user.gender !== 'female') {
    return { eligible: false, reason: 'Women only' };
  }
  // 2. Age restriction
  const age = getAge(user.birthDate);
  if (div.minAge || div.maxAge) {
    if (age === null) return { eligible: false, reason: 'Profile missing Birth Date' };
    if (div.minAge && age < div.minAge) return { eligible: false, reason: `Too young (Age ${age} < ${div.minAge})` };
    if (div.maxAge && age > div.maxAge) return { eligible: false, reason: `Too old (Age ${age} > ${div.maxAge})` };
  }
  // 3. Rating restriction
  const userRating = div.type === 'doubles' ? user.duprDoublesRating : user.duprSinglesRating;
  if (div.minRating || div.maxRating) {
    if (userRating === undefined || userRating === null) {
      return { eligible: false, reason: 'Profile missing DUPR Rating' };
    }
    if (div.minRating && userRating < div.minRating) {
      return { eligible: false, reason: `Rating too low (${userRating.toFixed(2)} < ${div.minRating})` };
    }
    if (div.maxRating && userRating > div.maxRating) {
      return { eligible: false, reason: `Rating too high (${userRating.toFixed(2)} > ${div.maxRating})` };
    }
  }
  return { eligible: true };
};

export const TournamentEventSelection: React.FC<TournamentEventSelectionProps> = ({ 
  tournament, 
  userProfile, 
  initialDivisionId, 
  onCancel, 
  onNext 
}) => {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [regData, setRegData] = useState<TournamentRegistration | null>(null);
  const [existingTeamsByDivision, setExistingTeamsByDivision] = useState<Record<string, Team>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to divisions for this tournament
    const unsubscribe = subscribeToDivisions(tournament.id, setDivisions);
    // Load any existing team registrations for this user (to mark already registered divisions)
    const loadExistingTeams = async () => {
      const teams = await getUserTeamsForTournament(tournament.id, userProfile.id);
      const teamMap: Record<string, Team> = {};
      teams.forEach(team => { teamMap[team.divisionId] = team; });
      setExistingTeamsByDivision(teamMap);
    };
    loadExistingTeams();
    // Initialize or fetch the registration document for this user/tournament
    const initRegistration = async () => {
      if (!userProfile.id) return;
      let reg = await getRegistration(tournament.id, userProfile.id);
      if (!reg) {
        reg = {
          id: `${userProfile.id}_${tournament.id}`,
          tournamentId: tournament.id,
          playerId: userProfile.id,
          status: 'in_progress',
          waiverAccepted: false,
          selectedEventIds: initialDivisionId ? [initialDivisionId] : [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as TournamentRegistration;
        await saveRegistration(reg);
      } else {
        // If an initial invited division is provided and not already in reg, include it
        if (initialDivisionId && !reg.selectedEventIds.includes(initialDivisionId)) {
          reg.selectedEventIds = [...reg.selectedEventIds, initialDivisionId];
          reg.updatedAt = Date.now();
          await saveRegistration(reg);
        }
      }
      setRegData(reg);
      setLoading(false);
    };
    initRegistration();
    return () => unsubscribe();
  }, [tournament.id, userProfile.id, initialDivisionId]);

  const handleSave = async (updates: Partial<TournamentRegistration>) => {
    if (!regData) return;
    const updatedReg = { ...regData, ...updates, updatedAt: Date.now() } as TournamentRegistration;
    setRegData(updatedReg);
    await saveRegistration(updatedReg);
  };

  if (loading || !regData) {
    return <div className="p-10 text-white text-center">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 animate-fade-in">
      <h1 className="text-3xl font-bold text-white mb-6">Register for {tournament.name}</h1>
      <p className="text-gray-300 mb-4">
        {initialDivisionId ? 'You have been invited to join the following event (pre-selected below):' : 'Select the event(s) you want to play in:'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {divisions.map(div => {
          const { eligible, reason } = checkEligibility(div, userProfile);
          const isSelected = regData.selectedEventIds.includes(div.id);
          const hasExistingTeam = !!existingTeamsByDivision[div.id];
          return (
            <div
              key={div.id}
              onClick={() => {
                if (!eligible) return;
                // If this division is the invited one, do not allow deselecting it
                if (initialDivisionId && div.id === initialDivisionId && isSelected) return;
                const current = regData.selectedEventIds;
                const nextSelected = current.includes(div.id)
                  ? current.filter(x => x !== div.id)
                  : [...current, div.id];
                handleSave({ selectedEventIds: nextSelected });
              }}
              className={`p-4 rounded border flex justify-between items-center transition-all ${
                !eligible
                  ? 'bg-gray-800 border-gray-700 opacity-60 cursor-not-allowed'
                  : isSelected
                    ? `bg-green-900/40 border-green-500 ${initialDivisionId && div.id === initialDivisionId ? 'cursor-not-allowed' : 'cursor-pointer'} shadow-[0_0_10px_rgba(34,197,94,0.1)]`
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer'
              }`}
            >
              <div>
                <div className={`font-bold ${isSelected ? 'text-green-400' : 'text-white'}`}>{div.name}</div>
                <div className="text-xs text-gray-400 mt-1 flex gap-2">
                  <span className="capitalize">{div.type}</span>
                  <span>•</span>
                  <span className="capitalize">{div.gender}</span>
                  {div.minRating && <span>• {div.minRating}+ Rating</span>}
                  {div.minAge && <span>• Age {div.minAge}+</span>}
                </div>
              </div>
              {!eligible ? (
                <div className="text-xs font-bold text-red-400 border border-red-900 bg-red-900/20 px-2 py-1 rounded whitespace-nowrap">
                  {reason}
                </div>
              ) : hasExistingTeam ? (
                <div className="text-xs font-bold text-gray-300 border border-gray-600 bg-gray-900 px-2 py-1 rounded whitespace-nowrap">
                  Currently Registered
                </div>
              ) : isSelected ? (
                <div className="text-green-500 font-bold text-xl">✓</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Eligibility note and action buttons */}
      {onCancel ? (
        <>
          <p className="text-xs text-gray-500 mt-6">* Eligibility is based on your Profile.</p>
          <div className="flex justify-between items-center border-t border-gray-700 pt-4 mt-4">
            <button 
              onClick={onCancel} 
              className="text-gray-400 hover:text-white px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={() => onNext(regData.selectedEventIds)}
              disabled={regData.selectedEventIds.length === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-8 py-2 rounded font-bold transition-colors"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <div className="flex justify-between items-center mt-6 border-t border-gray-700 pt-4">
          <div className="text-xs text-gray-500">
            * Eligibility is based on your Profile.
          </div>
          <button
            onClick={() => onNext(regData.selectedEventIds)}
            disabled={regData.selectedEventIds.length === 0}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-8 py-2 rounded font-bold transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
