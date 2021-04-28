import ArDB from "ardb";
import { GQLEdgeTransactionInterface } from "ardb/lib/faces/gql";
import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import axios from "axios";
import { interactWrite } from "smartweave";
import {
  BalanceInterface,
  OrderBookInterface,
  OrderInterface,
  PriceInterface,
  TokenInterface,
  TradingPostInterface,
  TransactionInterface,
  UserInterface,
} from "./faces";

const client = new Arweave({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export default class Verto {
  public arweave = client;
  public wallet: "use_wallet" | JWKInterface = "use_wallet";

  public endpoint = "https://v2.cache.verto.exchange";

  /**
   *
   * @param arweave An optional Arweave instance.
   * @param wallet An optional Arweave keyfile.
   */
  constructor(arweave?: Arweave, wallet?: JWKInterface) {
    if (arweave) this.arweave = arweave;
    if (wallet) this.wallet = wallet;
  }

  // === User Functions ===

  /**
   * Fetches the user info for a given wallet address or username.
   * @param input User wallet address or username.
   * @returns The user's data such as name & image, or undefined.
   */
  async getUser(input: string): Promise<UserInterface | undefined> {
    const res = await axios.get(`${this.endpoint}/user/${input}`);
    if (res.data === "Not Found") return undefined;
    return res.data;
  }

  /**
   * Fetches the assets for a given wallet address.
   * @param address User wallet address.
   * @returns List of asset ids, balances, names, tickers, & logos.
   */
  async getBalances(address: string): Promise<BalanceInterface[]> {
    const res = await axios.get(`${this.endpoint}/user/${address}/balances`);
    return res.data;
  }

  /**
   * Fetches the orders for a given wallet address.
   * @param address User wallet address.
   * @returns List of order ids, statuses, inputs, outputs, & timestamps.
   */
  async getOrders(address: string): Promise<OrderInterface[]> {
    const res = await axios.get(`${this.endpoint}/user/${address}/orders`);
    return res.data;
  }

  /**
   * Fetches the latest transactions for a given wallet address.
   * @param address User wallet address.
   * @returns List of transaction ids, statuses, amounts, & timestamps.
   */
  async getTransactions(address: string): Promise<TransactionInterface[]> {
    const gql = new ArDB(this.arweave);

    const inTxs = (await gql
      .search()
      .to(address)
      .limit(5)
      .find()) as GQLEdgeTransactionInterface[];
    const outTxs = (await gql
      .search()
      .from(address)
      .limit(5)
      .find()) as GQLEdgeTransactionInterface[];

    const res: TransactionInterface[] = [];

    for (const { node } of [...inTxs, ...outTxs]) {
      const appName = node.tags.find((tag) => tag.name === "App-Name");

      let status;
      let amount;
      if (appName && appName.value === "SmartWeaveAction") {
        const input = node.tags.find((tag) => tag.name === "Input");

        if (input) {
          const parsedInput = JSON.parse(input.value);

          if (parsedInput.function === "transfer" && parsedInput.qty) {
            const { data: contract } = await axios.get(
              `${this.endpoint}/${
                node.tags.find((tag) => tag.name === "Contract")?.value
              }?filter=state.ticker%20validity.${node.id}`
            );

            amount = `${parsedInput.qty} ${
              contract.state ? contract.state.ticker : "???"
            }`;

            if (contract.validity && contract.validity[node.id] === false)
              status = "error";
          }
        }
      }

      res.push({
        id: node.id,
        // @ts-ignore
        status: node.block ? status || "success" : "pending",
        type: node.owner.address === address ? "out" : "in",
        amount: amount || `${parseFloat(node.quantity.ar)} AR`,
        timestamp: node.block && node.block.timestamp,
      });
    }

    return res
      .sort(
        (a, b) =>
          (b.timestamp ||
            parseFloat(new Date().getTime().toString().substring(0, 10))) -
          (a.timestamp ||
            parseFloat(new Date().getTime().toString().substring(0, 10)))
      )
      .slice(0, 5);
  }

  // === Token Functions ===

  /**
   * Fetches the tokens traded on Verto.
   * @returns List of token ids, names, & tickers.
   */
  async getTokens(): Promise<TokenInterface[]> {
    const res = await axios.get(`${this.endpoint}/tokens`);
    return res.data;
  }

  /**
   * Fetches the latest price for a given token.
   * @param id Token contract id.
   * @returns The price with name & ticker, or undefined.
   */
  async getPrice(id: string): Promise<PriceInterface | undefined> {
    const res = await axios.get(`${this.endpoint}/token/${id}/price`);
    return res.data;
  }

  /**
   * Fetches the price history for a given token.
   * @param id Token contract id.
   * @returns Dates mapped to prices.
   */
  async getPriceHistory(id: string): Promise<{ [date: string]: number }> {
    const res = await axios.get(`${this.endpoint}/token/${id}/history`);
    return res.data;
  }

  /**
   * Transfer a specified amount of tokens to another wallet.
   * @param amount The amount of tokens.
   * @param id Token contract id.
   * @param target The receiving address.
   * @returns The transaction id of the transfer.
   */
  async transfer(amount: number, id: string, target: string): Promise<string> {
    const transaction = await interactWrite(
      this.arweave,
      this.wallet,
      id,
      {
        function: "transfer",
        target,
        qty: amount,
      },
      [
        { name: "Exchange", value: "Verto" },
        { name: "Action", value: "Transfer" },
      ],
      target
    );

    return transaction;
  }

  // === Trading Post Functions ===

  /**
   * Fetches the currently staked trading posts.
   * @returns List of trading post addresses, balances, & stakes.
   */
  async getTradingPosts(): Promise<TradingPostInterface[]> {
    const res = await axios.get(`${this.endpoint}/posts`);
    return res.data;
  }

  /**
   * Recommends a random trading post based on it's reputation.
   * @returns The address of the selected trading post.
   */
  async recommendPost(): Promise<string> {
    const posts = await this.getTradingPosts();

    const reputations: { [address: string]: number } = {};
    let total = 0;
    for (const post of posts) {
      const reputation = this.getReputation(post);
      reputations[post.address] = reputation;
      total += reputation;
    }

    const normalised: { [address: string]: number } = {};
    for (const post of posts) {
      normalised[post.address] = reputations[post.address] / total;
    }

    return this.weightedRandom(normalised);
  }

  /**
   * Fetches the order book for a specific trading post and token.
   * @param address The trading post address.
   * @param id Token contract id.
   * @returns List of order ids, amounts, rates, & types.
   */
  async getOrderBook(
    address: string,
    id: string
  ): Promise<OrderBookInterface[]> {
    const { data } = await axios.get(`${this.endpoint}/posts/${address}`);
    const post: TradingPostInterface = data;
    const endpoint = post.endpoint.split("/ping")[0] + "/orders";

    const res = await axios.get(endpoint);
    const orders: { token: string; orders: OrderBookInterface[] }[] = res.data;

    const entry = orders.find((item) => item.token === id);
    if (entry) {
      return entry.orders;
    } else {
      return [];
    }
  }

  // =🔐= Private Functions =🔐=

  private getReputation(post: TradingPostInterface): number {
    const stakeWeighted = post.stake / 2;
    const timeStakedWeighted = post.time / 3;
    const balanceWeighted = post.balance / 6;

    return parseFloat(
      (stakeWeighted + timeStakedWeighted + balanceWeighted).toFixed(3)
    );
  }

  private weightedRandom(input: { [key: string]: number }): string {
    let sum = 0;
    const r = Math.random();

    for (const key of Object.keys(input)) {
      sum += input[key];
      if (r <= sum && input[key] > 0) {
        return key;
      }
    }

    return "aLemOhg9OGovn-0o4cOCbueiHT9VgdYnpJpq7NgMA1A";
  }
}
