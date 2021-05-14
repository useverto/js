import ArDB from "ardb";
import {
  GQLEdgeTransactionInterface,
  GQLTransactionInterface,
} from "ardb/lib/faces/gql";
import Arweave from "arweave";
import Transaction from "arweave/node/lib/transaction";
import { JWKInterface } from "arweave/node/lib/wallet";
import axios from "axios";
import { interactWrite } from "smartweave";
import {
  BalanceInterface,
  ConfigInterface,
  FeeInterface,
  OrderBookInterface,
  OrderInterface,
  PriceInterface,
  SwapInterface,
  TokenInterface,
  TradingPostInterface,
  TransactionInterface,
  UserInterface,
  VaultInterface,
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
  private EXCHANGE_WALLET = "aLemOhg9OGovn-0o4cOCbueiHT9VgdYnpJpq7NgMA1A";
  private EXCHANGE_CONTRACT = "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A";
  private EXCHANGE_FEE = 0.005;

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
    const res = await axios.get(`${this.endpoint}/token/${id}/priceHistory`);
    return res.data;
  }

  /**
   * Fetches the latest volume for a given token.
   * @param id Token contract id.
   * @returns The volume as a number.
   */
  async getVolume(id: string): Promise<number> {
    const res = await axios.get(`${this.endpoint}/token/${id}/volume`);
    return res.data;
  }

  /**
   * Fetches the volume history for a given token.
   * @param id Token contract id.
   * @returns Dates mapped to volumes.
   */
  async getVolumeHistory(id: string): Promise<{ [date: string]: number }> {
    const res = await axios.get(`${this.endpoint}/token/${id}/volumeHistory`);
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

  /**
   * Create a swap.
   * @param input An object containing the amount of input, along with the unit.
   * @param output An object containing the output unit, with an optional amount.
   * @param post The receiving trading post address.
   * @param tags Optional custom tags.
   * @returns An object containing the transactions and total cost of the swap.
   */
  async createSwap(
    input: {
      amount: number;
      unit: string | "AR";
    },
    output: {
      amount?: number;
      unit: string | "AR";
    },
    post: string,
    tags?: { name: string; value: string }[]
  ): Promise<SwapInterface | undefined> {
    if (input.unit === "AR") {
      if (/[a-z0-9_-]{43}/i.test(output.unit)) {
        // AR -> Token.
        const transaction = await this.arweave.createTransaction(
          {
            target: post,
            quantity: client.ar.arToWinston(input.amount.toString()),
          },
          this.wallet
        );

        for (const { name, value } of [
          { name: "Exchange", value: "Verto" },
          { name: "Type", value: "Buy" },
          { name: "Token", value: output.unit },
          ...(tags || []),
        ]) {
          transaction.addTag(name, value);
        }

        const fee = await this.createExchangeFee(input.amount);

        return {
          transactions: [
            { transaction },
            { transaction: fee.transaction, type: "fee" },
          ],
          cost: {
            ar:
              input.amount + this.getTransactionFee(transaction) + fee.cost.ar,
            token: 0,
          },
        };
      } else {
        // Unsupported.
      }
    } else if (/[a-z0-9_-]{43}/i.test(input.unit)) {
      if (output.unit === "AR" && output.amount) {
        // Token -> AR.
        const transaction = await this.arweave.createTransaction(
          {
            target: post,
            data: Math.random().toString().slice(-4),
          },
          this.wallet
        );

        for (const { name, value } of [
          { name: "Exchange", value: "Verto" },
          { name: "Type", value: "Sell" },
          { name: "Rate", value: (output.amount / input.amount).toString() },
          { name: "App-Name", value: "SmartWeaveAction" },
          { name: "App-Version", value: "0.3.0" },
          { name: "Contract", value: input.unit },
          {
            name: "Input",
            value: JSON.stringify({
              function: "transfer",
              target: post,
              qty: Math.ceil(input.amount),
            }),
          },
          ...(tags || []),
        ]) {
          transaction.addTag(name, value);
        }

        const tradingPostFee = await this.createTradingPostFee(
          input.amount,
          input.unit,
          post
        );
        const vrtHolderFee = await this.createVRTHolderFee(
          input.amount,
          input.unit
        );

        return {
          transactions: [
            { transaction },
            { transaction: tradingPostFee.transaction, type: "fee" },
            { transaction: vrtHolderFee.transaction, type: "fee" },
          ],
          cost: {
            ar:
              this.getTransactionFee(transaction) +
              tradingPostFee.cost.ar +
              vrtHolderFee.cost.ar,
            token:
              input.amount +
              tradingPostFee.cost.token +
              vrtHolderFee.cost.token,
          },
        };
      } else {
        // Unsupported.
      }
    } else {
      // Unsupported.
    }
  }

  /**
   * Send a swap.
   * @param input A list containing the different order transactions.
   * @returns The transaction id of the swap.
   */
  async sendSwap(
    order: { transaction: Transaction; type?: "fee" }[]
  ): Promise<string> {
    let res: string = "";

    for (const item of order) {
      await this.arweave.transactions.sign(item.transaction, this.wallet);
      await this.arweave.transactions.post(item.transaction);

      if (item.type !== "fee") res = item.transaction.id;
    }

    axios.post(`https://hook.verto.exchange/api/transaction?id=${res}`);
    return res;
  }

  /**
   * Cancel a swap.
   * @param order The transaction id of the swap.
   * @returns The transaction id of the cancel.
   */
  async cancel(order: string): Promise<string> {
    const gql = new ArDB(this.arweave);
    const res = (await gql
      .search("transaction")
      .id(order)
      .only("recipient")
      .findOne()) as GQLTransactionInterface;

    const transaction = await this.arweave.createTransaction(
      {
        target: res.recipient,
        data: Math.random().toString().slice(-4),
      },
      this.wallet
    );

    transaction.addTag("Exchange", "Verto");
    transaction.addTag("Type", "Cancel");
    transaction.addTag("Order", order);

    await this.arweave.transactions.sign(transaction, this.wallet);
    await this.arweave.transactions.post(transaction);

    return transaction.id;
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

  /**
   * Fetches the configuration for a specific trading post.
   * @param address The trading post address.
   * @returns An object containing the configuration, or undefined.
   */
  async getConfig(address: string): Promise<ConfigInterface | undefined> {
    const gql = new ArDB(this.arweave);

    const res = (await gql
      .search()
      .from(address)
      .to(this.EXCHANGE_WALLET)
      .tag("Exchange", "Verto")
      .tag("Type", "Genesis")
      .only("id")
      .findOne()) as GQLEdgeTransactionInterface[];

    if (res.length) {
      const data = await this.arweave.transactions.getData(res[0].node.id, {
        decode: true,
        string: true,
      });

      return JSON.parse(data.toString());
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

    return this.EXCHANGE_WALLET;
  }

  private async createExchangeFee(amount: number): Promise<FeeInterface> {
    const fee = amount * this.EXCHANGE_FEE;

    const transaction = await this.arweave.createTransaction(
      {
        target: this.EXCHANGE_WALLET,
        quantity: client.ar.arToWinston(fee.toString()),
      },
      this.wallet
    );

    transaction.addTag("Exchange", "Verto");
    transaction.addTag("Type", "Fee-Exchange");

    return {
      transaction,
      cost: { ar: fee + this.getTransactionFee(transaction), token: 0 },
    };
  }

  private async createTradingPostFee(
    amount: number,
    token: string,
    post: string
  ): Promise<FeeInterface> {
    const fee = Math.ceil(
      Math.ceil(amount) * (await this.getConfig(post))?.tradeFee!
    );

    const transaction = await this.arweave.createTransaction(
      {
        target: post,
        data: Math.random().toString().slice(-4),
      },
      this.wallet
    );

    const tags = {
      Exchange: "Verto",
      Type: "Fee-Trading-Post",
      "App-Name": "SmartWeaveAction",
      "App-Version": "0.3.0",
      Contract: token,
      Input: JSON.stringify({
        function: "transfer",
        target: post,
        qty: fee,
      }),
    };
    for (const [name, value] of Object.entries(tags)) {
      transaction.addTag(name, value);
    }

    return {
      transaction,
      cost: { ar: this.getTransactionFee(transaction), token: fee },
    };
  }

  private async createVRTHolderFee(
    amount: number,
    token: string
  ): Promise<FeeInterface> {
    const fee = Math.ceil(Math.ceil(amount) * this.EXCHANGE_FEE);
    const target = await this.selectWeightedHolder();

    const transaction = await this.arweave.createTransaction(
      {
        target,
        data: Math.random().toString().slice(-4),
      },
      this.wallet
    );

    const tags = {
      Exchange: "Verto",
      Type: "Fee-VRT-Holder",
      "App-Name": "SmartWeaveAction",
      "App-Version": "0.3.0",
      Contract: token,
      Input: JSON.stringify({
        function: "transfer",
        target,
        qty: fee,
      }),
    };
    for (const [name, value] of Object.entries(tags)) {
      transaction.addTag(name, value);
    }

    return {
      transaction,
      cost: { ar: this.getTransactionFee(transaction), token: fee },
    };
  }

  private getTransactionFee(transaction: Transaction): number {
    return parseFloat(this.arweave.ar.winstonToAr(transaction.reward));
  }

  private async selectWeightedHolder(): Promise<string> {
    const res = await axios.get(
      `${this.endpoint}/${this.EXCHANGE_CONTRACT}?filter=state.balances%20state.vault`
    );

    const state = res.data;
    const balances: { [address: string]: number } = state.balances;
    const vault: VaultInterface = state.vault;

    let totalTokens = 0;
    for (const addr of Object.keys(balances)) {
      totalTokens += balances[addr];
    }

    for (const addr of Object.keys(vault)) {
      if (!vault[addr].length) continue;

      const vaultBalance = vault[addr]
        .map((a) => a.balance)
        .reduce((a, b) => a + b, 0);
      totalTokens += vaultBalance;
      if (addr in balances) {
        balances[addr] += vaultBalance;
      } else {
        balances[addr] = vaultBalance;
      }
    }

    const weighted: { [address: string]: number } = {};
    for (const addr of Object.keys(balances)) {
      weighted[addr] = balances[addr] / totalTokens;
    }

    return this.weightedRandom(weighted);
  }
}
