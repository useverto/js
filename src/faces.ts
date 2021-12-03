import { JWKInterface } from "arweave/node/lib/wallet";

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
  type?: TokenType;
}

export interface OrderInterface {
  id: string;
  owner: string;
  pair: TokenPair;
  price: number;
  filled: number;
  quantity: number;
}

export type TokenType = "art" | "community" | "custom";

export type TokenPair = [string, string];

export interface DecodedTag {
  name: string;
  value: string;
}

export type ExtensionOrJWK = "use_wallet" | JWKInterface;

/**
 * Config type for Global Verto Variables
 */
export interface GlobalConfigInterface {
  CLOB_CONTRACT?: string;
  COMMUNITY_CONTRACT?: string;
}

export interface VolumeOrderInterface {
  quantity: number;
  timestamp: number;
}

export interface SwapPairInterface {
  /** The token you are trading from / sending to the exchange */
  from: string;
  /** The token you wish to receive */
  to: string;
}
