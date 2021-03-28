import axios from "axios";
import Arweave from "arweave";
import { VaultInterface } from "./faces";

export const fetchContract = async (id: string): Promise<any> => {
  const { data: res } = await axios.get(`http://localhost:8080/${id}`);
  return res.state;
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
