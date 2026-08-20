import { beforeEach, describe, expect, it } from "vitest";
import { BASE_TARGET, STARTING_LIVES } from "../game/roguelike";
import { mountApp } from "./app";

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
  mountApp(root);
});

describe("mountApp — round 1", () => {
  it("renders a playable board", () => {
    expect(root.querySelectorAll(".pile.stock")).toHaveLength(1);
    expect(root.querySelectorAll(".tableau-row .column")).toHaveLength(7);
  });

  it("shows round 1's target and starting lives in the HUD", () => {
    const scoreText = root.querySelector(".hud .score")?.textContent ?? "";
    expect(scoreText).toBe(`Score: 0 / ${BASE_TARGET}`);

    const roundInfo = root.querySelector(".hud .round-info")?.textContent ?? "";
    expect(roundInfo).toContain("Round 1");
    expect(roundInfo).toContain(String(STARTING_LIVES));
  });

  it("shows the round's redeal and undo allotments, and hides the freeplay New Game button", () => {
    expect(root.querySelector(".hud .redeals")).not.toBeNull();
    expect(root.querySelector(".hud .undos-left")).not.toBeNull();
    expect(root.querySelector(".new-game")).toBeNull();
  });
});
