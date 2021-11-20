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
  ExtensionOrJWK,
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
import Token from "./token";

const client = new Arweave({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export default class Verto {
  public arweave = client;
  public wallet: ExtensionOrJWK = "use_wallet";
  public smartweave: SmartWeave;
  public cache: boolean;

  // Submodules
  private utils: Utils;
  public user: User;
  public token: Token;

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
    this.utils = new Utils(
      this.arweave,
      this.wallet,
      this.cache,
      this.smartweave
    );
    this.user = new User(this.arweave, this.cache, this.utils);
    this.token = new Token(this.arweave, this.wallet, this.cache, this.smartweave, this.utils);
  }

  // === Token Functions ===

  

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
