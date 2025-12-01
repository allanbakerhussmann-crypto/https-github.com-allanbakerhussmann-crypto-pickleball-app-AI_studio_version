import React from "react";

/**
 * Shared status types for courts and matches in the allocation view.
 * We keep them narrow and focused on what the court board needs.
 * Later we can align these with your global types in types.ts if you like.
 */
export type MatchStatus = "WAITING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export type CourtStatus = "AVAILABLE" | "ASSIGNED" | "IN_USE" | "OUT_OF_SERVICE";

export interface Court {
  id: string;
  name: string;
  status: CourtStatus;
  currentMatchId?: string;
}

/**
 * This is a "view model" for matches on the court board.
 * It doesn't care about every tournament field, only what we need to show.
 * We'll map your real match objects into this shape in the parent component.
 */
export interface CourtMatch {
  id: string;
  division: string;
  roundLabel: string; // e.g. "Round 1", "Pool A", etc.
  matchLabel: string; // e.g. "Match 3"
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  courtId?: string;
}

interface CourtAllocationProps {
  courts: Court[];
  matches: CourtMatch[];

  // Called when the organizer assigns a waiting match to a court
  onAssignMatchToCourt: (matchId: string, courtId: string) => void;

  // Called when the organizer (or later, players) start a match on a court
  onStartMatchOnCourt: (courtId: string) => void;

  // Called when the match on a court is finished (scores submitted)
  onFinishMatchOnCourt: (courtId: string) => void;
}

/**
 * CourtAllocation is now a "real" component:
 * - It shows whatever courts + matches you pass in
 * - It notifies the parent when actions happen
 * - It does NOT store its own mock data
 *
 * The parent (e.g. TournamentManager) will:
 * - Load real data from Firebase
 * - Hold the state
 * - Pass down courts + matches + handlers
 */
const CourtAllocation: React.FC<CourtAllocationProps> = ({
  courts,
  matches,
  onAssignMatchToCourt,
  onStartMatchOnCourt,
  onFinishMatchOnCourt,
}) => {
  // Waiting = not yet assigned to any court
  const waitingMatches = matches.filter((m) => m.status === "WAITING");

  // Helper to find the match currently on a court
  const getMatchForCourt = (court: Court): CourtMatch | undefined =>
    matches.find((m) => m.id === court.currentMatchId);

  const renderMatchStatusBadge = (status: MatchStatus) => {
    const base =
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold";
    switch (status) {
      case "WAITING":
        return <span className={`${base} bg-yellow-100`}>Waiting</span>;
      case "ASSIGNED":
        return <span className={`${base} bg-blue-100`}>Assigned</span>;
      case "IN_PROGRESS":
        return <span className={`${base} bg-green-100`}>In Progress</span>;
      case "COMPLETED":
        return <span className={`${base} bg-gray-200`}>Completed</span>;
      default:
        return null;
    }
  };

  const renderCourtStatusBadge = (status: CourtStatus) => {
    const base =
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold";
    switch (status) {
      case "AVAILABLE":
        return <span className={`${base} bg-green-100`}>Available</span>;
      case "ASSIGNED":
        return <span className={`${base} bg-blue-100`}>Assigned</span>;
      case "IN_USE":
        return <span className={`${base} bg-red-100`}>In Use</span>;
      case "OUT_OF_SERVICE":
        return <span className={`${base} bg-gray-300`}>Out of Service</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Court Allocation</h1>
          <p className="text-sm text-gray-600">
            Assign matches to courts, start and finish matches in real time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Waiting Matches */}
        <div className="lg:col-span-1 border rounded-lg p-3 bg-white">
          <h2 className="font-semibold mb-2">Waiting Matches</h2>
          {waitingMatches.length === 0 ? (
            <p className="text-sm text-gray-500">No matches waiting.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {waitingMatches.map((match) => (
                <div
                  key={match.id}
                  className="border rounded p-2 text-sm bg-slate-50"
                >
                  <div className="flex justify-between">
                    <div className="font-medium">{match.division}</div>
                    {renderMatchStatusBadge(match.status)}
                  </div>
                  <div className="text-xs text-gray-600">
                    {match.roundLabel} • {match.matchLabel}
                  </div>
                  <div className="mt-1">
                    <div>{match.teamAName}</div>
                    <div>vs</div>
                    <div>{match.teamBName}</div>
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs text-gray-600 mb-1">
                      Assign to court:
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {courts
                        .filter((c) => c.status === "AVAILABLE")
                        .map((court) => (
                          <button
                            key={court.id}
                            className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                            onClick={() =>
                              onAssignMatchToCourt(match.id, court.id)
                            }
                          >
                            {court.name}
                          </button>
                        ))}
                      {courts.filter((c) => c.status === "AVAILABLE").length ===
                        0 && (
                        <span className="text-xs text-gray-500">
                          No available courts.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Courts */}
        <div className="lg:col-span-2 border rounded-lg p-3 bg-white">
          <h2 className="font-semibold mb-2">Courts</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {courts.map((court) => {
              const match = getMatchForCourt(court);
              return (
                <div
                  key={court.id}
                  className="border rounded p-3 bg-slate-50 flex flex-col justify-between min-h-[140px]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{court.name}</div>
                      <div className="mt-1">
                        {renderCourtStatusBadge(court.status)}
                      </div>
                    </div>
                    {match && renderMatchStatusBadge(match.status)}
                  </div>

                  <div className="mt-2 text-sm">
                    {match ? (
                      <>
                        <div className="text-xs text-gray-600">
                          {match.division} • {match.roundLabel} •{" "}
                          {match.matchLabel}
                        </div>
                        <div className="mt-1">
                          <div>{match.teamAName}</div>
                          <div>vs</div>
                          <div>{match.teamBName}</div>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">
                        No match assigned.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2 flex-wrap">
                    {court.status === "ASSIGNED" && (
                      <button
                        className="px-2 py-1 text-xs border rounded hover:bg-green-100"
                        onClick={() => onStartMatchOnCourt(court.id)}
                      >
                        Start Match
                      </button>
                    )}
                    {court.status === "IN_USE" && (
                      <button
                        className="px-2 py-1 text-xs border rounded hover:bg-blue-100"
                        onClick={() => onFinishMatchOnCourt(court.id)}
                      >
                        Finish Match
                      </button>
                    )}
                    {court.status === "AVAILABLE" && !match && (
                      <span className="text-xs text-gray-500">
                        Waiting for assignment…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourtAllocation;
