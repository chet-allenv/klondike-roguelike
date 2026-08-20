import "./style.css";
import { mountGame } from "./render";

const app = document.querySelector<HTMLDivElement>("#app")!;
mountGame(app);
