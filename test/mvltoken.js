const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
const {proceedTime, snapshot, revert} = require('./util');
const moment = require('moment');


chai.use(chaiAsPromised);
chai.should();

const MVLToken = artifacts.require("MVLToken");
const SafeMathMock = artifacts.require('SafeMathMock');

contract('MVLToken', (accounts) => {
  let token, safeMath;
  before(async () => {
    token = await MVLToken.deployed();
    safeMath = await SafeMathMock.new();
    await token.enableTransfer(true);
  });

  describe('basic info', () => {
    it("should put 3e28 MVL to the first account", async () => {
      const balance = await token.balanceOf.call(accounts[0]);
      balance.equals(web3.toBigNumber(3e28)).should.be.true;
    });

    it("check name and symbol", async () => {
      const name = await token.name();
      name.should.equal('Mass Vehicle Ledger Token');
      const sym = await token.symbol();
      sym.should.equal('MVL');
    });

    it("should have total supply of 3e28", async () => {
      const sppl = await token.totalSupply();
      sppl.equals(web3.toBigNumber(3e28)).should.be.true;
    });
  });

  describe("transfer", () => {
    it("should transfer token", async () => {
      const acc1 = accounts[0];
      const acc2 = accounts[1];
      const amount = 1e18;
      let acc1balance, acc2balance;
      let acc1balanceAfter, acc2balanceAfter;

      const token = await MVLToken.deployed();
      acc1balance = await token.balanceOf.call(acc1);
      acc2balance = await token.balanceOf.call(acc2);
      await token.transfer(acc2, amount, {from: acc1});
      acc1balanceAfter = await token.balanceOf.call(acc1);
      acc2balanceAfter = await token.balanceOf.call(acc2);

      acc2balanceAfter.equals(acc2balance.add(amount)).should.be.true;
      acc1balanceAfter.equals(acc1balance.minus(amount)).should.be.true;
    });

    it("transfer is possible only for valid destination", async () => {
      await token.transfer(0x0, 10).should.be.rejectedWith(Error);
      await token.transfer(token.address, 10).should.be.rejectedWith(Error);
      const owner = await token.owner.call();
      console.log('owner=', owner);
      await token.transfer(owner, 10).should.be.rejectedWith(Error);
    });

    it("cannot transfer 0 amount", async () => {
      await token.transfer(accounts[1], 0, {from: accounts[0]}).should.be.rejectedWith(Error);
    });

    it("cannot transfer from 0x0", async () => {
      await token.transfer(accounts[1], 1, {from: 0}).should.be.rejectedWith(Error);
    });

    it("shouldn't transfer token if not enough balance", async () => {
      let token;

      const acc1 = accounts[2];
      const acc2 = accounts[3];
      const amount = 1e18;

      token = await MVLToken.deployed();
      await token.transfer(acc2, amount, {from: acc1}).should.be.rejectedWith(Error);
    });

    it("can't transfer before official release date if not owner", async () => {
      const DISTRIBUTE_DATE = 1527768000; // 2018-05-31T21:00:00+09:00

      const aaa = await token.DISTRIBUTE_DATE();
      console.log('distribute', aaa.toString());
      const b = await web3.eth.getBlock(web3.eth.blockNumber);
      console.log('b', b.timestamp);

      const from = accounts[1];
      const to = accounts[2];
      const amount = web3.toWei(1, 'ether'); // 1 MVL (1e18)
      const aa = await token.balanceOf(from);
      console.log(aa.minus(amount).toString());

      await token.transfer(to, amount, {from}).should.be.rejectedWith(Error);
    });

    it("can transfer before official release date if owner", async () => {
      const from = accounts[0];
      const to = accounts[3];
      const amount = web3.toWei(200, 'ether'); // 200 MVL

      await token.transfer(to, amount, {from});
      const balance = await token.balanceOf.call(to);
      balance.equals(web3.toBigNumber(amount)).should.be.true;
    });
  });

  describe("approval", () => {
    let allowance;
    it("should approve certain amount", async () => {
      // proceed time after distribute date
      const DISTRIBUTE_DATE = 1527768000;
      await proceedTime(moment.unix(DISTRIBUTE_DATE + 1));
      // setup token amount
      await token.transfer(accounts[1], web3.toBigNumber(web3.toWei(1000000, 'ether')), {from: accounts[0]});

      const from = accounts[1];
      const spender = accounts[2];
      const amount = web3.toBigNumber(web3.toWei(500000, 'ether')); // 0.5mil MVL
      await token.approve(spender, amount, {from});
      allowance = await token.allowance(from, spender);
      console.log(allowance, allowance.toString());
      allowance.equals(amount).should.be.true;
    });

    it("can set allowance to zero", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      await token.approve(spender, 0, {from});
      let allowance;
      allowance = await token.allowance(from, spender);
      allowance.equals(web3.toBigNumber(0)).should.be.true;

      // restore
      const amount = web3.toBigNumber(web3.toWei(500000, 'ether')); // 0.5mil MVL
      await token.approve(spender, amount, {from});
      allowance = await token.allowance(from, spender);
      allowance.equals(amount).should.be.true;
    });

    it("shouldn't accept re-call approve function if it is already set", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      const amount = web3.toBigNumber(web3.toWei(500000, 'ether')); // 0.5mil MVL
      await token.approve(spender, amount, {from}).should.be.rejectedWith(Error);
    });

    it("should increase allowance", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      const increase = web3.toBigNumber(web3.toWei(500000, 'ether')); // 0.5mil MVL
      await token.increaseApproval(spender, increase, {from});
      allowance = await token.allowance(from, spender);
      allowance.equals(web3.toBigNumber(1e24)).should.be.true; // allowance should be 1mil
    });

    it("should decrease allowance", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      const increase = web3.toBigNumber(web3.toWei(300000, 'ether')); // 0.3mil MVL
      await token.decreaseApproval(spender, increase, {from});
      allowance = await token.allowance(from, spender);
      allowance.equals(web3.toBigNumber(7e23)).should.be.true; // allowance should be 0.7mil
    });

    it("cannot transfer from 0x0", async () => {
      const spender = accounts[2];
      const to = accounts[7];
      await token.transferFrom(0x0, to, 1, {from: spender}).should.be.rejectedWith(Error);
    });

    it("should transfer token by allowed spender", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      const to = accounts[7];

      // get original balances
      const oldBalances = [];
      await Promise.all([from, spender, to].map(async (acc, i) => {
        const balance = await token.balanceOf.call(acc);
        oldBalances[i] = balance;
      }));

      // delegate transfer
      const amount = web3.toBigNumber(web3.toWei(500000, 'ether')); // 0.5mil MVL
      await token.transferFrom(from, to, amount, {from: spender});

      // check balances again
      const newBalances = [];
      await Promise.all([from, spender, to].map(async (acc, i) => {
        const balance = await token.balanceOf.call(acc);
        newBalances[i] = balance;
      }));

      (oldBalances[0].sub(newBalances[0])).equals(amount).should.be.true;
      (newBalances[2].sub(oldBalances[2])).equals(amount).should.be.true;
      oldBalances[1].equals(newBalances[1]).should.be.true;
    });

    it("shouldn't transfer token more than allowed by spender", async () => {
      // delegate transfer
      const from = accounts[1];
      const spender = accounts[2];
      const to = accounts[7];

      const amount = web3.toBigNumber(web3.toWei(700000, 'ether')); // 0.7mil MVL
      await token.transferFrom(from, to, amount, {from: spender}).should.be.rejectedWith(Error);
    });

    it("should transfer more under allowance", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      const to = accounts[7];

      // get original balances
      const oldBalances = [];
      await Promise.all([from, spender, to].map(async (acc, i) => {
        const balance = await token.balanceOf.call(acc);
        oldBalances[i] = balance;
      }));

      // delegate transfer
      const amount = web3.toBigNumber(web3.toWei(200000, 'ether')); // 0.2mil MVL
      await token.transferFrom(from, to, amount, {from: spender});

      // check balances again
      const newBalances = [];
      await Promise.all([from, spender, to].map(async (acc, i) => {
        const balance = await token.balanceOf.call(acc);
        newBalances[i] = balance;
      }));

      (oldBalances[0].sub(newBalances[0])).equals(amount).should.be.true;
      (newBalances[2].sub(oldBalances[2])).equals(amount).should.be.true;
      oldBalances[1].equals(newBalances[1]).should.be.true;
    });

    it("should decrease value more than allowance for setting it to zero", async () => {
      const from = accounts[1];
      const spender = accounts[2];
      const decrease = web3.toBigNumber(web3.toWei(300000000, 'ether')); // 300mil MVL
      await token.decreaseApproval(spender, decrease, {from});
      allowance = await token.allowance(from, spender);
      allowance.equals(web3.toBigNumber(0)).should.be.true; // allowance should be 0
    });

    it("should not be able to transfer token by spender anymore", async () => {
      // delegate transfer
      const from = accounts[1];
      const spender = accounts[2];
      const to = accounts[7];

      await token.transferFrom(from, to, 1, {from: spender}).should.be.rejectedWith(Error);
    });

    it("should be able to set another spender", async () => {
      const from = accounts[1];
      const spender = accounts[4];
      const amount = web3.toBigNumber(web3.toWei(10000, 'ether')); // 10000 MVL
      await token.approve(spender, amount, {from});
      allowance = await token.allowance(from, spender);
      console.log(allowance, allowance.toString());
      allowance.equals(amount).should.be.true;
    });

    it("should transfer token by another spender", async () => {
      const from = accounts[1];
      const spender = accounts[4];
      const to = accounts[7];

      // get original balances
      const oldBalances = [];
      await Promise.all([from, spender, to].map(async (acc, i) => {
        const balance = await token.balanceOf.call(acc);
        oldBalances[i] = balance;
      }));

      // delegate transfer
      const amount = web3.toBigNumber(web3.toWei(10000, 'ether')); // 10000 MVL
      await token.transferFrom(from, to, amount, {from: spender});

      // check balances again
      const newBalances = [];
      await Promise.all([from, spender, to].map(async (acc, i) => {
        const balance = await token.balanceOf.call(acc);
        newBalances[i] = balance;
      }));

      (oldBalances[0].sub(newBalances[0])).equals(amount).should.be.true;
      (newBalances[2].sub(oldBalances[2])).equals(amount).should.be.true;
      oldBalances[1].equals(newBalances[1]).should.be.true;

      // allowance should be adjusted
      const allowance2 = await token.allowance(from, spender);
      allowance2.equals(web3.toBigNumber(0)).should.be.true;
    });

    it("should not transfer token by another spender more than allowed", async () => {
      const from = accounts[1];
      const spender = accounts[4];
      const to = accounts[7];

      // delegate transfer
      const amount = web3.toBigNumber(web3.toWei(10000, 'ether')); // 10000 MVL
      await token.transferFrom(from, to, amount, {from: spender}).should.be.rejectedWith(Error);
    });
  });

  describe("bonus lock", () => {
    /*********************/
    /* Bonus lock test 1 */
    /*********************/
    it("should setup the lock policy", async () => {
      // for each month, 25% vesting
      const beneficiary = accounts[3];

      // const lockAmount = web3.toWei(100, 'ether'); // 100 MVL (1e20)
      // const startTime = moment.parseZone('2018-07-01T00:00:00+00:00').unix();
      // const stepTime = moment.duration(1, 'month')/1000; // in sec
      // const unlockStep = 4;
      // await token.setTokenLockPolicy(beneficiary, lockAmount, startTime, stepTime, unlockStep, {from: accounts[0]});
      await token.addTokenLock(beneficiary, web3.toWei(25, 'ether'), moment.parseZone('2018-07-01T00:00:00+00:00').unix());
      await token.addTokenLock(beneficiary, web3.toWei(25, 'ether'), moment.parseZone('2018-07-31T00:00:00+00:00').unix());
      await token.addTokenLock(beneficiary, web3.toWei(25, 'ether'), moment.parseZone('2018-08-30T00:00:00+00:00').unix());
      await token.addTokenLock(beneficiary, web3.toWei(25, 'ether'), moment.parseZone('2018-09-29T00:00:00+00:00').unix());

      const locked = await token.getMinLockedAmount(beneficiary);
      locked.equals(web3.toBigNumber(100e18)).should.be.true;

      // time warp after release date
      await proceedTime(moment.parseZone('2018-06-01T01:00:00+00:00'));

    });

    it("cannot set the lock for 0 addr", async () => {
      await token.addTokenLock(0x0, 25, moment.parseZone('2018-07-01T00:00:00+00:00').unix(), {from: accounts[0]}).should.be.rejectedWith(Error);
    });

    it("block set token lock policy for unauthorized user", async () => {
      await token.addTokenLock(accounts[5], 25, moment.parseZone('2018-07-01T00:00:00+00:00').unix(), {from: accounts[3]}).should.be.rejectedWith(Error);
    });

    it("should not be able to transfer token including bonus", async () => {
      const from = accounts[3];
      const to = accounts[4];
      // 10 MVL was bonus
      const amount = web3.toWei(110, 'ether');
      await token.transfer(to, amount, {from}).should.be.rejectedWith(Error);
    });

    it("should be able to transfer token under locked values", async () => {
      const from = accounts[3];
      const to = accounts[4];

      // 10 mvl was bonus
      const amount = web3.toWei(90, 'ether'); // 90MVL
      await token.transfer(to, amount, {from});

      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(web3.toWei(110, 'ether'))).should.be.true;
      balance2.equals(web3.toBigNumber(web3.toWei(90, 'ether'))).should.be.true;
    });

    it("should be able to transfer token when part of it released", async () => {
      // time warp to 1month later
      await proceedTime(moment.parseZone('2018-07-01T01:00:00+00:00'));

      const from = accounts[3];
      const to = accounts[4];

      // 10 mvl was bonus
      const amount = web3.toWei(20, 'ether'); // 10MVL(no locked) + 10MVL(part of bonus. 25 MVL was released)
      await token.transfer(to, amount, {from});

      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(web3.toWei(90, 'ether'))).should.be.true;
      balance2.equals(web3.toBigNumber(web3.toWei(110, 'ether'))).should.be.true;
    });

    it("should not be able to transfer more than allowed now", async () => {
      const from = accounts[3];
      const to = accounts[4];

      let balance1 = await token.balanceOf.call(from);
      console.log('balance1=', balance1.div(web3.toBigNumber(1e18)).toString());

      const locked = await token.getMinLockedAmount(from);
      console.log('locked=', locked.div(web3.toBigNumber(1e18)).toString());

      locked.equals(web3.toBigNumber(web3.toWei(75, 'ether'))).should.be.true;

      // just 1wei amount above to allowance
      const amount = balance1.minus(locked).add(1);
      console.log('amount=',amount.toString());

      token.transfer(to, amount, {from}).should.be.rejectedWith(Error);
    });

    it("should not be able to transfer more than allowed now 2", async () => {
      // time warp to 1month later again
      await proceedTime(moment.parseZone('2018-08-01T01:00:00+00:00'));

      const from = accounts[3];
      const to = accounts[4];

      let balance1 = await token.balanceOf.call(from);
      console.log('balance1=', balance1);

      const locked = await token.getMinLockedAmount(from);
      console.log('locked=', locked.div(web3.toBigNumber(1e18)).toString());

      locked.equals(web3.toBigNumber(web3.toWei(50, 'ether'))).should.be.true;

      const amount = balance1.minus(locked).add(1);
      console.log('amount=', amount.toString());
      await token.transfer(to, amount, {from}).should.be.rejectedWith(Error);
    });

    it("should transfer under locked amount", async () => {
      const from = accounts[3];
      const to = accounts[4];

      const amount = 1e18; // 1 MVL
      await token.transfer(to, amount, {from});

      // check balance
      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(89e18)).should.be.true;
      balance2.equals(web3.toBigNumber(111e18)).should.be.true;
    });

    it("should not be able to transfer more than allowed now 3", async () => {
      // time warp to 1month later again
      await proceedTime(moment.parseZone('2018-09-01T00:00:01+00:00'));

      const from = accounts[3];
      const to = accounts[4];

      let balance1 = await token.balanceOf.call(from);
      console.log('balance1=', balance1);

      const locked = await token.getMinLockedAmount(from);
      console.log('locked=', locked.div(web3.toBigNumber(1e18)).toString());

      locked.equals(web3.toBigNumber(web3.toWei(25, 'ether'))).should.be.true;

      const amount = balance1.minus(locked).add(1);
      console.log('amount=', amount.toString());
      await token.transfer(to, amount, {from}).should.be.rejectedWith(Error);
    });

    it("should transfer under locked amount", async () => {
      const from = accounts[3];
      const to = accounts[4];

      const amount = 29e18; // 29 MVL
      await token.transfer(to, amount, {from});

      // check balance
      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(60e18)).should.be.true;
      balance2.equals(web3.toBigNumber(140e18)).should.be.true;
    });


    it("should not be able to transfer more than allowed now 3", async () => {
      // time warp to right before all lock released
      await proceedTime(moment.parseZone('2018-09-28T23:59:00+00:00'));

      const from = accounts[3];
      const to = accounts[4];

      let balance1 = await token.balanceOf.call(from);
      console.log('balance1=', balance1);

      const locked = await token.getMinLockedAmount(from);
      console.log('locked=', locked.div(web3.toBigNumber(1e18)).toString());

      locked.equals(web3.toBigNumber(web3.toWei(25, 'ether'))).should.be.true;

      const amount = balance1.minus(locked).add(1);
      console.log('amount=', amount.toString());
      await token.transfer(to, amount, {from}).should.be.rejectedWith(Error);
    });

    it("should be able to send all tokens", async () => {
      // time warp to right after all lock released
      await proceedTime(moment.parseZone('2018-09-29T00:00:01+00:00'));

      const from = accounts[3];
      const to = accounts[4];

      const amount = await token.balanceOf.call(from);
      await token.transfer(to, amount, {from});

      // check balance
      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(0)).should.be.true;
      balance2.equals(web3.toBigNumber(200e18)).should.be.true;
    });

    /*********************/
    /* Bonus lock test 2 */
    /*********************/
    it("should setup the different bonus policy", async () => {
      const beneficiary = accounts[4];
      const lockAmount = web3.toWei(100, 'ether'); // 100 MVL (1e20)
      // const startTime = moment.parseZone('2018-10-01T00:00:00+00:00').unix();
      // const stepTime = moment.duration(3, 'month')/1000; // in sec
      // const unlockStep = 1;
      // await token.setTokenLockPolicy(beneficiary, lockAmount, startTime, stepTime, unlockStep, {from: accounts[0]});
      await token.addTokenLock(beneficiary, lockAmount, moment.parseZone('2018-10-01T00:00:00+00:00').add(moment.duration(3, 'month')/1000, 'seconds').unix());
    });

    it("should not be able to transfer locked amount before release date", async () => {
      await proceedTime(moment.parseZone('2018-10-02T00:00:00+00:00'));
      const from = accounts[4];
      const to = accounts[5];

      const amount = 101e18;
      await token.transfer(amount, to, {from}).should.be.rejectedWith(Error);
    });

    it("should be able to transfer token under locked amount before release time", async () => {
      const from = accounts[4];
      const to = accounts[5];

      const amount = 99e18;
      await token.transfer(to, amount, {from});

      // check balance
      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(101e18)).should.be.true;
      balance2.equals(web3.toBigNumber(99e18)).should.be.true;
    });

    it("should be able to transfer all tokens after release time", async () => {
      await proceedTime(moment.parseZone('2018-12-30T00:00:01+00:00'));
      const from = accounts[4];
      const to = accounts[5];

      const amount = 101e18;
      await token.transfer(to, amount, {from});

      // check balance
      const balance1 = await token.balanceOf.call(from);
      const balance2 = await token.balanceOf.call(to);

      balance1.equals(web3.toBigNumber(0)).should.be.true;
      balance2.equals(web3.toBigNumber(200e18)).should.be.true;
    });

    it("lock 100 tokens", async () => {
      const from = await token.owner();
      const b = accounts[4];
      await token.transfer(b, web3.toWei(100, 'ether'), {from});
      // token.setTokenLockPolicy(b, web3.toWei(100, 'ether'), m.unix(), 86400, 3);
      await token.addTokenLock(b, web3.toWei(33, 'ether'), moment.parseZone('2019-01-01T00:00:00+09:00').unix());
      await token.addTokenLock(b, web3.toWei(33, 'ether'), moment.parseZone('2019-01-02T00:00:00+09:00').unix());
      await token.addTokenLock(b, web3.toWei(34, 'ether'), moment.parseZone('2019-01-03T00:00:00+09:00').unix());
      const a = await token.getMinLockedAmount(accounts[4]);
      console.log('minlocked', a.toString());
      a.equals(web3.toBigNumber(web3.toWei(100, 'ether'))).should.be.true;
    });

    it("should unlock 33 tokens after 1day", async () => {
      await proceedTime(moment.parseZone('2019-01-01T00:00:01+09:00'));
      const a = await token.getMinLockedAmount(accounts[4]);
      console.log('minlocked', a.toString());
      a.equals(web3.toBigNumber(web3.toWei(67, 'ether'))).should.be.true;
    });

    it("should unlock 33 tokens after 2day", async () => {
      await proceedTime(moment.parseZone('2019-01-02T00:00:01+09:00'));
      const a = await token.getMinLockedAmount(accounts[4]);
      console.log('minlocked', a.toString());
      a.equals(web3.toWei(34, 'ether')).should.be.true;
    });

    it("should unlock all tokens after 3day", async () => {
      await proceedTime(moment.parseZone('2019-01-03T00:00:01+09:00'));
      const a = await token.getMinLockedAmount(accounts[4]);
      console.log('minlocked', a.toString());
      a.equals(web3.toBigNumber(0)).should.be.true;
    });
  });

  describe("transfer control", () => {
    /*************************/
    /* transfer control test */
    /*************************/
    it("shouldn't be blocked by random account", async () => {
      const owner = await token.owner();
      console.log('owner', owner);
      for (let i=1; i < accounts.length; i++) {
        const from = accounts[i];
        if (owner === from) {
          continue;
        }
        await token.enableTransfer(false, {from}).should.be.rejectedWith(Error);
        await token.enableTransfer(true, {from}).should.be.rejectedWith(Error);
        await token.enableTransfer(2**256-1, {from}).should.be.rejectedWith(Error);
        await token.enableTransfer("true", {from}).should.be.rejectedWith(Error);
        await token.enableTransfer("false", {from}).should.be.rejectedWith(Error);
      }
    });

    it("should block transfer when transferEnabled is false", async () => {
      const owner = await token.owner();
      const from = await accounts[1];
      const to = await accounts[9];

      await token.enableTransfer(false, {from: owner}); // turn off transfer

      // try to move token
      const aa = await token.balanceOf(from);
      await token.transfer(to, 1, {from}).should.be.rejectedWith(Error);
    });

    it("should be able to move token again after transfer enabled", async () => {
      const owner = await token.owner();
      const from = await accounts[1];
      const to = await accounts[9];

      // check balance
      const balance11 = await token.balanceOf.call(from);
      const balance12 = await token.balanceOf.call(to);

      await token.enableTransfer(true, {from: owner}); // turn on transfer

      // try to move token
      await token.transfer(to, 100, {from});

      const balance21 = await token.balanceOf.call(from);
      const balance22 = await token.balanceOf.call(to);

      balance11.minus(100).equals(balance21).should.be.true;
      balance12.add(100).equals(balance22).should.be.true;
    });
  });

  describe("burn", () => {
    /*************/
    /* burn test */
    /*************/
    it("shouldn't be burnt by random account who isn't not the owner", async () => {
      const owner = await token.owner();
      console.log('owner', owner);
      for (let i=1; i < accounts.length; i++) {
        const from = accounts[i];
        if (owner === from) {
          continue;
        }
        // console.log('1, from=',from, 'i=',i);
        await token.burn(3e27, {from}).should.be.rejectedWith(Error);
        // console.log('2, from=',from, 'i=',i);
        await token.burn(1, {from}).should.be.rejectedWith(Error);
        // console.log('3, from=',from, 'i=',i);
        await token.burn(1e18, {from}).should.be.rejectedWith(Error);
      }
    });

    it("should be able to burn", async () => {
      const owner = await token.owner.call();
      let oldOwnerAmount = await token.balanceOf.call(owner);
      const burnAmount = web3.toBigNumber(web3.toWei(10000000, 'ether')); // 10000000 MVL
      // console.log(ownerAmount.toString());
      // console.log(burnAmount.toString());
      await token.burn(burnAmount, {from: owner});

      const totalSupply = await token.totalSupply();
      totalSupply.equals(web3.toBigNumber(3e28).minus(burnAmount)).should.be.true;
      const ownerAmount = await token.balanceOf.call(owner);
      ownerAmount.equals(oldOwnerAmount.minus(burnAmount)).should.be.true;
    });

    it("shouldn't burn more than the owner has", async () => {
      const owner = await token.owner.call();
      const ownerAmount = await token.balanceOf.call(owner);
      const burnAmount = ownerAmount.add(web3.toWei(100, 'ether')); // ownerAmount + 100MVL
      await token.burn(burnAmount, {from: owner}).should.be.rejectedWith(Error);
    });
  });

  describe("big amount", () => {
    /*******************/
    /* big number test */
    /*******************/

    it("should be able to transfer very large amount", async () => {
      const owner = await token.owner.call();
      const to = accounts[8];

      // const ownerAmount = await token.balanceOf.call(owner);
      // console.log(web3.fromWei(ownerAmount, 'ether').toString());

      const balance11 = await token.balanceOf.call(owner);
      const balance12 = await token.balanceOf.call(to);

      const amount = web3.toBigNumber(2e27);
      await token.transfer(to, amount, {from: owner});

      const balance21 = await token.balanceOf.call(owner);
      const balance22 = await token.balanceOf.call(to);

      balance11.minus(balance21).equals(amount).should.be.true;
      balance22.minus(balance12).equals(amount).should.be.true;
    });

    it("should not be able to transfer very large amount", async () => {
      const owner = await token.owner.call();
      const to = accounts[8];

      const amount = web3.toBigNumber(1e77);
      await token.transfer(to, amount, {from: owner}).should.be.rejectedWith(Error);
    });
  });

  describe("admin setup", () => {
    /***************/
    /* setup admin */
    /***************/
    it("setup admin", async () => {
      const admin = accounts[9];
      const owner = await token.owner();
      await token.setAdmin(admin, {from: owner});

      const newAdmin = await token.admin();
      newAdmin.should.equal(admin);

      // get approved amount
      const allowance = await token.allowance(owner, admin);
      // all amount should be allowed
      allowance.equals(web3.toBigNumber(3e28)).should.be.true;
    });

    it("change admin", async () => {
      const admin = accounts[8];
      const oldAdmin = await token.admin();
      const owner = await token.owner();
      await token.setAdmin(admin, {from: owner});

      const newAdmin = await token.admin();
      newAdmin.should.equal(admin);

      // get approved amount
      const allowance = await token.allowance(owner, admin);
      // all amount should be allowed
      allowance.equals(web3.toBigNumber(3e28)).should.be.true;
      // old admin is not allowed
      const allowance2 = await token.allowance(owner, oldAdmin);
      allowance2.equals(web3.toBigNumber(0)).should.be.true;
    });

    it("block change admin to the same one", async () => {
      const admin = await token.admin();
      const from = await token.owner();
      await token.setAdmin(admin, {from}).should.be.rejectedWith(Error);
    });

    it("block change admin to owner", async () => {
      const admin = await token.owner();
      const from = await token.owner();
      await token.setAdmin(admin, {from}).should.be.rejectedWith(Error);
    });

  });

  describe("misc", () => {
    /*******************************/
    /* default payable revert test */
    /*******************************/
    it("should reject send eth directly to token contract", async () => {
      try {
        await web3.eth.sendTransaction({to: token.address, gas: 500000, from: accounts[3]}).should.be.rejectedWith(Error);
        chai.expect.fail(false, true);
      } catch (err) {
        // originally expected err
      }
    });

    /*************************/
    /* unlock all token test */
    /*************************/
    it("should unlock all tokens", async () => {
      const owner = await token.owner();
      await token.unlockAllTokens({from: owner});
      const nolock = await token.noTokenLocked();
      nolock.should.be.true;

      const account = accounts[5];
      const balance = await token.balanceOf(account);

      // lock all balance
      // const d = await token.DISTRIBUTE_DATE();
      // await token.setTokenLockPolicy(account, balance, d.add(web3.toBigNumber(365*86400*1000)), 365*86400*1000, 10); // 10 yrs, 1 year interval
      await token.addTokenLock(account, balance, moment.parseZone('2028-01-01T00:00:00+00:00').unix());
      const locked = await token.getMinLockedAmount(account);
      locked.equals(balance).should.be.true;

      // even if somebody's portion is locked, it should be able to xfer now
      const to = accounts[6];

      const balance11 = await token.balanceOf.call(account);
      const balance12 = await token.balanceOf.call(to);

      token.transfer(to, web3.toWei(10, 'ether'), {from: account});

      // check balance
      const balance21 = await token.balanceOf.call(account);
      const balance22 = await token.balanceOf.call(to);

      balance11.minus(balance21).equals(web3.toBigNumber(web3.toWei(10, 'ether')));
      balance22.minus(balance12).equals(web3.toBigNumber(web3.toWei(10, 'ether')));
    });

    /***********************/
    /* ownership xfer test */
    /***********************/

    it("should transfer ownership", async () => {
      const oldOwner = await token.owner.call();
      const newOwner = accounts[1];
      await token.transferOwnership(newOwner, {from: oldOwner});

      // owner check
      const owner = await token.owner.call();
      owner.should.equal(newOwner);

      // permission test
      await token.enableTransfer(false, {from: oldOwner}).should.be.rejectedWith(Error);
      await token.enableTransfer(true, {from: newOwner});
    });

    it("should check invalid address when xfer owner", async () => {
      const owner = await token.owner.call();
      await token.transferOwnership(0x0, {from: owner}).should.be.rejectedWith(Error);
      await token.transferOwnership(owner, {from: owner}).should.be.rejectedWith(Error); // owner didn't change
    });
  });
});
