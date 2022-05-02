import { cacheContractHook } from "verto-cache-interface";
import {
  ClobContractStateInterface,
  CreateOrderResult,
  DecodedTag,
  ExtensionOrJWK,
  OrderInterfaceWithPair,
  SwapPairInterface,
  TokenPair,
} from "./faces";
import { interactWrite } from "smartweave";
import Arweave from "arweave";
import axios from "axios";
import Utils from "./utils";
import Token from "./token";

export default class Exchange {
  private arweave: Arweave;
  private wallet: ExtensionOrJWK;
  private utils: Utils;
  private token: Token;

  /**
   *
   * @param arweave Arweave instance.
   * @param wallet Arweave keyfile.
   * @param utils Utils submodule.
   * @param token Token submodule.
   */
  constructor(
    arweave: Arweave,
    wallet: ExtensionOrJWK,
    utils: Utils,
    token: Token
  ) {
    this.arweave = arweave;
    this.wallet = wallet;
    this.utils = utils;
    this.token = token;
  }

  /**
   * Add a new pair to the exchange
   * @param pair A tuple of two token IDs
   * @param tags Optional tags for the interaction
   * @returns InteractionID
   */
  async addPair(pair: TokenPair, tags: DecodedTag[] = []): Promise<string> {
    if (pair.length !== 2) throw new Error("Invalid pair. Length should be 2.");

    pair.forEach((hash) => {
      if (!this.utils.validateHash(hash))
        throw new Error(`Invalid token address in pair "${hash}".`);
    });

    const interactionID = await cacheContractHook(async () => {
      // create interaction
      const id = await interactWrite(
        this.arweave,
        this.wallet,
        this.utils.CLOB_CONTRACT,
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

      // mine if testnet
      await this.utils.mineIfNeeded();

      return id;
    }, this.utils.CLOB_CONTRACT);

    if (!interactionID) throw new Error("Could not add pair.");

    return interactionID;
  }

  /**
   * Create a swap
   * @param pair The two tokens to trade between. Must be an existing pair
   * @param amount The amount of tokens sent to the contract
   * @param price Optional price for the order
   * @param tags Optional custom tags
   * @returns OrderID
   */
  async swap(
    pair: SwapPairInterface,
    amount: number,
    price?: number,
    tags: DecodedTag[] = []
  ): Promise<string> {
    // Validate hashes
    if (
      !this.utils.validateHash(pair.from) ||
      !this.utils.validateHash(pair.to)
    )
      throw new Error(
        "Invalid ID in pair. Must be a valid SmartWeave contract ID"
      );

    const orderID = await cacheContractHook(async () => {
      // Transfer input tokens to the orderbook
      const transferID = await this.token.transfer(
        amount,
        pair.from,
        this.utils.CLOB_CONTRACT,
        [{ name: "Type", value: "Send-Input" }]
      );

      // Interaction input
      const input = {
        function: "createOrder",
        transaction: transferID,
        pair: [pair.from, pair.to],
        price: price,
      };

      // Interaction tags
      const interactionTags = [
        {
          name: "Exchange",
          value: "Verto",
        },
        {
          name: "Action",
          value: "Order",
        },
        ...tags,
      ];

      // Create the swap interaction
      const res = await this.utils.interactWriteWithResult<
        ClobContractStateInterface,
        CreateOrderResult
      >(this.utils.CLOB_CONTRACT, input, interactionTags);

      // Validate result
      if (res.type === "ok" && res.result.status === "success") {
        // mine if testnet
        await this.utils.mineIfNeeded();

        // invoke foreign calls on token contracts
        await this.utils.syncFCP(this.utils.CLOB_CONTRACT, pair.from, pair.to);

        // return the order ID
        return res.interactionID;
      } else {
        throw new Error(res.result.message);
      }
    }, [pair.from, this.utils.CLOB_CONTRACT, pair.to]);

    if (orderID === null) throw new Error("Could not create order");

    // Create exchange fee
    await this.utils.createFee(amount, pair.from, orderID, "exchange");

    // Create VRT holder fee
    await this.utils.createFee(amount, pair.from, orderID, "token_holder");

    // mine if testnet
    await this.utils.mineIfNeeded();

    // Call Discord hook if not testnet
    if (!(await this.utils.isTestnet())) {
      axios.post(`https://hook.verto.exchange/api/transaction?id=${orderID}`);
    }

    return orderID;
  }

  /**
   * Cancel an order. This will return the non-filled tokens for an order and
   * remove it from the orderbook
   * @param orderID The transaction id of the swap
   * @returns The transaction id of the cancel
   */
  async cancel(orderID: string): Promise<string> {
    // get the cancelled order
    const order = await this.getOrder(orderID);

    if (!order) throw new Error("Order does not exist");

    const transactionID = await cacheContractHook(async () => {
      // cancel interaction
      const txID = await interactWrite(
        this.arweave,
        this.wallet,
        this.utils.CLOB_CONTRACT,
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

      // mine if testnet
      await this.utils.mineIfNeeded();

      // sync fcp for the two tokens in the pair
      await this.utils.syncFCP(this.utils.CLOB_CONTRACT, ...order.pair);

      return txID;
    }, [this.utils.CLOB_CONTRACT, ...order.pair]);

    if (!transactionID) throw new Error("Order could not be cancelled");

    return transactionID;
  }

  /**
   * Fetches the order book for a specific token (or all orders) from the CLOB contract
   * @param input Token contract ID or token pair. Leave undefined to fetch **all** orders
   * @returns List of orders
   */
  async getOrderBook(
    input?: string | TokenPair
  ): Promise<OrderInterfaceWithPair[]> {
    // get clob contract state
    const clobContractState: ClobContractStateInterface = await this.utils.getState(
      this.utils.CLOB_CONTRACT
    );
    // map orders
    const allOrders: OrderInterfaceWithPair[] = clobContractState.pairs.flatMap(
      ({ pair, orders }) =>
        orders.map((order) => ({
          ...order,
          pair,
        }))
    );

    if (!input) return allOrders;

    // flatten orders
    return allOrders.filter(({ pair }) => {
      if (typeof input === "string") return pair.includes(input);
      else return pair.includes(input[0]) && pair.includes(input[1]);
    });
  }

  /**
   * Get a single order with by it's ID
   * @param orderID Order's ID
   * @returns Order data
   */
  async getOrder(orderID: string): Promise<OrderInterfaceWithPair | undefined> {
    const allOrders = await this.getOrderBook();

    return allOrders.find(({ id }) => id === orderID);
  }
}
