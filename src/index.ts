import axios from "axios";
import { BalanceInterface, OrderInterface, TokenInterface } from "./faces";

export default class Verto {
  public endpoint = "https://v2.cache.verto.exchange";

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
   * @returns The price as a number, or undefined.
   */
  async getPrice(id: string): Promise<number | undefined> {
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
}
