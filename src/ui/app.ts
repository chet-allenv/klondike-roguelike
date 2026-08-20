import {
  createRun,
  REDEALS_PER_ROUND,
  resolveRound,
  type RoundResult,
  type RunState,
  targetForRound,
  UNDOS_PER_ROUND,
} from "../game/roguelike";
import { mountGame } from "./render";

/** Bootstraps and drives the full roguelike run: a sequence of Klondike hands. */
export function mountApp(root: HTMLElement): void {
  let run: RunState = createRun();

  function startRound() {
    const target = targetForRound(run.round);
    mountGame(root, {
      redealsAllowed: REDEALS_PER_ROUND,
      undosAllowed: UNDOS_PER_ROUND,
      target,
      roundInfo: { round: run.round, lives: run.lives },
      onHandEnd: ({ score }) => finishRound(score, target),
    });
  }

  function finishRound(score: number, target: number) {
    const outcome = resolveRound(run, score, target);
    run = outcome.run;
    showRoundResult(outcome.result, score, target);
  }

  function showRoundResult(result: RoundResult, score: number, target: number) {
    root.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "round-result";

    const heading = document.createElement("h2");
    heading.textContent = result === "won" ? "Round Cleared!" : "Round Lost";
    panel.appendChild(heading);

    const scoreLine = document.createElement("p");
    scoreLine.textContent = `Score: ${score} / ${target}`;
    panel.appendChild(scoreLine);

    if (run.gameOver) {
      const summary = document.createElement("p");
      const cleared = run.roundsCleared;
      summary.textContent = `Run over — ${cleared} round${cleared === 1 ? "" : "s"} cleared.`;
      panel.appendChild(summary);

      const restartBtn = document.createElement("button");
      restartBtn.className = "continue";
      restartBtn.textContent = "New Run";
      restartBtn.addEventListener("click", () => {
        run = createRun();
        startRound();
      });
      panel.appendChild(restartBtn);
    } else {
      const livesLine = document.createElement("p");
      livesLine.textContent = `Lives: ${run.lives}`;
      panel.appendChild(livesLine);

      const continueBtn = document.createElement("button");
      continueBtn.className = "continue";
      continueBtn.textContent = "Continue";
      continueBtn.addEventListener("click", startRound);
      panel.appendChild(continueBtn);
    }

    root.appendChild(panel);
  }

  startRound();
}
