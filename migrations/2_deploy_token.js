const MVLToken = artifacts.require("MVLToken");

module.exports = function(deployer) {
  return deployer.deploy(MVLToken);
};
