import { cacheContractHook } from "verto-cache-interface";
import { SmartWeave } from "redstone-smartweave";
import {
  DecodedTag,
  ExtensionOrJWK,
  OrderBookInterface,
  TokenPair,
} from "./faces";
import Arweave from "arweave";
import axios from "axios";
import Utils from "./utils";
import Token from "./token";

export default class Exchange {
  private arweave: Arweave;
  private wallet: ExtensionOrJWK;
  private smartweave: SmartWeave;
  private utils: Utils;
  private token: Token;

  /**
   *
   * @param arweave Arweave instance.
   * @param wallet Arweave keyfile.
   * @param smartweave SmartWeave instance.
   * @param utils Utils submodule.
   * @param token Token submodule.
   */
  constructor(
    arweave: Arweave,
    wallet: ExtensionOrJWK,
    smartweave: SmartWeave,
    utils: Utils,
    token: Token
  ) {
    this.arweave = arweave;
    this.wallet = wallet;
    this.smartweave = smartweave;
    this.utils = utils;
    this.token = token;
  }

  /**
   * Add a new pair to the exchange.
   * @param pair A tuple of two token IDs
   * @returns InteractionID
   */
  async addPair(pair: TokenPair, tags: DecodedTag[] = []): Promise<string> {
    const contract = this.smartweave
      .contract(this.utils.CLOB_CONTRACT)
      .connect(this.wallet);

    if (pair.length !== 2) throw new Error("Invalid pair. Length should be 2.");

    pair.forEach((hash) => {
      if (!this.utils.validateHash(hash))
        throw new Error(`Invalid token address in pair "${hash}".`);
    });

    const interactionID = await cacheContractHook(
      () =>
        contract.writeInteraction(
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
    if (
      !this.utils.validateHash(pair.from) ||
      !this.utils.validateHash(pair.to)
    )
      throw new Error(
        "Invalid ID in pair. Must be a valid SmartWeave contract ID"
      );

    const contract = this.smartweave
      .contract(this.utils.CLOB_CONTRACT)
      .connect(this.wallet);

    const orderID = await cacheContractHook(async () => {
      // Transfer input tokens to the orderbook
      const transferID = await this.token.transfer(
        amount,
        pair.from,
        this.utils.CLOB_CONTRACT,
        [{ name: "Type", value: "Send-Input" }]
      );

      // Create the swap interaction
      return await contract.writeInteraction(
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
   * Cancel a swap.
   * @param orderID The transaction id of the swap.
   * @returns The transaction id of the cancel.
   */
  async cancel(orderID: string): Promise<string> {
    const contract = this.smartweave
      .contract(this.utils.CLOB_CONTRACT)
      .connect(this.wallet);

    const transactionID = await cacheContractHook(
      async () =>
        contract.writeInteraction(
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
   * Fetches the order book for a specific token from the CLOB contract.
   * @param id Token contract id.
   * @returns List of order ids, amounts, rates, & types.
   */
  async getOrderBook(id: string): Promise<OrderBookInterface[]> {
    // get clob contract state
    const clobContractState: {
      [key: string]: any;
      pairs: {
        pair: [string, string];
        orders: {
          [key: string]: any;
        }[];
      }[];
    } = await this.utils.getState(this.utils.CLOB_CONTRACT);

    // map orders
    const allOrders: OrderBookInterface[][] = clobContractState.pairs
      .filter(({ pair }) => pair.includes(id))
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
    return ([] as OrderBookInterface[]).concat(...allOrders);
  }
}
