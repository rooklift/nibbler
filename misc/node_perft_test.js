// Evil hack to run a Perft test in Node rather than Electron.

const fs = require("fs");

const FEN = "Qr3knr/P1bp1p1p/2pn1q2/4p3/2PP2pB/1p1N1bP1/BP2PP1P/1R3KNR w BHbh - 0 1";
const DEPTH = 5;

const sources = ["../20_utils.js", "../30_point.js", "../40_position.js", "../41_fen.js", "../42_perft.js"];

let concat = "";

for (let source of sources) {
	let s = fs.readFileSync(source, "utf8");
	concat += "\n" + s + "\n";
}

concat += `Perft("${FEN}", ${DEPTH});`;

eval(concat);
