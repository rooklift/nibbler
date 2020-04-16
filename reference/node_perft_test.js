// Evil hack to run a Perft test in Node rather than electron.

const fs = require("fs");

const FEN = "Q1r2knr/P1bp1p1p/2pn1q2/4p3/2PP2pB/1p3bP1/BP2PP1P/2R1NKNR w CHch - 0 1";
const DEPTH = 5

let sources = ["../20_utils.js", "../30_point.js", "../40_position.js", "../41_fen.js", "../42_perft.js"];

let concat = "";

for (let source of sources) {
	let s = fs.readFileSync(source, "utf8");
	concat += s;
}

concat += "\n" + `Perft("${FEN}", ${DEPTH});`;

eval(concat);
