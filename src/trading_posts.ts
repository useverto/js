import Arweave from "arweave";
import ArDB from "ardb";
import { fetchContract, getStake } from "./utils";

export const getTradingPosts = async (
  client: Arweave,
  exchangeContract: string,
  exchangeWallet: string
): Promise<string[]> => {
  // Fetch all trading posts.
  const gql = new ArDB(client);
  const query = await gql
    .search()
    .to(exchangeWallet)
    .tag("Exchange", "Verto")
    .tag("Type", "Genesis")
    .findAll();
  const res: string[] = Array.from(
    // @ts-ignore
    new Set(query.map((edge: any) => edge.node.owner.address))
  );

  // Fetch the vault of the Verto contract.
  const state = await fetchContract(exchangeContract);
  const vault = state.vault;

  // Filter out all the trading posts without stake.
  let i = res.length;
  while (i--) {
    const stake = await getStake(res[i], client, vault);

    if (stake === 0) {
      res.splice(i, 1);
    }
  }

  return res;
};
