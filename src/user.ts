import {
  CommunityContractPeople,
  fetchBalancesForAddress,
  fetchContract,
  fetchUsers,
  UserBalance,
} from "verto-cache-interface";
import {
  OrderInterfaceWithPair,
  TransactionInterface,
  UserInterface,
} from "./faces";
import Arweave from "arweave";
import Utils from "./utils";
import Token from "./token";
import Exchange from "./exchange";

export default class User {
  private arweave: Arweave;
  private cache: boolean;
  private utils: Utils;
  private token: Token;
  private exchange: Exchange;

  /**
   *
   * @param arweave Arweave instance.
   * @param cache Use the Verto cache.
   * @param utils Utils submodule.
   * @param token Token submodule.
   */
  constructor(
    arweave: Arweave,
    cache: boolean,
    utils: Utils,
    token: Token,
    exchange: Exchange
  ) {
    this.arweave = arweave;
    this.cache = cache;
    this.utils = utils;
    this.token = token;
    this.exchange = exchange;
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
      const listedTokens = await this.token.getTokens();

      for (const token of listedTokens) {
        const tokenState = await this.utils.getState(token.id);

        if (tokenState?.balances?.[address]) {
          balances.push({
            contractId: token.id,
            name: token.name,
            ticker: token.ticker,
            logo: this.utils.getPSTSettingValue("communityLogo", tokenState),
            balance: tokenState.balances[address],
            userAddress: address,
          });
        }
      }

      return balances;
    } else {
      return await fetchBalancesForAddress(address);
    }
  }

  /**
   * Fetches the orders for a given wallet address
   * @param address User wallet address
   * @returns List of orders
   */
  async getOrders(address: string): Promise<OrderInterfaceWithPair[]> {
    // get all orders
    const allOrders = await this.exchange.getOrderBook();

    return allOrders.filter((order) => order.creator === address);
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
    let maxHeight: number | undefined = undefined;

    // get the block height for the after tx
    if (after) {
      const tx = await this.utils.arGQL(
        `
        query($id: ID!) {
          transaction(id: $id) {
            id
            block {
              height
            }
          }
        }      
      `,
        { id: after }
      );

      if (tx) {
        maxHeight = tx.data.transaction.block.height;
      }
    }

    // get outgoing txs
    const outTxQuery = await this.utils.arGQL(
      `
      query ($addr: String!, $max: Int) {
        transactions (owners: [$addr], block: { max: $max }) {
          edges {
            node {
              id
              owner {
                address
              }
              recipient
              quantity {
                ar
                winston
              }
              tags {
                name
                value
              }
              block {
                timestamp
              }
            }
          }
        }
      }
    `,
      { addr: address, max: maxHeight }
    );

    // get incoming txs
    const inTxQuery = await this.utils.arGQL(
      `
      query ($addr: String!, $max: Int) {
        transactions (recipients: [$addr], block: { max: $max }) {
          edges {
            node {
              id
              owner {
                address
              }
              recipient
              quantity {
                ar
                winston
              }
              tags {
                name
                value
              }
              block {
                timestamp
              }
            }
          }
        }
      }
    `,
      { addr: address, max: maxHeight }
    );

    // parse data
    let inTxs = inTxQuery.data.transactions.edges;
    let outTxs = outTxQuery.data.transactions.edges;

    // if we are limiting to an "after" tx
    // remove the ones before that tx
    if (after) {
      const inIndex = inTxs.findIndex((tx) => tx.node.id === after);
      const outIndex = outTxs.findIndex((tx) => tx.node.id === after);

      if (inIndex > -1) inTxs = inTxs.slice(inIndex + 1);
      if (outIndex > -1) outTxs = outTxs.slice(outIndex + 1);
    }

    // we'll push the formatted txs here
    const res: TransactionInterface[] = [];

    for (const { node } of [...inTxs, ...outTxs]) {
      if (res.find(({ id }) => id === node.id)) continue;

      const appName = this.utils.getTagValue("App-Name", node.tags);

      let status;
      let amount;

      // do some checks to see if it is a token transfer
      // if it is, we format the amount
      if (appName && appName === "SmartWeaveAction") {
        const input = node.tags.find((tag) => tag.name === "Input");

        if (input) {
          const parsedInput = JSON.parse(input.value);
          const contractID = this.utils.getTagValue("Contract", node.tags);

          if (
            parsedInput.function === "transfer" &&
            parsedInput.qty &&
            contractID
          ) {
            const contract = await fetchContract(contractID, true);

            if (contract) {
              amount = `${parsedInput.qty} ${
                contract.state ? contract.state.ticker : "???"
              }`;

              if (contract.validity && contract.validity[node.id] === false)
                status = "error";
            }
          }
        }
      }

      res.push({
        id: node.id,
        // @ts-expect-error
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
