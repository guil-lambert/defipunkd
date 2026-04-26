const ETH_VAULT = "0x1111111111111111111111111111111111111111";
const ARB_VAULT = "0x2222222222222222222222222222222222222222";
const ETH_ORACLE = "0x3333333333333333333333333333333333333333";
const ETH_ADMIN_MULTISIG = "0x4444444444444444444444444444444444444444";

async function ethTvl(api) {
  return api.sumTokens({ owner: ETH_VAULT, tokens: ["0x5555555555555555555555555555555555555555"] });
}

async function arbTvl(api) {
  return api.sumTokens({ owner: ARB_VAULT });
}

module.exports = {
  ethereum: {
    tvl: ethTvl,
    oracle: ETH_ORACLE,
    admin: ETH_ADMIN_MULTISIG,
  },
  arbitrum: {
    tvl: arbTvl,
  },
};
