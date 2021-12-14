import { cacheContractHook } from "verto-cache-interface";
import {
  ClobContractStateInterface,
  DecodedTag,
  ExtensionOrJWK,
  OrderInterface,
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

    const interactionID = await cacheContractHook(
      () =>
        interactWrite(
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
        ),
      this.utils.CLOB_CONTRACT
    );

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

      // Create the swap interaction
      return await interactWrite(
        this.arweave,
        this.wallet,
        this.utils.CLOB_CONTRACT,
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
    }, [pair.from, this.utils.CLOB_CONTRACT, pair.to]);

    if (orderID === null) throw new Error("Could not create order");

    // Create exchange fee
    await this.utils.createFee(amount, pair.from, orderID, "exchange");

    // Create VRT holder fee
    await this.utils.createFee(amount, pair.from, orderID, "token_holder");

    // Call Discord hook
    axios.post(`https://hook.verto.exchange/api/transaction?id=${orderID}`);

    return orderID;
  }

  /**
   * Cancel an order. This will return the non-filled tokens for an order and
   * remove it from the orderbook
   * @param orderID The transaction id of the swap
   * @returns The transaction id of the cancel
   */
  async cancel(orderID: string): Promise<string> {
    const transactionID = await cacheContractHook(
      () =>
        interactWrite(
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
        ),
      this.utils.CLOB_CONTRACT
    );

    if (!transactionID) throw new Error("Order could not be cancelled");

    return transactionID;
  }

  /**
   * Fetches the order book for a specific token from the CLOB contract
   * @param input Token contract ID or token pair
   * @returns List of orders
   */
  async getOrderBook(input: string | TokenPair): Promise<OrderInterface[]> {
    // get clob contract state
    const clobContractState: ClobContractStateInterface = await this.utils.getState(
      this.utils.CLOB_CONTRACT
    );

    // map orders
    const allOrders: OrderInterface[][] = clobContractState.pairs
      .filter(({ pair }) => {
        if (typeof input === "string") return pair.includes(input);
        else return pair.includes(input[0]) && pair.includes(input[1]);
      })
      .map(({ pair, orders }) =>
        orders.map((order) => ({
          id: order.id,
          owner: order.creator,
          pair,
          price: order.price,
          filled: order.originalQuantity - order.quantity,
          quantity: order.originalQuantity,
        }))
      );

    // flatten orders
    return ([] as OrderInterface[]).concat(...allOrders);
  }
}
