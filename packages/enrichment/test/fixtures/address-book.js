const ADDRESSES = require("../helper/coreAssets.json");

const ethContract = ADDRESSES.ethereum.STETH;

async function eth(api) {
  const pooledETH = await api.call({
    target: ethContract,
    abi: "uint256:getTotalPooledEther",
  });
  // Inline member-expression form, no aliasing.
  const pooledMatic = await api.call({
    target: ADDRESSES.ethereum.MATIC,
    abi: "uint256:getTotalPooledMatic",
  });
  // Truly dynamic — target is a runtime value.
  const dynamicVault = (
    await api.call({
      target: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      abi: "address:vault",
    })
  ).output;
  return api.add(dynamicVault, pooledETH);
}

module.exports = {
  ethereum: { tvl: eth },
};
