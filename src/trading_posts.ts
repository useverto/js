import Arweave from "arweave";
import {
  weightedRandom,
  fetchContract,
  getStake,
  getTimeStaked,
  getBalance,
} from "./utils";
import { VaultInterface } from "./faces";
import ArDB from "ardb";
import { GQLEdgeTransactionInterface } from "ardb/lib/faces/gql";

export const getTradingPosts = async (
  client: Arweave,
  exchangeContract: string,
  exchangeWallet: string
): Promise<string[]> => {
  const res = await _getTradingPosts(client, exchangeContract, exchangeWallet);
  return res.posts;
};

export const recommendPost = async (
  client: Arweave,
  exchangeContract: string,
  exchangeWallet: string
): Promise<string> => {
  const res = await _getTradingPosts(client, exchangeContract, exchangeWallet);

  const reputations: Record<string, number> = {};
  let total = 0;
  for (const post of res.posts) {
    const reputation = await getReputation(post, client, res.vault);

    reputations[post] = reputation;
    total += reputation;
  }

  const posts: Record<string, number> = {};
  for (const post of res.posts) {
    posts[post] = reputations[post] / total;
  }

  return weightedRandom(posts)!;
};

// Helper function

const _getTradingPosts = async (
  client: Arweave,
  exchangeContract: string,
  exchangeWallet: string
): Promise<{ posts: string[]; vault: VaultInterface }> => {
  // Fetch all trading posts.
  const gql = new ArDB(client);
  const query = (await gql
    .search()
    .to(exchangeWallet)
    .tag("Exchange", "Verto")
    .tag("Type", "Genesis")
    .only("owner.address")
    .findAll()) as GQLEdgeTransactionInterface[];
  const res: string[] = Array.from(
    new Set(query.map((edge) => edge.node.owner.address))
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

  return { posts: res, vault };
};

export const getReputation = async (
  addr: string,
  client: Arweave,
  vault: VaultInterface
): Promise<number> => {
  const stakeWeighted = ((await getStake(addr, client, vault)) * 1) / 2,
    timeStakedWeighted = ((await getTimeStaked(addr, client, vault)) * 1) / 3,
    balanceWeighted = ((await getBalance(addr, client)) * 1) / 6;

  return parseFloat(
    (stakeWeighted + timeStakedWeighted + balanceWeighted).toFixed(3)
  );
};
