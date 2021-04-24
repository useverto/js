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
  image: string;
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
