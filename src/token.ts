import {
  cacheContractHook,
  CommunityContractState,
  CommunityContractToken,
  fetchContract,
  fetchTokenMetadata,
  fetchTokens,
  fetchTokenStateMetadata,
  TokenMetadata,
} from "verto-cache-interface";
import {
  DecodedTag,
  ExtensionOrJWK,
  TokenInterface,
  TokenType,
  VolumeData,
  PriceData,
  TokenPair,
  ValidityInterface,
} from "./faces";
import { GQLEdgeInterface } from "ar-gql/dist/faces";
import { readContract, interactWrite } from "smartweave";
import Arweave from "arweave";
import Utils from "./utils";

export default class Token {
  private arweave: Arweave;
  private wallet: ExtensionOrJWK;
  private cache: boolean;
  private utils: Utils;

  /**
   *
   * @param arweave Arweave instance
   * @param wallet Arweave keyfile
   * @param cache Use the Verto cache
   * @param utils Utils submodule
   */
  constructor(
    arweave: Arweave,
    wallet: ExtensionOrJWK,
    cache: boolean,
    utils: Utils
  ) {
    this.arweave = arweave;
    this.wallet = wallet;
    this.cache = cache;
    this.utils = utils;
  }

  /**
   * Fetches the tokens listed on Verto
   * @type Optional type filter
   * @returns List of token ids, names, & tickers
   */
  async getTokens(type?: TokenType): Promise<TokenInterface[]> {
    let tokens: CommunityContractToken[] = [];
    const parsedTokens: TokenInterface[] = [];

    if (this.cache) tokens = await fetchTokens(type);
    else {
      const contract = await this.utils.getState(this.utils.COMMUNITY_CONTRACT);

      if (type) {
        tokens = contract.tokens.filter(
          (listedToken: Omit<TokenMetadata, "contractId">) =>
            listedToken.type === type
        );
      } else {
        tokens = contract.tokens;
      }
    }

    for (const token of tokens) {
      if (this.cache) {
        const data = await fetchTokenStateMetadata(token.id);

        if (!data) continue;
        parsedTokens.push({
          id: data.id,
          name: data.name,
          ticker: data.ticker,
        });
      } else {
        const data = await this.utils.getState(token.id);

        if (!data) continue;
        parsedTokens.push({
          id: token.id,
          name: data.name,
          ticker: data.ticker,
        });
      }
    }

    return parsedTokens;
  }

  /**
   * Fetches the type for a given token
   * @param id Token contract id
   * @returns The type of the token
   */
  async getTokenType(id: string): Promise<TokenType | undefined> {
    if (this.cache) {
      const tokenMetadata = await fetchTokenMetadata(id);

      return tokenMetadata?.type as TokenType;
    } else {
      const communityContractState = await this.utils.getState<CommunityContractState>(
        this.utils.COMMUNITY_CONTRACT
      );
      const token = communityContractState.tokens.find(
        (listedToken) => listedToken.id === id
      );

      return token?.type as TokenType;
    }
  }

  // TODO: to get the price,
  // loop through all the orders for that token pair
  // all the orders will calculate the price
  // for the price history, we can just stop after
  // each day, calculate the price till that day
  // (by only using the existing data) and push
  // the calculated price to an array with dates

  /**
   * Fetches the latest price for a given token
   * @param pair Pairs to calculate price from.
   * One token of the first token = X tokens of the second
   * @param region Two dates to *fetch and average* the price between [from, to]
   * @returns Token price for the **first item in the pair** averaged
   * between the two dates
   */
  async getPrice(
    pair: TokenPair,
    region: [Date, Date]
  ): Promise<number | undefined> {
    let contractData:
      | {
          state: any;
          validity: ValidityInterface;
        }
      | undefined;

    // load from cache
    if (this.cache) {
      contractData = await fetchContract(this.utils.CLOB_CONTRACT, true);
    }

    // load from contract if cache is disabled
    // or if the cache did not return anything
    if (!this.cache || !contractData) {
      contractData = await readContract(
        this.arweave,
        this.utils.CLOB_CONTRACT,
        undefined,
        true
      );
    }

    if (!contractData) throw new Error("Could not load clob contract data.");

    const orders = (
      await this.utils.loopOrders(contractData.validity, region)
    ).filter((edge) => {
      // return false if interaction is not an order
      if (!this.utils.checkIfValidOrder(edge.node)) return false;

      // "createOrder" interaction
      const interaction = JSON.parse(
        // @ts-expect-error | Defined for interactions
        this.utils.getTagValue("Input", edge.node.tags)
      );

      // check if the pair of the order is the same as the pair supplied
      if (
        !interaction.pair.includes(pair[0]) ||
        !interaction.pair.includes(pair[1])
      )
        return false;

      // return false if the token that the order is for is not the second
      // one because the orders needed for the price calculation of the
      // first token in the pair have to have the second token sent and
      // the first token bought
      if (interaction?.token !== pair[1]) return false;

      // return false if the order have not matched with any orders
      // (the quantity equals to the originalQuantity)
      const ordersState = contractData?.state?.pairs?.find(
        (pairData: any) =>
          pairData.pair.includes(pair[0]) && pairData.pair.includes(pair[1])
      );
      const order = ordersState?.orders?.find(
        ({ id }: any) => id === edge.node.id
      );

      if (!!order && order.quantity === order.originalQuantity) return false;

      // return false if the order doesn't have a price (market order)
      // (we only need limit orders for prices)
      return !!interaction?.price;
    });

    return this.utils.calculatePriceSum(orders);
  }

  // TODO: clob
  // TODO: cache / no-cache

  /**
   * Fetches the price history for a given token
   * @param pair Pairs to calculate price from.
   * One token of the first token = X tokens of the second
   * @param region Two dates to return prices between (use
   * undefined to get the full price history)
   * @returns Token prices for the **first item in the pair**
   * between the two dates mapped with dates
   */
  async getPriceHistory(
    pair: TokenPair,
    region?: [Date, Date]
  ): Promise<PriceData[]> {
    let contractData:
      | {
          state: any;
          validity: ValidityInterface;
        }
      | undefined;

    // load from cache
    if (this.cache) {
      contractData = await fetchContract(this.utils.CLOB_CONTRACT, true);
    }

    // load from contract if cache is disabled
    // or if the cache did not return anything
    if (!this.cache || !contractData) {
      contractData = await readContract(
        this.arweave,
        this.utils.CLOB_CONTRACT,
        undefined,
        true
      );
    }

    if (!contractData) throw new Error("Could not read clob contract data.");

    const orders = (
      await this.utils.loopOrders(contractData.validity, region)
    ).filter((edge) => {
      // return false if interaction is not an order
      if (!this.utils.checkIfValidOrder(edge.node)) return false;

      // "createOrder" interaction
      const interaction = JSON.parse(
        // @ts-expect-error | Defined for interactions
        this.utils.getTagValue("Input", edge.node.tags)
      );

      // check if the pair of the order is the same as the pair supplied
      if (
        !interaction.pair.includes(pair[0]) ||
        !interaction.pair.includes(pair[1])
      )
        return false;

      // return false if the token that the order is for is not the second
      // one because the orders needed for the price calculation of the
      // first token in the pair have to have the second token sent and
      // the first token bought
      if (interaction?.token !== pair[1]) return false;

      // return false if the order doesn't have a price (market order)
      // (we only need limit orders for prices)
      return !!interaction?.price;
    });

    const days: Record<string, number[]> = {};
    const prices: PriceData[] = [];

    // map days and prices for them
    for (const order of orders) {
      const blockTime = new Date(
        this.utils.blockTimestampToMs(order.node.block.timestamp)
      );
      // existing day data or new array
      const val = days[this.utils.formateDate(blockTime)] || [];
      const interaction = JSON.parse(
        // @ts-expect-error | Defined for interactions
        this.utils.getTagValue("Input", edge.node.tags)
      );

      days[this.utils.formateDate(blockTime)] = [...val, interaction.price];
    }

    // calculate price sum for each day
    for (const day in days) {
      const sum = days[day].reduce((a, b) => a + b, 0);

      // push price
      prices.push({
        date: day,
        value: sum / days[day].length || 0,
      });
    }

    return prices;
  }

  /**
   * Fetches the latest volume for a given token
   * @param id Token contract id
   * @returns The volume as a number
   */
  async getVolume(id: string): Promise<number> {
    // get the validity for the clob contract
    const validity = await this.utils.getValidity(this.utils.CLOB_CONTRACT);
    const from = new Date();
    from.setHours(0, 0, 0, 0);

    const to = this.utils.tomorrow(from);

    // call the volume calculator
    return this.utils.calculateVolumeForDay(
      // loop through the interactions that have been made today
      // and add those that have been swaps using this token
      await this.utils.loopOrders(validity, [from, to]),
      id
    );
  }

  /**
   * Fetches the volume history for a given token
   * @param id Token contract id
   * @returns Dates mapped to volumes
   */
  async getVolumeHistory(id: string): Promise<VolumeData[]> {
    // get the validity for the clob contract
    const validity = await this.utils.getValidity(this.utils.CLOB_CONTRACT);

    // loop through all the interactions for this token
    const loop = async (
      orders: GQLEdgeInterface[],
      cursor?: string
    ): Promise<GQLEdgeInterface[]> => {
      const txs = Object.keys(validity).filter((key) => validity[key]);
      const { data } = await this.utils.arGQL(
        `
        query($txs: [ID!], $cursor: String) {
          transactions(first: 100, ids: $txs, after: $cursor) {
            edges {
              cursor
              node {
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
        { txs, cursor }
      );

      const loopOrders = data.transactions.edges.filter(({ node }) =>
        this.utils.checkIfValidOrder(node)
      );

      orders.push(...loopOrders);

      // if there are no orders left
      if (data.transactions.edges.length > 0) return orders;
      else
        return await loop(
          orders,
          data.transactions.edges[data.transactions.edges.length - 1].cursor
        );
    };

    const txs = await loop([]);
    const data: VolumeData[] = [];
    const dates: string[] = [];

    // set dates from blocks
    for (const tx of txs) {
      const date = new Date(
        this.utils.blockTimestampToMs(tx.node.block.timestamp)
      );
      const formattedDate = this.utils.formateDate(date);

      if (!dates.includes(formattedDate)) dates.push(formattedDate);
    }

    // sort dates array
    dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // get txs for each date
    for (const date in data) {
      const txsForDay = txs.filter((tx) => {
        const tomorrow = this.utils.tomorrow(date);

        return (
          this.utils.blockTimestampToMs(tx.node.block.timestamp) >=
            new Date(date).getTime() &&
          this.utils.blockTimestampToMs(tx.node.block.timestamp) <=
            tomorrow.getTime()
        );
      });

      data.push({
        date,
        value: await this.utils.calculateVolumeForDay(txsForDay, id),
      });
    }

    // fill missing days with 0 volume
    for (let i = 0; i < dates.length; i++) {
      const nextDate = dates[i + 1];

      // break if no next dates are available in the volume array
      if (!nextDate) break;

      const date = dates[i];
      const loopDate = new Date(date);

      // loop till the next date
      while (this.utils.formateDate(loopDate) !== nextDate) {
        loopDate.setDate(new Date(loopDate).getDate() + 1);
        data.push({
          date: this.utils.formateDate(loopDate),
          value: 0,
        });
      }
    }

    // sort data by dates
    data.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return data;
  }

  /**
   * Transfer a specified amount of tokens to another wallet
   * @param amount The amount of tokens
   * @param id Token contract id
   * @param target The receiving address
   * @param tags Optional additional tags
   * @returns The transaction id of the transfer
   */
  async transfer(
    amount: number,
    id: string,
    target: string,
    tags: { name: string; value: string }[] = []
  ) {
    const interaction = () =>
      interactWrite(
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
          ...tags,
        ],
        target,
        "0"
      );

    // get listed tokens to see if we need to refres the cache
    const listedTokens = await fetchTokens();
    let transaction: string | null;

    if (listedTokens.find((token) => token.id === id))
      transaction = await cacheContractHook(interaction, id);
    else transaction = await interaction();

    if (!transaction) throw new Error("Could not create transfer interaction.");

    return transaction;
  }

  /**
   * List a new token on the exchange.
   * @param address The ID of the token
   * @param type The type of the token
   * @param tags Optional additional tags
   * @returns InteractionID
   */
  async list(
    address: string,
    type: TokenType,
    tags: DecodedTag[] = []
  ): Promise<string> {
    if (!this.utils.validateHash(address))
      throw new Error("Invalid token address.");

    const interactionID = await cacheContractHook(
      () =>
        interactWrite(
          this.arweave,
          this.wallet,
          this.utils.COMMUNITY_CONTRACT,
          {
            function: "list",
            id: address,
            type,
          },
          [
            {
              name: "Exchange",
              value: "Verto",
            },
            {
              name: "Action",
              value: "ListToken",
            },
            ...tags,
          ]
        ),
      this.utils.COMMUNITY_CONTRACT,
      true
    );

    if (!interactionID) throw new Error("Could not list token.");

    return interactionID;
  }
}
