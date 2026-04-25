const sdk = require("@defillama/sdk");

const FACTORY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function tvl(api) {
  const vaultAddr = (
    await sdk.api.abi.call({
      target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      abi: "address:vault",
      chain: "ethereum",
    })
  ).output;
  return api.sumTokens({ owner: vaultAddr });
}

module.exports = {
  ethereum: { tvl },
};
