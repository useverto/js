import axios from "axios";
import Arweave from "arweave";
import { VaultInterface } from "./faces";

export const fetchContract = async (id: string): Promise<any> => {
  const { data: res } = await axios.get(`http://localhost:8080/${id}`);
  return res.state;
};

export const getBalance = async (
  addr: string,
  client: Arweave
): Promise<number> => {
  const winston = await client.wallets.getBalance(addr);
  const ar = client.ar.winstonToAr(winston);

  return parseFloat(ar);
};

export const getStake = async (
  addr: string,
  client: Arweave,
  vault: VaultInterface
): Promise<number> => {
  let stake = 0;

  if (addr in vault) {
    const height = (await client.network.getInfo()).height;
    const filtered = vault[addr].filter((a) => height < a.end);

    stake += filtered.map((a) => a.balance).reduce((a, b) => a + b, 0);
  }

  return stake;
};

export const getTimeStaked = async (
  addr: string,
  client: Arweave,
  vault: VaultInterface
): Promise<number> => {
  let time = 0;

  if (addr in vault) {
    const height = (await client.network.getInfo()).height;

    for (const element of vault[addr]) {
      if (height < element.end) {
        time = Math.max(time, element.end - element.start);
      }
    }
  }

  return time;
};

export const weightedRandom = (
  dict: Record<string, number>
): string | undefined => {
  let sum = 0;
  const r = Math.random();

  for (const addr of Object.keys(dict)) {
    sum += dict[addr];
    if (r <= sum && dict[addr] > 0) {
      return addr;
    }
  }

  return;
};
