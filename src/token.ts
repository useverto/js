import {
  CommunityContractState,
  CommunityContractToken,
  fetchTokenMetadata,
  fetchTokens,
  fetchTokenStateMetadata,
  TokenMetadata,
} from "verto-cache-interface";
import {
  DecodedTag,
  ExtensionOrJWK,
  PriceInterface,
  TokenInterface,
  TokenType,
} from "./faces";
import { SmartWeave } from "redstone-smartweave";
import Arweave from "arweave";
import axios from "axios";
import Utils from "./utils";

export default class Token {
  private arweave: Arweave;
  private wallet: ExtensionOrJWK;
  private cache: boolean;
  private smartweave: SmartWeave;
  private utils: Utils;

  /**
   *
   * @param arweave Arweave instance.
   * @param wallet Arweave keyfile.
   * @param cache Use the Verto cache.
   * @param smartweave SmartWeave instance.
   * @param utils Utils submodule.
   */
  constructor(
    arweave: Arweave,
    wallet: ExtensionOrJWK,
    cache: boolean,
    smartweave: SmartWeave,
    utils: Utils
  ) {
    this.arweave = arweave;
    this.wallet = wallet;
    this.cache = cache;
    this.smartweave = smartweave;
    this.utils = utils;
  }

  /**
   * Fetches the tokens listed on Verto.
   * @returns List of token ids, names, & tickers.
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
   * Fetches the type for a given token.
   * @param id Token contract id.
   * @returns The type of the token.
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

  // TODO: clob
  // TODO: cache / no-cache

  /**
   * Fetches the latest price for a given token.
   * @param id Token contract id.
   * @returns The price with name & ticker, or undefined.
   */
  async getPrice(id: string): Promise<PriceInterface | undefined> {
    const res = await axios.get(`${this.utils.endpoint}/token/${id}/price`);
    return res.data;
  }

  // TODO: clob
  // TODO: cache / no-cache

  /**
   * Fetches the price history for a given token.
   * @param id Token contract id.
   * @returns Dates mapped to prices.
   */
  async getPriceHistory(id: string): Promise<{ [date: string]: number }> {
    const res = await axios.get(
      `${this.utils.endpoint}/token/${id}/priceHistory`
    );
    return res.data;
  }

  // TODO: clob
  // TODO: cache / no-cache

  /**
   * Fetches the latest volume for a given token.
   * @param id Token contract id.
   * @returns The volume as a number.
   */
  async getVolume(id: string): Promise<number> {
    const res = await axios.get(`${this.utils.endpoint}/token/${id}/volume`);
    return res.data;
  }

  // TODO: clob
  // TODO: cache / no-cache

  /**
   * Fetches the volume history for a given token.
   * @param id Token contract id.
   * @returns Dates mapped to volumes.
   */
  async getVolumeHistory(id: string): Promise<{ [date: string]: number }> {
    const res = await axios.get(
      `${this.utils.endpoint}/token/${id}/volumeHistory`
    );
    return res.data;
  }

  /**
   * Transfer a specified amount of tokens to another wallet.
   * @param amount The amount of tokens.
   * @param id Token contract id.
   * @param target The receiving address.
   * @param tags Optional additional tags
   * @returns The transaction id of the transfer.
   */
  async transfer(
    amount: number,
    id: string,
    target: string,
    tags: { name: string; value: string }[] = []
  ) {
    const contract = this.smartweave.contract(id).connect(this.wallet);
    const transaction = contract.writeInteraction(
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
      {
        target,
        winstonQty: "0",
      }
    );

    return transaction;
  }

  /**
   * List a new token on the exchange.
   * @param address The ID of the token
   * @returns InteractionID
   */
  async list(
    address: string,
    type: TokenType,
    tags: DecodedTag[] = []
  ): Promise<string> {
    const contract = this.smartweave
      .contract(this.utils.COMMUNITY_CONTRACT)
      .connect(this.wallet);

    if (!this.utils.validateHash(address))
      throw new Error("Invalid token address.");

    // TODO: do we want fees on this @t8
    const interactionID = await contract.writeInteraction(
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
    );

    if (!interactionID) throw new Error("Could not list token.");

    return interactionID;
  }
}
