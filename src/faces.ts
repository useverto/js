export interface VaultInterface {
  [key: string]: {
    balance: number;
    start: number;
    end: number;
  }[];
}
