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
  CommunityContractPeople,
  UserBalance,
  fetchContract,
  fetchTokens,
  fetchUsers,
  fetchBalancesForAddress,
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
import Utils from "./utils";
import User from "./user";

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

  // Submodules
  private utils: Utils;
  public user: User;

  /**
   *
   * @param arweave An optional Arweave instance.
   * @param wallet An optional Arweave keyfile.
   * @param cache Use the Verto cache.
   */
  constructor(arweave?: Arweave, wallet?: JWKInterface, cache: boolean = true) {
    if (arweave) this.arweave = arweave;
    if (wallet) this.wallet = wallet;

    this.cache = cache;
    this.smartweave = SmartWeaveNodeFactory.memCached(this.arweave);

    // Submodules
    this.utils = new Utils(this.arweave, this.wallet, this.cache, this.smartweave);
    this.user = new User(this.arweave, this.cache, this.utils);
  }

  // === Token Functions ===

  /**
   * Fetches the tokens listed on Verto.
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

  // TODO
  /**
   * Fetches the type for a given token.
   * @param id Token contract id.
   * @returns The type of the token.
   */
  /*async getTokenType(id: string): Promise<TokenType> {
    if (this.cache) {

    } 
  }*/

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
  async list(
    address: string,
    type: TokenType,
    tags: DecodedTag[] = []
  ): Promise<string> {
    const contract = this.smartweave
      .contract(this.COMMUNITY_CONTRACT)
      .connect(this.wallet);

    if (!this.validateHash(address)) throw new Error("Invalid token address.");

    // TODO: do we want fees on this @t8
    const interactionID = await contract.writeInteraction(
      {
        function: "list",
        id: address,
        type,
      },
      [
        {
          name: "Exchange",
          value: "Verto",
        },
        {
          name: "Action",
          value: "ListToken",
        },
        ...tags,
      ]
    );

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
      if (!this.validateHash(hash))
        throw new Error(`Invalid token address in pair "${hash}".`);
    });

    // TODO: do we want fees on this @t8
    const interactionID = await contract.writeInteraction(
      {
        function: "addPair",
        pair,
      },
      [
        {
          name: "Exchange",
          value: "Verto",
        },
        {
          name: "Action",
          value: "AddPair",
        },
        ...tags,
      ]
    );

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
   * @param orderID The transaction id of the swap.
   * @returns The transaction id of the cancel.
   */
  async cancel(orderID: string): Promise<string> {
    const contract = this.smartweave
      .contract(this.CLOB_CONTRACT)
      .connect(this.wallet);

    const transactionID = await contract.writeInteraction(
      {
        function: "cancelOrder",
        orderID,
      },
      [
        {
          name: "Exchange",
          value: "Verto",
        },
        {
          name: "Action",
          value: "CancelOrder",
        },
      ]
    );

    if (!transactionID) throw new Error("Order could not be cancelled");

    return transactionID;
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
}
