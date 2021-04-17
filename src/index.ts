import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import axios from "axios";
import { interactWrite } from "smartweave";
import {
  BalanceInterface,
  OrderInterface,
  PriceInterface,
  TokenInterface,
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
}
