import ArDB from "ardb";
import {
  GQLEdgeTransactionInterface,
  GQLTransactionInterface,
} from "ardb/lib/faces/gql";
import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import axios from "axios";
import { SmartWeave, SmartWeaveNodeFactory } from "redstone-smartweave";
import {
  CommunityContractToken,
  fetchContract,
  fetchTokens,
  fetchTokenStateMetadata,
} from "verto-cache-interface";
import {
  BalanceInterface,
  DecodedTag,
  OrderBookInterface,
  OrderInterface,
  PriceInterface,
  TokenInterface,
  TokenPair,
  TokenType,
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
  public smartweave: SmartWeave;
  public cache: boolean;

  public endpoint = "https://v2.cache.verto.exchange";
  private EXCHANGE_WALLET = "aLemOhg9OGovn-0o4cOCbueiHT9VgdYnpJpq7NgMA1A";
  private EXCHANGE_CONTRACT = "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A";
  private CLOB_CONTRACT = ""; // TODO
  private COMMUNITY_CONTRACT = "t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE";
  private EXCHANGE_FEE = 0.005;

  /**
   *
   * @param arweave An optional Arweave instance.
   * @param wallet An optional Arweave keyfile.
   */
  constructor(arweave?: Arweave, wallet?: JWKInterface, cache: boolean = true) {
    if (arweave) this.arweave = arweave;
    if (wallet) this.wallet = wallet;

    this.cache = cache;
    this.smartweave = SmartWeaveNodeFactory.memCached(this.arweave);
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
   * @param after Optional latest transaction id, used for pagination.
   * @returns List of transaction ids, statuses, amounts, & timestamps.
   */
  async getTransactions(
    address: string,
    after?: string
  ): Promise<TransactionInterface[]> {
    const gql = new ArDB(this.arweave);
    let inTxQuery = gql.search().to(address).limit(5);
    let outTxQuery = gql.search().from(address).limit(5);

    if (after) {
      const tx = (await new ArDB(this.arweave)
        .search()
        .id(after)
        .only(["block", "block.height"])
        .findOne()) as GQLEdgeTransactionInterface[];

      if (tx.length) {
        inTxQuery = inTxQuery.max(tx[0].node.block.height);
        outTxQuery = outTxQuery.max(tx[0].node.block.height);
      }
    }

    let inTxs = (await inTxQuery.find()) as GQLEdgeTransactionInterface[];
    let outTxs = (await outTxQuery.find()) as GQLEdgeTransactionInterface[];

    if (after) {
      const inIndex = inTxs.findIndex((tx) => tx.node.id === after);
      const outIndex = outTxs.findIndex((tx) => tx.node.id === after);

      if (inIndex > -1) inTxs = inTxs.slice(inIndex + 1);
      if (outIndex > -1) outTxs = outTxs.slice(outIndex + 1);
    }

    const res: TransactionInterface[] = [];

    for (const { node } of [...inTxs, ...outTxs]) {
      if (res.find(({ id }) => id === node.id)) continue;

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
  async getTokens(type?: TokenType): Promise<TokenInterface[]> {
    let tokens: CommunityContractToken[] = [];
    const parsedTokens: TokenInterface[] = [];

    if (this.cache) tokens = await fetchTokens(type);
    else {
      const contract = await this.getState(this.COMMUNITY_CONTRACT);

      tokens = contract.tokens;
    }

    for (const token of tokens) {
      if (this.cache) {
        const data = await fetchTokenStateMetadata(token.id);

        if (!data) continue;
        parsedTokens.push({
          id: data.id,
          name: data.name,
          ticker: data.ticker,
        });
      } else {
        const data = await this.getState(token.id);

        if (!data) continue;
        parsedTokens.push({
          id: token.id,
          name: data.name,
          ticker: data.ticker,
        });
      }
    }

    return parsedTokens;
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
   * @param tags Optional additional tags
   * @returns The transaction id of the transfer.
   */
  async transfer(
    amount: number,
    id: string,
    target: string,
    tags: { name: string; value: string }[] = []
  ) {
    const contract = this.smartweave.contract(id).connect(this.wallet);
    const transaction = contract.writeInteraction(
      {
        function: "transfer",
        target,
        qty: amount,
      },
      [
        { name: "Exchange", value: "Verto" },
        { name: "Action", value: "Transfer" },
        ...tags,
      ],
      {
        target,
        winstonQty: "0",
      }
    );

    return transaction;
  }

  /**
   * List a new token on the exchange.
   * @param address The ID of the token
   * @returns InteractionID
   */
  async list(address: string, type: TokenType, tags: DecodedTag[] = []): Promise<string> {
    const contract = this.smartweave
      .contract(this.COMMUNITY_CONTRACT)
      .connect(this.wallet);

    if(!this.validateHash(address)) throw new Error("Invalid token address.");

    // TODO: do we want fees on this @t8
    const interactionID = await contract.writeInteraction({
      function: "list",
      id: address,
      type
    }, [
      {
        name: "Exchange",
        value: "Verto",
      },
      {
        name: "Action",
        value: "ListToken",
      },
      ...tags
    ]);

    if (!interactionID) throw new Error("Could not list token.");

    return interactionID;
  }

  /**
   * Add a new pair to the exchange.
   * @param pair A tuple of two token IDs
   * @returns InteractionID
   */
  async addPair(pair: TokenPair, tags: DecodedTag[] = []): Promise<string> {
    const contract = this.smartweave
      .contract(this.CLOB_CONTRACT)
      .connect(this.wallet);

    if (pair.length !== 2) throw new Error("Invalid pair. Length should be 2.");

    pair.forEach((hash) => {
      if (!this.validateHash(hash)) throw new Error(`Invalid token address in pair "${hash}".`);
    });

    // TODO: do we want fees on this @t8
    const interactionID = await contract.writeInteraction({
      function: "addPair",
      pair
    }, [
      {
        name: "Exchange",
        value: "Verto",
      },
      {
        name: "Action",
        value: "AddPair",
      },
      ...tags
    ]);

    if (!interactionID) throw new Error("Could not add pair.");

    return interactionID;
  }

  /**
   * Create a swap.
   * @param pair The two tokens to trade between. Must be an existing pair.
   * @param amount The amount of tokens sent to the contract.
   * @param price Optional price for the order.
   * @param tags Optional custom tags.
   * @returns OrderID
   */
  async swap(
    pair: {
      from: string;
      to: string;
    },
    amount: number,
    price?: number,
    tags: DecodedTag[] = []
  ): Promise<string> {
    // Validate hashes
    if (!/[a-z0-9_-]{43}/i.test(pair.from) || !/[a-z0-9_-]{43}/i.test(pair.to))
      throw new Error(
        "Invalid ID in pair. Must be a valid SmartWeave contract ID"
      );

    const contract = this.smartweave
      .contract(this.CLOB_CONTRACT)
      .connect(this.wallet);

    // Transfer input tokens to the orderbook
    const transferID = await this.transfer(
      amount,
      pair.from,
      this.CLOB_CONTRACT,
      [{ name: "Type", value: "Send-Input" }]
    );

    // Create the swap interaction
    const orderID = await contract.writeInteraction(
      {
        function: "createOrder",
        transaction: transferID,
        pair: [pair.from, pair.to],
        price: price,
      },
      [
        {
          name: "Exchange",
          value: "Verto",
        },
        {
          name: "Action",
          value: "Order",
        },
        ...tags,
      ]
    );

    if (orderID === null) throw new Error("Could not create order");

    // Create exchange fee
    await this.createFee(amount, pair.from, orderID, "exchange");

    // Create VRT holder fee
    await this.createFee(amount, pair.from, orderID, "token_holder");

    axios.post(`https://hook.verto.exchange/api/transaction?id=${orderID}`);

    return orderID;
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

  // TODO: implement cache and switch to clob contract

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

  private async createFee(
    amount: number,
    token: string,
    orderID: string,
    feeTarget: "exchange" | "token_holder"
  ) {
    const fee = Math.ceil(Math.ceil(amount) * this.EXCHANGE_FEE);
    const target =
      feeTarget === "exchange"
        ? this.EXCHANGE_WALLET
        : await this.selectWeightedHolder();

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
      Order: orderID,
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

    await this.arweave.transactions.sign(transaction, this.wallet);
    await this.arweave.transactions.post(transaction);
  }

  private async selectWeightedHolder(): Promise<string> {
    const res = await axios.get(
      `${this.endpoint}/${this.EXCHANGE_CONTRACT}?filter=state.balances%20state.vault`
    );

    const { state } = res.data;
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

  /**
   * Get the state of a contract
   * @param addr Address of the contract
   * @returns Contract state
   */
  private async getState(addr: string) {
    if (this.cache) return (await fetchContract(addr))?.state;
    else {
      const contract = this.smartweave.contract(addr).connect(this.wallet);

      return (await contract.readState()).state;
    }
  }

  private validateHash(hash: string) {
    return /[a-z0-9_-]{43}/i.test(hash);
  }
}
