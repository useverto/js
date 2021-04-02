import axios from "axios";

export default class Verto {
  // User Functions
  async getBalances(address: string) {
    const res = await axios.get(
      `https://v2.cache.verto.exchange/user/${address}/balances`
    );
    return res.data;
  }

  async getOrders(address: string) {
    const res = await axios.get(
      `https://v2.cache.verto.exchange/user/${address}/orders`
    );
    return res.data;
  }
}
