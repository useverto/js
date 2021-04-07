import axios from "axios";
import { BalanceInterface, OrderInterface } from "./faces";

export default class Verto {
  // === User Functions ===

  /**
   * Fetches the assets for a given wallet address.
   * @param address User wallet address.
   * @returns List of asset ids, balances, names, tickers, & logos.
   */
  async getBalances(address: string): Promise<BalanceInterface[]> {
    const res = await axios.get(
      `https://v2.cache.verto.exchange/user/${address}/balances`
    );
    return res.data;
  }

  /**
   * Fetches the orders for a given wallet address.
   * @param address User wallet address.
   * @returns List of order ids, statuses, inputs, outputs, & timestamps.
   */
  async getOrders(address: string): Promise<OrderInterface[]> {
    const res = await axios.get(
      `https://v2.cache.verto.exchange/user/${address}/orders`
    );
    return res.data;
  }
}
