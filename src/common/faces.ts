import { JWKInterface } from "arweave/node/lib/wallet";
import {
  OrderInterface,
  ClobState,
} from "verto-internals/interfaces/contracts/clob";
import { CacheInterfaceConstants } from "verto-cache-interface";

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

export type TokenType = "art" | "community" | "collection" | "custom";

export type TokenPair = [string, string];

export interface DecodedTag {
  name: string;
  value: string;
}

export type ExtensionOrJWK = "use_wallet" | JWKInterface;

export interface OrderInterfaceWithPair extends OrderInterface {
  pair: TokenPair;
}

/**
 * Config type for Global Verto Variables
 */
export interface GlobalConfigInterface {
  CLOB_CONTRACT?: string;
  COMMUNITY_CONTRACT?: string;
  /** VRT contract ID */
  EXCHANGE_CONTRACT?: string;
  CACHE_CONFIG?: Partial<
    Omit<typeof CacheInterfaceConstants, "COMMUNITY_CONTRACT">
  >;
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

export interface VolumeData {
  date: string;
  value: number;
}

export type PriceData = VolumeData;

export interface ValidityInterface {
  [interactionID: string]: boolean;
}

export type ClobContractStateInterface = ClobState;

export interface CreateOrderResult {
  status: "success" | "failure";
  message: string;
}
