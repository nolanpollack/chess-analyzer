export type GameResult = "win" | "loss" | "draw";
export type GameResultLetter = "W" | "L" | "D";
export type PlayerColor = "white" | "black";
export type TimeControlClass = "bullet" | "blitz" | "rapid" | "classical" | "daily";

// Server DTO — wire format, what listGames/getGame return per row
export type Game = {
  id: string;
  platformGameId: string;
  playedAt: string;              // ISO string, not Date
  timeControl: string;
  timeControlClass: TimeControlClass;
  resultDetail: string;
  playerColor: PlayerColor;
  playerRating: number;
  opponentUsername: string;
  opponentRating: number;
  openingEco: string | null;
  openingName: string | null;
  accuracyWhite: number | null;
  accuracyBlack: number | null;
  // Joined/computed
  analysisStatus: string | null;
  overallAccuracy: number | null;
  gameScore: number | null;
};

// UI projection — condensed shape for compact displays
export type GameSummary = {
  id: string;
  opp: string;
  oppElo: number | null;
  result: GameResultLetter;
  color: PlayerColor;
  score: number | null;
  acc: number | null;
  time: string;
  opening: string;
  when: string;
};
