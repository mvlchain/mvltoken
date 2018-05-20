const moment = require('moment');

async function mine() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_mine',
      id: Date.now() + 1,
    }, err1 => {
      if (err1) return reject(err1);
      resolve();
    });
  });
}

async function proceedTime(time) {
  const m = moment(time);

  const block = await web3.eth.getBlock(web3.eth.blockNumber);
  const cur = moment.unix(block.timestamp);

  if (m.isBefore(cur)) {
    console.log('no need to jump time. skip.');
    return Promise.resolve();
  }

  const sec = parseInt(m-cur)/1000;

  if (sec < 0) {
    console.log('no need to jump time. skip.');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [sec],
      id: Date.now(),
    }, err1 => {
      if (err1) return reject(err1);
      resolve();
    })
  }).then(() => mine());
}

async function revert(snapshotId) {
  return new Promise((rs, rj) => {
    web3.currentProvider.sendAsync({
      jsonrpc: "2.0",
      method: "evm_revert",
      params: [parseInt(snapshotId)],
      id: Date.now() + 1
    }, (err, res) => {
      if (err) {
        return rj(err);
      }
      rs(res);
    });
  }).then(() => mine());
}

async function snapshot() {
  return new Promise((rs, rj) => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_snapshot',
      params: [],
      id: new Date().getTime(),
    }, (err, res) => {
      if (err) {
        return rj(err);
      }
      rs(web3.toDecimal(res.result));
    });
  });
}

module.exports = {
  mine,
  proceedTime,
  snapshot,
  revert,
};
