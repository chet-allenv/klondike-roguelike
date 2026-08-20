import "./ui/style.css";
import { mountGame } from "./ui/render";

const app = document.querySelector<HTMLDivElement>("#app")!;
mountGame(app);
