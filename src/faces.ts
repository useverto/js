// Community Interfaces

export interface VaultInterface {
  [key: string]: {
    balance: number;
    start: number;
    end: number;
  }[];
}

// User Interfaces

export interface BalanceInterface {
  id: string;
  balance: number;
  name: string;
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
