import {
  DecodedTag,
  ExtensionOrJWK,
  GlobalConfigInterface,
  VaultInterface,
  VolumeOrderInterface,
} from "./faces";
import { SmartWeave } from "redstone-smartweave";
import { fetchContract } from "verto-cache-interface";
import { Tag } from "arweave/node/lib/transaction";
import { run } from "ar-gql";
import Arweave from "arweave";
import axios from "axios";

export default class Utils {
  private arweave: Arweave;
  private wallet: ExtensionOrJWK;
  private smartweave: SmartWeave;
  private cache: boolean;

  // TODO: remove
  public endpoint = "https://v2.cache.verto.exchange";
  public EXCHANGE_WALLET = "aLemOhg9OGovn-0o4cOCbueiHT9VgdYnpJpq7NgMA1A";
  public EXCHANGE_CONTRACT = "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A";
  public CLOB_CONTRACT = ""; // TODO
  public COMMUNITY_CONTRACT = "t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE";
  public EXCHANGE_FEE = 0.005;

  /**
   *
   * @param arweave Arweave instance.
   * @param wallet Arweave keyfile.
   * @param cache Use the Verto cache.
   * @param smartweave SmartWeave instance.
   */
  constructor(
    arweave: Arweave,
    wallet: ExtensionOrJWK,
    cache: boolean,
    smartweave: SmartWeave,
    globalConfig?: GlobalConfigInterface
  ) {
    this.arweave = arweave;
    this.wallet = wallet;
    this.cache = cache;
    this.smartweave = smartweave;

    // Set custom config
    if (globalConfig) {
      if (globalConfig.CLOB_CONTRACT)
        this.CLOB_CONTRACT = globalConfig.CLOB_CONTRACT;
      if (globalConfig.COMMUNITY_CONTRACT)
        this.COMMUNITY_CONTRACT = globalConfig.COMMUNITY_CONTRACT;
    }
  }

  /**
   * Create a Verto fee on the network
   * @param amount Fee amount
   * @param token Fee token
   * @param orderID ID of the order that the fee is for
   * @param feeTarget Target of the fee transaction
   * @returns ID of the fee transfer
   */
  public async createFee(
    amount: number,
    token: string,
    orderID: string,
    feeTarget: "exchange" | "token_holder"
  ): Promise<string> {
    const fee = Math.ceil(Math.ceil(amount) * this.EXCHANGE_FEE);
    const target =
      feeTarget === "exchange"
        ? this.EXCHANGE_WALLET
        : await this.selectWeightedHolder();

    const transaction = await this.arweave.createTransaction(
      {
        target,
        data: Math.random().toString().slice(-4),
      },
      this.wallet
    );

    const tags = {
      Exchange: "Verto",
      Type: "Fee-VRT-Holder",
      Order: orderID,
      "App-Name": "SmartWeaveAction",
      "App-Version": "0.3.0",
      Contract: token,
      Input: JSON.stringify({
        function: "transfer",
        target,
        qty: fee,
      }),
    };
    for (const [name, value] of Object.entries(tags)) {
      transaction.addTag(name, value);
    }

    await this.arweave.transactions.sign(transaction, this.wallet);
    await this.arweave.transactions.post(transaction);

    return transaction.id;
  }

  /**
   * Get the state of a contract
   * @param addr Address of the contract
   * @returns Contract state
   */
  public async getState<T = any>(addr: string): Promise<T> {
    if (this.cache) return (await fetchContract(addr))?.state;
    else {
      const contract = this.smartweave.contract(addr).connect(this.wallet);

      return (await contract.readState()).state as T;
    }
  }

  /**
   * Validate an Arweave hash, such as transaction ID,
   * wallet address, etc.
   * @param hash The hash to validate
   * @returns If the hash is valid
   */
  public validateHash(hash: string) {
    return /[a-z0-9_-]{43}/i.test(hash);
  }

  /**
   * Get the value for a PST's setting
   * @param name Name of the setting
   * @param state Full contract state
   * @returns Value of the setting
   */
  public getPSTSettingValue(
    name: string,
    state: { settings: [string, any][]; [key: string]: any }
  ) {
    return state.settings.find(([settingName]) => settingName === name)?.[1];
  }

  /**
   * Execute a graphql request to the configured
   * Arweave gateway
   * @param query The graphql query string
   * @param variables Optional variables
   * @returns Graphql API response
   */
  public async arGQL(
    query: string,
    variables?: Record<string, any>
  ): Promise<ReturnType<typeof run>> {
    const graphql = JSON.stringify({
      query,
      variables,
    });
    const clientConfig = this.arweave.api.getConfig();

    const { data: res } = await axios.post(
      `${clientConfig.protocol}://${clientConfig.host ?? "arweave.net"}:${
        clientConfig.port ?? 443
      }/graphql`,
      graphql,
      {
        headers: {
          "content-type": "application/json",
        },
      }
    );

    return res;
  }

  /**
   * Get the value for a given tag name
   * @param name Name of the tag
   * @param tags All tags to search from
   * @returns The value of the tag
   */
  public getTagValue(name: string, tags: DecodedTag[]) {
    return tags.find((tag) => tag.name === name)?.value;
  }

  /**
   * Calculate the volume for a given day
   * @param orders Orders that send this token to the exchange to calculate from
   * @param day Day to calculate for
   * @returns Volume for the day
   */
  public calculateVolumeForDay(orders: VolumeOrderInterface[], day: Date) {
    const dayFrom = new Date(day).setHours(0, 0, 0, 0);
    const dayTo = new Date(day).setDate(day.getDate() + 1);
    const ordersForDay = orders.filter(
      (order) => dayFrom < order.timestamp && order.timestamp < dayTo
    );

    return ordersForDay
      .map(({ quantity }) => quantity)
      .reduce((a, b) => a + b, 0);
  }

  public decodeTags(tags: Tag[]): DecodedTag[] {
    return tags.map((tag) => ({
      name: tag.get("name", { decode: true, string: true }),
      value: tag.get("value", { decode: true, string: true }),
    }));
  }

  /**
   * Select a token holder based on their share of the
   * total supply.
   * @returns Address of the selected holder
   */
  private async selectWeightedHolder(): Promise<string> {
    const state: {
      balances: { [address: string]: number };
      vault: VaultInterface;
      [key: string]: any;
    } = await this.getState(this.EXCHANGE_CONTRACT);

    let totalTokens = 0;

    for (const addr of Object.keys(state.balances)) {
      totalTokens += state.balances[addr];
    }

    for (const addr of Object.keys(state.vault)) {
      if (!state.vault[addr].length) continue;

      const vaultBalance = state.vault[addr]
        .map((a) => a.balance)
        .reduce((a, b) => a + b, 0);

      totalTokens += vaultBalance;

      if (addr in state.balances) {
        state.balances[addr] += vaultBalance;
      } else {
        state.balances[addr] = vaultBalance;
      }
    }

    const weighted: { [address: string]: number } = {};

    for (const addr of Object.keys(state.balances)) {
      weighted[addr] = state.balances[addr] / totalTokens;
    }

    return this.weightedRandom(weighted);
  }

  /**
   * Select an address randomly, using their token weight.
   * @param input User addresses with weight
   * @returns Selected address
   */
  private weightedRandom(input: { [key: string]: number }): string {
    let sum = 0;
    const r = Math.random();

    for (const key of Object.keys(input)) {
      sum += input[key];
      if (r <= sum && input[key] > 0) {
        return key;
      }
    }

    return this.EXCHANGE_WALLET;
  }
}
