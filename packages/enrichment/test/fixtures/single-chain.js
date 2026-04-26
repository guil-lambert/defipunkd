const { sumTokens2 } = require("../helpers/unwrapLPs");

const stETH = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const wstETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const treasury = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
// 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef — comment, must be ignored

async function tvl(api) {
  return sumTokens2({ api, owner: treasury, tokens: [stETH, wstETH] });
}

module.exports = {
  methodology: "Counts stETH and wstETH held by the Lido treasury.",
  ethereum: { tvl },
};
