pragma solidity ^0.4.23;

import './SafeMath.sol';
import './ERC20Basic.sol';
import './ERC20.sol';
import './DetailedERC20.sol';
import './Ownable.sol';

contract BasicToken is ERC20Basic {
  using SafeMath for uint256;

  mapping(address => uint256) balances;

  uint256 _totalSupply;

  /**
  * @dev total number of tokens in existence
  */
  function totalSupply() public view returns (uint256) {
    return _totalSupply;
  }

  /**
  * @dev transfer token for a specified address
  * @param _to The address to transfer to.
  * @param _value The amount to be transferred.
  */
  function transfer(address _to, uint256 _value) public returns (bool) {
    require(_to != address(0));
    require(_value > 0);
    require(_value <= balances[msg.sender]);

    // SafeMath.sub will throw if there is not enough balance.
    balances[msg.sender] = balances[msg.sender].sub(_value);
    balances[_to] = balances[_to].add(_value);
    emit Transfer(msg.sender, _to, _value);
    return true;
  }

  /**
  * @dev Gets the balance of the specified address.
  * @param _owner The address to query the the balance of.
  * @return An uint256 representing the amount owned by the passed address.
  */
  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balances[_owner];
  }
}

contract ERC20Token is BasicToken, ERC20 {
  using SafeMath for uint256;
  mapping (address => mapping (address => uint256)) allowed;

  function approve(address _spender, uint256 _value) public returns (bool) {
    require(_value == 0 || allowed[msg.sender][_spender] == 0);

    allowed[msg.sender][_spender] = _value;
    emit Approval(msg.sender, _spender, _value);

    return true;
  }

  function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
    return allowed[_owner][_spender];
  }

  function increaseApproval(address _spender, uint256 _addedValue) external returns (bool success) {
    allowed[msg.sender][_spender] = allowed[msg.sender][_spender].add(_addedValue);
    emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
    return true;
  }

  function decreaseApproval(address _spender, uint256 _subtractedValue) external returns (bool success) {
    uint256 oldValue = allowed[msg.sender][_spender];
    if (_subtractedValue >= oldValue) {
      allowed[msg.sender][_spender] = 0;
    } else {
      allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
    }
    emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
    return true;
  }

}

contract BurnableToken is BasicToken, Ownable {
  // events
  event Burn(address indexed burner, uint256 amount);

  // reduce sender balance and Token total supply
  function burn(uint256 _value) onlyOwner public {
    balances[msg.sender] = balances[msg.sender].sub(_value);
    _totalSupply = _totalSupply.sub(_value);
    emit Burn(msg.sender, _value);
    emit Transfer(msg.sender, address(0), _value);
  }
}

contract TokenLock is Ownable {
  using SafeMath for uint256;

  bool public transferEnabled = false; // indicates that token is transferable or not
  bool public noTokenLocked = false; // indicates all token is released or not

  struct TokenLockState {
    uint256 unlockStart; // unix timestamp
    uint256 step; // how many step required to final release
    uint256 stepTime; // time in second hold in each step
    uint256 amount; // how many token locked
  }

  mapping(address => TokenLockState) lockingStates;
  event UpdateTokenLockState(address indexed to, uint256 start_time, uint256 step_time, uint256 unlock_step, uint256 value);

  function enableTransfer(bool _enable) external onlyOwner {
    transferEnabled = _enable;
  }

  // calculate the amount of tokens an address can use
  function getMinLockedAmount(address _addr) view public returns (uint256) {
    // if the address has no limitations just return 0
    TokenLockState storage lockState = lockingStates[_addr];

    if (lockState.amount == 0) {
      return 0;
    }

    // if the purchase date is in the future block all the tokens
    if (lockState.unlockStart > now) {
      return lockState.amount;
    }

    // uint256 s = (now - unlock_start_dates[_addr]) / unlock_step_time[_addr] + 1; // unlock from start step
    uint256 s = ((now.sub(lockState.unlockStart)).div(lockState.stepTime)).add(1);
    if (s >= lockState.step) {
      return 0x0;
    }

    // uint256 min_tokens = (unlock_steps[_addr] - s)*locked_amounts[_addr] / unlock_steps[_addr];
    uint256 minTokens = ((lockState.step.sub(s)).mul(lockState.amount)).div(lockState.step);

    return minTokens;
  }

  function setTokenLockPolicy(address _addr, uint256 _value, uint256 _start_time, uint256 _step_time, uint256 _unlock_step) external onlyOwner {
    require(_addr != address(0));

    TokenLockState storage lockState = lockingStates[_addr]; // assigns a pointer. change the member value will update struct itself.

    lockState.unlockStart = _start_time;
    lockState.stepTime = _step_time;
    lockState.step = _unlock_step;
    uint256 final_value = lockState.amount.add(_value);
    lockState.amount = final_value;

    emit UpdateTokenLockState(_addr, _start_time, _step_time, _unlock_step, final_value);
  }
}

contract MVLToken is BurnableToken, DetailedERC20, ERC20Token, TokenLock {
  using SafeMath for uint256;
  bool public noTokenLocked = false;
  uint256 public DISTRIBUTE_DATE = 1527768000; // 2018-05-31T21:00:00+09:00

  // events
  event Approval(address indexed owner, address indexed spender, uint256 value);
  event UpdatedBlockingState(address indexed to, uint256 start_time, uint256 step_time, uint256 unlock_step, uint256 value);

  string public constant symbol = "MVL";
  string public constant name = "Mass Vehicle Ledger Token";
  uint8 public constant decimals = 18;
  uint256 public constant TOTAL_SUPPLY = 3*(10**10)*(10**uint256(decimals));

  constructor() DetailedERC20(name, symbol, decimals) public {
    _totalSupply = TOTAL_SUPPLY;

    // initial supply belongs to owner
    balances[owner] = _totalSupply;
  }

  function unlockAllTokens() external onlyOwner {
    noTokenLocked = true;
  }

  // modifiers
  // checks if the address can transfer tokens
  modifier canTransfer(address _sender, uint256 _value) {
    require(_sender != address(0));
    require(
      canTransferBefore(_sender) || (
        transferEnabled && (
        now > DISTRIBUTE_DATE && (
            noTokenLocked ||
            canTransferIfLocked(_sender, _value)
          )
        )
      )
    );

    _;
  }

  modifier onlyValidDestination(address to) {
    require(to != address(0x0));
    require(to != address(this));
    require(to != owner);
    _;
  }

  function canTransferBefore(address _sender) public view returns(bool) {
    return _sender == owner;
  }

  function canTransferIfLocked(address _sender, uint256 _value) public view returns(bool) {
    require(now >= DISTRIBUTE_DATE);
    uint256 after_math = balances[_sender].sub(_value);
    return after_math >= getMinLockedAmount(_sender);
  }

  // override from ERC20Token
  function approve(address _spender, uint256 _value) public returns (bool) {
    return super.approve(_spender, _value);
  }

  // override function using canTransfer on the sender address
  function transfer(address _to, uint256 _value) onlyValidDestination(_to) canTransfer(msg.sender, _value) public returns (bool success) {
    return super.transfer(_to, _value);
  }

  // transfer tokens from one address to another
  function transferFrom(address _from, address _to, uint256 _value) onlyValidDestination(_to) canTransfer(_from, _value) public returns (bool success) {
    // SafeMath.sub will throw if there is not enough balance.
    balances[_from] = balances[_from].sub(_value);
    balances[_to] = balances[_to].add(_value);
    allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value); // this will throw if we don't have enough allowance

    // this event comes from BasicToken.sol
    emit Transfer(_from, _to, _value);

    return true;
  }

  function() public payable { // don't send eth directly to token contract
    revert();
  }
}
