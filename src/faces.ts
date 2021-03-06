import Transaction from "arweave/node/lib/transaction";

// Community Interfaces

export interface VaultInterface {
  [key: string]: {
    balance: number;
    start: number;
    end: number;
  }[];
}

// User Interfaces

export interface UserInterface {
  username: string;
  name: string;
  addresses: string[];
  image?: string;
  bio?: string;
  links?: {
    [identifier: string]: string;
  };
}

export interface BalanceInterface {
  id: string;
  balance: number;
  name: string;
  ticker: string;
  logo?: string;
}

export interface OrderInterface {
  id: string;
  status: "pending" | "success" | "cancelled" | "returned";
  sender: string;
  target: string;
  token: string;
  input: string;
  output: string;
  timestamp: number;
}

export interface TransactionInterface {
  id: string;
  status: "success" | "pending" | "error";
  type: "in" | "out";
  amount: string;
  timestamp?: number;
}

// Token Interfaces

export interface TokenInterface {
  id: string;
  name: string;
  ticker: string;
}

export interface PriceInterface {
  price: number;
  name: string;
  ticker: string;
  type?: "art" | "community" | "custom";
}

interface CostInterface {
  ar: number;
  token: number;
}

export interface SwapInterface {
  transactions: { transaction: Transaction; type?: "fee" }[];
  cost: CostInterface;
}

export interface FeeInterface {
  transaction: Transaction;
  cost: CostInterface;
}

// Trading Post Interfaces

export interface TradingPostInterface {
  address: string;
  balance: number;
  stake: number;
  time: number;
  endpoint: string;
}

export interface OrderBookInterface {
  txID: string;
  amnt: number;
  rate?: number;
  addr: string;
  type: string;
  createdAt: number;
  received: number;
  token?: string;
}

export interface ConfigInterface {
  blockedTokens: string[];
  chain: {
    [identifier: string]: {
      addr: string;
    };
  };
  tradeFee: number;
  publicURL: string;
  version: string;
}
