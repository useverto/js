import { CommunityContractPeople, fetchBalancesForAddress, fetchUsers, UserBalance } from "verto-cache-interface"
import {
  OrderInterface,
  TransactionInterface,
  UserInterface
} from "./faces";
import {
  GQLEdgeTransactionInterface,
} from "ardb/lib/faces/gql";
import ArDB from "ardb";
import Arweave from "arweave";
import axios from "axios"
import Utils from "./utils"

export default class User {
  private arweave: Arweave;
  private cache: boolean;
  private utils: Utils;

  /**
   *
   * @param arweave Arweave instance.
   * @param cache Use the Verto cache.
   * @param utils Utils submodule.
   */
   constructor(arweave: Arweave, cache: boolean, utils: Utils) {
    this.arweave = arweave;
    this.cache = cache;
    this.utils = utils;
  }

  /**
   * Fetches the user info for a given wallet address or username.
   * @param input User wallet address or username.
   * @returns The user's data such as name & image, or undefined.
   */
   async getUser(input: string): Promise<UserInterface | undefined> {
    let allUsers: CommunityContractPeople[];

    if (this.cache) allUsers = await fetchUsers();
    else {
      const contract = await this.utils.getState(this.utils.COMMUNITY_CONTRACT);
      allUsers = contract.people;
    }

    return allUsers.find(
      (user) => user.username === input || user.addresses.includes(input)
    );
  }

  /**
   * Fetches the assets (listed on Verto) for a given wallet address.
   * @param address User wallet address.
   * @returns List of asset ids, balances, names, tickers, & logos.
   */
  async getBalances(address: string): Promise<UserBalance[]> {
    if (!this.cache) {
      const balances: UserBalance[] = [];
      // TODO
      const listedTokens = await this.getTokens();

      for (const token of listedTokens) {
        const tokenState = await this.utils.getState(token.id);

        if (tokenState?.balances?.[address]) {
          balances.push({
            contractId: token.id,
            name: token.name,
            ticker: token.ticker,
            logo: this.utils.getPSTSettingValue("communityLogo", tokenState),
            balance: tokenState.balances[address],
            userAddress: address
          });
        }
      }

      return balances;
    } else return await fetchBalancesForAddress(address);
  }

  /**
   * Fetches the orders for a given wallet address.
   * @param address User wallet address.
   * @returns List of order ids, statuses, inputs, outputs, & timestamps.
   */
  async getOrders(address: string): Promise<OrderInterface[]> {
    const res = await axios.get(`${this.utils.endpoint}/user/${address}/orders`);
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
              `${this.utils.endpoint}/${
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
}